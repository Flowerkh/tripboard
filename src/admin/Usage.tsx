import { useEffect, useMemo, useState } from "react";
import { big, counted, FEATURE_LABEL, kstDayKey, kstHour, kstStart, members, money, PROVIDER_COLOR, PROVIDER_LABEL, settings, usageSince, type Member, type UsageRow } from "./api";

type Period = "today" | "7" | "30" | "month";
const PERIODS: [Period, string][] = [["today", "오늘"], ["7", "7일"], ["30", "30일"], ["month", "이번 달"]];
const SERIES = ["gemini", "claude", "openai"] as const; // bottom → top in each bar

function since(p: Period) {
  return p === "today" ? kstStart("day") : p === "month" ? kstStart("month") : kstStart("day", Number(p) - 1);
}

export function Usage() {
  const [period, setPeriod] = useState<Period>("30");
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [monthRows, setMonthRows] = useState<UsageRow[]>([]);
  const [people, setPeople] = useState<Member[]>([]);
  const [budget, setBudget] = useState(50);
  const [defMonthly, setDefMonthly] = useState(0);
  const [err, setErr] = useState("");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    setRows(null);
    setErr("");
    Promise.all([usageSince(since(period)), usageSince(kstStart("month")), members(), settings()])
      .then(([r, m, p, s]) => { setRows(r); setMonthRows(m); setPeople(p); setBudget(s.budget_usd); setDefMonthly(s.monthly_limit); })
      .catch((e) => setErr(e.message));
  }, [period]);

  const d = useMemo(() => {
    if (!rows) return null;
    const cost = rows.reduce((a, r) => a + r.cost_usd, 0);
    const requests = rows.filter(counted).length;
    const tin = rows.reduce((a, r) => a + r.input_tokens + r.cache_read + r.cache_write, 0);
    const tout = rows.reduce((a, r) => a + r.output_tokens, 0);
    const cacheRead = rows.reduce((a, r) => a + r.cache_read, 0);
    const blockedApp = rows.filter((r) => r.status === "blocked_app").length;
    const blockedAi = rows.filter((r) => r.status === "blocked_ai" && r.first_round).length;
    const users = new Set(rows.filter(counted).map((r) => r.user_id)).size;

    // buckets: hours for today, days otherwise
    const hourly = period === "today";
    const start = since(period);
    const n = hourly ? 24 : Math.max(1, Math.round((kstStart("day").getTime() - start.getTime()) / 864e5) + 1);
    const keys = Array.from({ length: n }, (_, i) => (hourly ? String(i) : kstDayKey(new Date(start.getTime() + i * 864e5 + 3600e3).toISOString())));
    const buckets = keys.map((k) => ({ key: k, by: { gemini: 0, claude: 0, openai: 0 } as Record<string, number>, req: 0 }));
    const idx = new Map(keys.map((k, i) => [k, i]));
    for (const r of rows) {
      const i = idx.get(hourly ? String(kstHour(r.at)) : kstDayKey(r.at));
      if (i === undefined) continue;
      if (r.provider) buckets[i].by[r.provider] = (buckets[i].by[r.provider] ?? 0) + r.cost_usd;
      if (counted(r)) buckets[i].req++;
    }
    const max = Math.max(0.01, ...buckets.map((b) => SERIES.reduce((a, s) => a + b.by[s], 0)));
    const nice = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find((v) => v >= max) ?? Math.ceil(max);
    const label = (k: string) => (hourly ? `${k}시` : `${Number(k.slice(5, 7))}.${Number(k.slice(8))}`);

    const byProvider = Object.fromEntries(SERIES.map((s) => [s, rows.filter((r) => r.provider === s).reduce((a, r) => a + r.cost_usd, 0)]));
    const models = [...rows.filter((r) => r.model).reduce((m, r) => {
      const k = `${r.provider}|${r.model}`;
      const v = m.get(k) ?? { provider: r.provider!, model: r.model!, req: 0, tin: 0, tout: 0, cost: 0 };
      if (counted(r)) v.req++;
      v.tin += r.input_tokens + r.cache_read + r.cache_write; v.tout += r.output_tokens; v.cost += r.cost_usd;
      return m.set(k, v);
    }, new Map<string, { provider: string; model: string; req: number; tin: number; tout: number; cost: number }>()).values()].sort((a, b) => b.cost - a.cost);
    const feats = Object.entries(rows.reduce((m, r) => ((m[r.feature] = (m[r.feature] ?? 0) + r.input_tokens + r.cache_read + r.cache_write + r.output_tokens), m), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]);
    const featMax = Math.max(1, ...feats.map((f) => f[1]));
    const featSum = feats.reduce((a, f) => a + f[1], 0) || 1;
    const per = new Map<string, { req: number; cost: number }>();
    for (const r of rows) {
      if (!r.user_id) continue;
      const v = per.get(r.user_id) ?? { req: 0, cost: 0 };
      if (counted(r)) v.req++;
      v.cost += r.cost_usd;
      per.set(r.user_id, v);
    }
    const top = [...per.entries()].sort((a, b) => b[1].req - a[1].req).slice(0, 6);
    return { cost, requests, tin, tout, cachePct: tin ? Math.round((cacheRead / tin) * 100) : 0, blockedApp, blockedAi, users, buckets, nice, label, byProvider, models, feats, featMax, featSum, top };
  }, [rows, period]);

  const monthCost = monthRows.reduce((a, r) => a + r.cost_usd, 0);
  const budgetPct = budget ? Math.round((monthCost / budget) * 100) : 0;
  const who = (id: string) => people.find((p) => p.user_id === id);

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div><h1>사용량</h1><p>AI 요청, 토큰, 비용을 한눈에 봐요. 비용은 등록한 단가로 계산한 예상값이에요.</p></div>
        <div className="adm-seg" role="radiogroup" aria-label="기간">
          {PERIODS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={period === v} onClick={() => setPeriod(v)}>{l}</button>)}
        </div>
      </header>
      {err && <p className="adm-err">불러오지 못했어요: {err}</p>}
      {!d ? !err && <p className="adm-muted">불러오는 중…</p> : (
        <>
          <section className="adm-tiles" aria-label="요약">
            <div className="adm-tile">
              <span>비용</span><b>{money(d.cost)}</b>
              <div className="adm-bar" role="progressbar" aria-label="이번 달 예산 사용" aria-valuemin={0} aria-valuemax={100} aria-valuenow={budgetPct}><i className={budgetPct >= 100 ? "full" : ""} style={{ width: `${Math.min(100, budgetPct)}%` }} /></div>
              <small>이번 달 {money(monthCost)} · 예산 ${budget} 중 {budgetPct}%</small>
            </div>
            <div className="adm-tile"><span>AI 요청</span><b>{d.requests.toLocaleString()}회</b><small>회원 {d.users}명이 사용</small></div>
            <div className="adm-tile"><span>토큰</span><b>{big(d.tin + d.tout)}</b><small>입력 {big(d.tin)} · 출력 {big(d.tout)} · 캐시 {d.cachePct}%</small></div>
            <div className="adm-tile"><span>걸러진 요청</span><b>{d.blockedApp + d.blockedAi}건</b><small>앱에서 {d.blockedApp} · AI가 {d.blockedAi} · <a href="#/admin/filters">필터 보기</a></small></div>
          </section>

          <section className="adm-card" aria-labelledby="cost-title">
            <div className="adm-head" style={{ alignItems: "center" }}>
              <h2 id="cost-title">{period === "today" ? "시간별" : "하루"} 비용 · AI별</h2>
              <div className="adm-legend">
                {SERIES.map((s) => <span key={s}><span className="adm-swatch" style={{ background: PROVIDER_COLOR[s] }} />{PROVIDER_LABEL[s]} <b className="mono">{money(d.byProvider[s])}</b></span>)}
              </div>
            </div>
            <div className="adm-chart">
              <div className="adm-yaxis" aria-hidden="true">{[1, 0.66, 0.33, 0].map((f) => <span key={f}>{money(d.nice * f)}</span>)}</div>
              <div className="adm-plot">
                <div className="adm-grid" aria-hidden="true"><div /><div /><div /><div /></div>
                <div className="adm-bars">
                  {d.buckets.map((b, i) => {
                    const total = SERIES.reduce((a, s) => a + b.by[s], 0);
                    return (
                      <div key={b.key} className="adm-col" tabIndex={0} aria-label={`${d.label(b.key)} ${money(total)}, 요청 ${b.req}회`}
                        onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                        {[...SERIES].reverse().map((s) => b.by[s] > 0 && <i key={s} style={{ height: `${(b.by[s] / d.nice) * 100}%`, background: PROVIDER_COLOR[s] }} />)}
                      </div>
                    );
                  })}
                </div>
                {hover !== null && d.buckets[hover] && (
                  <div className="adm-tip" style={{ left: `${((hover + 0.5) / d.buckets.length) * 100}%` }}>
                    <b>{d.label(d.buckets[hover].key)} · {money(SERIES.reduce((a, s) => a + d.buckets[hover].by[s], 0))}</b><br />
                    {SERIES.map((s) => `${PROVIDER_LABEL[s]} ${money(d.buckets[hover].by[s])}`).join(" · ")}<br />요청 {d.buckets[hover].req}회
                  </div>
                )}
              </div>
            </div>
            <div className="adm-xaxis" aria-hidden="true">
              {d.buckets.filter((_, i) => i === 0 || i === d.buckets.length - 1 || i % Math.ceil(d.buckets.length / 5) === 0).map((b) => <span key={b.key}>{d.label(b.key)}</span>)}
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <caption className="adm-muted" style={{ textAlign: "left", fontSize: 12, fontWeight: 700, paddingBottom: 4 }}>모델별</caption>
                <thead><tr><th scope="col">모델</th><th scope="col" className="adm-r">요청</th><th scope="col" className="adm-r">입력 토큰</th><th scope="col" className="adm-r">출력 토큰</th><th scope="col" className="adm-r">비용</th></tr></thead>
                <tbody>
                  {d.models.length ? d.models.map((m) => (
                    <tr key={m.provider + m.model}><th scope="row"><span className="adm-swatch" style={{ background: PROVIDER_COLOR[m.provider] }} />{m.model}</th><td className="adm-r">{m.req}</td><td className="adm-r">{big(m.tin)}</td><td className="adm-r">{big(m.tout)}</td><td className="adm-r"><b>{money(m.cost)}</b></td></tr>
                  )) : <tr><td colSpan={5} className="adm-empty">이 기간에는 AI를 쓴 기록이 없어요.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className="adm-row">
            <section className="adm-card" aria-labelledby="feat-title">
              <h2 id="feat-title">기능별 토큰</h2>
              {d.feats.length ? d.feats.map(([f, t]) => (
                <div key={f} className="adm-hbar">
                  <span style={{ fontWeight: 600 }}>{FEATURE_LABEL[f] ?? f}</span>
                  <div><i style={{ width: `${(t / d.featMax) * 100}%` }} /></div>
                  <span className="mono" style={{ textAlign: "right", color: "var(--muted)" }}>{big(t)} · {Math.round((t / d.featSum) * 100)}%</span>
                </div>
              )) : <p className="adm-empty">기록이 없어요.</p>}
            </section>
            <section className="adm-card" aria-labelledby="top-title" style={{ flexGrow: 1.4 }}>
              <div className="adm-head" style={{ alignItems: "center" }}><h2 id="top-title">많이 쓴 회원</h2><a href="#/admin/members" style={{ fontWeight: 600, fontSize: 13 }}>회원 전체</a></div>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead><tr><th scope="col">회원</th><th scope="col" className="adm-r">요청</th><th scope="col" className="adm-r">비용</th><th scope="col" style={{ minWidth: 150 }}>이번 달 한도</th></tr></thead>
                  <tbody>
                    {d.top.length ? d.top.map(([id, v]) => {
                      const m = who(id);
                      const lim = m?.monthly ?? null;
                      return (
                        <tr key={id}>
                          <th scope="row">{m?.name ?? "알 수 없음"}</th>
                          <td className="adm-r">{v.req}회</td>
                          <td className="adm-r">{money(v.cost)}</td>
                          <td>{m ? <MonthBar used={m.used_month} limit={lim ?? defMonthly} /> : "-"}</td>
                        </tr>
                      );
                    }) : <tr><td colSpan={4} className="adm-empty">아직 없어요.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export function MonthBar({ used, limit }: { used: number; limit: number }) {
  const full = limit > 0 && used >= limit;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="adm-bar"><i className={full ? "full" : ""} style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }} /></span>
      <span style={{ fontSize: 12, fontWeight: 600, color: full ? "var(--bad)" : "var(--muted)", whiteSpace: "nowrap" }}>{used} / {limit || "-"}</span>
    </span>
  );
}
