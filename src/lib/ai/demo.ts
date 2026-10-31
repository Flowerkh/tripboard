/**
 * Demo mode: what the app does without an API key, so every screen can be tried.
 * It understands only a few simple requests and fills plans with placeholders.
 */
import { fromMin, nowMin, parseDay, today, toMin } from "../dates";
import { itemsOfDay, phase, tripDays } from "../trip";
import type { Draft } from "../store";
import type { IconName, Rec } from "../types";
import { makeExecutors } from "./tools";

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(Object.assign(new Error("aborted"), { name: "AbortError" })); });
  });

function demoRecs(start: string): Omit<Rec, "id">[] {
  const m = parseDay(start).getMonth() + 1;
  const season = m >= 3 && m <= 5 ? "봄" : m >= 6 && m <= 8 ? "여름" : m >= 9 && m <= 11 ? "가을" : "겨울";
  const base: Record<string, [IconName, string, string][]> = {
    봄: [["nature", "꽃길 산책", "봄꽃이 피는 때라 공원이나 강변 산책이 좋아요."], ["cafe", "테라스 카페", "날이 풀려 바깥 자리에서 쉬기 좋아요."]],
    여름: [["beach", "바다·물놀이", "더운 낮에는 물가가 좋아요."], ["night", "저녁 야시장", "해가 진 뒤가 걷기 편해요."]],
    가을: [["nature", "단풍 명소", "선선해서 걷기 좋은 계절이에요."], ["night", "노을 전망대", "해가 일찍 져서 노을과 야경을 한 번에 봐요."]],
    겨울: [["night", "겨울 조명 축제", "해가 일찍 져서 저녁 일찍부터 조명을 볼 수 있어요."], ["food", "따뜻한 국물 요리", "추운 날엔 국물 음식이 잘 어울려요."]],
  };
  return base[season].map(([icon, title, why]) => ({ icon, title: `${title} (데모)`, why, area: "" }));
}

export async function demoPlan(draft: Draft, changes: string[], onStage: (s: string) => void, signal?: AbortSignal): Promise<string> {
  const run = makeExecutors({ draft, changes, onStage });
  const t = draft.trip;
  await wait(700, signal);
  const days = tripDays(t);
  run.update_trip({
    season: "",
    dayLabels: Object.fromEntries(days.map((d, i) => [d, `${i + 1}일차 (데모)`])),
    notice: "데모 일정이에요. 설정에서 API 키를 넣고 'AI로 다시 짜기'를 누르면 실제 장소로 채워져요.",
    recommendations: demoRecs(t.start),
  });
  await wait(700, signal);
  const overseas = t.kind === "overseas";
  const arr = toMin((t.legs.out?.arr || "").slice(11, 16));
  const dep = toMin((t.legs.back?.dep || "").slice(11, 16));
  const slots: [string, IconName, string][] = [
    ["10:00", "sight", "오전 둘러보기"], ["12:30", "food", "점심"], ["14:00", "sight", "오후 일정"],
    ["16:30", "cafe", "카페에서 쉬기"], ["18:30", "food", "저녁"], ["20:00", "night", "야경 산책"],
  ];
  const items: Record<string, unknown>[] = [];
  days.forEach((d, i) => {
    let from = 9 * 60;
    let until = 22 * 60;
    if (i === 0 && arr != null) from = arr + (overseas ? 100 : 30);
    if (i === days.length - 1 && dep != null) until = dep - (overseas ? 180 : 60);
    for (const [time, icon, title] of slots) {
      const s = toMin(time)!;
      if (s < from || s + 60 > until) continue;
      items.push({ day: d, start: time, end: fromMin(s + 60), icon, title, status: "todo", note: "데모 일정 · 장소 미정" });
    }
  });
  if (items.length) run.add_items({ items });
  return `${t.city || t.country} 일정 틀을 데모로 만들었어요. 진짜 장소로 채우려면 설정에서 API 키를 넣어 주세요.`;
}

export async function demoRecsRun(draft: Draft, changes: string[], signal?: AbortSignal): Promise<string> {
  await wait(500, signal);
  makeExecutors({ draft, changes }).update_trip({ recommendations: demoRecs(draft.trip.start) });
  return "데모 추천을 넣었어요. API 키를 넣으면 이 여행지에 맞는 진짜 추천을 받아요.";
}

/** Understands "N분 미뤄/당겨줘", "N시간 미뤄줘", "<이름> 빼줘". */
export async function demoChat(draft: Draft, changes: string[], text: string, viewingDay: string, signal?: AbortSignal): Promise<string> {
  await wait(500, signal);
  const run = makeExecutors({ draft, changes });
  const t = draft.trip;
  const during = phase(t) === "during";
  const day = during ? today() : viewingDay;
  const list = itemsOfDay(draft.items, day).filter((i) => !i.done);
  const mm = text.match(/(\d+)\s*(분|시간)/);
  if (mm && /(미뤄|늦춰|뒤로|늦어|당겨|앞으로)/.test(text)) {
    let mins = Number(mm[1]) * (mm[2] === "시간" ? 60 : 1);
    if (/(당겨|앞으로)/.test(text)) mins = -mins;
    const fromNow = during ? nowMin() : 0;
    const first = list.find((i) => (toMin(i.start) ?? 0) >= fromNow);
    if (!first) return "옮길 일정이 없어요.";
    run.shift_items({ day, from: first.start, minutes: mins });
    return `${first.start} 이후 일정을 ${Math.abs(mins)}분 ${mins > 0 ? "미뤘어요" : "당겼어요"}.`;
  }
  if (/(빼|지워|삭제)/.test(text)) {
    const hit = draft.items.filter((i) => text.replace(/\s/g, "").includes(i.title.replace(/^[^:]{1,8}:\s*/, "").replace(/\s/g, "").slice(0, 6)));
    if (hit.length) {
      run.delete_items({ ids: hit.map((h) => h.id) });
      return `${hit.map((h) => h.title).join(", ")}을(를) 뺐어요.`;
    }
  }
  return "데모 모드라서 \"30분 미뤄줘\", \"1시간 당겨줘\", \"(일정 이름) 빼줘\" 정도만 알아들어요. 설정에서 API 키를 넣으면 뭐든 말로 고칠 수 있어요.";
}
