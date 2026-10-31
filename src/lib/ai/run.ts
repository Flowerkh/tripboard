import { addChat, commitDraft, getState, setPending, setState, snapshot, toast, type Draft } from "../store";
import { contextBlock, DAY_PROMPT, FLIGHT_PROMPT, PLAN_PROMPT, RECS_PROMPT, RULES } from "./prompts";
import { makeExecutors, TOOL_DEFS } from "./tools";
import { AiError, readTicket, runAgent, testConn, type Msg } from "./claude";
import { demoChat, demoPlan, demoRecsRun } from "./demo";

let ctl: AbortController | null = null;

export function stopAi() {
  ctl?.abort();
}
export const hasKey = () => {
  const { apiKey, proxyUrl } = getState().settings;
  return !!(apiKey.trim() || proxyUrl.trim());
};

function history(tripId: string, text: string): Msg[] {
  const list = (getState().chats[tripId] ?? []).filter((m) => m.role !== "note" && m.text).slice(-10);
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

type Mode = { kind: "plan" } | { kind: "day"; day: string } | { kind: "recs" } | { kind: "chat"; text: string; viewingDay: string };

const SHOWN: Record<string, string> = { plan: "전체 일정을 짜줘", recs: "계절 추천 다시 받기" };

/** One AI turn: works on a copy of the trip, then applies it (or waits for approval). */
export async function runAi(tripId: string, mode: Mode): Promise<void> {
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
  if (mode.kind === "plan" && hasKey()) {
    // Drop leftovers from an earlier demo plan; the AI writes fresh ones.
    draft.trip = { ...draft.trip, notice: "", dayLabels: {} };
  }
  ctl = new AbortController();
  const signal = ctl.signal;
  const shown = mode.kind === "chat" ? mode.text : mode.kind === "day" ? `${mode.day} 일정을 짜줘` : SHOWN[mode.kind];
  addChat(tripId, { role: "user", text: shown });
  setState({ run: { tripId, kind: mode.kind === "plan" ? "plan" : mode.kind === "recs" ? "recs" : "chat", status: "생각하는 중…", startedAt: Date.now(), stage: 0 } });
  const onStage = (name: string) =>
    setState((st) => (st.run ? { run: { ...st.run, stage: Math.max(st.run.stage, name === "update_trip" ? 1 : 2), status: name === "add_items" ? "일정 넣는 중…" : "여행 정보 정리 중…" } } : {}));

  let text = "";
  const usedDemo = !hasKey();
  try {
    if (usedDemo) {
      if (mode.kind === "plan" || mode.kind === "day") text = await demoPlan(draft, changes, onStage, signal);
      else if (mode.kind === "recs") text = await demoRecsRun(draft, changes, signal);
      else text = await demoChat(draft, changes, mode.text, mode.viewingDay, signal);
    } else {
      const { settings } = getState();
      const bigJob = mode.kind === "plan" || mode.kind === "day";
      const prompt = mode.kind === "plan" ? PLAN_PROMPT : mode.kind === "day" ? DAY_PROMPT(mode.day) : mode.kind === "recs" ? RECS_PROMPT : "";
      const messages: Msg[] = mode.kind === "chat" ? history(tripId, mode.text) : [{ role: "user", content: prompt }];
      text = await runAgent({
        conn: { apiKey: settings.apiKey, proxyUrl: settings.proxyUrl },
        model: bigJob || mode.kind === "recs" ? settings.planModel : settings.editModel,
        system: RULES,
        context: contextBlock(draft.trip, draft.items, mode.kind === "chat" ? mode.viewingDay : undefined),
        messages,
        tools: TOOL_DEFS,
        run: makeExecutors({ draft, changes, onStage }),
        maxTokens: bigJob ? 16000 : 4000,
        signal,
      });
    }
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    const msg = aborted ? "멈췄어요. 바뀐 건 없어요." : e instanceof AiError ? e.message : `문제가 생겼어요: ${(e as Error).message}`;
    addChat(tripId, { role: "assistant", text: msg });
    ctl = null;
    if (!aborted && mode.kind === "plan") setState((st) => ({ run: st.run ? { ...st.run, error: msg } : null }));
    else setState({ run: null });
    return;
  }
  ctl = null;
  if (!text) text = changes.length ? "바꿨어요." : "답을 만들지 못했어요. 조금 다르게 말해 주세요.";
  const shortList = changes.length > 14 ? [...changes.slice(0, 13), `외 ${changes.length - 13}개`] : changes;
  const msgId = addChat(tripId, { role: "assistant", text, changes: shortList });
  if (changes.length) {
    const confirm = getState().settings.confirmAI && mode.kind === "chat";
    if (confirm) setPending(tripId, { draft, before, changes: shortList, msgId });
    else commitDraft(tripId, draft, before, msgId);
  }
  setState({ run: null });
  if (mode.kind === "plan") toast(usedDemo ? "데모 일정이에요 · 설정에서 API 키를 저장하면 실제 장소로 짜요" : "일정을 다 짰어요");
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

/** Settings "키 확인": returns null when the key works, or a message saying what's wrong. */
export async function checkKey(): Promise<string | null> {
  const { settings } = getState();
  if (!hasKey()) return "키가 비어 있어요.";
  try {
    await testConn({ apiKey: settings.apiKey, proxyUrl: settings.proxyUrl });
    return null;
  } catch (e) {
    return e instanceof AiError ? e.message : (e as Error).message;
  }
}

export async function readFlights(file: File) {
  const { settings } = getState();
  if (!hasKey()) throw new AiError("e-티켓 읽기는 API 키가 있어야 해요. 설정에서 넣어 주세요.");
  return readTicket({ apiKey: settings.apiKey, proxyUrl: settings.proxyUrl }, settings.planModel, file, FLIGHT_PROMPT);
}
