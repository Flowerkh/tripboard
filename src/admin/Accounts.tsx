/** 회원 › 계정 관리: nickname, admin note, log out everywhere, ban, delete. */
import { useMemo, useState } from "react";
import { ConfirmButton } from "../components/ui";
import { toast } from "../lib/store";
import { accountAction, banLabel, saveNote, shortWhen, type Member } from "./api";
import { Banner, day, MemberCell, PanelHead, Toolbar, useMembers } from "./memberBits";

type Filter = "all" | "banned" | "noted" | "admin";

export function Accounts({ initial }: { initial?: string }) {
  const { list, load, err } = useMembers();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<string | null>(initial ?? null);
  const pass = (m: Member, f: Filter) => f === "all" || (f === "banned" && !!m.banned_until) || (f === "noted" && !!m.note) || (f === "admin" && m.is_admin);
  const shown = useMemo(() => (list ?? []).filter((m) => (!q.trim() || m.name.includes(q.trim()) || m.note.includes(q.trim())) && pass(m, filter)), [list, q, filter]);
  const count = (f: Filter) => (list ?? []).filter((m) => pass(m, f)).length;
  const cur = list?.find((m) => m.user_id === sel) ?? null;
  const banned = count("banned");

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div><h1>계정 관리</h1><p>카카오로 가입한 회원 {list?.length ?? "…"}명{banned ? ` · 정지 ${banned}명` : ""}</p></div>
      </header>
      <Toolbar q={q} setQ={setQ} placeholder="이름이나 메모로 찾기" value={filter} onChange={setFilter}
        chips={[["all", "전체", count("all")], ["banned", "정지", banned], ["noted", "메모 있음", count("noted")], ["admin", "관리자", count("admin")]]} />
      {err && <p className="adm-err">{err}</p>}

      <div className="adm-split">
        <section className="adm-card" style={{ padding: 0, overflow: "hidden" }} aria-label="회원 목록">
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th scope="col" style={{ paddingLeft: 16 }}>회원</th><th scope="col">가입</th><th scope="col">최근 접속</th><th scope="col" className="adm-r">여행</th><th scope="col" className="adm-r">공유 링크</th><th scope="col">상태</th></tr></thead>
              <tbody>
                {!list ? <tr><td colSpan={6} className="adm-empty">불러오는 중…</td></tr> : !shown.length ? <tr><td colSpan={6} className="adm-empty">해당하는 회원이 없어요.</td></tr> : shown.map((m) => {
                  const st = m.is_admin ? ["info", "관리자"] : m.banned_until ? ["warn", `정지 · ${banLabel(m.banned_until)}`] : ["ok", "정상"];
                  return (
                    <tr key={m.user_id} className={"click" + (sel === m.user_id ? " sel" : "")} onClick={() => setSel(m.user_id)}>
                      <MemberCell m={m} sub={m.note ? `메모 · ${m.note}` : ""} onPick={() => setSel(m.user_id)} />
                      <td className="adm-muted">{day(m.created_at)}</td>
                      <td className="adm-muted">{m.last_sign_in_at ? shortWhen(m.last_sign_in_at) : "-"}</td>
                      <td className="adm-r">{m.trips}</td>
                      <td className="adm-r">{m.shares || "-"}</td>
                      <td><span className={`adm-pill ${st[0]}`}>{st[1]}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        {cur && (
          <aside key={cur.user_id} className="adm-card" aria-labelledby="member-title" style={{ gap: 16 }}>
            <PanelHead m={cur} onClose={() => setSel(null)} other={{ href: `#/admin/members/${cur.user_id}`, label: "이 회원의 AI 사용 · 한도 보기" }}
              line={`가입 ${day(cur.created_at)} · 최근 접속 ${cur.last_sign_in_at ? shortWhen(cur.last_sign_in_at) : "-"} · 여행 ${cur.trips}개`} />
            {cur.banned_until && <Banner tone="warn">이용 정지 중 · {banLabel(cur.banned_until)}{cur.ban_reason ? ` · 사유: ${cur.ban_reason}` : ""}</Banner>}
            <InfoSection m={cur} onSaved={load} />
            {cur.is_admin
              ? <p className="adm-muted" style={{ fontSize: 13, paddingTop: 16, borderTop: "1px solid var(--line)" }}>관리자 계정은 로그인 초기화 · 정지 · 삭제할 수 없어요.</p>
              : <><AccountSection m={cur} onSaved={load} /><DeleteSection m={cur} onDeleted={() => { setSel(null); load(); }} /></>}
          </aside>
        )}
      </div>
    </div>
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
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "flex", flexDirection: "column", flex: "1 1 240px" }}><b>로그인 초기화 · 모든 기기에서 로그아웃</b><small className="adm-muted">카카오 로그인이라 트립보드에는 암호가 없어요. 대신 모든 기기의 로그인을 끊어요. 휴대폰을 잃어버렸을 때 써요. 앱을 다시 열면 바로, 열어 둔 화면도 1시간 안에 로그아웃돼요.</small></span>
        {busy ? <button type="button" className="btn sm" disabled>…</button>
          : <ConfirmButton className="btn sm" confirmText="한 번 더" onConfirm={() => act(() => accountAction("sign_out", m.user_id), `${m.name}님을 모든 기기에서 로그아웃시켰어요`)}>로그인 초기화</ConfirmButton>}
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
