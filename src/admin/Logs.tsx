/** 회원 › AI 사용 기록: every AI request with its tokens and cost, filterable, downloadable as CSV. */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { big, FEATURE_LABEL, kstStart, members, money, PROVIDER_LABEL, shortWhen, usageSince, type Member, type UsageRow } from "./api";

type Period = "today" | "7" | "30" | "month";
type Status = "all" | "ok" | "blocked" | "limit" | "error";
const PERIODS: [Period, string][] = [["today", "오늘"], ["7", "7일"], ["30", "30일"], ["month", "이번 달"]];
const since = (p: Period) => (p === "today" ? kstStart("day") : p === "month" ? kstStart("month") : kstStart("day", Number(p) - 1));
const STATUS: Record<string, [label: string, tone: string]> = {
  ok: ["정상", "ok"], blocked_app: ["걸러짐 · 앱", "warn"], blocked_ai: ["AI가 거절", "warn"], limit: ["한도 초과", "mute"], error: ["오류", "bad"],
};
const PAGE = 100;

/** One member action. A chat edit takes a few AI rounds; they share a request id and become one entry here. */
interface Req {
  key: string; at: string; user_id: string | null; feature: string; provider: string | null; model: string | null; rounds: number;
  input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; status: string; topic: string | null; snippet: string | null;
}
const tokensOf = (r: Req) => r.input + r.output + r.cacheRead + r.cacheWrite;

