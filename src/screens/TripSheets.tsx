import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { stopShareQuietly } from "../lib/share";
import { fallbackView, MapView } from "../components/MapView";
import { AskBar, ConfirmButton, go, Sheet, TimeInput } from "../components/ui";
import { applyPending, discardPending, runAi, stopAi } from "../lib/ai/run";
import { KakaoButton } from "../components/Account";
import { fmtDay, normTime, uid } from "../lib/dates";
import { dirLink, mapLink, providerFor, providerName } from "../lib/links";
import { deleteItem, deleteTrip, undoLast, upsertItem, useApp } from "../lib/store";
import { hasGeo, itemsOfDay, phase, tripDays } from "../lib/trip";
import type { Item, Status, Trip } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { ICONS } from "../lib/ai/tools";

const chgClass = (c: string) => (c.startsWith("+") ? "add" : c.startsWith("-") ? "del" : c.startsWith("~") || c.startsWith("✎") ? "mod" : "");

export function ChatSheet({ trip, viewingDay, onClose }: { trip: Trip; viewingDay: string; onClose: () => void }) {
  const s = useApp();
  const msgs = s.chats[trip.id] ?? [];
  const run = s.run && s.run.tripId === trip.id && s.run.kind !== "plan" ? s.run : null;
  const pending = s.pending[trip.id];
  const undo = s.undo[trip.id];
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs.length, !!run, !!pending]);
  const send = (text: string) => runAi(trip.id, { kind: "chat", text, viewingDay });
  const during = phase(trip) === "during";
  const examples: [string, string[]][] = [
    ["여행 전에", [`${tripDays(trip).indexOf(viewingDay) + 1 || 1}일차를 조금 더 여유롭게 바꿔줘`, "미정인 식당을 근처로 채워줘", "출발 전에 확인할 것만 정리해줘"]],
    ["여행 중에", ["30분 늦어질 것 같아, 뒤로 밀어줘", "비 와요, 남은 일정 실내로 바꿔줘"]],
  ];
  if (during) examples.reverse();
  return (
    <Sheet onClose={onClose} label="AI와 일정 고치기" tall>
      <div className="sheet-head">
        <span style={{ width: 36, height: 36, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="sparkle" size={19} /></span>
        <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 16 }}>말로 일정 고치기</b>
          <span className="muted" style={{ fontSize: 12 }}>{trip.title}</span>
        </span>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      {!s.user && (
        <div className="card" style={{ margin: "10px 16px 0", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--accent-soft)", borderColor: "transparent" }}>
          <p style={{ fontSize: 14 }}>AI와 대화로 일정을 고치려면 카카오로 로그인해 주세요.</p>
          <KakaoButton small label="카카오로 로그인" />
        </div>
      )}
      <div className="chat-list" ref={list} aria-live="polite">
        {!msgs.length && !run ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "12px 4px" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <span style={{ width: 56, height: 56, borderRadius: 18, background: "var(--accent-soft)", color: "var(--accent-text)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="chat" size={26} stroke={1.7} /></span>
              <h2 style={{ fontSize: 19 }}>말하면 일정과 지도가 바로 바뀌어요</h2>
              <p className="muted" style={{ fontSize: 14 }}>바뀐 내용은 언제든 되돌릴 수 있어요.</p>
            </div>
            {examples.map(([title, items]) => (
              <div key={title} className="sec" style={{ gap: 8 }}>
                <span className="label">{title}</span>
                {items.map((q) => <button key={q} type="button" className="suggest" onClick={() => send(q)}><span>“{q}”</span><Icon name="right" size={15} stroke={2} className="muted" /></button>)}
              </div>
            ))}
          </div>
        ) : (
          msgs.map((m) =>
            m.role === "note" ? <p key={m.id} className="msg note">{m.text}</p> :
            m.role === "user" ? <p key={m.id} className="msg user">{m.text}</p> : (
              <div key={m.id} className="msg assistant">
                <span>{m.text}</span>
                {m.changes?.map((c, i) => <span key={i} className={"chg " + chgClass(c)}>{c}</span>)}
                {pending?.msgId === m.id && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn sm primary" onClick={() => applyPending(trip.id)}>적용</button>
                    <button type="button" className="btn sm" onClick={() => discardPending(trip.id)}>적용 안 함</button>
                  </div>
                )}
                {undo?.msgId === m.id && !run && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn sm" onClick={() => undoLast(trip.id)}><Icon name="undo" size={15} stroke={2} />되돌리기</button>
                    <button type="button" className="btn sm" onClick={onClose}><Icon name="map" size={15} />지도에서 보기</button>
                  </div>
                )}
              </div>
            ),
          )
        )}
        {run && (
          <div className="msg assistant">
            <span className="typing"><span className="spinner" />{run.status}</span>
            <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={stopAi}><Icon name="stop" size={13} fill />멈추기</button>
          </div>
        )}
      </div>
      <div style={{ padding: "10px 14px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        <AskBar id="chat-ask" placeholder="예: 저녁을 1시간 당겨줘" onSend={send} disabled={!!s.run} chat={{ open: true, onToggle: onClose }} />
      </div>
    </Sheet>
  );
}

const STATUSES: Status[] = ["confirmed", "optional", "check", "todo"];

export function ItemSheet({ trip, itemId, preset, onClose, onAsk }: {
  trip: Trip; itemId?: string; preset?: { day: string; start: string }; onClose: () => void; onAsk: (text: string) => void;
}) {
  const s = useApp();
  const items = s.items.filter((i) => i.tripId === trip.id);
  const orig = itemId ? items.find((i) => i.id === itemId) : undefined;
  const [f, setF] = useState<Item>(() => orig ?? {
    id: uid("i"), tripId: trip.id, day: preset?.day ?? trip.start, start: preset?.start ?? "10:00", end: "", title: "", icon: "pin",
    status: "confirmed", place: "", lat: null, lng: null, note: "", done: false, order: Date.now(),
  });
  const set = (p: Partial<Item>) => setF((x) => ({ ...x, ...p }));
  const days = tripDays(trip);
  const dayList = itemsOfDay(items, f.day);
  const idx = orig ? dayList.findIndex((i) => i.id === orig.id) : -1;
  const prev = idx > 0 ? dayList[idx - 1] : null;
  const provider = providerFor(trip, s.settings);
  const nums = dayList.filter(hasGeo);
  const n = orig && hasGeo(orig) ? nums.findIndex((x) => x.id === orig.id) + 1 : 0;
  const save = () => {
    const start = normTime(f.start);
    if (!f.title.trim() || !start) return;
    const placeChanged = orig && orig.place !== f.place;
    upsertItem({ ...f, title: f.title.trim(), start, end: normTime(f.end) ?? "", ...(placeChanged ? { lat: null, lng: null } : {}) });
    onClose();
  };
  return (
    <Sheet onClose={onClose} label={orig ? "일정 편집" : "일정 추가"}>
      <div className="grabber" style={{ marginTop: 10 }} />
      <form className="sheet-body" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {n > 0 && <span className={"num s-" + f.status} style={{ minWidth: 26, height: 26, fontSize: 13 }}>{n}</span>}
          <label htmlFor="ie-title" className="sr">일정 이름</label>
          <input id="ie-title" required value={f.title} placeholder="예: 점심: 라멘" onChange={(e) => set({ title: e.target.value })} style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", fontSize: 20, fontWeight: 700, padding: 0, outline: "none" }} autoFocus={!orig} />
          <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        {orig && hasGeo(orig) && (
          <div className="map-card" style={{ height: 120 }}>
            <MapView pins={[{ id: orig.id, lat: orig.lat, lng: orig.lng, n: n || "•", status: orig.status, done: orig.done }]} fallback={fallbackView(trip.country)} interactive={false} label={`${orig.title} 위치`} />
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 84px 84px", gap: 8 }}>
          <div className="field" style={{ gap: 5 }}>
            <label className="label" htmlFor="ie-day">날짜</label>
            <select id="ie-day" className="input" style={{ padding: "0 8px", fontSize: 14 }} value={f.day} onChange={(e) => set({ day: e.target.value })}>
              {days.map((d, i) => <option key={d} value={d}>{i + 1}일차 {fmtDay(d)}</option>)}
            </select>
          </div>
          <div className="field" style={{ gap: 5 }}><label className="label" htmlFor="ie-start">시작</label><TimeInput id="ie-start" required style={{ padding: "0 10px" }} value={f.start} onChange={(v) => set({ start: v })} /></div>
          <div className="field" style={{ gap: 5 }}><label className="label" htmlFor="ie-end">끝</label><TimeInput id="ie-end" placeholder="--:--" style={{ padding: "0 10px" }} value={f.end} onChange={(v) => set({ end: v })} /></div>
        </div>
        <div className="field" style={{ gap: 6 }}>
          <span className="label">상태</span>
          <div className="seg" role="radiogroup" aria-label="상태" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
            {STATUSES.map((st) => (
              <button key={st} type="button" role="radio" aria-checked={f.status === st} className={f.status === st ? "on" : ""} style={{ height: 44, flexDirection: "row", gap: 5, fontSize: 13, borderRadius: 12 }} onClick={() => set({ status: st })}>
                <span className={"num s-" + st} style={{ minWidth: 10, width: 10, height: 10, padding: 0 }} />{STATUS_LABEL[st]}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ gap: 6 }}>
          <label className="label" htmlFor="ie-place">장소 (지도 검색용 이름)</label>
          <input id="ie-place" className="input" value={f.place} placeholder={trip.kind === "domestic" ? "예: 해운대해수욕장" : "예: Osaka Castle"} onChange={(e) => set({ place: e.target.value })} />
          {!hasGeo(f) && <span className="muted" style={{ fontSize: 12 }}>위치가 없어 지도에 안 나와요. AI에게 "{f.title || "이 일정"} 위치 넣어줘"라고 하면 채워 줘요.</span>}
        </div>
        <div className="field" style={{ gap: 6 }}>
          <label className="label" htmlFor="ie-icon">종류</label>
          <select id="ie-icon" className="input" value={f.icon} onChange={(e) => set({ icon: e.target.value as Item["icon"] })}>
            {ICONS.map((ic) => <option key={ic} value={ic}>{ICON_LABEL[ic]}</option>)}
          </select>
        </div>
        <div className="field" style={{ gap: 6 }}>
          <label className="label" htmlFor="ie-note">메모</label>
          <textarea id="ie-note" className="input" rows={2} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </div>
        {orig && (orig.place || hasGeo(orig)) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <a className="btn primary" href={dirLink(provider, orig, trip)} target="_blank" rel="noopener noreferrer"><Icon name="nav" size={16} stroke={2} />지금 위치에서</a>
            {prev && (prev.place || hasGeo(prev)) ? <a className="btn" href={dirLink(provider, orig, trip, prev)} target="_blank" rel="noopener noreferrer">이전 일정에서 ↗</a> : <a className="btn" href={mapLink(provider, orig, trip)} target="_blank" rel="noopener noreferrer">{providerName(provider)} ↗</a>}
          </div>
        )}
        {orig && (
          <div className="field" style={{ gap: 6 }}>
            <span className="label" style={{ color: "var(--accent-text)", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="sparkle" size={14} />AI에게 이 일정만 부탁하기</span>
            <div className="chips scroll">
              {[`"${orig.title}" 일정을 30분 늘려줘`, `"${orig.title}" 대신 근처 대안을 찾아줘`, days.length > 1 ? `"${orig.title}"을(를) ${orig.day === days[0] ? "2" : "1"}일차로 옮겨줘` : `"${orig.title}" 위치 넣어줘`].map((q) => (
                <button key={q} type="button" className="chip sm" onClick={() => onAsk(q)}>{q.replace(`"${orig.title}" `, "").replace(`"${orig.title}"을(를) `, "")}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          {orig && <ConfirmButton className="btn danger" confirmText="한 번 더 누르면 삭제" onConfirm={() => { deleteItem(orig.id); onClose(); }}><Icon name="trash" size={18} /><span className="sr">삭제</span></ConfirmButton>}
          {orig && <button type="button" className="btn" style={{ flex: 1 }} aria-pressed={f.done} onClick={() => set({ done: !f.done })}><Icon name="check" size={16} stroke={2.4} />{f.done ? "다녀왔어요 ✓" : "다녀왔어요"}</button>}
          <button type="submit" className="btn primary" style={{ flex: 1 }} disabled={!f.title.trim()}>{orig ? "저장" : "추가"}</button>
        </div>
      </form>
    </Sheet>
  );
}

const ICON_LABEL: Record<string, string> = {
  flight: "비행", train: "기차·전철", car: "자동차", bus: "버스", walk: "걷기", food: "식사", cafe: "카페", shop: "쇼핑", sight: "관광",
  nature: "자연", beach: "바다", night: "야경", stay: "숙소", activity: "체험·테마파크", pin: "기타",
};

export function RecsSheet({ trip, onClose, onAdd }: { trip: Trip; onClose: () => void; onAdd: (title: string) => void }) {
  const s = useApp();
  const items = s.items.filter((i) => i.tripId === trip.id);
  const inPlan = (title: string) => items.some((i) => (i.title + i.place).replace(/\s/g, "").includes(title.replace(/\s|\(데모\)/g, "")));
  return (
    <Sheet onClose={onClose} label="계절 추천">
      <div className="sheet-head">
        <Icon name="leaf" />
        <b style={{ flex: 1 }}>{trip.season || "이 계절"}에 좋은 곳</b>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <div className="sheet-body">
        {!trip.recs.length && <p className="muted">아직 추천이 없어요.</p>}
        {trip.recs.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name={r.icon} size={18} className="muted" /><b>{r.title}</b>{r.area && <span className="muted" style={{ fontSize: 12 }}>{r.area}</span>}</span>
            <p className="muted" style={{ fontSize: 14 }}>{r.why}</p>
            {inPlan(r.title) ? <span style={{ color: "var(--good)", fontSize: 13, fontWeight: 700 }}>✓ 일정에 있어요</span> : <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={!!s.run} onClick={() => onAdd(r.title)}>+ 일정에 넣기</button>}
          </div>
        ))}
        <button type="button" className="btn" disabled={!!s.run} onClick={() => { onClose(); runAi(trip.id, { kind: "recs" }); }}><Icon name="sparkle" />추천 다시 받기</button>
      </div>
    </Sheet>
  );
}

export function TripMenu({ trip, onClose, onShare }: { trip: Trip; onClose: () => void; onShare: () => void }) {
  const s = useApp();
  return (
    <Sheet onClose={onClose} label="여행 설정">
      <div className="sheet-head"><b style={{ flex: 1 }}>여행 설정</b><button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" size={18} /></button></div>
      <div className="sheet-body">
        <button type="button" className="btn" style={{ justifyContent: "flex-start" }} onClick={() => { onClose(); go(`/edit/${trip.id}`); }}><Icon name="edit" size={18} />여행 정보 고치기 (날짜·이동편·취향)</button>
        <button type="button" className="btn" style={{ justifyContent: "flex-start" }} onClick={onShare}><Icon name="share" size={18} />{trip.share ? "공유 링크 보기 (공유 중)" : "일정 공유하기"}</button>
        {s.user ? (
          <ConfirmButton className="btn" confirmText="한 번 더 누르면 지금 일정을 지우고 새로 짜요" onConfirm={() => { onClose(); runAi(trip.id, { kind: "plan" }); }}>
            <Icon name="sparkle" size={18} />AI로 처음부터 다시 짜기
          </ConfirmButton>
        ) : (
          <div className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "var(--accent-soft)", borderColor: "transparent" }}>
            <p style={{ fontSize: 14 }}>로그인하면 AI가 이 여행 일정을 짜 줘요.</p>
            <KakaoButton small label="카카오로 로그인" />
          </div>
        )}
        <ConfirmButton className="btn danger" confirmText={trip.share ? "한 번 더 누르면 삭제되고 공유 링크도 멈춰요" : "한 번 더 누르면 삭제돼요"} onConfirm={() => { onClose(); stopShareQuietly(trip); deleteTrip(trip.id); go("/"); }}>
          <Icon name="trash" size={18} />이 여행 삭제
        </ConfirmButton>
      </div>
    </Sheet>
  );
}
