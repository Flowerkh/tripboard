import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { fallbackView, MapView, type Pin } from "../components/MapView";
import { ItemRow, LegRow } from "../components/Timeline";
import { AskBar, go } from "../components/ui";
import { runAi } from "../lib/ai/run";
import { daysBetween, durLabel, fmtDay, nowMin, today, toMin } from "../lib/dates";
import { dayRouteLinks, providerFor, providerName } from "../lib/links";
import { useApp } from "../lib/store";
import { hasGeo, itemsOfDay, legsOn, nowInfo, phase, tripDays, tripEnd } from "../lib/trip";
import { Generating } from "./Generating";
import { ChatSheet, ItemSheet, RecsSheet, TripMenu } from "./TripSheets";

export function TripView({ id }: { id: string }) {
  const s = useApp();
  const trip = s.trips.find((t) => t.id === id);
  const items = useMemo(() => s.items.filter((i) => i.tripId === id), [s.items, id]);
  const days = trip ? tripDays(trip) : [];
  const t0 = today();
  const [day, setDay] = useState(() => (days.includes(t0) ? t0 : days[0]));
  const [sel, setSel] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const [sheet, setSheet] = useState<{ id?: string; preset?: { day: string; start: string } } | null>(null);
  const [recs, setRecs] = useState(false);
  const [menu, setMenu] = useState(false);
  const [bigMap, setBigMap] = useState(false);
  useEffect(() => {
    if (trip && !tripDays(trip).includes(day)) setDay(tripDays(trip)[0]);
  }, [trip, day]);

  if (!trip) {
    return (
      <main className="screen">
        <p>이 여행을 찾을 수 없어요.</p>
        <button type="button" className="btn" onClick={() => go("/")}>내 여행으로</button>
      </main>
    );
  }
  if (s.run && s.run.tripId === id && s.run.kind === "plan") return <Generating trip={trip} run={s.run} />;

  const ph = phase(trip);
  const dayIdx = days.indexOf(day);
  const list = itemsOfDay(items, day);
  const geo = list.filter(hasGeo);
  const num = new Map(geo.map((g, i) => [g.id, i + 1]));
  const provider = providerFor(trip, s.settings);
  const routes = dayRouteLinks(provider, list, trip);
  const isToday = day === t0 && ph === "during";
  const now = isToday ? nowInfo(trip, items) : null;
  const pins: Pin[] = geo.map((g) => ({ id: g.id, lat: g.lat, lng: g.lng, n: num.get(g.id)!, status: g.status, done: g.done, role: now?.cur?.id === g.id ? "now" : undefined }));
  const legs = legsOn(trip, day);
  const entries = [...list.map((it) => ({ k: toMin(it.start) ?? 9999, it })), ...legs.map((l) => ({ k: l.sortMin, l }))].sort((a, b) => a.k - b.k);
  const out = trip.legs.out;
  const ask = (text: string) => { setChat(true); runAi(id, { kind: "chat", text, viewingDay: day }); };
  const inPlan = (title: string) => items.some((i) => (i.title + i.place).replace(/\s/g, "").includes(title.replace(/\s|\(데모\)/g, "")));
  let prev: (typeof list)[number] | null = null;

  return (
    <main className="screen tight" style={{ paddingBottom: 110 }}>
      <header className="page-head" style={{ gap: 10 }}>
        <button type="button" className="icon-btn" aria-label="내 여행으로" onClick={() => go("/")}><Icon name="back" /></button>
        <b style={{ fontSize: 17, flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trip.title}</b>
        <button type="button" className="icon-btn" aria-label="여행 설정" onClick={() => setMenu(true)}><Icon name="sliders" /></button>
      </header>

      <section className="strip">
        <span className="ic"><Icon name={trip.kind === "domestic" ? (trip.transport === "자차" ? "car" : trip.transport === "고속버스" ? "bus" : "train") : "flight"} stroke={1.7} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
            {trip.kind === "overseas"
              ? out && (out.from || out.to) ? `${out.from} ${out.dep.slice(11, 16)} → ${out.to} ${out.arr.slice(11, 16)}` : `${trip.country} ${trip.city}`
              : `${trip.origin || "출발지"} → ${trip.city}${out?.arr ? ` ${out.arr.slice(11, 16)} 도착` : ""}`}
          </span>
          <span className="sub">{fmtDay(trip.start)} – {fmtDay(tripEnd(trip))} · {durLabel(trip.nights)}{trip.season ? ` · ${trip.season}` : ""}</span>
        </span>
        <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{ph === "before" ? `D-${daysBetween(t0, trip.start)}` : ph === "during" ? "여행 중" : "다녀옴"}</span>
      </section>

      {trip.notice && <p className="muted" style={{ fontSize: 13, background: "var(--sunk)", borderRadius: 12, padding: "8px 12px" }}>{trip.notice}</p>}

      <button type="button" className="btn" style={{ justifyContent: "space-between", borderColor: ph === "during" ? "var(--bad-dot)" : undefined }} onClick={() => go(`/trip/${id}/now`)}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {ph === "during" ? <span className="live-pill"><i />지금</span> : <Icon name="nav" size={16} />}
          {ph === "during" ? "여행 중 화면 열기" : "여행 중 화면 미리보기"}
        </span>
        <Icon name="right" size={16} />
      </button>

      <nav className="days" aria-label="날짜">
        {days.map((d, i) => {
          const cnt = items.filter((x) => x.day === d).length;
          return (
            <button key={d} type="button" className={"day-tab" + (d === day ? " on" : "")} aria-pressed={d === day} onClick={() => { setDay(d); setSel(null); }}>
              <b>{i + 1}일차 · {fmtDay(d)}{d === t0 ? " · 오늘" : ""}</b>
              <span>{trip.dayLabels[d] ? `${trip.dayLabels[d]} · ` : ""}{cnt ? `${cnt}곳` : "아직 비어 있어요"}</span>
            </button>
          );
        })}
      </nav>

      <section className="map-card" aria-label={`${dayIdx + 1}일차 지도`}>
        <MapView pins={pins} selectedId={sel} onPin={(pid) => { setSel(pid); document.getElementById(`it-${pid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} fallback={fallbackView(trip.country)} className={bigMap ? "big" : ""} label={`${dayIdx + 1}일차 동선 지도`} />
        {!geo.length && <div className="map-empty"><span><Icon name="pin" size={16} />장소를 넣으면 여기에 동선이 그려져요</span></div>}
        <button type="button" className="icon-btn flat map-over" style={{ top: 10, right: 10, width: 36, height: 36 }} aria-label={bigMap ? "지도 작게" : "지도 크게"} onClick={() => setBigMap(!bigMap)}><Icon name="expand" size={18} /></button>
        {routes[0] && <a className="float-chip map-over" style={{ left: 10, bottom: 10 }} href={routes[0]} target="_blank" rel="noopener noreferrer">{providerName(provider)}으로 동선 보기 ↗</a>}
      </section>
      <style>{bigMap ? ".map-card .map.big{height:420px}" : ""}</style>

      {(trip.recs.length > 0 || items.length > 0) && (
        <section className="sec" style={{ gap: 8 }}>
          <div className="sec-row">
            <span className="label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="leaf" size={15} />{trip.season || "이 계절"} 추천</span>
            {trip.recs.length > 0 ? <button type="button" className="link-btn" onClick={() => setRecs(true)}>{trip.recs.length}곳 모두 보기</button> : <button type="button" className="link-btn" disabled={!!s.run} onClick={() => runAi(id, { kind: "recs" })}>추천 받기</button>}
          </div>
          {trip.recs.length > 0 && (
            <div className="recs-row">
              {trip.recs.map((r) => inPlan(r.title)
                ? <span key={r.id} className="rec-chip in"><Icon name="check" size={14} stroke={2.8} />{r.title}</span>
                : <button key={r.id} type="button" className="rec-chip" disabled={!!s.run} onClick={() => ask(`계절 추천 목록의 "${r.title}"을(를) 동선에 가장 잘 맞는 날과 시간에 넣어줘.`)}>{r.title}<em>+ 넣기</em></button>)}
            </div>
          )}
        </section>
      )}

      <section className="tl" aria-label={`${dayIdx + 1}일차 일정`}>
        {entries.map((e) => {
          if ("l" in e && e.l) return <LegRow key={e.l.key} leg={e.l} trip={trip} />;
          const it = (e as { it: (typeof list)[number] }).it;
          const row = (
            <ItemRow key={it.id} it={it} n={num.get(it.id)} prev={prev} trip={trip} provider={provider} selected={sel === it.id}
              isNow={now?.cur?.id === it.id} past={isToday && (toMin(it.end) ?? (toMin(it.start) ?? 0) + 30) <= nowMin()} onOpen={() => { setSel(it.id); setSheet({ id: it.id }); }} />
          );
          prev = it;
          return row;
        })}
        {!list.length && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
            <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 18 }}>{dayIdx + 1}일차가 비어 있어요</h2>
                <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>AI에게 맡기거나, 계절 추천에서 고르거나, 직접 넣을 수 있어요.</p>
              </div>
              <button type="button" className="btn primary" disabled={!!s.run} onClick={() => { setChat(true); runAi(id, { kind: "day", day }); }}><Icon name="sparkle" size={18} />AI로 {dayIdx + 1}일차 짜기</button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button type="button" className="btn" onClick={() => (trip.recs.length ? setRecs(true) : runAi(id, { kind: "recs" }))}><Icon name="leaf" size={16} />계절 추천 보기</button>
                <button type="button" className="btn" onClick={() => setSheet({ preset: { day, start: "10:00" } })}><Icon name="plus" size={16} stroke={2} />직접 추가</button>
              </div>
            </section>
            {([["오전", "10:00"], ["점심", "12:30"], ["오후", "15:00"], ["저녁", "18:30"]] as const).map(([label, start]) => (
              <div key={label} className="slot">
                <b>{label}</b>
                <button type="button" onClick={() => setSheet({ preset: { day, start } })}><Icon name="plus" size={15} stroke={2} />{label} 일정 넣기</button>
              </div>
            ))}
          </div>
        )}
        {list.length > 0 && <button type="button" className="btn sm" style={{ alignSelf: "flex-start", marginLeft: 70, marginTop: 8 }} onClick={() => setSheet({ preset: { day, start: list[list.length - 1].end || "18:00" } })}><Icon name="plus" size={15} stroke={2} />직접 추가</button>}
      </section>

      <div className="askbar-wrap">
        <AskBar id="trip-ask" placeholder={list.length ? "말로 고치기 · 점심은 국밥집으로" : `예: ${dayIdx + 1}일차는 바다 위주로 짜줘`} onSend={ask} disabled={!!s.run} />
      </div>

      {chat && <ChatSheet trip={trip} viewingDay={day} onClose={() => setChat(false)} />}
      {sheet && <ItemSheet trip={trip} itemId={sheet.id} preset={sheet.preset} onClose={() => setSheet(null)} onAsk={(q) => { setSheet(null); ask(q); }} />}
      {recs && <RecsSheet trip={trip} onClose={() => setRecs(false)} onAdd={(title) => { setRecs(false); ask(`계절 추천 목록의 "${title}"을(를) 동선에 가장 잘 맞는 날과 시간에 넣어줘.`); }} />}
      {menu && <TripMenu trip={trip} onClose={() => setMenu(false)} />}
      {s.pending[id] && !chat && (
        <button type="button" className="btn primary" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", zIndex: 40 }} onClick={() => setChat(true)}>AI 제안 확인하기</button>
      )}
    </main>
  );
}
