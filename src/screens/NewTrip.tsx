import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconKey } from "../components/Icon";
import { go, Sheet, Switch, TimeInput } from "../components/ui";
import { Help } from "../components/Help";
import { HELP } from "../lib/help";
import { addDays, daysBetween, fmtDay, parseDay, pad, seasonOf, today } from "../lib/dates";
import { cleanSleep, NIGHT_LABEL, nightOf, sleepCounts, sleepNote, tripDurLabel, tripNights } from "../lib/trip";
import { canUseAi, LOGIN_FOR_AI, readFlights, runAi } from "../lib/ai/run";
import { loginWithKakao, planAfterLogin } from "../lib/cloud";
import { createTrip, toast, updateTrip, useApp } from "../lib/store";
import type { Kind, Leg, NightAway, NightKind, Trip } from "../lib/types";

const COUNTRIES = ["일본", "대만", "베트남", "태국", "필리핀", "싱가포르", "홍콩", "미국", "프랑스"];
const CITIES = ["부산", "제주", "강릉", "경주", "여수", "전주", "속초", "통영"];
const TRANSPORT: [string, "car" | "train" | "bus" | "flight"][] = [["자차", "car"], ["KTX·기차", "train"], ["고속버스", "bus"], ["비행기", "flight"]];
const WHO = ["혼자", "연인·부부", "친구", "가족", "아이와"];
const LIKES = ["맛집", "카페", "쇼핑", "자연·풍경", "바다", "역사·문화", "야경", "사진 명소", "캐릭터·굿즈", "온천·휴식"];
const PACES: [string, string][] = [["여유롭게", "하루 4~5곳"], ["보통", "하루 6~7곳"], ["알차게", "하루 8곳 이상"]];

interface Flight { from: string; to: string; dep: string; arr: string; no: string }
interface W {
  step: number; kind: Kind | ""; start: string; nights: number; sleep: Record<string, NightAway>; country: string; city: string;
  out: Flight; back: Flight; noFlight: boolean; origin: string; transport: string; arrTime: string; depTime: string;
  who: string; likes: string[]; pace: string; memo: string; title: string;
}

function fromTrip(t: Trip): W {
  const f = (l?: Leg): Flight => ({ from: l?.from ?? "", to: l?.to ?? "", dep: l?.dep ?? "", arr: l?.arr ?? "", no: l?.no ?? "" });
  return {
    step: 2, kind: t.kind, start: t.start, nights: t.nights, sleep: { ...(t.sleep ?? {}) }, country: t.country, city: t.city,
    out: f(t.legs.out), back: f(t.legs.back), noFlight: t.kind === "overseas" && !t.legs.out && !t.legs.back,
    origin: t.origin, transport: t.transport, arrTime: (t.legs.out?.arr ?? "").slice(11, 16), depTime: (t.legs.back?.dep ?? "").slice(11, 16),
    who: t.companions, likes: [...t.styles], pace: t.pace || "보통", memo: t.memo, title: t.title,
  };
}

