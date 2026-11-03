import { fmtShort, fromMin, normTime, toMin, uid } from "../dates";
import { tripDays } from "../trip";
import type { Draft } from "../store";
import type { IconName, Item, Status } from "../types";
import { STATUS_LABEL } from "../types";

export const ICONS: IconName[] = ["flight", "train", "car", "bus", "walk", "food", "cafe", "shop", "sight", "nature", "beach", "night", "stay", "activity", "pin"];
const STATUSES: Status[] = ["confirmed", "optional", "check", "todo"];

const ITEM_PROPS = {
  day: { type: "string", description: "YYYY-MM-DD" },
  start: { type: "string", description: "HH:MM 24시간제" },
  end: { type: "string", description: "HH:MM, 모르면 생략" },
  title: { type: "string" },
  icon: { type: "string", enum: ICONS, description: "flight 비행 · train 기차/전철 · car · bus · walk · food 식사 · cafe · shop 쇼핑 · sight 관광 · nature 자연 · beach 바다 · night 야경 · stay 숙소 · activity 체험/테마파크 · pin 기타" },
  status: { type: "string", enum: STATUSES },
  place: { type: "string", description: "지도 앱 검색용 장소명" },
  lat: { type: "number" },
  lng: { type: "number" },
  note: { type: "string" },
};

export const TOOL_DEFS = [
  {
    name: "add_items",
    description: "일정 항목을 여러 개 한 번에 추가해. 추가된 항목의 id 목록을 돌려줘.",
    input_schema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: ITEM_PROPS, required: ["day", "start", "title"] } } }, required: ["items"] },
  },
  {
    name: "update_items",
    description: "기존 항목을 id로 여러 개 고쳐. 바꿀 필드만 넣어. 위치를 지우려면 clear_location: true, 완료 표시는 done.",
    input_schema: { type: "object", properties: { updates: { type: "array", items: { type: "object", properties: { id: { type: "string" }, ...ITEM_PROPS, done: { type: "boolean" }, clear_location: { type: "boolean" } }, required: ["id"] } } }, required: ["updates"] },
  },
  {
    name: "delete_items",
    description: "id 목록에 있는 항목을 지워.",
    input_schema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] },
  },
  {
    name: "shift_items",
    description: "어느 날 from 시각 이후(포함)에 시작하는, 완료되지 않은 항목의 시작·끝을 minutes만큼 미루거나(+) 당겨(-).",
    input_schema: { type: "object", properties: { day: { type: "string" }, from: { type: "string", description: "HH:MM" }, minutes: { type: "number" } }, required: ["day", "from", "minutes"] },
  },
  {
    name: "update_trip",
    description: "여행 전체 정보를 고쳐: title, season, notice, dayLabels(날짜→짧은 테마), recommendations(계절 추천 목록 전체 교체), legs(이동편 출발·도착). 넣은 필드만 바뀌어.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        season: { type: "string" },
        notice: { type: "string" },
        dayLabels: { type: "array", description: "날짜별 짧은 테마", items: { type: "object", properties: { day: { type: "string", description: "YYYY-MM-DD" }, label: { type: "string" } }, required: ["day", "label"] } },
        recommendations: { type: "array", items: { type: "object", properties: { title: { type: "string" }, why: { type: "string" }, icon: { type: "string", enum: ICONS }, area: { type: "string" } }, required: ["title", "why"] } },
        legs: {
          type: "object",
          properties: {
            out: { type: "object", properties: { dep: { type: "string", description: "YYYY-MM-DDTHH:MM" }, arr: { type: "string" }, from: { type: "string" }, to: { type: "string" }, no: { type: "string" } } },
            back: { type: "object", properties: { dep: { type: "string" }, arr: { type: "string" }, from: { type: "string" }, to: { type: "string" }, no: { type: "string" } } },
          },
        },
      },
    },
  },
];

type Input = Record<string, unknown>;
export interface ToolCtx { draft: Draft; changes: string[]; onStage?: (name: string) => void }

