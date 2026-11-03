import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { toast } from "../lib/store";
// the same check the AI server runs, so the tester here matches what members get
import { check } from "../../supabase/functions/ai/filter";
import { blockedLog, members, saveSettings, settings, shortWhen, usageSince, kstStart, type FilterConfig, type Member, type UsageRow } from "./api";

function Words({ words, onRemove, allow }: { words: string[]; onRemove: (w: string) => void; allow?: boolean }) {
  return (
    <div className="adm-words">
      {words.map((w) => (
        <span key={w} className={"adm-word" + (allow ? " allow" : "")}>{w}
          <button type="button" aria-label={`"${w}" 빼기`} onClick={() => onRemove(w)}><Icon name="close" size={12} stroke={2.4} /></button>
        </span>
      ))}
    </div>
  );
}
function AddWord({ label, onAdd }: { label: string; onAdd: (w: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="adm-add" onSubmit={(e) => { e.preventDefault(); const w = v.trim().toLowerCase(); if (w) onAdd(w); setV(""); }}>
      <Icon name="plus" size={14} stroke={2} />
      <label className="sr" htmlFor={`add-${label}`}>{label}에 단어 추가</label>
      <input id={`add-${label}`} value={v} onChange={(e) => setV(e.target.value)} placeholder="단어 추가 후 Enter" />
    </form>
  );
}

export function Filters() {
  const [f, setF] = useState<FilterConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [log, setLog] = useState<UsageRow[]>([]);
  const [people, setPeople] = useState<Member[]>([]);
  const [month, setMonth] = useState<{ app: number; ai: number; byTopic: Record<string, number> }>({ app: 0, ai: 0, byTopic: {} });
  const [test, setTest] = useState("파이썬으로 크롤러 짜줘");
  const [err, setErr] = useState("");

  useEffect(() => {
    settings().then((s) => { setF(s.filter); setSaved(JSON.stringify(s.filter)); }).catch((e) => setErr(e.message));
    blockedLog().then(setLog).catch(() => {});
    members().then(setPeople).catch(() => {});
    usageSince(kstStart("month")).then((rows) => {
      const byTopic: Record<string, number> = {};
      for (const r of rows) if (r.status === "blocked_app" && r.topic) byTopic[r.topic] = (byTopic[r.topic] ?? 0) + 1;
      setMonth({ app: rows.filter((r) => r.status === "blocked_app").length, ai: rows.filter((r) => r.status === "blocked_ai" && r.first_round).length, byTopic });
    }).catch(() => {});
  }, []);

  const result = useMemo(() => (f && test.trim() ? (f.stage1 ? check(test, f) : null) : undefined), [f, test]);
  if (!f) return <div className="adm-page">{err ? <p className="adm-err">{err}</p> : <p className="adm-muted">불러오는 중…</p>}</div>;
  const dirty = JSON.stringify(f) !== saved;
  const setTopic = (i: number, patch: Partial<FilterConfig["topics"][number]>) => setF({ ...f, topics: f.topics.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
  const save = async () => {
    try { await saveSettings({ filter: f }); setSaved(JSON.stringify(f)); toast("필터를 저장했어요 · 바로 적용돼요"); } catch (e) { toast((e as Error).message); }
  };
  const name = (id: string | null) => people.find((p) => p.user_id === id)?.name ?? "-";

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div><h1>대화 필터</h1><p>여행과 상관없는 요청을 걸러서 토큰을 아껴요. 이번 달 {month.app + month.ai}건을 걸렀어요.</p></div>
        <button type="button" className="btn primary" disabled={!dirty} onClick={save}>{dirty ? "변경 내용 저장" : "저장됨"}</button>
      </header>

      <div className="adm-row">
        <label className="adm-card" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><b>1단계 · 앱에서 먼저 거르기</b><small className="adm-muted">아래 주제 단어가 있고 여행 단어가 없으면 AI를 부르지 않아요 · 토큰 0 · 횟수에도 안 들어가요 · <span style={{ whiteSpace: "nowrap" }}>이번 달 {month.app}건</span></small></span>
          <input type="checkbox" role="switch" checked={f.stage1} onChange={(e) => setF({ ...f, stage1: e.target.checked })} style={{ width: 22, height: 22 }} />
        </label>
        <label className="adm-card" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><b>2단계 · AI가 한 번 더 거절</b><small className="adm-muted">1단계를 지나온 무관한 요청은 AI가 한 문장으로 거절해요 · <span style={{ whiteSpace: "nowrap" }}>이번 달 {month.ai}건</span></small></span>
          <input type="checkbox" role="switch" checked={f.stage2} onChange={(e) => setF({ ...f, stage2: e.target.checked })} style={{ width: 22, height: 22 }} />
        </label>
      </div>

      <section aria-labelledby="topics-title" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="adm-head" style={{ alignItems: "center" }}>
          <h2 id="topics-title" style={{ margin: 0, fontSize: 16 }}>막을 주제</h2>
          <button type="button" className="btn sm" onClick={() => { const n = prompt("새 주제 이름 (예: 게임)"); if (n?.trim()) setF({ ...f, topics: [...f.topics, { name: n.trim(), on: true, words: [] }] }); }}><Icon name="plus" size={15} stroke={2} />주제 추가</button>
        </div>
        <div className="adm-row">
          {f.topics.map((t, i) => (
            <article key={i} className="adm-card" style={{ flex: "1 1 420px", opacity: t.on ? 1 : 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <b style={{ flex: 1, fontSize: 15 }}>{t.name}</b>
                <span className="adm-muted mono" style={{ fontSize: 12 }}>이번 달 {month.byTopic[t.name] ?? 0}건</span>
                <label style={{ display: "inline-flex" }}><span className="sr">{t.name} 사용</span><input type="checkbox" role="switch" checked={t.on} onChange={(e) => setTopic(i, { on: e.target.checked })} style={{ width: 20, height: 20 }} /></label>
                <button type="button" className="icon-btn" style={{ width: 36, height: 36 }} aria-label={`${t.name} 주제 삭제`} onClick={() => confirm(`"${t.name}" 주제를 지울까요?`) && setF({ ...f, topics: f.topics.filter((_, k) => k !== i) })}><Icon name="trash" size={16} /></button>
              </div>
              <Words words={t.words} onRemove={(w) => setTopic(i, { words: t.words.filter((x) => x !== w) })} />
              <AddWord label={t.name} onAdd={(w) => !t.words.includes(w) && setTopic(i, { words: [...t.words, w] })} />
            </article>
          ))}
        </div>
      </section>

      <div className="adm-row">
        <section className="adm-card" aria-labelledby="allow-title">
          <div><h2 id="allow-title">통과시키는 여행 단어</h2><p className="adm-muted" style={{ margin: "2px 0 0", fontSize: 13 }}>이 단어가 하나라도 있으면 막지 않고 AI에게 보내요. 예: "오사카에서 고백하기 좋은 곳"</p></div>
          <Words allow words={f.allow} onRemove={(w) => setF({ ...f, allow: f.allow.filter((x) => x !== w) })} />
          <AddWord label="여행 단어" onAdd={(w) => !f.allow.includes(w) && setF({ ...f, allow: [...f.allow, w] })} />
        </section>
        <section className="adm-card" aria-labelledby="reply-title">
          <h2 id="reply-title"><label htmlFor="reply-text">걸렀을 때 보여 줄 안내</label></h2>
          <textarea id="reply-text" className="input" rows={4} style={{ height: "auto", padding: "10px 12px", lineHeight: 1.55, resize: "vertical" }} value={f.reply} onChange={(e) => setF({ ...f, reply: e.target.value })} />
        </section>
      </div>

      <section className="adm-card" aria-labelledby="test-title">
        <h2 id="test-title"><label htmlFor="filter-test">필터 시험해 보기</label></h2>
        <input id="filter-test" className="input" value={test} onChange={(e) => setTest(e.target.value)} placeholder="회원이 보낼 만한 문장" />
        {result !== undefined && (
          <div role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13 }}>
            {result
              ? <><span className="adm-pill bad">1단계에서 막혀요</span><span>주제 <b>{result.topic}</b> · 걸린 단어 <b>"{result.word}"</b> · AI 호출 안 함</span></>
              : <><span className="adm-pill ok">통과 · AI에게 보내요</span><span className="adm-muted">{f.stage1 ? "막을 단어가 없거나 여행 단어가 있어요." : "1단계가 꺼져 있어요."} 여행과 무관하면 2단계에서 AI가 거절해요.</span></>}
            {dirty && <span className="adm-muted">(저장 전 설정으로 시험 중)</span>}
          </div>
        )}
      </section>

      <section className="adm-card" aria-labelledby="log-title">
        <h2 id="log-title">최근 걸러진 대화</h2>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th scope="col">시간</th><th scope="col">회원</th><th scope="col">내용</th><th scope="col">걸린 곳</th><th scope="col">주제</th><th scope="col"><span className="sr">조치</span></th></tr></thead>
            <tbody>
              {!log.length ? <tr><td colSpan={6} className="adm-empty">아직 걸러진 대화가 없어요.</td></tr> : log.map((r, i) => {
                const hit = r.status === "blocked_app" && r.snippet ? check(r.snippet, { ...f, allow: [] }) : null;
                return (
                  <tr key={i}>
                    <td className="adm-muted" style={{ whiteSpace: "nowrap" }}>{shortWhen(r.at)}</td>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{name(r.user_id)}</td>
                    <td style={{ minWidth: 220 }}>{r.snippet}</td>
                    <td><span className={`adm-pill ${r.status === "blocked_app" ? "info" : "warn"}`}>{r.status === "blocked_app" ? "앱" : "AI"}</span></td>
                    <td className="adm-muted" style={{ whiteSpace: "nowrap" }}>{r.topic}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {hit && <button type="button" className="btn sm" title="잘못 막혔다면 이 단어를 주제에서 빼요" onClick={() => {
                        const i = f.topics.findIndex((t) => t.name === hit.topic);
                        if (i >= 0) { setTopic(i, { words: f.topics[i].words.filter((w) => w !== hit.word) }); toast(`"${hit.word}"를 뺐어요 · 저장을 눌러야 적용돼요`); }
                      }}>잘못 막힘 · "{hit.word}" 빼기</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
