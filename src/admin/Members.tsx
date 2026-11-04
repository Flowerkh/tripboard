/** 회원 › AI 사용 · 한도: each member's requests, tokens and cost, their limits, and pausing their AI. */
import { useEffect, useMemo, useState } from "react";
import { toast } from "../lib/store";
import { banLabel, big, kstStart, money, resetMonth, saveLimits, saveSettings, shortWhen, usageSince, type Member, type UsageRow } from "./api";
import { Banner, day, MemberCell, PanelHead, Toolbar, useMembers } from "./memberBits";
import { MonthBar } from "./Usage";

type Filter = "all" | "active" | "full" | "paused";
const tokensOf = (r: UsageRow) => r.input_tokens + r.cache_read + r.cache_write + r.output_tokens;

function Num({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 120px" }}>
      <label htmlFor={id} style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>{label}</label>
      <span className="adm-num">
        <button type="button" aria-label={`${label} 줄이기`} onClick={() => onChange(Math.max(0, value - (value > 50 ? 10 : 1)))}>−</button>
        <input id={id} type="number" min={0} inputMode="numeric" value={value} onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
        <button type="button" aria-label={`${label} 늘리기`} onClick={() => onChange(value + (value >= 50 ? 10 : 1))}>+</button>
      </span>
    </span>
  );
}

