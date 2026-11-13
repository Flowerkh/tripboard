import { Avatar, KakaoButton } from "../components/Account";
import { Icon } from "../components/Icon";
import { go } from "../components/ui";
import { Help } from "../components/Help";
import { daysBetween, fmtDay, today, untilLabel } from "../lib/dates";
import { dirLink, linkProps, providerFor } from "../lib/links";
import { HELP } from "../lib/help";
import { loadSamples, useApp } from "../lib/store";
import { nowInfo, phase, routeLabel, tripDays, tripEnd, tripLengthLabel } from "../lib/trip";
import type { Trip } from "../lib/types";

function TripCard({ t, right, past, help }: { t: Trip; right: string; past?: boolean; help?: string }) {
  const dom = t.kind === "domestic";
  return (
    <button type="button" className="trip-card" data-help={help} style={past ? { borderStyle: "dashed", background: "transparent" } : undefined} onClick={() => go(`/trip/${t.id}`)}>
      <span className={"ic" + (dom ? " dom" : "")}><Icon name={dom ? "train" : "flight"} size={22} stroke={1.7} /></span>
      <span className="body">
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="title">{t.title}</span>
          <span className={"tag" + (dom ? " dom" : "")}>{dom ? "국내" : "해외"}</span>
        </span>
        <span className="sub">{fmtDay(t.start)} – {fmtDay(tripEnd(t))} · {tripLengthLabel(t)}</span>
        {routeLabel(t) && <span className="sub mono">{routeLabel(t)}</span>}
      </span>
      {right && <span className="dday">{right}</span>}
    </button>
  );
}

export function Home() {
  const s = useApp();
  const t0 = today();
  const sorted = [...s.trips].sort((a, b) => (a.start < b.start ? -1 : 1));
  const live = sorted.filter((t) => phase(t, t0) === "during");
  const upcoming = sorted.filter((t) => phase(t, t0) === "before");
  const past = sorted.filter((t) => phase(t, t0) === "after").reverse();
  const current = live[0];
  const nextTrip = upcoming[0];
  const empty = !s.trips.length;
  const d = new Date();

  return (
    <main className="screen">
      <header className="page-head">
        <div>
          <span className="eyebrow">{d.getMonth() + 1}월 {d.getDate()}일 {"일월화수목금토"[d.getDay()]}요일</span>
          <h1>내 여행</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Help screen={HELP.home} auto />
          {s.user === null && <KakaoButton small label="로그인" help="login" />}
          {s.ai?.is_admin && <button type="button" className="icon-btn" aria-label="관리자 페이지" title="관리자 페이지" onClick={() => go("/admin")}><Icon name="shield" /></button>}
          {s.user ? (
            <button type="button" className="avatar-btn" data-help="account" aria-label={`${s.user.name} · 계정과 설정`} onClick={() => go("/settings")}>
              <Avatar user={s.user} size={40} />
              {s.sync.state === "error" && <i className="dot bad" aria-hidden="true" />}
            </button>
          ) : (
            <button type="button" className="icon-btn" data-help="account" aria-label="설정" onClick={() => go("/settings")}><Icon name="sliders" /></button>
          )}
        </div>
      </header>

      <section className="sec">
        <h2>지금 여행 중</h2>
        {current ? <LiveCard t={current} /> : nextTrip ? (
          <div className="dashed" data-help="now" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 76 }}>
              <span className="mono" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1, color: "var(--accent-text)" }}>D-{daysBetween(t0, nextTrip.start)}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>다음 여행까지</span>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <b style={{ fontSize: 15 }}>지금 여행 중인 여행은 없어요</b>
              <span className="muted" style={{ fontSize: 13 }}>다음은 {nextTrip.title}, {fmtDay(nextTrip.start)}에 출발해요.</span>
            </span>
          </div>
        ) : (
          <div className="dashed" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <div aria-hidden="true" className="mono" style={{ display: "flex", alignItems: "baseline", gap: 8, color: "var(--faint)" }}>
              <span style={{ fontSize: 22, fontWeight: 600 }}>---</span><span>--:--</span>
              <Icon name="flight" size={18} stroke={1.6} /><span style={{ fontSize: 22, fontWeight: 600 }}>---</span><span>--:--</span>
            </div>
            <b style={{ fontSize: 16 }}>지금 여행 중인 여행이 없어요</b>
            <span className="muted" style={{ fontSize: 13 }}>여행이 시작되면 이 자리에 지금 일정, 다음 일정, 길찾기 버튼이 떠요.</span>
          </div>
        )}
      </section>

      <section className="sec">
        <h2>다가오는 여행</h2>
        {upcoming.map((t, i) => <TripCard key={t.id} t={t} right={`D-${daysBetween(t0, t.start)}`} help={i === 0 ? "card" : undefined} />)}
        {live.slice(1).map((t) => <TripCard key={t.id} t={t} right="여행 중" />)}
        {upcoming.length ? (
          <button type="button" className="btn dashed" style={{ borderRadius: 16, color: "var(--muted)" }} onClick={() => go("/new")}><Icon name="plus" size={16} stroke={2} />여행 하나 더 계획하기</button>
        ) : (
          <div className="dashed" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: 14, background: "var(--sunk)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="calendar" size={22} /></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <b style={{ fontSize: 16 }}>예정된 여행이 없어요</b>
                <span className="muted" style={{ fontSize: 13 }}>해외인지 국내인지만 고르면 시작할 수 있어요</span>
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" className="btn" onClick={() => go("/new/overseas")}><Icon name="globe" size={17} />해외여행</button>
              <button type="button" className="btn" onClick={() => go("/new/domestic")}><Icon name="train" size={17} />국내여행</button>
            </div>
            {empty && <button type="button" className="link-btn" data-help="samples" onClick={loadSamples}>샘플 여행 2개 넣어서 둘러보기</button>}
          </div>
        )}
      </section>

      <section className="sec">
        <h2>다녀온 여행</h2>
        {past.length ? past.map((t, i) => <TripCard key={t.id} t={t} right="" past help={!upcoming.length && i === 0 ? "card" : undefined} />) : (
          <div className="dashed" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>아직 다녀온 여행이 없어요</span>
            <span className="muted" style={{ fontSize: 13 }}>{nextTrip ? `${nextTrip.title}이 끝나면` : "끝난 여행은"} 일정과 함께 여기에 모여요.</span>
          </div>
        )}
      </section>

      <div className="dock-bottom">
        <button type="button" className="btn primary big" data-help="new" style={{ boxShadow: "var(--shadow)" }} onClick={() => go("/new")}><Icon name="plus" stroke={2.2} />새 여행 만들기</button>
      </div>
    </main>
  );
}