export function NewTrip({ kind, editId }: { kind?: string; editId?: string }) {
  const s = useApp();
  const editing = editId ? s.trips.find((t) => t.id === editId) : undefined;
  const [w, setW] = useState<W>(() =>
    editing ? fromTrip(editing) : {
      step: kind === "overseas" || kind === "domestic" ? 2 : 1, kind: kind === "overseas" || kind === "domestic" ? kind : "",
      start: addDays(today(), 14), nights: 2, sleep: {}, country: "", city: "",
      out: { from: "ICN", to: "", dep: "", arr: "", no: "" }, back: { from: "", to: "ICN", dep: "", arr: "", no: "" }, noFlight: false,
      origin: "", transport: "", arrTime: "", depTime: "", who: "", likes: [], pace: "보통", memo: "", title: "",
    });
  const set = (p: Partial<W>) => setW((x) => ({ ...x, ...p }));
  const minStep = editing ? 2 : 1;
  const autoTitle = `${(w.kind === "overseas" ? w.city || w.country : w.city) || "새 여행"} ${tripDurLabel(w)}`;

  const next = () => {
    if (w.step === 1 && !w.kind) return toast("해외인지 국내인지 골라 주세요");
    if (w.step === 3 && w.kind === "overseas" && !w.country.trim()) return toast("나라를 넣어 주세요");
    if (w.step === 3 && w.kind === "domestic" && !w.city.trim()) return toast("도시를 넣어 주세요");
    set({ step: w.step + 1 });
    window.scrollTo(0, 0);
  };
  const back = () => (w.step <= minStep ? history.back() : set({ step: w.step - 1 }));

  const build = (): Omit<Trip, "id" | "createdAt"> => {
    const end = addDays(w.start, w.nights);
    const legs: Trip["legs"] = {};
    if (w.kind === "overseas" && !w.noFlight) {
      if (w.out.from || w.out.to || w.out.dep || w.out.arr) legs.out = { mode: "flight", ...w.out };
      if (w.back.from || w.back.to || w.back.dep || w.back.arr) legs.back = { mode: "flight", ...w.back };
    }
    if (w.kind === "domestic") {
      if (w.origin || w.transport || w.arrTime) legs.out = { mode: w.transport, from: w.origin, to: w.city, dep: "", arr: w.arrTime ? `${w.start}T${w.arrTime}` : "" };
      if (w.origin || w.transport || w.depTime) legs.back = { mode: w.transport, from: w.city, to: w.origin, dep: w.depTime ? `${end}T${w.depTime}` : "", arr: "" };
    }
    return {
      title: (w.title || autoTitle).trim().slice(0, 60), kind: w.kind as Kind, country: w.kind === "overseas" ? w.country.trim() : "대한민국", city: w.city.trim(),
      start: w.start, nights: w.nights, sleep: cleanSleep(w.sleep, w.start, w.nights), season: editing?.season ?? "", origin: w.origin.trim(), transport: w.transport, companions: w.who, styles: w.likes, pace: w.pace,
      memo: w.memo.trim(), legs, dayLabels: editing?.dayLabels ?? {}, notice: editing?.notice ?? "", recs: editing?.recs ?? [],
    };
  };
  const finish = (how: "ai" | "empty" | "save" | "login") => {
    if (editing) {
      updateTrip(editing.id, build());
      toast("여행 정보를 저장했어요");
      go(`/trip/${editing.id}`);
      return;
    }
    const id = createTrip(build());
    go(`/trip/${id}`);
    if (how === "ai") setTimeout(() => runAi(id, { kind: "plan" }), 0);
    if (how === "login") {
      // keep the trip, sign in, and let the AI plan it once the member is back
      planAfterLogin(id);
      setTimeout(() => loginWithKakao(), 0);
    }
  };

  const help = w.step === 1 ? HELP.kind : w.step === 2 ? HELP.dates : w.step === 3 ? (w.kind === "overseas" ? HELP.overseas : HELP.domestic) : HELP.style;
  return (
    <main className="screen" style={{ gap: 18 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="icon-btn" aria-label={w.step <= minStep ? "닫기" : "이전 단계"} onClick={back}>
          <Icon name={w.step <= minStep ? "close" : "back"} />
        </button>
        <div className="progress" aria-hidden="true">{[1, 2, 3, 4].map((i) => <span key={i} className={i <= w.step ? "on" : ""} />)}</div>
        <span className="mono muted" style={{ fontSize: 13, fontWeight: 600 }}>{w.step}/4</span>
        <Help key={help.id} screen={help} auto={help.id === "new-2" && !editing} />
      </header>

      {w.step === 1 && <StepKind w={w} set={set} />}
      {w.step === 2 && <StepDates w={w} set={set} />}
      {w.step === 3 && w.kind === "overseas" && <StepOverseas w={w} set={set} />}
      {w.step === 3 && w.kind === "domestic" && <StepDomestic w={w} set={set} />}
      {w.step === 4 && <StepStyle w={w} set={set} autoTitle={autoTitle} />}

      <div className="dock-bottom">
        {w.step < 4 ? (
          <button type="button" className="btn primary big" onClick={next}>다음</button>
        ) : editing ? (
          <button type="button" className="btn primary big" onClick={() => finish("save")}>저장</button>
        ) : (
          <div data-help="st-finish" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <button type="button" className="btn big" onClick={() => finish("empty")}>빈 일정으로</button>
            {canUseAi()
              ? <button type="button" className="btn primary big" onClick={() => finish("ai")}><Icon name="sparkle" />AI로 일정 짜기</button>
              : <button type="button" className="kakao-btn big-k" onClick={() => finish("login")}>카카오 로그인하고 AI로 짜기</button>}
          </div>
        )}
      </div>
    </main>
  );
}

type StepProps = { w: W; set: (p: Partial<W>) => void };

function StepKind({ w, set }: StepProps) {
  const opt = (k: Kind, icon: "globe" | "train", title: string, sub: string, tags: string[]) => (
    <button type="button" data-help={`kind-${k}`} className={"kind" + (w.kind === k ? " on" : "")} aria-pressed={w.kind === k} onClick={() => set({ kind: k, step: 2 })}>
      {w.kind === k && <span className="check"><Icon name="check" size={16} stroke={2.6} /></span>}
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="ic" style={{ background: k === "overseas" ? "var(--accent-soft)" : "var(--good-soft)", color: k === "overseas" ? "var(--accent-text)" : "var(--good)" }}><Icon name={icon} size={26} stroke={1.6} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <b style={{ fontSize: 20 }}>{title}</b>
          <span className="muted" style={{ fontSize: 14 }}>{sub}</span>
        </span>
      </span>
      <span className="chips">{tags.map((t) => <span key={t} className="tag" style={{ background: "var(--sunk)", color: "var(--muted)", fontSize: 12, padding: "4px 9px" }}>{t}</span>)}</span>
    </button>
  );
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>어디로 가요?</h1>
        <p className="muted">고른 쪽에 맞춰 다음 단계에서 물어보는 내용이 달라져요.</p>
      </div>
      {opt("overseas", "globe", "해외여행", "나라 · 도시 · 공항 · 항공편 시간", ["입국·출국 시간까지 계산", "구글맵 길찾기"])}
      {opt("domestic", "train", "국내여행", "도시 · 출발지 · 교통수단", ["KTX · 자차 · 버스 · 비행기", "카카오맵 · 네이버지도 길찾기"])}
    </>
  );
}

const MAX_NIGHTS = 30;
const NIGHT_ICON: Record<NightKind, IconKey> = { stay: "stay", flight: "flight", move: "train" };
const NIGHT_SHORT: Record<NightKind, string> = { stay: "숙소", flight: "기내", move: "이동" };
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`;

function StepDates({ w, set }: StepProps) {
  const [sheet, setSheet] = useState<"both" | "end" | null>(null);
  const [pick, setPick] = useState<{ day: string; left: number; top: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const end = addDays(w.start, w.nights);
  const nights = tripNights(w);
  const kindOf = (d: string) => nightOf(w, d);
  const setKind = (d: string, k: NightKind) => {
    const s = { ...w.sleep };
    if (k === "stay") delete s[d]; else s[d] = k;
    set({ sleep: s });
  };
  // close the picker when tapping anywhere else
  useEffect(() => {
    if (!pick) return;
    const off = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!popRef.current?.contains(el) && !el.closest(".night-cell")) setPick(null);
    };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [pick]);
  const openPick = (d: string, el: HTMLElement) => {
    if (pick?.day === d) return setPick(null);
    const box = gridRef.current!;
    const left = Math.max(0, Math.min(el.offsetLeft + el.offsetWidth / 2 - 120, box.clientWidth - 240));
    setPick({ day: d, left, top: el.offsetTop + el.offsetHeight + 6 });
  };
  const first = nights[0];
  const last = nights[nights.length - 1];
  const presets: [string, string][] = nights.length > 1 ? [["가는 비행기에서 1박", first], ["오는 비행기에서 1박", last]] : nights.length ? [["밤 비행기에서 1박", first]] : [];
  const lead = parseDay(w.start).getDay();
  const cells: ({ d: string; home: boolean } | null)[] = [...Array<null>(lead).fill(null), ...nights.map((d) => ({ d, home: false })), { d: end, home: true }];
  while (cells.length % 7) cells.push(null);
  const note = sleepNote(w);

  return (
    <>
      <h1 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>언제, 며칠 가요?</h1>
      <section className="sec" aria-label="날짜" style={{ gap: 8 }}>
        <div className="date-fields" data-help="dates">
          <button type="button" className="date-field" aria-label={`가는 날 바꾸기, 지금 ${fmtDay(w.start)}`} onClick={() => setSheet("both")}>
            <span className="k">가는 날</span><b>{fmtDay(w.start)}</b>
          </button>
          <span className="days-pill">{w.nights ? `${w.nights + 1}일` : "당일"}</span>
          <button type="button" className="date-field" aria-label={`오는 날 바꾸기, 지금 ${fmtDay(end)}`} onClick={() => setSheet("end")}>
            <span className="k">오는 날</span><b>{fmtDay(end)}</b>
          </button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>누르면 달력이 열려요. 두 달에 걸친 여행도 위아래로 넘기며 한 번에 골라요.</span>
      </section>

      {nights.length > 0 && (
        <section className="card" aria-labelledby="night-title" style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 id="night-title" style={{ fontSize: 17 }}>밤마다 어디서 자요?</h2>
            <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>기본은 모두 숙소예요. 밤 비행기나 야간 버스 · 기차를 타는 밤은 칸을 눌러 바꿔 주세요.</span>
          </div>
          <div className="chips" data-help="presets" style={{ alignSelf: "flex-start" }}>
            {presets.map(([label, d]) => {
              const on = kindOf(d) === "flight";
              return <button key={label} type="button" className={"chip sm" + (on ? " on" : "")} aria-pressed={on} onClick={() => setKind(d, on ? "stay" : "flight")}><Icon name="flight" size={15} />{label}</button>;
            })}
          </div>
          <div className="wd-row" aria-hidden="true">{"일월화수목금토".split("").map((x, i) => <span key={x} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>{x}</span>)}</div>
          <div className="night-grid" data-help="nights" ref={gridRef}>
            {cells.map((c, i) => {
              if (!c) return <span key={i} />;
              const firstOfMonth = c.d === w.start || c.d.endsWith("-01");
              const label = firstOfMonth ? md(c.d) : String(Number(c.d.slice(8)));
              if (c.home) return <span key={c.d} className="night-cell home"><span className="d">{label}</span><span className="k muted">도착</span></span>;
              const k = kindOf(c.d);
              return (
                <button key={c.d} type="button" className={`night-cell ${k}` + (pick?.day === c.d ? " picked" : "")} aria-haspopup="dialog" aria-expanded={pick?.day === c.d}
                  aria-label={`${fmtDay(c.d)} 밤, ${NIGHT_LABEL[k]}. 눌러서 바꾸기`} onClick={(e) => openPick(c.d, e.currentTarget)}>
                  <span className="d">{label}</span><Icon name={NIGHT_ICON[k]} size={18} /><span className="k">{NIGHT_SHORT[k]}</span>
                </button>
              );
            })}
            {pick && (
              <div ref={popRef} className="night-pop" role="dialog" aria-label={`${fmtDay(pick.day)} 밤 어디서 자요?`} style={{ left: pick.left, top: pick.top }}
                onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setPick(null); } }}>
                <b>{fmtDay(pick.day)} 밤 어디서 자요?</b>
                <div className="opts">
                  {(["stay", "flight", "move"] as NightKind[]).map((k) => (
                    <button key={k} type="button" aria-pressed={kindOf(pick.day) === k} autoFocus={kindOf(pick.day) === k} onClick={() => { setKind(pick.day, k); setPick(null); }}>
                      <Icon name={NIGHT_ICON[k]} size={18} />{NIGHT_SHORT[k]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--sunk)", borderRadius: 16, padding: "12px 14px" }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--surface)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name={note ? "moon" : "leaf"} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <b style={{ fontSize: 15 }}><span className="mono">{fmtDay(w.start)} – {fmtDay(end)}</span> · {tripDurLabel(w)}</b>
          <span className="muted" style={{ fontSize: 13 }}>{note ? `숙소 ${sleepCounts(w).stay}박 · ${note} · ` : ""}{seasonOf(w.start)}이에요. 이 계절에 좋은 곳을 함께 추천해요.</span>
        </span>
      </section>

      {sheet && (
        <DateSheet start={w.start} end={end} mode={sheet} onClose={() => setSheet(null)}
          onDone={(s, e) => { const n = daysBetween(s, e); set({ start: s, nights: n, sleep: cleanSleep(w.sleep, s, n) }); setSheet(null); }} />
      )}
    </>
  );
}

/** Bottom sheet calendar: months run on below each other, so a trip across two months is picked in one go. */
function DateSheet({ start, end, mode, onClose, onDone }: { start: string; end: string; mode: "both" | "end"; onClose: () => void; onDone: (s: string, e: string) => void }) {
  const t0 = today();
  const [s, setS] = useState(start);
  const [e, setE] = useState<string | null>(end);
  // which tap comes next: "both" starts over from the departure day, "end" only moves the return day
  const [stage, setStage] = useState<"start" | "end">(mode === "end" ? "end" : "start");
  const monthsRef = useRef<HTMLDivElement>(null);
  const months = useMemo(() => {
    const first = parseDay(start < t0 ? start : t0);
    return Array.from({ length: 15 }, (_, i) => new Date(first.getFullYear(), first.getMonth() + i, 1));
  }, []);
  useEffect(() => {
    monthsRef.current?.querySelector<HTMLElement>(`[data-month="${(mode === "end" ? end : start).slice(0, 7)}"]`)?.scrollIntoView({ block: "start" });
  }, []);
  const tap = (d: string) => {
    if (stage === "start") { setS(d); setE(null); setStage("end"); return; }
    if (d < s) { setS(d); setE(null); return; }
    if (daysBetween(s, d) > MAX_NIGHTS) return toast(`여행은 최대 ${MAX_NIGHTS + 1}일까지 고를 수 있어요`);
    setE(d);
    setStage("start");
  };
  const n = e ? daysBetween(s, e) : 0;
  const hint = !e ? "돌아오는 날을 누르세요. 출발일보다 앞을 누르면 거기서부터 다시 골라요."
    : mode === "end" && stage === "end" ? "돌아오는 날을 누르세요. 가는 날은 그대로예요."
    : "다시 누르면 출발일부터 새로 골라요. 같은 날을 두 번 누르면 당일치기예요.";
  return (
    <Sheet onClose={onClose} label="날짜 고르기" tall>
      <div className="date-sheet" style={{ display: "contents" }}>
        <div className="sheet-head">
          <b style={{ flex: 1, fontSize: 18 }}>날짜 고르기</b>
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="date-sum" role="status">
          <span><span className="k">가는 날</span><b>{fmtDay(s)}</b></span>
          <span className="days-pill">{e ? (n ? `${n + 1}일` : "당일") : "…"}</span>
          <span style={{ textAlign: "right" }}><span className="k">오는 날</span><b>{e ? fmtDay(e) : "고르는 중"}</b></span>
        </div>
        <p className="date-hint">{hint}</p>
        <div className="wd-row" aria-hidden="true">{"일월화수목금토".split("").map((x, i) => <span key={x} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>{x}</span>)}</div>
        <div className="sheet-body date-months" ref={monthsRef}>
          {months.map((m) => {
            const key = `${m.getFullYear()}-${pad(m.getMonth() + 1)}`;
            const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
            const cells: (string | null)[] = [...Array<null>(m.getDay()).fill(null)];
            for (let d = 1; d <= days; d++) cells.push(`${key}-${pad(d)}`);
            return (
              <section key={key} data-month={key} aria-label={`${m.getFullYear()}년 ${m.getMonth() + 1}월`}>
                <div className="m-title">{m.getFullYear()}년 {m.getMonth() + 1}월</div>
                <div className="cal-grid">
                  {cells.map((c, i) => {
                    if (!c) return <span key={i} />;
                    const dow = i % 7;
                    const edge = c === s || c === e;
                    const inRange = !!e && c > s && c < e;
                    const past = c < t0;
                    const tag = c === s ? "가는 날" : c === e ? "오는 날" : "";
                    return (
                      <button key={c} type="button" disabled={past} aria-pressed={edge}
                        className={["cal-day", dow === 0 ? "sun" : dow === 6 ? "sat" : "", edge ? "edge" : inRange ? "in" : "", past ? "past" : ""].join(" ")}
                        aria-label={`${m.getMonth() + 1}월 ${Number(c.slice(8))}일 ${"일월화수목금토"[dow]}요일${tag ? `, ${tag}` : ""}`} onClick={() => tap(c)}>
                        {Number(c.slice(8))}{tag && <span className="tag">{tag}</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn primary big" style={{ width: "100%" }} disabled={!e} onClick={() => e && onDone(s, e)}>
            {e ? `${md(s)} – ${md(e)} · ${n ? `${n + 1}일` : "당일치기"}로 정하기` : "돌아오는 날을 골라 주세요"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function FlightCard({ label, f, onChange, date }: { label: string; f: Flight; onChange: (f: Flight) => void; date: string }) {
  const [open, setOpen] = useState(false);
  const id = label === "가는 편" ? "out" : "back";
  const time = (v: string) => v.slice(11, 16) || "--:--";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" className="flight" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sec-row" style={{ fontSize: 12, fontWeight: 700, color: "var(--pass-muted)" }}>
          <span>{label} · {f.dep ? fmtDay(f.dep.slice(0, 10)) : fmtDay(date)}{f.no ? ` · ${f.no}` : ""}</span>
          <Icon name="edit" size={16} />
        </span>
        <span className="frow">
          <span style={{ display: "flex", flexDirection: "column" }}><b style={{ fontSize: 22, fontWeight: 600 }}>{f.from || "---"}</b><span style={{ fontSize: 13, color: "var(--pass-muted)" }}>{time(f.dep)}</span></span>
          <span className="line" /><Icon name="flight" size={18} stroke={1.6} /><span className="line" />
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}><b style={{ fontSize: 22, fontWeight: 600 }}>{f.to || "---"}</b><span style={{ fontSize: 13, color: "var(--pass-muted)" }}>{time(f.arr)}</span></span>
        </span>
      </button>
      {open && (
        <div className="card" style={{ padding: 12, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
          <div className="field"><label className="label" htmlFor={`${id}-from`}>출발 공항</label><input id={`${id}-from`} className="input mono" value={f.from} placeholder="ICN" onChange={(e) => onChange({ ...f, from: e.target.value.toUpperCase().trim() })} /></div>
          <div className="field"><label className="label" htmlFor={`${id}-to`}>도착 공항</label><input id={`${id}-to`} className="input mono" value={f.to} placeholder="KIX" onChange={(e) => onChange({ ...f, to: e.target.value.toUpperCase().trim() })} /></div>
          <DateTime24 id={`${id}-dep`} label="출발 (현지)" value={f.dep} fallbackDate={date} onChange={(v) => onChange({ ...f, dep: v })} />
          <DateTime24 id={`${id}-arr`} label="도착 (현지)" value={f.arr} fallbackDate={f.dep.slice(0, 10) || date} onChange={(v) => onChange({ ...f, arr: v })} />
          <div className="field" style={{ gridColumn: "1 / -1" }}><label className="label" htmlFor={`${id}-no`}>편명 (선택)</label><input id={`${id}-no`} className="input mono" value={f.no} onChange={(e) => onChange({ ...f, no: e.target.value.toUpperCase().trim() })} /></div>
        </div>
      )}
    </div>
  );
}

/** Date + 24-hour time for a flight ("YYYY-MM-DDTHH:MM"), instead of datetime-local which shows 오전/오후. */
function DateTime24({ id, label, value, fallbackDate, onChange }: { id: string; label: string; value: string; fallbackDate: string; onChange: (v: string) => void }) {
  const d = value.slice(0, 10);
  const t = value.slice(11, 16);
  const join = (day: string, time: string) => (day && time ? `${day}T${time}` : day ? `${day}T${t || "00:00"}` : "");
  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label className="label" htmlFor={`${id}-t`}>{label}</label>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 8 }}>
        <input id={`${id}-d`} aria-label={`${label} 날짜`} className="input" type="date" value={d} onChange={(e) => onChange(join(e.target.value, t))} />
        <TimeInput id={`${id}-t`} value={t} placeholder="14:30" onChange={(v) => onChange(v ? join(d || fallbackDate, v) : d ? `${d}T00:00` : "")} />
      </div>
    </div>
  );
}

type Span = Pick<W, "start" | "nights" | "sleep">;
/**
 * A flight that lands the next day means that night is spent on the plane: mark it 기내, and stretch the
 * trip to the landing day if needed. Only for a one- or two-day jump, so a half-typed date can't stretch it.
 */
function fitFlights(w: W, out: Flight, back: Flight): { patch: Span; title: string; body: string } | null {
  const day = (v: string) => v.slice(0, 10);
  const overnight = (f: Flight) => f.dep && f.arr && day(f.arr) > day(f.dep) && daysBetween(day(f.dep), day(f.arr)) <= 2;
  let { start, nights } = w;
  const sleep = { ...w.sleep };
  const lines: string[] = [];
  if (overnight(out)) {
    const d = day(out.dep);
    let moved = false;
    if (d < start && daysBetween(d, start) <= 2) { nights += daysBetween(d, start); start = d; moved = true; }
    const moveText = moved ? `출발이 ${fmtDay(d)}이라 여행을 그날부터로 맞추고, ` : "";
    if (d >= start && sleep[d] !== "flight") { sleep[d] = "flight"; lines.push(`${moveText}${fmtDay(d)} 밤은 가는 비행기에서 자는 것으로 했어요.`); }
    else if (moved) lines.push(`출발이 ${fmtDay(d)}이라 여행을 그날부터로 맞췄어요.`);
  }
  if (overnight(back)) {
    const d = day(back.dep), a = day(back.arr);
    const endNow = addDays(start, nights);
    let moved = false;
    if (a > endNow && daysBetween(endNow, a) <= 2) { nights = daysBetween(start, a); moved = true; }
    const moveText = moved ? `도착이 ${fmtDay(a)}이라 여행을 ${fmtDay(a)}까지로 맞추고, ` : "";
    if (d >= start && d < addDays(start, nights) && sleep[d] !== "flight") { sleep[d] = "flight"; lines.push(`${moveText}${fmtDay(d)} 밤은 기내박으로 했어요.`); }
    else if (moved) lines.push(`도착이 ${fmtDay(a)}이라 여행을 ${fmtDay(a)}까지로 맞췄어요.`);
  }
  if (!lines.length) return null;
  return {
    patch: { start, nights, sleep: cleanSleep(sleep, start, nights) },
    title: overnight(out) && overnight(back) ? "가는 · 오는 비행기에서 자요" : overnight(back) ? "오는 비행기에서 하룻밤 자요" : "가는 비행기에서 하룻밤 자요",
    body: lines.join(" "),
  };
}

function StepOverseas({ w, set }: StepProps) {
  const file = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [fit, setFit] = useState<{ undo: Span; title: string; body: string } | null>(null);
  /** Sets the flights and, when one lands the next day, the night on the plane (with a way back). */
  const setFlights = (out: Flight, back: Flight, extra: Partial<W> = {}) => {
    const r = fitFlights(w, out, back);
    if (r) setFit({ undo: { start: w.start, nights: w.nights, sleep: w.sleep }, title: r.title, body: r.body });
    set({ out, back, ...extra, ...(r?.patch ?? {}) });
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setReading(true);
    try {
      const r = await readFlights(f);
      const pick = (src: Record<string, string> | undefined, cur: Flight): Flight => ({ from: src?.from || cur.from, to: src?.to || cur.to, dep: src?.dep || cur.dep, arr: src?.arr || cur.arr, no: src?.no || cur.no });
      setFlights(pick(r.out, w.out), pick(r.back, w.back), { noFlight: false });
      toast("항공편을 채웠어요. 맞는지 확인해 주세요");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setReading(false);
      if (file.current) file.current.value = "";
    }
  };
  return (
    <>
      <h1 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>어느 나라로, 어떤 비행기로?</h1>
      <div className="field">
        <label className="label" htmlFor="ov-country">나라</label>
        <input id="ov-country" data-help="ov-place" className="input" value={w.country} placeholder="예: 일본" onChange={(e) => set({ country: e.target.value })} />
        <div className="chips scroll">{COUNTRIES.map((c) => <button key={c} type="button" className={"chip sm" + (w.country === c ? " on" : "")} onClick={() => set({ country: c })}>{c}</button>)}</div>
      </div>
      <div className="field">
        <label className="label" htmlFor="ov-city">도시 (선택)</label>
        <input id="ov-city" className="input" value={w.city} placeholder="예: 오사카" onChange={(e) => set({ city: e.target.value })} />
        <span className="muted" style={{ fontSize: 12 }}>비워 두면 계절과 취향을 보고 AI가 골라요.</span>
      </div>
      <div className="sec">
        <div className="sec-row">
          <span className="label">항공편 (현지 시각)</span>
          <button type="button" className="btn sm" data-help="ov-ticket" style={{ color: "var(--accent-text)" }} onClick={() => (canUseAi() ? file.current?.click() : toast(LOGIN_FOR_AI))} disabled={reading}>
            <Icon name="camera" size={16} />{reading ? "읽는 중…" : "e-티켓 캡처로 채우기"}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {!w.noFlight && (
          <>
            <FlightCard label="가는 편" f={w.out} date={w.start} onChange={(out) => setFlights(out, w.back)} />
            <FlightCard label="오는 편" f={w.back} date={addDays(w.start, w.nights)} onChange={(back) => setFlights(w.out, back)} />
          </>
        )}
        {fit && !w.noFlight && (
          <section className="fit-note" role="status" aria-labelledby="fit-title">
            <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--surface)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="moon" /></span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              <b id="fit-title" style={{ fontSize: 15 }}>{fit.title}</b>
              <span style={{ fontSize: 13, lineHeight: 1.5 }}>{fit.body}</span>
              <span className="chips-row">
                <span>숙소 {sleepCounts(w).stay}박</span>
                {sleepNote(w) && <span style={{ color: "var(--accent-text)" }}>{sleepNote(w)}</span>}
                <span>{tripDurLabel(w)}</span>
                <button type="button" className="link-btn" style={{ marginLeft: "auto", minHeight: 36, textDecoration: "underline", textUnderlineOffset: 3 }}
                  onClick={() => { set(fit.undo); setFit(null); }}>되돌리기</button>
              </span>
            </span>
          </section>
        )}
        <label className="toggle" htmlFor="ov-noflight" data-help="ov-noflight">
          <span>항공편은 아직 안 정했어요</span>
          <Switch id="ov-noflight" checked={w.noFlight} onChange={(v) => set({ noFlight: v })} label="항공편 미정" />
        </label>
      </div>
    </>
  );
}

function StepDomestic({ w, set }: StepProps) {
  return (
    <>
      <h1 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>어느 도시로, 어떻게 가요?</h1>
      <div className="field">
        <label className="label" htmlFor="dm-city">도시</label>
        <input id="dm-city" data-help="dm-city" className="input" value={w.city} placeholder="예: 부산" onChange={(e) => set({ city: e.target.value })} />
        <div className="chips">{CITIES.map((c) => <button key={c} type="button" className={"chip sm" + (w.city === c ? " on" : "")} onClick={() => set({ city: c })}>{c}</button>)}</div>
      </div>
      <div className="field">
        <label className="label" htmlFor="dm-origin">어디서 출발해요?</label>
        <input id="dm-origin" className="input" value={w.origin} placeholder="예: 서울" onChange={(e) => set({ origin: e.target.value })} />
      </div>
      <div className="field">
        <span className="label">교통수단</span>
        <div className="seg" data-help="dm-transport" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {TRANSPORT.map(([t, ic]) => (
            <button key={t} type="button" className={w.transport === t ? "on" : ""} aria-pressed={w.transport === t} style={{ height: 74, fontSize: 13 }} onClick={() => set({ transport: w.transport === t ? "" : t })}>
              <Icon name={ic} size={22} stroke={1.7} />{t}
            </button>
          ))}
        </div>
      </div>
      <div data-help="dm-times" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label className="label" htmlFor="dm-arr">첫날 {w.city || "현지"} 도착</label><TimeInput id="dm-arr" placeholder="10:30" value={w.arrTime} onChange={(v) => set({ arrTime: v })} /></div>
        <div className="field"><label className="label" htmlFor="dm-dep">마지막 날 {w.city || "현지"} 출발</label><TimeInput id="dm-dep" placeholder="18:00" value={w.depTime} onChange={(v) => set({ depTime: v })} /></div>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>시간을 아직 모르면 비워 두세요. AI가 보통 시간으로 잡아 둘게요.</p>
    </>
  );
}

function StepStyle({ w, set, autoTitle }: StepProps & { autoTitle: string }) {
  return (
    <>
      <h1 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>누구와, 어떤 여행?</h1>
      <div className="field">
        <span className="label">누구와</span>
        <div className="chips" data-help="st-who">{WHO.map((c) => <button key={c} type="button" className={"chip" + (w.who === c ? " on" : "")} aria-pressed={w.who === c} onClick={() => set({ who: w.who === c ? "" : c })}>{c}</button>)}</div>
      </div>
      <div className="field">
        <span className="label">좋아하는 것 · 여러 개 골라도 돼요</span>
        <div className="chips" data-help="st-likes">
          {LIKES.map((c) => {
            const on = w.likes.includes(c);
            return <button key={c} type="button" className={"chip" + (on ? " on" : "")} aria-pressed={on} onClick={() => set({ likes: on ? w.likes.filter((x) => x !== c) : [...w.likes, c] })}>{on && <Icon name="check" size={14} stroke={2.8} />}{c}</button>;
          })}
        </div>
      </div>
      <div className="field">
        <span className="label">하루 페이스</span>
        <div className="seg" data-help="st-pace" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {PACES.map(([p, d]) => (
            <button key={p} type="button" className={w.pace === p ? "on" : ""} aria-pressed={w.pace === p} style={{ height: 64 }} onClick={() => set({ pace: p })}>
              <span style={{ fontSize: 15 }}>{p}</span><span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{d}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="st-memo">꼭 하고 싶은 것, 피하고 싶은 것</label>
        <textarea id="st-memo" className="input" rows={3} value={w.memo} placeholder="예: 돼지국밥은 꼭, 회는 못 먹어요" onChange={(e) => set({ memo: e.target.value })} />
      </div>
      <div className="field" style={{ paddingBottom: 30 }}>
        <label className="label" htmlFor="st-title">여행 이름</label>
        <input id="st-title" className="input" value={w.title} placeholder={autoTitle} onChange={(e) => set({ title: e.target.value })} />
      </div>
    </>
  );
}
