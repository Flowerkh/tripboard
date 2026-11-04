/** Pieces both member pages use: loading the list, the search + filter bar, the name cell and the panel header. */
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { members, settings, shortWhen, type Member } from "./api";

export const day = (iso: string | null) => (iso ? shortWhen(iso).split(" ")[0] : "-");

export function useMembers() {
  const [list, setList] = useState<Member[] | null>(null);
  const [defs, setDefs] = useState({ daily: 30, monthly: 300 });
  const [err, setErr] = useState("");
  const load = () => Promise.all([members(), settings()])
    .then(([m, s]) => { setList(m); setDefs({ daily: s.daily_limit, monthly: s.monthly_limit }); setErr(""); })
    .catch((e) => setErr((e as Error).message));
  useEffect(() => { load(); }, []);
  return { list, defs, setDefs, load, err };
}

export function Toolbar<F extends string>({ q, setQ, placeholder, chips, value, onChange }: {
  q: string; setQ: (v: string) => void; placeholder: string;
  chips: [id: F, label: string, count: number][]; value: F; onChange: (f: F) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <label className="adm-search"><Icon name="search" size={18} /><span className="sr">회원 검색</span><input type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="adm-chips" role="radiogroup" aria-label="회원 걸러 보기">
        {chips.map(([f, l, n]) => <button key={f} type="button" role="radio" aria-checked={value === f} onClick={() => onChange(f)}>{l} {n}</button>)}
      </div>
    </div>
  );
}

const avatar = (m: Member, size?: number) => m.avatar
  ? <img className="adm-avatar" style={size ? { width: size, height: size } : undefined} src={m.avatar} alt="" referrerPolicy="no-referrer" />
  : <span className="adm-avatar" style={size ? { width: size, height: size, fontSize: size * 0.38 } : undefined} aria-hidden="true">{m.name.slice(0, 1)}</span>;

/** First cell of a member row: picture, name and one grey line under it. */
export function MemberCell({ m, sub, onPick }: { m: Member; sub?: string; onPick: () => void }) {
  return (
    <th scope="row" style={{ paddingLeft: 16 }}>
      <button type="button" onClick={onPick} style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }} aria-label={`${m.name} 자세히`}>
        {avatar(m)}
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span>{m.name}</span>{sub && <small className="adm-muted adm-clip" style={{ fontWeight: 400 }}>{sub}</small>}</span>
      </button>
    </th>
  );
}

/** Top of the side panel, with a link to the same member on the other member page. */
export function PanelHead({ m, line, onClose, other }: { m: Member; line: string; onClose: () => void; other: { href: string; label: string } }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {avatar(m, 48)}
        <div style={{ flex: 1, minWidth: 0 }}><h2 id="member-title" style={{ fontSize: 18 }}>{m.name}</h2><span className="adm-muted" style={{ fontSize: 12 }}>{line}</span></div>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <a className="adm-crosslink" href={other.href}>{other.label}<Icon name="right" size={14} /></a>
    </>
  );
}

export function Banner({ tone, children }: { tone: "warn" | "bad"; children: ReactNode }) {
  return <p role="status" className={`adm-pill ${tone}`} style={{ whiteSpace: "normal", padding: "10px 12px", borderRadius: 12, fontWeight: 600 }}>{children}</p>;
}
