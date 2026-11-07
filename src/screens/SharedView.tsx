import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { fallbackView, MapView, type Pin } from "../components/MapView";
import { ItemRow, LegRow } from "../components/Timeline";
import { go } from "../components/ui";
import { fmtDay, today, toMin } from "../lib/dates";
import { dayRouteLinks, linkProps, providerFor, providerName, routeProvider, withRo } from "../lib/links";
import { fetchShared, ShareError, type Fetched } from "../lib/share";
import { importTrip, toast, useApp } from "../lib/store";
import { hasGeo, itemsOfDay, legsOn, nowInfo, phase, tripDays, tripEnd, tripLengthLabel } from "../lib/trip";
import type { Item, Trip } from "../lib/types";
import { ago } from "./ShareSheet";

const REFRESH = 30_000;

export function SharedView({ id }: { id: string }) {
  const s = useApp();
  const [got, setGot] = useState<Fetched | null | undefined>(undefined); // undefined = loading, null = not found
  const [err, setErr] = useState("");
  const [day, setDay] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchShared(id);
      setGot(r);
      setErr("");
    } catch (e) {
      setErr(e instanceof ShareError ? e.message : "일정을 불러오지 못했어요.");
    }
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), REFRESH);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const trip: Trip | null = useMemo(() => (got ? { ...got.data.trip, id: `shared-${id}`, createdAt: 0 } : null), [got, id]);
  const items: Item[] = useMemo(() => (got ? got.data.items.map((it, k) => ({ ...it, id: `s${k}`, tripId: `shared-${id}` })) : []), [got, id]);
  const days = trip ? tripDays(trip) : [];
  const t0 = today();
  useEffect(() => {
    if (days.length && !days.includes(day)) setDay(days.includes(t0) ? t0 : days[0]);
  }, [days.join(), day, t0]);
  useEffect(() => {
    document.querySelector(".days .day-tab.on")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [day]);

  const mine = s.trips.find((t) => t.share?.id === id);
  const head = (
    <header className="page-head" style={{ gap: 10 }}>
      <button type="button" className="icon-btn" aria-label="트립보드 홈으로" onClick={() => go("/")}><Icon name="back" /></button>
      <b style={{ fontSize: 17, flex: 1, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trip?.title ?? "공유받은 일정"}</b>
      <span style={{ width: 44 }} />
    </header>
  );

  if (got === undefined) {
    return (
      <main className="screen" aria-busy={!err}>
        {head}
        {err ? (
          <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ color: "var(--bad)" }}>{err}</p>
            <button type="button" className="btn" onClick={load}>다시 불러오기</button>
          </section>
        ) : <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>공유받은 일정을 불러오는 중…</p>}
      </main>
    );
  }
  if (!got || !trip) {
    return (
      <main className="screen">
        {head}
        <section className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10, textAlign: "center" }}>
          <b style={{ fontSize: 18 }}>이 링크로는 일정을 볼 수 없어요</b>
          <p className="muted">공유가 멈췄거나 링크가 잘못됐어요. 보낸 사람에게 새 링크를 받아 주세요.</p>
          <button type="button" className="btn" onClick={() => go("/")}>트립보드 홈으로</button>
        </section>
      </main>
    );
  }

  const ph = phase(trip);
  const dayIdx = Math.max(0, days.indexOf(day));
  const list = itemsOfDay(items, day);
  const geo = list.filter(hasGeo);
  const num = new Map(geo.map((g, i) => [g.id, i + 1]));
  const provider = providerFor(trip, s.settings);
  const routeVia = routeProvider(provider); // Naver on a computer → Kakao Map
  const routes = dayRouteLinks(routeVia, list, trip);
  const isToday = day === t0 && ph === "during";
  const now = isToday ? nowInfo(trip, items) : null;
  const pins: Pin[] = geo.map((g) => ({ id: g.id, lat: g.lat, lng: g.lng, n: num.get(g.id)!, status: g.status, done: g.done, role: now?.cur?.id === g.id ? "now" : undefined }));
  const entries = [...list.map((it) => ({ k: toMin(it.start) ?? 9999, it })), ...legsOn(trip, day).map((l) => ({ k: l.sortMin, l }))].sort((a, b) => a.k - b.k);
  const where = trip.kind === "overseas" ? `${trip.country} ${trip.city}` : `${trip.origin ? `${trip.origin} → ` : ""}${trip.city}`;
  let prev: Item | null = null;

  const save = () => {
    const newId = importTrip(got.data.trip, got.data.items);
    toast("내 여행에 저장했어요 · 이제 마음대로 고칠 수 있어요");
    go(`/trip/${newId}`);
  };

  return (
    <main className="screen tight" style={{ paddingBottom: 120 }}>
      {head}
      <p className="shared-badge"><Icon name="link" size={14} />공유받은 일정 · 업데이트 {ago(got.updatedAt)}</p>

      <section className="strip">
        <span className="ic"><Icon name={trip.kind === "domestic" ? "train" : "flight"} stroke={1.7} /></span>
        <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{where.trim()}</span>
          <span className="sub">{fmtDay(trip.start)} – {fmtDay(tripEnd(trip))} · {tripLengthLabel(trip)}{trip.season ? ` · ${trip.season}` : ""}</span>
        </span>
      </section>

      {trip.notice && <p className="muted" style={{ fontSize: 13, background: "var(--sunk)", borderRadius: 12, padding: "8px 12px" }}>{trip.notice}</p>}

      <nav className="days" aria-label="날짜">
        {days.map((d, i) => {
          const cnt = items.filter((x) => x.day === d).length;
          return (
            <button key={d} type="button" className={"day-tab" + (d === day ? " on" : "")} aria-pressed={d === day} onClick={() => { setDay(d); setSel(null); }}>
              <b>{i + 1}일차 · {fmtDay(d)}{d === t0 ? " · 오늘" : ""}</b>
              <span>{trip.dayLabels[d] ? `${trip.dayLabels[d]} · ` : ""}{cnt ? `${cnt}곳` : "비어 있어요"}</span>
            </button>
          );
        })}
      </nav>

      <section className="map-card" aria-label={`${dayIdx + 1}일차 지도`}>
        <MapView pins={pins} selectedId={sel} onPin={(pid) => { setSel(pid); document.getElementById(`it-${pid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }} fallback={fallbackView(trip.country)} label={`${dayIdx + 1}일차 동선 지도`} />
        {routes[0] && <a className="float-chip map-over" style={{ left: 10, bottom: 10 }} href={routes[0]} {...linkProps(routes[0])}>{withRo(providerName(routeVia))} 동선 보기 ↗</a>}
      </section>

      <section className="tl" aria-label={`${dayIdx + 1}일차 일정`}>
        {entries.map((e) => {
          if ("l" in e && e.l) return <LegRow key={e.l.key} leg={e.l} trip={trip} />;
          const it = (e as { it: Item }).it;
          const row = <ItemRow key={it.id} it={it} n={num.get(it.id)} prev={prev} trip={trip} provider={provider} selected={sel === it.id} isNow={now?.cur?.id === it.id} past={false} onOpen={() => setSel(it.id)} readOnly />;
          prev = it;
          return row;
        })}
        {!list.length && !legsOn(trip, day).length && <p className="muted" style={{ padding: "12px 4px" }}>이날은 아직 일정이 없어요.</p>}
      </section>

      <div className="dock-bottom" style={{ pointerEvents: "auto" }}>
        {mine ? (
          <button type="button" className="btn big primary" onClick={() => go(`/trip/${mine.id}`)}><Icon name="edit" size={18} />내가 공유한 여행이에요 · 고치러 가기</button>
        ) : (
          <button type="button" className="btn big primary" onClick={save}><Icon name="plus" size={18} stroke={2} />내 여행에 저장하기</button>
        )}
      </div>
    </main>
  );
}
