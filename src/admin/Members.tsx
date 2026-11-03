import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { toast } from "../lib/store";
import { ConfirmButton } from "../components/ui";
import { accountAction, banLabel, big, memberUsage, members, money, PROVIDER_LABEL, resetMonth, saveLimits, saveNote, saveSettings, settings, shortWhen, type Member, type UsageRow } from "./api";
import { MonthBar } from "./Usage";

type Filter = "all" | "active" | "full" | "paused" | "banned";
const FEATURE: Record<string, string> = { chat: "대화로 고치기", plan: "일정 처음 짜기", day: "하루 일정 짜기", geo: "위치 채우기", recs: "계절 추천", ticket: "항공권 읽기" };
const day = (iso: string | null) => (iso ? shortWhen(iso).split(" ")[0] : "-");

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

export function Members() {
  const [list, setList] = useState<Member[] | null>(null);
  const [defs, setDefs] = useState({ daily: 30, monthly: 300 });
  const [editDefs, setEditDefs] = useState<{ daily: number; monthly: number } | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = () => Promise.all([members(), settings()]).then(([m, s]) => { setList(m); setDefs({ daily: s.daily_limit, monthly: s.monthly_limit }); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const limitOf = (m: Member) => ({ daily: m.daily ?? defs.daily, monthly: m.monthly ?? defs.monthly });
  const isFull = (m: Member) => { const l = limitOf(m); return m.used_month >= l.monthly || m.used_today >= l.daily; };
  const pass = (m: Member, f: Filter) => f === "all" || (f === "active" && m.used_month > 0) || (f === "full" && isFull(m)) || (f === "paused" && m.paused) || (f === "banned" && !!m.banned_until);
  const shown = useMemo(() => (list ?? []).filter((m) =>
    (!q.trim() || m.name.includes(q.trim()) || m.note.includes(q.trim())) && pass(m, filter)), [list, q, filter, defs]);
  const count = (f: Filter) => (list ?? []).filter((m) => pass(m, f)).length;
  const cur = list?.find((m) => m.user_id === sel) ?? null;

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div><h1>회원</h1><p>카카오로 가입한 회원 {list?.length ?? "…"}명</p></div>
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label className="adm-search"><Icon name="search" size={18} /><span className="sr">회원 검색</span><input type="search" placeholder="이름이나 메모로 찾기" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="adm-chips" role="radiogroup" aria-label="회원 걸러 보기">
          {([["all", "전체"], ["active", "이번 달 사용"], ["full", "한도 다 씀"], ["paused", "AI 멈춤"], ["banned", "정지"]] as [Filter, string][]).map(([f, l]) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>{l} {count(f)}</button>
          ))}
        </div>
      </div>
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-split">
        <section className="adm-card" style={{ padding: 0, overflow: "hidden" }} aria-label="회원 목록">
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th scope="col" style={{ paddingLeft: 16 }}>회원</th><th scope="col">가입</th><th scope="col">최근 접속</th><th scope="col" className="adm-r">여행</th><th scope="col" style={{ minWidth: 150 }}>이번 달 AI</th><th scope="col">상태</th></tr></thead>
              <tbody>
                {!list ? <tr><td colSpan={6} className="adm-empty">불러오는 중…</td></tr> : !shown.length ? <tr><td colSpan={6} className="adm-empty">해당하는 회원이 없어요.</td></tr> : shown.map((m) => {
                  const l = limitOf(m);
                  const st = m.is_admin ? ["info", "관리자"] : m.banned_until ? ["warn", `정지 · ${banLabel(m.banned_until)}`] : m.paused ? ["mute", "AI 멈춤"] : isFull(m) ? ["bad", "한도 다 씀"] : ["ok", "사용 중"];
                  const sub = m.note ? `메모 · ${m.note}` : m.daily !== null || m.monthly !== null ? "한도 따로" : "";
                  return (
                    <tr key={m.user_id} className={"click" + (sel === m.user_id ? " sel" : "")} onClick={() => setSel(m.user_id)}>
                      <th scope="row" style={{ paddingLeft: 16 }}>
                        <button type="button" onClick={() => setSel(m.user_id)} style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }} aria-label={`${m.name} 자세히`}>
                          {m.avatar ? <img className="adm-avatar" src={m.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="adm-avatar" aria-hidden="true">{m.name.slice(0, 1)}</span>}
                          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span>{m.name}</span>{sub && <small className="adm-muted adm-clip" style={{ fontWeight: 400 }}>{sub}</small>}</span>
                        </button>
                      </th>
                      <td className="adm-muted">{day(m.created_at)}</td>
                      <td className="adm-muted">{day(m.last_sign_in_at)}</td>
                      <td className="adm-r">{m.trips}</td>
                      <td><MonthBar used={m.used_month} limit={l.monthly} /></td>
                      <td><span className={`adm-pill ${st[0]}`}>{st[1]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        {cur && <MemberPanel key={cur.user_id} m={cur} defs={defs} onClose={() => setSel(null)} onSaved={load} onDeleted={() => { setSel(null); load(); }} />}
      </div>
    </div>
  );
}

function MemberPanel({ m, defs, onClose, onSaved, onDeleted }: { m: Member; defs: { daily: number; monthly: number }; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const custom0 = m.daily !== null || m.monthly !== null;
  const [custom, setCustom] = useState(custom0);
  const [daily, setDaily] = useState(m.daily ?? defs.daily);
  const [monthly, setMonthly] = useState(m.monthly ?? defs.monthly);
  const [paused, setPaused] = useState(m.paused);
  const [recent, setRecent] = useState<UsageRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { memberUsage(m.user_id).then(setRecent).catch(() => setRecent([])); }, [m.user_id]);
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {m.avatar ? <img className="adm-avatar" style={{ width: 48, height: 48 }} src={m.avatar} alt="" referrerPolicy="no-referrer" /> : <span className="adm-avatar" style={{ width: 48, height: 48, fontSize: 18 }} aria-hidden="true">{m.name.slice(0, 1)}</span>}
        <div style={{ flex: 1, minWidth: 0 }}><h2 id="member-title" style={{ fontSize: 18 }}>{m.name}</h2><span className="adm-muted" style={{ fontSize: 12 }}>가입 {day(m.created_at)} · 최근 접속 {m.last_sign_in_at ? shortWhen(m.last_sign_in_at) : "-"} · 여행 {m.trips}개</span></div>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      {m.banned_until && <p role="status" className="adm-pill warn" style={{ whiteSpace: "normal", padding: "10px 12px", borderRadius: 12, fontWeight: 600 }}>이용 정지 중 · {banLabel(m.banned_until)}{m.ban_reason ? ` · 사유: ${m.ban_reason}` : ""}</p>}
      {full && !paused && !m.banned_until && <p role="status" className="adm-pill bad" style={{ whiteSpace: "normal", padding: "10px 12px", borderRadius: 12, fontWeight: 600 }}>한도를 다 써서 지금은 AI를 쓸 수 없어요 (오늘 {m.used_today}/{lim.daily} · 이번 달 {m.used_month}/{lim.monthly}).</p>}

      <InfoSection m={m} onSaved={onSaved} />

      <section className="adm-sec" aria-labelledby="sec-limit">
      <h3 id="sec-limit" className="adm-sec-title">AI 사용 한도</h3>
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

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <b>이번 달 사용 <span className="adm-muted mono" style={{ fontWeight: 400 }}>{m.used_month}회 · {money(m.cost_month)}</span></b>
        {!recent ? <p className="adm-muted">불러오는 중…</p> : !recent.length ? <p className="adm-muted" style={{ fontSize: 13 }}>아직 AI를 쓰지 않았어요.</p> : recent.map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)", fontSize: 13 }}>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{r.status === "blocked_app" ? `걸러짐 · ${r.topic}` : r.status === "blocked_ai" ? "AI가 거절" : r.status === "limit" ? "한도 초과로 막힘" : r.status === "error" ? "오류" : FEATURE[r.feature] ?? r.feature}</span>
              <span className="adm-muted" style={{ fontSize: 12 }}>{shortWhen(r.at)} · {r.model ? `${PROVIDER_LABEL[r.provider ?? ""] ?? ""} ${r.model}` : r.status === "blocked_app" ? "앱에서 막음" : "-"}</span>
            </span>
            <span className="mono adm-muted" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{big(r.input_tokens + r.cache_read + r.output_tokens)} 토큰<br />{money(Number(r.cost_usd))}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn primary" style={{ flex: "1 1 140px" }} disabled={busy} onClick={save}>한도 저장</button>
        <button type="button" className="btn" style={{ flex: "1 1 140px" }} disabled={busy} onClick={async () => {
          try { await resetMonth(m.user_id); toast("이번 달 횟수를 0으로 돌렸어요"); onSaved(); } catch (e) { toast((e as Error).message); }
        }}>이번 달 횟수 초기화</button>
      </div>
      </section>

      {m.is_admin
        ? <p className="adm-muted" style={{ fontSize: 13, paddingTop: 16, borderTop: "1px solid var(--line)" }}>관리자 계정은 로그아웃시키거나 정지 · 삭제할 수 없어요.</p>
        : <><AccountSection m={m} onSaved={onSaved} /><DeleteSection m={m} onDeleted={onDeleted} /></>}
    </aside>
  );
}

const fail = (e: unknown) => toast((e as Error).message);

function InfoSection({ m, onSaved }: { m: Member; onSaved: () => void }) {
  const [name, setName] = useState(m.name);
  const [note, setNote] = useState(m.note);
  const [busy, setBusy] = useState("");
  const nameOk = name.trim() && [...name.trim()].length <= 20 && name.trim() !== m.name;
  return (
    <section className="adm-sec" aria-labelledby="sec-info">
      <h3 id="sec-info" className="adm-sec-title">회원 정보</h3>
      <label htmlFor="m-name" className="adm-label">닉네임 · 앱에 보이는 이름</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="m-name" className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <button type="button" className="btn" disabled={!nameOk || !!busy} onClick={async () => {
          setBusy("name");
          try { await accountAction("rename", m.user_id, { name }); toast("닉네임을 바꿨어요"); onSaved(); } catch (e) { fail(e); }
          setBusy("");
        }}>{busy === "name" ? "바꾸는 중…" : "바꾸기"}</button>
      </div>
      <label htmlFor="m-note" className="adm-label">관리자 메모 · 회원에게는 안 보여요</label>
      <textarea id="m-note" className="input" rows={2} maxLength={300} value={note} placeholder="예: 베타 테스터" onChange={(e) => setNote(e.target.value)} style={{ height: "auto", padding: "10px 12px", lineHeight: 1.5, resize: "vertical" }} />
      {note.trim() !== m.note && (
        <button type="button" className="btn sm" style={{ alignSelf: "flex-end" }} disabled={!!busy} onClick={async () => {
          setBusy("note");
          try { await saveNote(m.user_id, note); toast("메모를 저장했어요"); onSaved(); } catch (e) { fail(e); }
          setBusy("");
        }}>메모 저장</button>
      )}
    </section>
  );
}

const PERIODS: [days: number, label: string][] = [[7, "7일"], [30, "30일"], [0, "무기한"]];

function AccountSection({ m, onSaved }: { m: Member; onSaved: () => void }) {
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (what: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await what(); toast(done); onSaved(); } catch (e) { fail(e); }
    setBusy(false);
  };
  const label = PERIODS.find((p) => p[0] === days)![1];
  return (
    <section className="adm-sec" aria-labelledby="sec-account">
      <h3 id="sec-account" className="adm-sec-title">계정</h3>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ display: "flex", flexDirection: "column" }}><b>모든 기기에서 로그아웃</b><small className="adm-muted">휴대폰을 잃어버렸을 때 써요. 앱을 다시 열면 바로, 열어 둔 화면도 1시간 안에 로그아웃돼요.</small></span>
        {busy ? <button type="button" className="btn sm" disabled>…</button>
          : <ConfirmButton className="btn sm" confirmText="한 번 더" onConfirm={() => act(() => accountAction("sign_out", m.user_id), `${m.name}님을 모든 기기에서 로그아웃시켰어요`)}>로그아웃시키기</ConfirmButton>}
      </div>
      {m.banned_until ? (
        <div className="adm-ban">
          <b>이용 정지 중 · {banLabel(m.banned_until)}</b>
          <small>{m.ban_reason ? `사유: ${m.ban_reason}` : "사유를 적지 않았어요"}</small>
          <button type="button" className="btn" disabled={busy} onClick={() => act(() => accountAction("unban", m.user_id), "정지를 풀었어요")}>정지 풀기</button>
        </div>
      ) : (
        <fieldset className="adm-ban">
          <legend>이용 정지</legend>
          <small>정지하면 바로 로그아웃되고, 기간이 끝날 때까지 로그인할 수 없어요. 여행은 지워지지 않아요.</small>
          <div className="adm-chips" role="radiogroup" aria-label="정지 기간">
            {PERIODS.map(([d, l]) => <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)}>{l}</button>)}
          </div>
          <label htmlFor="m-ban-reason" className="adm-label">사유 · 관리자만 봐요</label>
          <input id="m-ban-reason" className="input" maxLength={100} value={reason} placeholder="예: 다른 사람을 사칭하는 닉네임" onChange={(e) => setReason(e.target.value)} />
          {busy ? <button type="button" className="btn" disabled>정지하는 중…</button>
            : <ConfirmButton className="btn danger" confirmText={`한 번 더 누르면 ${label} 정지돼요`} onConfirm={() => act(() => accountAction("ban", m.user_id, { days, reason }), `${m.name}님을 ${label} 정지했어요`)}>{days ? `${label} 정지하기` : "무기한 정지하기"}</ConfirmButton>}
        </fieldset>
      )}
    </section>
  );
}

