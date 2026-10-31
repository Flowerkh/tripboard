import { useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { go, Switch } from "../components/ui";
import { addDays, durLabel, fmtDay, parseDay, pad, seasonOf, today } from "../lib/dates";
import { readFlights, runAi, hasKey } from "../lib/ai/run";
import { createTrip, toast, updateTrip, useApp } from "../lib/store";
import type { Kind, Leg, Trip } from "../lib/types";

const COUNTRIES = ["일본", "대만", "베트남", "태국", "필리핀", "싱가포르", "홍콩", "미국", "프랑스"];
const CITIES = ["부산", "제주", "강릉", "경주", "여수", "전주", "속초", "통영"];
const TRANSPORT: [string, "car" | "train" | "bus" | "flight"][] = [["자차", "car"], ["KTX·기차", "train"], ["고속버스", "bus"], ["비행기", "flight"]];
const WHO = ["혼자", "연인·부부", "친구", "가족", "아이와"];
const LIKES = ["맛집", "카페", "쇼핑", "자연·풍경", "바다", "역사·문화", "야경", "사진 명소", "캐릭터·굿즈", "온천·휴식"];
const PACES: [string, string][] = [["여유롭게", "하루 4~5곳"], ["보통", "하루 6~7곳"], ["알차게", "하루 8곳 이상"]];

interface Flight { from: string; to: string; dep: string; arr: string; no: string }
interface W {
  step: number; kind: Kind | ""; start: string; nights: number; country: string; city: string;
  out: Flight; back: Flight; noFlight: boolean; origin: string; transport: string; arrTime: string; depTime: string;
  who: string; likes: string[]; pace: string; memo: string; title: string;
}

function fromTrip(t: Trip): W {
  const f = (l?: Leg): Flight => ({ from: l?.from ?? "", to: l?.to ?? "", dep: l?.dep ?? "", arr: l?.arr ?? "", no: l?.no ?? "" });
  return {
    step: 2, kind: t.kind, start: t.start, nights: t.nights, country: t.country, city: t.city,
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
      start: addDays(today(), 14), nights: 2, country: "", city: "",
      out: { from: "ICN", to: "", dep: "", arr: "", no: "" }, back: { from: "", to: "ICN", dep: "", arr: "", no: "" }, noFlight: false,
      origin: "", transport: "", arrTime: "", depTime: "", who: "", likes: [], pace: "보통", memo: "", title: "",
    });
  const set = (p: Partial<W>) => setW((x) => ({ ...x, ...p }));
  const minStep = editing ? 2 : 1;
  const autoTitle = `${(w.kind === "overseas" ? w.city || w.country : w.city) || "새 여행"} ${durLabel(w.nights)}`;

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
      start: w.start, nights: w.nights, season: editing?.season ?? "", origin: w.origin.trim(), transport: w.transport, companions: w.who, styles: w.likes, pace: w.pace,
      memo: w.memo.trim(), legs, dayLabels: editing?.dayLabels ?? {}, notice: editing?.notice ?? "", recs: editing?.recs ?? [],
    };
  };
  const finish = (how: "ai" | "empty" | "save") => {
    if (editing) {
      updateTrip(editing.id, build());
      toast("여행 정보를 저장했어요");
      go(`/trip/${editing.id}`);
      return;
    }
    const id = createTrip(build());
    go(`/trip/${id}`);
    if (how === "ai") setTimeout(() => runAi(id, { kind: "plan" }), 0);
  };

  return (
    <main className="screen" style={{ gap: 18 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="icon-btn" aria-label={w.step <= minStep ? "닫기" : "이전 단계"} onClick={back}>
          <Icon name={w.step <= minStep ? "close" : "back"} />
        </button>
        <div className="progress" aria-hidden="true">{[1, 2, 3, 4].map((i) => <span key={i} className={i <= w.step ? "on" : ""} />)}</div>
        <span className="mono muted" style={{ fontSize: 13, fontWeight: 600 }}>{w.step}/4</span>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <button type="button" className="btn big" onClick={() => finish("empty")}>빈 일정으로</button>
            <button type="button" className="btn primary big" onClick={() => finish("ai")}><Icon name="sparkle" />AI로 일정 짜기</button>
          </div>
        )}
      </div>
    </main>
  );
}

