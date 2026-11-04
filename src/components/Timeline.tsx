import { dirLink, linkProps, mapLink, providerName, type Provider } from "../lib/links";
import { hasGeo, type LegOnDay } from "../lib/trip";
import type { Item, Trip } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { toggleDone } from "../lib/store";
import { Icon } from "./Icon";

export function LegRow({ leg, trip }: { leg: LegOnDay; trip: Trip }) {
  const time = (s: string) => (s ? s.slice(11, 16) : "");
  const overseas = trip.kind === "overseas";
  const label = leg.key === "out" ? (overseas ? "가는 편" : "가는 길") : overseas ? "오는 편" : "오는 길";
  const icon = leg.mode === "flight" || leg.mode === "비행기" ? "flight" : leg.mode === "자차" ? "car" : leg.mode === "고속버스" ? "bus" : "train";
  return (
    <div className="row leg">
      <span className="time">{time(leg.dep) || time(leg.arr)}</span>
      <span className="rail"><i /></span>
      <div className="leg-card">
        <Icon name={icon} size={16} />
        <b>{leg.key === "out" ? `${leg.to || ""} 도착` : `${leg.from || ""} 출발`}</b>
        <span className="sub mono">
          {label} · {leg.from} {time(leg.dep)} → {leg.to} {time(leg.arr)}
          {leg.no ? ` · ${leg.no}` : ""}
        </span>
      </div>
    </div>
  );
}

export function ItemRow({ it, n, prev, trip, provider, selected, isNow, past, onOpen, readOnly }: {
  it: Item; n?: number; prev?: Item | null; trip: Trip; provider: Provider; selected: boolean; isNow: boolean; past: boolean; onOpen: () => void;
  /** shared-link view: no editing, no done toggle */
  readOnly?: boolean;
}) {
  const geo = hasGeo(it);
  const canLink = !!it.place || geo;
  const fromPrev = prev && (prev.place || hasGeo(prev)) ? prev : null;
  const cls = ["row", `s-${it.status}`, it.done ? "done" : "", selected ? "sel" : "", isNow ? "now" : "", past ? "past" : ""].join(" ");
  return (
    <div className={cls} id={`it-${it.id}`}>
      <span className="time">
        {it.start || "--:--"}
        {it.end && <small>{it.end}</small>}
      </span>
      <span className="rail"><i /></span>
      <div className="item">
        <button type="button" className="item-main" onClick={onOpen} aria-label={`${it.title} 자세히`}>
          <span className="item-title">
            {n ? <span className="num">{n}</span> : null}
            <Icon name={it.icon} size={17} className="muted" />
            <span className="txt">{it.title}</span>
          </span>
          <span className="item-meta">
            <span className={"pill s-" + it.status}>{STATUS_LABEL[it.status]}</span>
            {isNow && <span className="pill s-todo">지금</span>}
            {readOnly && it.done && <span className="pill s-confirmed">완료</span>}
            {it.place && <span>{it.place}</span>}
            {!geo && <span className="nogeo">위치 미정</span>}
          </span>
          {it.note && <span className="muted" style={{ fontSize: 13 }}>{it.note}</span>}
        </button>
        <div className="item-acts">
          {canLink && (
            <>
              <a className="link-chip" href={dirLink(provider, it, trip, fromPrev)} {...linkProps(dirLink(provider, it, trip, fromPrev))}>
                {fromPrev ? "이전 장소에서 길찾기" : "길찾기"} ↗
              </a>
              <a className="link-chip" href={mapLink(provider, it, trip)} target="_blank" rel="noopener noreferrer">
                {providerName(provider)} ↗
              </a>
            </>
          )}
          {!readOnly && (
            <button type="button" className="done-btn" aria-pressed={it.done} onClick={() => toggleDone(it.id)}>
              {it.done && <Icon name="check" size={13} stroke={2.6} />}
              {it.done ? "완료" : "완료 표시"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