function LiveCard({ t }: { t: Trip }) {
  const s = useApp();
  const items = s.items.filter((i) => i.tripId === t.id);
  const n = nowInfo(t, items);
  const dayNo = tripDays(t).indexOf(today()) + 1;
  const out = t.legs.out;
  const provider = providerFor(t, s.settings);
  const nowStr = new Date().toTimeString().slice(0, 5);
  return (
    <div className="pass" data-help="now">
      <button type="button" onClick={() => go(`/trip/${t.id}/now`)} style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 12 }} aria-label={`${t.title} 여행 중 화면 열기`}>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="tag">{t.kind === "domestic" ? "국내" : "해외"} · {t.kind === "domestic" ? t.city : t.country}</span>
          <span className="tag live"><i />{dayNo}일차 진행 중</span>
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.title}</span>
        {out && (out.from || out.to) ? (
          <span className="codes">
            <span className="code">{out.from}</span><span className="t">{out.dep.slice(11, 16)}</span>
            <Icon name="flight" size={18} stroke={1.6} className="t" />
            <span className="code">{out.to}</span><span className="t">{out.arr.slice(11, 16)}</span>
          </span>
        ) : null}
      </button>
      <div className="tear" />
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontWeight: 600, color: "var(--live-ink)" }}>지금 {nowStr}</span>
        <span style={{ fontWeight: 600 }}>{n?.cur ? n.cur.title : "빈 시간"}</span>
        {n?.cur?.end && <span className="mono t">~{n.cur.end}</span>}
      </div>
      {n?.next ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span className="t">다음 · {untilLabel(Math.max(0, (Number(n.next.start.slice(0, 2)) * 60 + Number(n.next.start.slice(3))) - n.min))} 뒤</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}><span className="mono">{n.next.start}</span> {n.next.title}</span>
          </div>
          <a className="btn primary" href={dirLink(provider, n.next, t)} {...linkProps(dirLink(provider, n.next, t))} style={{ flex: "none" }}><Icon name="nav" size={16} stroke={2} />길찾기</a>
        </div>
      ) : <span className="t">오늘 남은 일정이 없어요.</span>}
    </div>
  );
}