type StepProps = { w: W; set: (p: Partial<W>) => void };

function StepKind({ w, set }: StepProps) {
  const opt = (k: Kind, icon: "globe" | "train", title: string, sub: string, tags: string[]) => (
    <button type="button" className={"kind" + (w.kind === k ? " on" : "")} aria-pressed={w.kind === k} onClick={() => set({ kind: k, step: 2 })}>
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

function StepDates({ w, set }: StepProps) {
  const [month, setMonth] = useState(() => { const d = parseDay(w.start); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const end = addDays(w.start, w.nights);
  const t0 = today();
  const cells = useMemo(() => {
    const first = month.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (string | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) out.push(`${month.getFullYear()}-${pad(month.getMonth() + 1)}-${pad(d)}`);
    while (out.length % 7) out.push(null);
    return out;
  }, [month]);
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <>
      <h1 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>언제, 며칠 가요?</h1>
      <section className="card cal" aria-label="출발일 고르기">
        <div className="sec-row">
          <button type="button" className="icon-btn" style={{ border: 0, background: "transparent" }} aria-label="이전 달" onClick={() => shift(-1)}><Icon name="back" size={18} stroke={2} /></button>
          <b>{month.getFullYear()}년 {month.getMonth() + 1}월</b>
          <button type="button" className="icon-btn" style={{ border: 0, background: "transparent" }} aria-label="다음 달" onClick={() => shift(1)}><Icon name="right" size={18} stroke={2} /></button>
        </div>
        <div className="cal-grid">
          {"일월화수목금토".split("").map((d, i) => <span key={d} className="wd" style={{ color: i === 0 ? "var(--bad)" : i === 6 ? "var(--accent-text)" : undefined }}>{d}</span>)}
          {cells.map((c, i) => {
            if (!c) return <span key={i} />;
            const dow = i % 7;
            const edge = c === w.start || c === end;
            const inRange = c > w.start && c < end;
            const past = c < t0;
            const cls = ["cal-day", dow === 0 ? "sun" : dow === 6 ? "sat" : "", edge ? "edge" : inRange ? "in" : "", past ? "past" : ""].join(" ");
            return <button key={c} type="button" className={cls} disabled={past} aria-pressed={edge} aria-label={`${Number(c.slice(5, 7))}월 ${Number(c.slice(8))}일${c === w.start ? ", 출발일" : c === end ? ", 돌아오는 날" : ""}`} onClick={() => set({ start: c })}>{Number(c.slice(8))}</button>;
          })}
        </div>
      </section>
      <section className="sec">
        <span className="label">기간</span>
        <div className="chips">
          {[0, 1, 2, 3, 4].map((n) => <button key={n} type="button" className={"chip" + (w.nights === n ? " on" : "")} aria-pressed={w.nights === n} onClick={() => set({ nights: n })}>{durLabel(n)}</button>)}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="icon-btn" style={{ width: 38, height: 38 }} aria-label="하루 줄이기" onClick={() => set({ nights: Math.max(0, w.nights - 1) })}>−</button>
            <button type="button" className="icon-btn" style={{ width: 38, height: 38 }} aria-label="하루 늘리기" onClick={() => set({ nights: Math.min(20, w.nights + 1) })}>+</button>
          </span>
        </div>
      </section>
      <section style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--sunk)", borderRadius: 16, padding: "12px 14px" }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: "var(--surface)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="leaf" /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <b style={{ fontSize: 15 }}><span className="mono">{fmtDay(w.start)} – {fmtDay(end)}</span> · {durLabel(w.nights)}</b>
          <span className="muted" style={{ fontSize: 13 }}>{seasonOf(w.start)}이에요. 이 계절에 좋은 곳을 함께 추천해요.</span>
        </span>
      </section>
    </>
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
          <div className="field"><label className="label" htmlFor={`${id}-dep`}>출발 (현지)</label><input id={`${id}-dep`} className="input" type="datetime-local" value={f.dep} onChange={(e) => onChange({ ...f, dep: e.target.value })} /></div>
          <div className="field"><label className="label" htmlFor={`${id}-arr`}>도착 (현지)</label><input id={`${id}-arr`} className="input" type="datetime-local" value={f.arr} onChange={(e) => onChange({ ...f, arr: e.target.value })} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label className="label" htmlFor={`${id}-no`}>편명 (선택)</label><input id={`${id}-no`} className="input mono" value={f.no} onChange={(e) => onChange({ ...f, no: e.target.value.toUpperCase().trim() })} /></div>
        </div>
      )}
    </div>
  );
}