function DeleteSection({ m, onDeleted }: { m: Member; onDeleted: () => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="adm-danger" aria-labelledby="sec-delete">
      <h3 id="sec-delete">회원 삭제</h3>
      <ul>
        <li>계정과 계정에 저장된 여행 {m.trips}개</li>
        {m.shares > 0 && <li>이 회원이 만든 공유 링크 {m.shares}개 (받은 사람도 더 이상 못 봐요)</li>}
        <li>회원별 한도 · 메모 · 필터에 걸린 대화 내용</li>
        <li>카카오 연결 (다시 가입하면 새 계정이에요)</li>
      </ul>
      <small>AI 사용 기록은 이름 없이 남아 비용 통계에만 쓰여요. 되돌릴 수 없어요.</small>
      <label htmlFor="m-del-confirm" className="adm-label">지우려면 <b>{m.name}</b>을(를) 그대로 입력하세요</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="m-del-confirm" className="input" value={typed} placeholder={m.name} autoComplete="off" onChange={(e) => setTyped(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <button type="button" className="btn danger-solid" disabled={typed.trim() !== m.name || busy} onClick={async () => {
          setBusy(true);
          try {
            const r = await accountAction("delete", m.user_id) as { kakao?: string };
            toast(`${m.name}님 계정을 지웠어요${r.kakao === "skipped" ? " · 카카오 연결 끊기는 설정 전이라 건너뛰었어요" : r.kakao === "failed" ? " · 카카오 연결은 끊지 못했어요" : ""}`);
            onDeleted();
          } catch (e) { fail(e); setBusy(false); }
        }}>{busy ? "지우는 중…" : "회원 삭제"}</button>
      </div>
    </section>
  );
}
