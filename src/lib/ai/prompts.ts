import { durLabel, fromMin, seasonOf, weekday } from "../dates";
import { byTime, hasGeo, nowInfo, phase, tripDays, tripEnd } from "../trip";
import type { Item, Trip } from "../types";

export const RULES = `너는 여행 일정 앱 "트립보드"의 일정 담당 AI야. 사용자의 말에 따라 도구(add_items, update_items, delete_items, shift_items, update_trip)로 일정을 직접 고치고, 끝나면 무엇을 바꿨는지 한국어로 1~3문장으로 짧게 말해. 질문이면 도구 없이 짧게 답해.

지켜야 할 것:
- 시간은 24시간제 HH:MM, 날짜는 YYYY-MM-DD. 날짜는 여행 기간 안에서만 써.
- 앞뒤 일정과 시간이 겹치지 않게 하고, 장소 사이 이동 시간을 현실적으로 잡아. 어떤 일정을 늘리거나 미루면 뒤 일정은 shift_items로 같이 밀어.
- 해외여행은 첫날 비행기 도착 후 입국·이동에 1.5~2시간, 마지막 날은 귀국편 출발 3시간 전 공항 도착을 지켜. 국내여행은 도착·출발 시각 앞뒤로 30분~1시간 여유를 둬.
- 비행기·기차 같은 이동편(legs)은 화면에 자동으로 나오니 일정 항목으로 따로 넣지 마. 공항이나 역에서 시내로 가는 이동은 항목으로 넣어도 돼.
- status: confirmed=확정, optional=선택·대안, check=예약·운영시간 등 확인 필요, todo=아직 미정(예: 식당 미정).
- 운영시간·휴무·가격·예약처럼 바뀔 수 있는 정보는 단정하지 말고 status를 check로 두고 note에 무엇을 확인할지 적어.
- 실제로 있다고 확신하는 장소만 넣어. 확신이 없으면 "근처 라멘집"처럼 일반 항목으로 넣고 status는 todo.
- place는 지도 앱에서 바로 검색되는 이름 (해외: 현지어나 영어 + 도시, 국내: 상호명 + 지역).
- lat/lng는 위치를 수백 m 안으로 안다고 확신할 때만 넣고, 아니면 생략해.
- icon은 정해진 값 중 하나, title은 짧게 (예: "점심: 이치란 라멘").
- 지금 여행 중이면 이미 지난 일정은 사용자가 원할 때만 고쳐.
- 무엇을 원하는지 애매하면 바꾸지 말고 한 문장으로 되물어.
- 답변에 표나 긴 목록은 쓰지 마.`;

function tripSummary(t: Trip) {
  return {
    제목: t.title,
    종류: t.kind === "domestic" ? "국내" : "해외",
    나라: t.kind === "overseas" ? t.country : undefined,
    도시: t.city || "(미정: 네가 골라도 돼)",
    기간: `${t.start} ~ ${tripEnd(t)} (${durLabel(t.nights)})`,
    계절: t.season || seasonOf(t.start),
    출발지: t.origin || undefined,
    교통수단: t.transport || undefined,
    이동편: t.legs,
    날짜별테마: t.dayLabels,
    동행: t.companions || undefined,
    좋아하는것: t.styles.join(", ") || undefined,
    페이스: t.pace || undefined,
    요청메모: t.memo || undefined,
  };
}

export function contextBlock(t: Trip, items: Item[], viewingDay?: string): string {
  const L: string[] = [];
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  L.push(`현재 시각 (사용자 기기): ${todayStr} (${weekday(todayStr)}) ${fromMin(d.getHours() * 60 + d.getMinutes())}`);
  const ph = phase(t);
  if (ph === "during") {
    const n = nowInfo(t, items);
    L.push(`지금 여행 중 (${tripDays(t).indexOf(todayStr) + 1}일차).${n?.cur ? ` 지금 일정: ${n.cur.title}.` : ""}${n?.next ? ` 다음 일정: ${n.next.start} ${n.next.title}.` : ""}`);
  } else L.push(ph === "before" ? "아직 여행 전." : "이미 다녀온 여행.");
  if (viewingDay) L.push(`사용자가 지금 보고 있는 날짜: ${viewingDay}`);
  L.push("여행 정보: " + JSON.stringify(tripSummary(t)));
  L.push("현재 일정 (한 줄에 하나: id | 날짜 | 시작~끝 | 상태 | 아이콘 | 제목 | 장소 | 좌표 | 메모 | 완료여부):");
  const sorted = [...items].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : byTime(a, b)));
  if (!sorted.length) L.push("(아직 일정 없음)");
  for (const it of sorted) {
    L.push([it.id, it.day, `${it.start}~${it.end || ""}`, it.status, it.icon, it.title, it.place || "-", hasGeo(it) ? `${it.lat.toFixed(4)},${it.lng.toFixed(4)}` : "-", (it.note || "-").replace(/\s+/g, " "), it.done ? "완료" : ""].join(" | "));
  }
  if (t.recs.length) L.push("계절 추천 목록: " + t.recs.map((r) => `${r.title}(${r.area})`).join(", "));
  return L.join("\n");
}

export const PLAN_PROMPT = `[요청] 위 여행 정보로 전체 일정을 짜줘.
- 기존 일정이 있으면 먼저 delete_items로 모두 지워.
- update_trip 한 번으로 title(짧게, 예: "오사카 2박 3일"), season(그 나라·날짜 기준 계절, 예: "늦가을"), dayLabels(날짜마다 지역·테마 2~3개를 " · "로), notice(출발 전 꼭 확인할 것 1~2문장), recommendations(이 시기·계절에 특히 좋은 곳이나 할 것 5~7개, why에 계절 이유를 1~2문장)를 설정해.
- 같은 차례에 add_items 한 번으로 모든 날의 일정을 넣어. 하루 5~9개, 식사 포함, 가까운 곳끼리 이어지게, 페이스를 반영해.
- 계절 추천 가운데 동선에 맞는 것은 실제 일정에도 넣어.
- 도시가 비어 있으면 계절과 취향에 맞는 도시를 골라 title과 일정에 반영해.
- 다 넣은 뒤 2~3문장으로 일정의 흐름을 요약해.`;

export const DAY_PROMPT = (day: string) => `[요청] ${day} 하루 일정을 짜서 add_items로 넣어줘. 다른 날 일정은 건드리지 마. 하루 5~8개, 식사 포함. 끝나면 한 문장으로 말해.`;

export const RECS_PROMPT = `[요청] 이 여행 날짜와 지역의 계절에 맞는 추천 장소·할 거리 5~7개를 새로 골라 update_trip(season, recommendations)으로 저장해. 일정 항목은 바꾸지 마. 끝나면 한 문장으로 말해.`;

export const FLIGHT_PROMPT = `이 이미지는 항공권(e-티켓, 예약 확인 메일 캡처 등)이야. 가는 편과 오는 편 정보를 찾아서 아래 JSON 하나만 답해. 모르는 값은 빈 문자열.
{"out":{"from":"ICN","to":"KIX","dep":"YYYY-MM-DDTHH:MM","arr":"YYYY-MM-DDTHH:MM","no":"편명"},"back":{"from":"","to":"","dep":"","arr":"","no":""}}
시각은 각 공항의 현지 시각, 공항은 IATA 3글자 코드로.`;
