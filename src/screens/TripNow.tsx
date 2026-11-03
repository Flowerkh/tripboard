import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { fallbackView, MapView, type Pin } from "../components/MapView";
import { AskBar, go } from "../components/ui";
import { KakaoButton } from "../components/Account";
import { quickShift, runAi } from "../lib/ai/run";
import { fromMin, toMin, untilLabel } from "../lib/dates";
import { dirLink, providerFor, providerName } from "../lib/links";
import { toast, useApp } from "../lib/store";
import { hasGeo, itemsOfDay, nowInfo, tripDays, walkMinutes } from "../lib/trip";
import { ChatSheet } from "./TripSheets";

export function TripNow({ id }: { id: string }) {
  const s = useApp();
  const trip = s.trips.find((t) => t.id === id);
  const items = useMemo(() => s.items.filter((i) => i.tripId === id), [s.items, id]);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [chat, setChat] = useState(false);
  if (!trip) {
    return <main className="screen"><p>이 여행을 찾을 수 없어요.</p><button type="button" className="btn" onClick={() => go("/")}>내 여행으로</button></main>;
  }
  const n = nowInfo(trip, items)!;
  const list = itemsOfDay(items, n.day);
  const geo = list.filter(hasGeo);
  const num = new Map(geo.map((g, i) => [g.id, i + 1]));
  const pins: Pin[] = geo.map((g) => {
    const end = toMin(g.end) ?? (toMin(g.start) ?? 0) + 30;
    const role = n.cur?.id === g.id ? "now" : n.next?.id === g.id ? "next" : g.done || end <= n.min ? "past" : "later";
    return { id: g.id, lat: g.lat, lng: g.lng, n: num.get(g.id)!, status: g.status, done: g.done, role };
  });
  const from = me ?? (n.cur && hasGeo(n.cur) ? n.cur : null);
  const next = n.next;
  const highlight = from && next && hasGeo(next) ? ([{ lat: from.lat, lng: from.lng }, { lat: next.lat, lng: next.lng }] as [{ lat: number; lng: number }, { lat: number; lng: number }]) : null;
  const walk = from && next && hasGeo(next) ? walkMinutes(from, next) : null;
  const provider = providerFor(trip, s.settings);
  const dayNo = tripDays(trip).indexOf(n.day) + 1;
  const curStart = n.cur ? toMin(n.cur.start)! : 0;
  const curEnd = n.cur ? toMin(n.cur.end) ?? curStart + 60 : 0;
  const progress = n.cur ? Math.min(100, Math.max(2, ((n.min - curStart) / Math.max(1, curEnd - curStart)) * 100)) : 0;
  const ask = (text: string) => { setChat(true); runAi(id, { kind: "chat", text, viewingDay: n.day }); };
  const locate = () => {
    if (!navigator.geolocation) return toast("이 기기에서는 위치를 쓸 수 없어요");
    navigator.geolocation.getCurrentPosition(
      (p) => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast("위치 권한을 허용해야 내 위치가 보여요"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <main className="now-screen">
      <MapView pins={pins} me={me} highlight={highlight} fallback={fallbackView(trip.country)} label={`${dayNo}일차 지도`} />
      <div className="now-top">
        <button type="button" className="icon-btn flat" aria-label="일정 보기로" onClick={() => go(`/trip/${id}`)}><Icon name="back" /></button>
        <span className="title-chip">{trip.city || trip.title}<span className="muted" style={{ fontWeight: 500 }}>{dayNo}일차{n.preview ? " · 미리보기" : " · 오늘"}</span></span>
        <button type="button" className="icon-btn flat" style={{ color: "var(--accent-text)" }} aria-label="내 위치 보기" onClick={locate}><Icon name="locate" /></button>
      </div>

      <section className="now-sheet" aria-label="지금과 다음 일정">
        <span className="grabber" aria-hidden="true" />
        {n.preview && <p className="preview-note">여행 날짜가 아니라서 {dayNo}일차 {fromMin(n.min)} 기준으로 미리 보여 줘요. 여행 중엔 실제 시각으로 바뀌어요.</p>}
        {!list.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0" }}>
            <b>오늘은 일정이 없어요</b>
            <button type="button" className="btn primary" disabled={!!s.run} onClick={() => { setChat(true); runAi(id, { kind: "day", day: n.day }); }}><Icon name="sparkle" />AI로 오늘 일정 짜기</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                <span className="live-pill"><i />지금</span>
                <span className="mono" style={{ fontWeight: 600 }}>{fromMin(n.min)}</span>
                <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.cur ? n.cur.title : "빈 시간"}</b>
                {n.cur?.end && <span className="mono muted" style={{ marginLeft: "auto" }}>~{n.cur.end}</span>}
              </div>
              {n.cur && <span className="bar" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>}
            </div>

            {next ? (
              <div className="next-card">
                <div className="sec-row muted" style={{ fontSize: 12, fontWeight: 600 }}>
                  <span>다음 · {untilLabel(Math.max(0, toMin(next.start)! - n.min))} 뒤</span>
                  {walk != null && <span>걸어서 약 {walk}분 (직선 기준)</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {num.get(next.id) && <span className="num" style={{ minWidth: 24, height: 24, fontSize: 12 }}>{num.get(next.id)}</span>}
                  <Icon name={next.icon} size={18} className="muted" />
                  <b style={{ fontSize: 17 }}><span className="mono">{next.start}</span> {next.title}</b>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 8 }}>
                  <a className="btn primary" href={dirLink(provider, next, trip)} target="_blank" rel="noopener noreferrer"><Icon name="nav" size={17} stroke={2} />길찾기 · {providerName(provider)}</a>
                  <button type="button" className="btn" onClick={() => quickShift(id, n.day, next.start, 30)}>30분 미루기</button>
                </div>
              </div>
            ) : <p className="muted">오늘 남은 일정이 없어요.</p>}

            {n.later.slice(0, 3).map((l) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 34, fontSize: 14 }}>
                <span className="mono muted" style={{ width: 42, fontWeight: 600 }}>{l.start}</span>
                {num.get(l.id) ? <span className={"num s-" + l.status}>{num.get(l.id)}</span> : <Icon name={l.icon} size={16} className="muted" />}
                <b style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</b>
              </div>
            ))}

            <div className="chips scroll">
              <button type="button" className="chip sm" disabled={!!s.run} onClick={() => ask("비가 와요. 오늘 남은 일정을 실내 위주로 바꿔줘")}><Icon name="rain" size={15} />비 와요, 실내로</button>
              <button type="button" className="chip sm" disabled={!!s.run} onClick={() => ask("지금 근처에서 저녁 먹을 곳을 추천해서 넣어줘")}>근처 저녁 추천</button>
              <button type="button" className="chip sm" disabled={!!s.run} onClick={() => ask("좀 지쳤어. 오늘 남은 일정 중 하나를 빼서 여유 있게 해줘")}>좀 지쳤어, 하나 빼줘</button>
            </div>
          </>
        )}
      </section>

      <div className="askbar-wrap" style={{ zIndex: 750 }}>
        {s.user ? (
          <AskBar id="now-ask" placeholder="말로 고치기 · 30분 늦어질 것 같아" onSend={ask} disabled={!!s.run} onHistory={(s.chats[id] ?? []).some((c) => c.role !== "note") ? () => setChat(true) : undefined} />
        ) : (
          <div className="login-bar"><span>AI에게 말로 일정을 고치려면</span><KakaoButton small label="카카오로 로그인" /></div>
        )}
      </div>
      {chat && <ChatSheet trip={trip} viewingDay={n.day} onClose={() => setChat(false)} />}
    </main>
  );
}