function group(rows: UsageRow[]): Req[] {
  const by = new Map<string, Req>();
  rows.forEach((r, i) => {
    const key = r.request_id ?? `row-${i}`;
    const g = by.get(key) ?? { key, at: r.at, user_id: r.user_id, feature: r.feature, provider: null, model: null, rounds: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, status: r.status, topic: null, snippet: null };
    if (r.at < g.at) g.at = r.at;
    if (r.first_round) g.status = r.status;
    if (r.status === "error" && g.status === "ok") g.status = "error";
    if (r.model) { g.provider = r.provider; g.model = r.model; }
    if (r.topic) g.topic = r.topic;
    if (r.snippet) g.snippet = r.snippet;
    g.rounds += r.model ? 1 : 0;
    g.input += r.input_tokens; g.output += r.output_tokens; g.cacheRead += r.cache_read; g.cacheWrite += r.cache_write; g.cost += Number(r.cost_usd);
    by.set(key, g);
  });
  return [...by.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
}

function download(list: Req[], names: Record<string, string>) {
  const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["시간(KST)", "회원", "기능", "AI", "모델", "AI 호출 수", "입력 토큰", "출력 토큰", "캐시 읽기", "캐시 쓰기", "비용(USD)", "상태", "주제", "내용"];
  const lines = list.map((r) => [
    shortWhen(r.at), r.user_id ? names[r.user_id] ?? r.user_id : "(탈퇴한 회원)", FEATURE_LABEL[r.feature] ?? r.feature, PROVIDER_LABEL[r.provider ?? ""] ?? "", r.model ?? "",
    r.rounds, r.input, r.output, r.cacheRead, r.cacheWrite, r.cost.toFixed(6), STATUS[r.status]?.[0] ?? r.status, r.topic ?? "", r.snippet ?? "",
  ].map(cell).join(","));
  const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tripboard-ai-usage-${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Logs({ initial }: { initial?: string }) {
  const [period, setPeriod] = useState<Period>("7");
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [people, setPeople] = useState<Member[]>([]);
  const [who, setWho] = useState(initial ?? "");
  const [feature, setFeature] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [limit, setLimit] = useState(PAGE);
  const [err, setErr] = useState("");

  useEffect(() => { members().then(setPeople).catch(() => {}); }, []);
  useEffect(() => {
    setRows(null);
    usageSince(since(period)).then(setRows).catch((e) => setErr((e as Error).message));
  }, [period]);
  useEffect(() => setLimit(PAGE), [period, who, feature, status]);

  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.user_id, p.name])), [people]);
  const all = useMemo(() => group(rows ?? []), [rows]);
  const pass = (r: Req, s: Status) => s === "all" || (s === "blocked" ? r.status.startsWith("blocked") : r.status === s);
  const base = all.filter((r) => (!who || r.user_id === who) && (!feature || r.feature === feature));
  const list = base.filter((r) => pass(r, status));
  const count = (s: Status) => base.filter((r) => pass(r, s)).length;
  const total = list.reduce((t, r) => ({ tokens: t.tokens + tokensOf(r), cost: t.cost + r.cost }), { tokens: 0, cost: 0 });
  const features = [...new Set(all.map((r) => r.feature))];

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div><h1>AI 사용 기록</h1><p>회원이 AI에 보낸 요청 하나하나의 토큰과 비용이에요. 비용은 AI 키 · 모델에 넣은 단가로 계산한 예상값이에요.</p></div>
        <div className="adm-seg" role="radiogroup" aria-label="기간">
          {PERIODS.map(([p, l]) => <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)}>{l}</button>)}
        </div>
      </header>

      <div className="adm-logbar">
        <label className="adm-select"><span className="sr">회원</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">전체 회원</option>
            {[...people].sort((a, b) => a.name.localeCompare(b.name, "ko")).map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
          </select>
        </label>
        <label className="adm-select"><span className="sr">기능</span>
          <select value={feature} onChange={(e) => setFeature(e.target.value)}>
            <option value="">전체 기능</option>
            {features.map((f) => <option key={f} value={f}>{FEATURE_LABEL[f] ?? f}</option>)}
          </select>
        </label>
        <div className="adm-chips" role="radiogroup" aria-label="상태">
          {([["all", "전체"], ["ok", "정상"], ["blocked", "걸러짐"], ["limit", "한도 초과"], ["error", "오류"]] as [Status, string][]).map(([s, l]) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)}>{l} {rows ? count(s) : ""}</button>
          ))}
        </div>
        <button type="button" className="btn sm" style={{ marginLeft: "auto" }} disabled={!list.length} onClick={() => download(list, names)}><Icon name="download" size={15} />CSV 내려받기</button>
      </div>
      {err && <p className="adm-err">{err}</p>}

      <section className="adm-card" style={{ padding: 0, overflow: "hidden" }} aria-label="AI 사용 기록">
        <p className="adm-logsum" role="status">
          {!rows ? "불러오는 중…" : <>요청 <b>{list.length.toLocaleString()}건</b> · 토큰 <b>{big(total.tokens)}</b> · 비용 <b>{money(total.cost)}</b>{who && <> · {names[who] ?? "회원"} <button type="button" className="link-btn" onClick={() => setWho("")}>전체 보기</button></>}</>}
        </p>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th scope="col" style={{ paddingLeft: 16 }}>시간</th><th scope="col">회원</th><th scope="col">기능</th><th scope="col">AI · 모델</th><th scope="col" className="adm-r">토큰</th><th scope="col" className="adm-r">비용</th><th scope="col">상태</th></tr></thead>
            <tbody>
              {!rows ? <tr><td colSpan={7} className="adm-empty">불러오는 중…</td></tr> : !list.length ? <tr><td colSpan={7} className="adm-empty">이 조건의 기록이 없어요.</td></tr> : list.slice(0, limit).map((r) => {
                const st = STATUS[r.status] ?? [r.status, "mute"];
                return (
                  <tr key={r.key}>
                    <td className="adm-muted" style={{ paddingLeft: 16, whiteSpace: "nowrap" }}>{shortWhen(r.at)}</td>
                    <td>{r.user_id
                      ? <button type="button" className="link-btn" style={{ color: "var(--ink)", fontWeight: 600 }} onClick={() => setWho(r.user_id!)} title="이 회원 기록만 보기">{names[r.user_id] ?? "회원"}</button>
                      : <span className="adm-muted">(탈퇴한 회원)</span>}</td>
                    <td><span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>{FEATURE_LABEL[r.feature] ?? r.feature}{r.snippet && <small className="adm-muted adm-clip" title={r.snippet}>{r.topic ? `${r.topic} · ` : ""}{r.snippet}</small>}</span></td>
                    <td><span style={{ display: "flex", flexDirection: "column" }}>{r.model ? <>{PROVIDER_LABEL[r.provider ?? ""] ?? r.provider}<small className="adm-muted mono">{r.model}{r.rounds > 1 ? ` · ${r.rounds}번 호출` : ""}</small></> : <span className="adm-muted">-</span>}</span></td>
                    <td className="adm-r"><span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>{big(tokensOf(r))}<small className="adm-muted" style={{ whiteSpace: "nowrap" }}>입력 {big(r.input)} · 출력 {big(r.output)}{r.cacheRead ? ` · 캐시 ${big(r.cacheRead)}` : ""}</small></span></td>
                    <td className="adm-r">{money(r.cost)}</td>
                    <td><span className={`adm-pill ${st[1]}`}>{st[0]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows && list.length > limit && (
          <div style={{ padding: 12, display: "flex", justifyContent: "center" }}>
            <button type="button" className="btn sm" onClick={() => setLimit(limit + PAGE)}>{Math.min(PAGE, list.length - limit)}건 더 보기 ({limit.toLocaleString()} / {list.length.toLocaleString()})</button>
          </div>
        )}
      </section>
    </div>
  );
}