export function Members({ initial }: { initial?: string }) {
  const { list, defs, setDefs, load, err } = useMembers();
  const [editDefs, setEditDefs] = useState<{ daily: number; monthly: number } | null>(null);
  const [tokens, setTokens] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<string | null>(initial ?? null);

  // tokens this month per member (the member list only counts requests)
  useEffect(() => {
    usageSince(kstStart("month")).then((rows) => {
      const t: Record<string, number> = {};
      for (const r of rows) if (r.user_id) t[r.user_id] = (t[r.user_id] ?? 0) + tokensOf(r);
      setTokens(t);
    }).catch(() => {});
  }, []);

  const limitOf = (m: Member) => ({ daily: m.daily ?? defs.daily, monthly: m.monthly ?? defs.monthly });
  const isFull = (m: Member) => { const l = limitOf(m); return m.used_month >= l.monthly || m.used_today >= l.daily; };
  const pass = (m: Member, f: Filter) => f === "all" || (f === "active" && m.used_month > 0) || (f === "full" && isFull(m)) || (f === "paused" && m.paused);
  const shown = useMemo(() => (list ?? []).filter((m) => (!q.trim() || m.name.includes(q.trim()) || m.note.includes(q.trim())) && pass(m, filter)), [list, q, filter, defs]);
  const count = (f: Filter) => (list ?? []).filter((m) => pass(m, f)).length;
  const cur = list?.find((m) => m.user_id === sel) ?? null;

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div><h1>AI 사용 · 한도</h1><p>회원별 AI 요청 · 토큰 · 비용과 사용 한도</p></div>
        {editDefs ? (
          <div className="adm-card" style={{ padding: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
            <Num id="def-daily" label="기본 하루" value={editDefs.daily} onChange={(v) => setEditDefs({ ...editDefs, daily: v })} />
            <Num id="def-monthly" label="기본 한 달" value={editDefs.monthly} onChange={(v) => setEditDefs({ ...editDefs, monthly: v })} />
            <button type="button" className="btn primary sm" onClick={async () => {
              try { await saveSettings({ daily_limit: editDefs.daily, monthly_limit: editDefs.monthly }); setDefs(editDefs); setEditDefs(null); toast("기본 한도를 바꿨어요"); } catch (e) { toast((e as Error).message); }
            }}>저장</button>
            <button type="button" className="btn sm" onClick={() => setEditDefs(null)}>취소</button>
          </div>
        ) : (
          <div className="adm-card" style={{ padding: "10px 14px", flexDirection: "row", alignItems: "center", gap: 10 }}>
            <span className="adm-muted" style={{ fontSize: 13 }}>기본 AI 한도</span>
            <b className="mono">하루 {defs.daily}회 · 한 달 {defs.monthly}회</b>
            <button type="button" className="btn sm" onClick={() => setEditDefs(defs)}>바꾸기</button>
          </div>
        )}
      </header>

      <Toolbar q={q} setQ={setQ} placeholder="이름이나 메모로 찾기" value={filter} onChange={setFilter}
        chips={[["all", "전체", count("all")], ["active", "이번 달 사용", count("active")], ["full", "한도 다 씀", count("full")], ["paused", "AI 멈춤", count("paused")]]} />
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-split">
        <section className="adm-card" style={{ padding: 0, overflow: "hidden" }} aria-label="회원 목록">
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th scope="col" style={{ paddingLeft: 16 }}>회원</th><th scope="col" className="adm-r">오늘</th><th scope="col" style={{ minWidth: 150 }}>이번 달 요청</th><th scope="col" className="adm-r">이번 달 토큰</th><th scope="col" className="adm-r">비용</th><th scope="col">상태</th></tr></thead>
              <tbody>
                {!list ? <tr><td colSpan={6} className="adm-empty">불러오는 중…</td></tr> : !shown.length ? <tr><td colSpan={6} className="adm-empty">해당하는 회원이 없어요.</td></tr> : shown.map((m) => {
                  const l = limitOf(m);
                  const st = m.banned_until ? ["warn", "정지"] : m.paused ? ["mute", "AI 멈춤"] : isFull(m) ? ["bad", "한도 다 씀"] : m.is_admin ? ["info", "관리자"] : ["ok", "사용 중"];
                  return (
                    <tr key={m.user_id} className={"click" + (sel === m.user_id ? " sel" : "")} onClick={() => setSel(m.user_id)}>
                      <MemberCell m={m} sub={m.daily !== null || m.monthly !== null ? "한도 따로" : ""} onPick={() => setSel(m.user_id)} />
                      <td className="adm-r">{m.used_today} / {l.daily}</td>
                      <td><MonthBar used={m.used_month} limit={l.monthly} /></td>
                      <td className="adm-r">{big(tokens[m.user_id] ?? 0)}</td>
                      <td className="adm-r">{money(m.cost_month)}</td>
                      <td><span className={`adm-pill ${st[0]}`}>{st[1]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        {cur && <AiPanel key={cur.user_id} m={cur} tokens={tokens[cur.user_id] ?? 0} defs={defs} onClose={() => setSel(null)} onSaved={load} />}
      </div>
    </div>
  );
}

function AiPanel({ m, tokens, defs, onClose, onSaved }: { m: Member; tokens: number; defs: { daily: number; monthly: number }; onClose: () => void; onSaved: () => void }) {
  const [custom, setCustom] = useState(m.daily !== null || m.monthly !== null);
  const [daily, setDaily] = useState(m.daily ?? defs.daily);
  const [monthly, setMonthly] = useState(m.monthly ?? defs.monthly);
  const [paused, setPaused] = useState(m.paused);
  const [busy, setBusy] = useState(false);
  const lim = custom ? { daily, monthly } : defs;
  const full = m.used_month >= lim.monthly || m.used_today >= lim.daily;

  const save = async () => {
    setBusy(true);
    try {
      await saveLimits(m.user_id, { daily: custom ? daily : null, monthly: custom ? monthly : null, paused });
      toast(`${m.name}님 한도를 저장했어요`);
      onSaved();
    } catch (e) { toast((e as Error).message); }
    setBusy(false);
  };

  return (
    <aside className="adm-card" aria-labelledby="member-title" style={{ gap: 16 }}>
      <PanelHead m={m} onClose={onClose} other={{ href: `#/admin/accounts/${m.user_id}`, label: "이 회원의 계정 관리 (정지 · 삭제 등)" }}
        line={`가입 ${day(m.created_at)} · 최근 접속 ${m.last_sign_in_at ? shortWhen(m.last_sign_in_at) : "-"}`} />
      <div className="adm-stats">
        <span><small>오늘</small><b>{m.used_today}<i> / {lim.daily}회</i></b></span>
        <span><small>이번 달</small><b>{m.used_month}<i> / {lim.monthly}회</i></b></span>
        <span><small>토큰</small><b>{big(tokens)}</b></span>
        <span><small>비용</small><b>{money(m.cost_month)}</b></span>
      </div>
      {m.banned_until && <Banner tone="warn">이용 정지 중이라 AI도 쓸 수 없어요 · {banLabel(m.banned_until)}</Banner>}
      {full && !paused && !m.banned_until && <Banner tone="bad">한도를 다 써서 지금은 AI를 쓸 수 없어요.</Banner>}

      <section className="adm-sec" aria-labelledby="sec-limit">
        <h3 id="sec-limit" className="adm-sec-title">사용 한도</h3>
        <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <legend className="sr">AI 사용 한도 정하기</legend>
          <label className={"adm-choice" + (!custom ? " on" : "")}>
            <input type="radio" name="limit-mode" checked={!custom} onChange={() => setCustom(false)} />
            <span style={{ display: "flex", flexDirection: "column" }}><b>기본 한도 따르기</b><small className="adm-muted">하루 {defs.daily}회 · 한 달 {defs.monthly}회</small></span>
          </label>
          <label className={"adm-choice" + (custom ? " on" : "")}>
            <input type="radio" name="limit-mode" checked={custom} onChange={() => setCustom(true)} />
            <span style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              <b>이 회원만 따로 정하기</b>
              {custom && <span style={{ display: "flex", flexWrap: "wrap", gap: 10 }}><Num id="m-daily" label="하루" value={daily} onChange={setDaily} /><Num id="m-monthly" label="한 달" value={monthly} onChange={setMonthly} /></span>}
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 2px" }}>
            <span style={{ display: "flex", flexDirection: "column" }}><b>AI 사용 멈추기</b><small className="adm-muted">앱은 쓰고 AI만 막아요</small></span>
            <input type="checkbox" role="switch" checked={paused} onChange={(e) => setPaused(e.target.checked)} style={{ width: 22, height: 22 }} />
          </label>
        </fieldset>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn primary" style={{ flex: "1 1 140px" }} disabled={busy} onClick={save}>한도 저장</button>
          <button type="button" className="btn" style={{ flex: "1 1 140px" }} disabled={busy} onClick={async () => {
            try { await resetMonth(m.user_id); toast("이번 달 횟수를 0으로 돌렸어요"); onSaved(); } catch (e) { toast((e as Error).message); }
          }}>이번 달 횟수 초기화</button>
        </div>
      </section>

      <section className="adm-sec" aria-labelledby="sec-recent">
        <h3 id="sec-recent" className="adm-sec-title">사용 기록</h3>
        <p className="adm-muted" style={{ fontSize: 13 }}>요청마다 쓴 토큰과 비용은 AI 사용 기록에서 볼 수 있어요.</p>
        <a className="btn" href={`#/admin/logs/${m.user_id}`}>이 회원의 AI 사용 기록 보기</a>
      </section>
    </aside>
  );
}