function StepOverseas({ w, set }: StepProps) {
  const file = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const onFile = async (f?: File) => {
    if (!f) return;
    setReading(true);
    try {
      const r = await readFlights(f);
      const pick = (src: Record<string, string> | undefined, cur: Flight): Flight => ({ from: src?.from || cur.from, to: src?.to || cur.to, dep: src?.dep || cur.dep, arr: src?.arr || cur.arr, no: src?.no || cur.no });
      set({ out: pick(r.out, w.out), back: pick(r.back, w.back), noFlight: false });
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
        <input id="ov-country" className="input" value={w.country} placeholder="예: 일본" onChange={(e) => set({ country: e.target.value })} />
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
          <button type="button" className="btn sm" style={{ color: "var(--accent-text)" }} onClick={() => (hasKey() ? file.current?.click() : toast("e-티켓 읽기는 설정에서 API 키를 넣어야 쓸 수 있어요"))} disabled={reading}>
            <Icon name="camera" size={16} />{reading ? "읽는 중…" : "e-티켓 캡처로 채우기"}
          </button>
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {!w.noFlight && (
          <>
            <FlightCard label="가는 편" f={w.out} date={w.start} onChange={(out) => set({ out })} />
            <FlightCard label="오는 편" f={w.back} date={addDays(w.start, w.nights)} onChange={(back) => set({ back })} />
          </>
        )}
        <label className="toggle" htmlFor="ov-noflight">
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
        <input id="dm-city" className="input" value={w.city} placeholder="예: 부산" onChange={(e) => set({ city: e.target.value })} />
        <div className="chips">{CITIES.map((c) => <button key={c} type="button" className={"chip sm" + (w.city === c ? " on" : "")} onClick={() => set({ city: c })}>{c}</button>)}</div>
      </div>
      <div className="field">
        <label className="label" htmlFor="dm-origin">어디서 출발해요?</label>
        <input id="dm-origin" className="input" value={w.origin} placeholder="예: 서울" onChange={(e) => set({ origin: e.target.value })} />
      </div>
      <div className="field">
        <span className="label">교통수단</span>
        <div className="seg" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {TRANSPORT.map(([t, ic]) => (
            <button key={t} type="button" className={w.transport === t ? "on" : ""} aria-pressed={w.transport === t} style={{ height: 74, fontSize: 13 }} onClick={() => set({ transport: w.transport === t ? "" : t })}>
              <Icon name={ic} size={22} stroke={1.7} />{t}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="field"><label className="label" htmlFor="dm-arr">첫날 {w.city || "현지"} 도착</label><input id="dm-arr" type="time" className="input mono" value={w.arrTime} onChange={(e) => set({ arrTime: e.target.value })} /></div>
        <div className="field"><label className="label" htmlFor="dm-dep">마지막 날 {w.city || "현지"} 출발</label><input id="dm-dep" type="time" className="input mono" value={w.depTime} onChange={(e) => set({ depTime: e.target.value })} /></div>
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
        <div className="chips">{WHO.map((c) => <button key={c} type="button" className={"chip" + (w.who === c ? " on" : "")} aria-pressed={w.who === c} onClick={() => set({ who: w.who === c ? "" : c })}>{c}</button>)}</div>
      </div>
      <div className="field">
        <span className="label">좋아하는 것 · 여러 개 골라도 돼요</span>
        <div className="chips">
          {LIKES.map((c) => {
            const on = w.likes.includes(c);
            return <button key={c} type="button" className={"chip" + (on ? " on" : "")} aria-pressed={on} onClick={() => set({ likes: on ? w.likes.filter((x) => x !== c) : [...w.likes, c] })}>{on && <Icon name="check" size={14} stroke={2.8} />}{c}</button>;
          })}
        </div>
      </div>
      <div className="field">
        <span className="label">하루 페이스</span>
        <div className="seg" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
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