function clean(src: Input) {
  const o: Partial<Item> & { clear?: boolean } = {};
  if (src.day !== undefined) {
    const d = String(src.day).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`day 형식이 틀렸어요: ${d}`);
    o.day = d;
  }
  if (src.start !== undefined) {
    const t = normTime(src.start);
    if (!t) throw new Error(`start 형식이 틀렸어요: ${String(src.start)}`);
    o.start = t;
  }
  if (src.end !== undefined) o.end = normTime(src.end) || "";
  for (const k of ["title", "place", "note"] as const) if (src[k] !== undefined) o[k] = String(src[k] ?? "").slice(0, k === "note" ? 400 : 120);
  if (src.icon !== undefined) o.icon = ICONS.includes(src.icon as IconName) ? (src.icon as IconName) : "pin";
  if (src.status !== undefined) o.status = STATUSES.includes(src.status as Status) ? (src.status as Status) : "confirmed";
  if (src.clear_location) { o.lat = null; o.lng = null; }
  else if (src.lat !== undefined && src.lng !== undefined) {
    const la = Number(src.lat), ln = Number(src.lng);
    if (isFinite(la) && isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180) { o.lat = la; o.lng = ln; }
  }
  if (src.done !== undefined) o.done = !!src.done;
  return o;
}

export function makeExecutors(ctx: ToolCtx): Record<string, (input: Input) => unknown> {
  const { draft, changes } = ctx;
  const range = () => tripDays(draft.trip);
  const checkDay = (d: string) => {
    const r = range();
    if (!r.includes(d)) throw new Error(`${d}는 여행 기간(${r[0]} ~ ${r[r.length - 1]}) 밖이에요`);
  };
  const find = (id: string) => draft.items.find((i) => i.id === id);
  return {
    add_items(input) {
      const list = Array.isArray(input.items) ? (input.items as Input[]) : [];
      if (!list.length) throw new Error("items가 비어 있어요");
      if (list.length > 80) throw new Error("한 번에 80개까지 넣을 수 있어요");
      const made = list.map((raw, k) => {
        const f = clean(raw);
        if (!f.day || !f.start || !f.title) throw new Error("day, start, title은 꼭 필요해요");
        checkDay(f.day);
        const it: Item = { id: uid("i"), tripId: draft.trip.id, day: f.day, start: f.start, end: f.end || "", title: f.title, icon: f.icon || "pin", status: f.status || "confirmed", place: f.place || "", lat: f.lat ?? null, lng: f.lng ?? null, note: f.note || "", done: false, order: Date.now() + k };
        return it;
      });
      draft.items.push(...made);
      changes.push(...made.map((d) => `+ ${fmtShort(d.day)} ${d.start} ${d.title}`));
      ctx.onStage?.("add_items");
      return made.map((d) => ({ id: d.id, day: d.day, start: d.start, title: d.title }));
    },
    update_items(input) {
      const ups = Array.isArray(input.updates) ? (input.updates as Input[]) : [];
      if (!ups.length) throw new Error("updates가 비어 있어요");
      const out = ups.map((u) => {
        const id = String(u.id || "");
        const cur = find(id);
        if (!cur) throw new Error(`id ${id}인 항목이 없어요`);
        const f = clean(u);
        if (f.day) checkDay(f.day);
        const bits: string[] = [];
        if (f.day && f.day !== cur.day) bits.push(`${fmtShort(cur.day)}→${fmtShort(f.day)}`);
        if (f.start && f.start !== cur.start) bits.push(`${cur.start}→${f.start}`);
        if (f.status && f.status !== cur.status) bits.push(STATUS_LABEL[f.status]);
        if (f.done !== undefined && f.done !== cur.done) bits.push(f.done ? "완료" : "완료 취소");
        Object.assign(cur, f);
        changes.push(`~ ${cur.title}${bits.length ? " " + bits.join(", ") : ""}`);
        return { id, day: cur.day, start: cur.start, end: cur.end, title: cur.title, status: cur.status };
      });
      return out;
    },
    delete_items(input) {
      const ids = (Array.isArray(input.ids) ? input.ids : []).map(String);
      const gone = draft.items.filter((i) => ids.includes(i.id));
      if (!gone.length) throw new Error("지울 항목을 찾지 못했어요");
      draft.items = draft.items.filter((i) => !ids.includes(i.id));
      changes.push(...gone.map((g) => `- ${g.title}`));
      return { deleted: gone.map((g) => g.id) };
    },
    shift_items(input) {
      const day = String(input.day || "");
      const from = toMin(String(input.from || ""));
      const mins = Math.round(Number(input.minutes));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || from == null || !isFinite(mins) || !mins) throw new Error("day, from, minutes를 확인해 주세요");
      if (Math.abs(mins) > 720) throw new Error("12시간 넘게는 한 번에 옮길 수 없어요");
      const targets = draft.items.filter((i) => i.day === day && !i.done && (toMin(i.start) ?? -1) >= from);
      if (!targets.length) throw new Error("옮길 항목이 없어요");
      for (const it of targets) {
        it.start = fromMin(toMin(it.start)! + mins);
        if (it.end) it.end = fromMin((toMin(it.end) ?? 0) + mins);
      }
      changes.push(`↕ ${fmtShort(day)} ${fromMin(from)} 이후 ${targets.length}개 ${mins > 0 ? "+" : ""}${mins}분`);
      return targets.map((t) => ({ id: t.id, title: t.title, start: t.start, end: t.end }));
    },
    update_trip(input) {
      const t = draft.trip;
      const bits: string[] = [];
      if (input.title) { t.title = String(input.title).slice(0, 60); bits.push("제목"); }
      if (input.season) t.season = String(input.season).slice(0, 20);
      if (input.notice !== undefined) { t.notice = String(input.notice || "").slice(0, 300); bits.push("안내"); }
      if (input.dayLabels && typeof input.dayLabels === "object") {
        // a list of {day, label} (all AIs understand it); an older {day: label} map still works
        const pairs: [string, unknown][] = Array.isArray(input.dayLabels)
          ? (input.dayLabels as { day?: unknown; label?: unknown }[]).map((x) => [String(x?.day ?? ""), x?.label])
          : Object.entries(input.dayLabels as Record<string, unknown>);
        for (const [k, v] of pairs) if (/^\d{4}-\d{2}-\d{2}$/.test(k)) t.dayLabels[k] = String(v ?? "").slice(0, 40);
        bits.push("날짜별 테마");
      }
      if (Array.isArray(input.recommendations)) {
        t.recs = (input.recommendations as Input[]).slice(0, 10).map((r) => ({
          id: uid("r"),
          title: String(r.title || "").slice(0, 60),
          why: String(r.why || "").slice(0, 240),
          icon: ICONS.includes(r.icon as IconName) ? (r.icon as IconName) : "pin",
          area: String(r.area || "").slice(0, 40),
        })).filter((r) => r.title);
        bits.push(`계절 추천 ${t.recs.length}곳`);
      }
      if (input.legs && typeof input.legs === "object") {
        for (const k of ["out", "back"] as const) {
          const l = (input.legs as Record<string, Input | undefined>)[k];
          if (!l) continue;
          const cur = t.legs[k] ?? { mode: t.kind === "overseas" ? "flight" : t.transport, from: "", to: "", dep: "", arr: "" };
          for (const f of ["dep", "arr"] as const) if (l[f] !== undefined) {
            const v = String(l[f] || "");
            if (v && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error(`legs.${k}.${f}는 YYYY-MM-DDTHH:MM 형식이어야 해요`);
            cur[f] = v;
          }
          for (const f of ["from", "to", "no"] as const) if (l[f] !== undefined) cur[f] = String(l[f] || "").slice(0, 40);
          t.legs[k] = cur;
        }
        bits.push("이동편");
      }
      changes.push(`✎ 여행 정보: ${bits.join(", ") || "계절"}`);
      ctx.onStage?.("update_trip");
      return { ok: true };
    },
  };
}
