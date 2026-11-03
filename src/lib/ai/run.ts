import { addChat, commitDraft, getState, markChats, setPending, setState, snapshot, toast, type Draft } from "../store";
import { refreshAi } from "../cloud";
import { MAX_INPUT, OFF_MARK, OFF_REPLY } from "./guard";
import { contextBlock, DAY_PROMPT, FLIGHT_PROMPT, GEO_PROMPT, PLAN_PROMPT, RECS_PROMPT, RULES } from "./prompts";
import { makeExecutors, TOOL_DEFS } from "./tools";
import { AiError, readTicket, runAgent, type Feature, type Msg } from "./claude";

let ctl: AbortController | null = null;

export function stopAi() {
  ctl?.abort();
}
/** AI is for signed-in members only (the server counts each member's use). */
export const canUseAi = () => !!getState().user;
export const LOGIN_FOR_AI = "카카오로 로그인하면 AI를 쓸 수 있어요";
/** The AI the member picked, if the admin still offers it ("" lets the server use its default). */
const chosenProvider = () => {
  const { settings, ai } = getState();
  return settings.aiProvider && ai?.providers.some((p) => p.id === settings.aiProvider) ? settings.aiProvider : "";
};

function history(tripId: string, text: string): Msg[] {
  // off-topic exchanges are never sent again; only the last few messages travel with each request
  const list = (getState().chats[tripId] ?? []).filter((m) => m.role !== "note" && m.text && !m.offTopic).slice(-6);
  const msgs: Msg[] = [];
  for (const m of list) {
    const role = m.role === "user" ? "user" : "assistant";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${m.text}`;
    else msgs.push({ role, content: m.text });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const last = msgs[msgs.length - 1];
  if (last && last.role === "user") last.content = `${last.content}\n\n${text}`;
  else msgs.push({ role: "user", content: text });
  return msgs;
}

type Mode = { kind: "plan" } | { kind: "day"; day: string } | { kind: "recs" } | { kind: "geo" } | { kind: "chat"; text: string; viewingDay: string };

const SHOWN: Record<string, string> = { plan: "전체 일정을 짜줘", recs: "계절 추천 다시 받기", geo: "위치 미정인 곳을 지도에 표시해줘" };

/** One AI turn: works on a copy of the trip, then applies it (or waits for approval). */
export async function runAi(tripId: string, mode: Mode): Promise<void> {
  if (!canUseAi()) {
    toast(LOGIN_FOR_AI);
    return;
  }
  if (mode.kind === "chat") mode = { ...mode, text: mode.text.slice(0, MAX_INPUT) };
  const s = getState();
  if (s.run?.error) setState({ run: null }); // a failed run left on screen shouldn't block a new one
  else if (s.run) {
    toast("AI가 아직 다른 일을 하고 있어요. 끝난 뒤에 다시 해 주세요.");
    return;
  }
  const before = snapshot(tripId);
  if (!before.trip) return;
  const draft: Draft = structuredClone(before);
  const changes: string[] = [];
  if (mode.kind === "plan" && draft.items.length) {
    // "Start over" clears the old plan here instead of asking the AI to delete it item by item.
    changes.push(`- 기존 일정 ${draft.items.length}개`);
    draft.items = [];
  }
  if (mode.kind === "plan") {
    // the AI writes fresh day themes and notes
    draft.trip = { ...draft.trip, notice: "", dayLabels: {} };
  }
  ctl = new AbortController();
  const signal = ctl.signal;
  const shown = mode.kind === "chat" ? mode.text : mode.kind === "day" ? `${mode.day} 일정을 짜줘` : SHOWN[mode.kind];
  const userMsgId = addChat(tripId, { role: "user", text: shown });
  setState({ run: { tripId, kind: mode.kind === "plan" ? "plan" : mode.kind === "recs" ? "recs" : mode.kind === "geo" ? "geo" : "chat", status: mode.kind === "geo" ? "위치 찾는 중…" : "생각하는 중…", startedAt: Date.now(), stage: 0 } });
  const onStage = (name: string) =>
    setState((st) => (st.run ? { run: { ...st.run, stage: Math.max(st.run.stage, name === "update_trip" ? 1 : 2), status: name === "add_items" ? "일정 넣는 중…" : "여행 정보 정리 중…" } } : {}));

  let text = "";
  let fellBack = "";
  try {
    const bigJob = mode.kind === "plan" || mode.kind === "day";
    const prompt = mode.kind === "plan" ? PLAN_PROMPT : mode.kind === "day" ? DAY_PROMPT(mode.day) : mode.kind === "recs" ? RECS_PROMPT : mode.kind === "geo" ? GEO_PROMPT : "";
    const messages: Msg[] = mode.kind === "chat" ? history(tripId, mode.text) : [{ role: "user", content: prompt }];
    text = await runAgent({
      feature: mode.kind as Feature,
      provider: chosenProvider(),
      system: RULES,
      context: contextBlock(draft.trip, draft.items, mode.kind === "chat" ? mode.viewingDay : undefined),
      messages,
      tools: TOOL_DEFS,
      run: makeExecutors({ draft, changes, onStage }),
      maxTokens: bigJob ? 16000 : mode.kind === "chat" ? 1500 : 4000, // the server caps these too
      userText: mode.kind === "chat" ? mode.text : undefined,
      signal,
      onReply: (r) => { if (r.fallback && r.provider) fellBack = r.provider; },
    });
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    const msg = aborted ? "멈췄어요. 바뀐 건 없어요." : e instanceof AiError ? e.message : `문제가 생겼어요: ${(e as Error).message}`;
    addChat(tripId, { role: "assistant", text: msg });
    if (mode.kind === "geo" && !aborted) toast(msg); // no chat sheet is open for this one
    ctl = null;
    if (!aborted && mode.kind === "plan") setState((st) => ({ run: st.run ? { ...st.run, error: msg } : null }));
    else setState({ run: null });
    if (e instanceof AiError && ["limit", "paused", "login", "no_ai"].includes(e.code) && mode.kind !== "geo") toast(msg);
    refreshAi();
    return;
  }
  ctl = null;
  // B: the AI marked the request as not about the trip
  const refused = text.trimStart().startsWith(OFF_MARK);
  if (refused) text = text.trimStart().slice(OFF_MARK.length).trim() || OFF_REPLY;
  if (!text) text = changes.length ? "바꿨어요." : "답을 만들지 못했어요. 조금 다르게 말해 주세요.";
  const shortList = changes.length > 14 ? [...changes.slice(0, 13), `외 ${changes.length - 13}개`] : changes;
  const msgId = addChat(tripId, { role: "assistant", text, changes: shortList, ...(refused && !changes.length ? { offTopic: true } : {}) });
  if (refused && !changes.length) markChats(tripId, [userMsgId], { offTopic: true }); // D: keep it out of later requests
  if (changes.length) {
    const confirm = getState().settings.confirmAI && mode.kind === "chat";
    if (confirm) setPending(tripId, { draft, before, changes: shortList, msgId });
    else commitDraft(tripId, draft, before, msgId);
  }
  setState({ run: null });
  refreshAi(); // usage counts on the settings page
  if (fellBack) toast(`고른 AI가 응답하지 않아 ${fellBack === "claude" ? "Claude" : fellBack === "gemini" ? "Gemini" : "OpenAI"}로 대신 답했어요`);
  if (mode.kind === "plan") toast("일정을 다 짰어요");
  if (mode.kind === "geo") toast(changes.length ? `${changes.length}곳을 지도에 표시했어요 · 대화에서 되돌릴 수 있어요` : "지도에 더 표시할 수 있는 곳을 찾지 못했어요");
}

/** Deterministic "push everything back" without calling the AI. */
export function quickShift(tripId: string, day: string, from: string, minutes: number) {
  const before = snapshot(tripId);
  const draft: Draft = structuredClone(before);
  const changes: string[] = [];
  try {
    makeExecutors({ draft, changes }).shift_items({ day, from, minutes });
  } catch (e) {
    toast((e as Error).message);
    return;
  }
  const msgId = addChat(tripId, { role: "assistant", text: `${from} 이후 일정을 ${minutes}분 ${minutes > 0 ? "미뤘어요" : "당겼어요"}.`, changes });
  commitDraft(tripId, draft, before, msgId);
  toast(`${minutes}분 ${minutes > 0 ? "미뤘어요" : "당겼어요"} · 대화에서 되돌릴 수 있어요`);
}

export function applyPending(tripId: string) {
  const p = getState().pending[tripId];
  if (!p) return;
  commitDraft(tripId, p.draft, p.before, p.msgId);
  setPending(tripId, null);
  toast("적용했어요");
}
export function discardPending(tripId: string) {
  setPending(tripId, null);
  addChat(tripId, { role: "note", text: "AI가 제안한 변경을 적용하지 않았어요." });
}
export function clearRunError() {
  setState({ run: null });
}

export async function readFlights(file: File) {
  if (!canUseAi()) throw new AiError(`e-티켓 읽기: ${LOGIN_FOR_AI}`, "login");
  try {
    return await readTicket(chosenProvider(), file, FLIGHT_PROMPT);
  } finally {
    refreshAi();
  }
}
