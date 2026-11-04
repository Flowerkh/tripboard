import { KakaoButton } from "../components/Account";
import { Icon, type IconKey } from "../components/Icon";
import { go } from "../components/ui";
import { useApp } from "../lib/store";
import { Filters } from "./Filters";
import { Keys } from "./Keys";
import { Logs } from "./Logs";
import { Accounts } from "./Accounts";
import { Members } from "./Members";
import { Usage } from "./Usage";
import "./admin.css";

type Nav = { id: string; label: string; icon: IconKey; children?: { id: string; label: string }[] };
const NAV: Nav[] = [
  { id: "usage", label: "사용량", icon: "chart" },
  { id: "members", label: "회원", icon: "users", children: [{ id: "members", label: "AI 사용 · 한도" }, { id: "logs", label: "AI 사용 기록" }, { id: "accounts", label: "계정 관리" }] },
  { id: "keys", label: "AI 키 · 모델", icon: "key" },
  { id: "filters", label: "대화 필터", icon: "shield" },
];
const PAGES = NAV.flatMap((n) => (n.children ? n.children.map((c) => c.id) : [n.id]));

/** #/admin/<page>[/<member id>] — only admins get past the gate; the database refuses everyone else anyway. */
export default function AdminApp({ sub, arg }: { sub?: string; arg?: string }) {
  const s = useApp();
  const page = PAGES.includes(sub ?? "") ? sub! : "usage";

  if (s.user === undefined || (s.user && !s.ai)) return <div className="adm-gate"><p className="muted">관리자 정보를 확인하는 중…</p></div>;
  if (!s.user || !s.ai?.is_admin) {
    return (
      <div className="adm-gate">
        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, maxWidth: 360, textAlign: "center" }}>
          <Icon name="shield" size={28} />
          <b style={{ fontSize: 18 }}>관리자만 볼 수 있어요</b>
          {!s.user ? <KakaoButton label="관리자 카카오 계정으로 로그인" /> : <p className="muted" style={{ fontSize: 14 }}>이 계정은 관리자가 아니에요.</p>}
          <button type="button" className="btn" onClick={() => go("/")}>앱으로 돌아가기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="adm">
      <nav className="adm-nav" aria-label="관리자 메뉴">
        <div className="adm-brand">
          <span className="adm-logo" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 64 64"><path d="M52 32l-6-2H36L26 16h-3l5 14H18l-4-6h-2l2 8-2 8h2l4-6h10l-5 14h3l10-14h10z" fill="#7499ff" /></svg></span>
          <span><b>트립보드</b><small>관리자</small></span>
        </div>
        <div className="adm-links">
          {NAV.map((n) => n.children ? (
            <div key={n.id} className="adm-group" role="group" aria-labelledby={`nav-${n.id}`}>
              <span id={`nav-${n.id}`} className={"adm-group-label" + (n.children.some((c) => c.id === page) ? " on" : "")}><Icon name={n.icon} size={18} />{n.label}</span>
              {n.children.map((c) => (
                <a key={c.id} className="sub" href={`#/admin/${c.id}`} aria-current={page === c.id ? "page" : undefined}><span className="sr">{n.label} · </span>{c.label}</a>
              ))}
            </div>
          ) : (
            <a key={n.id} href={`#/admin/${n.id}`} aria-current={page === n.id ? "page" : undefined}><Icon name={n.icon} size={18} />{n.label}</a>
          ))}
        </div>
        <div className="adm-me">
          <span>{s.user.name} · 관리자</span>
          <a href="#/">앱으로 돌아가기</a>
        </div>
      </nav>
      <main className="adm-main">
        {page === "usage" && <Usage />}
        {page === "members" && <Members key={arg ?? ""} initial={arg} />}
        {page === "logs" && <Logs key={arg ?? ""} initial={arg} />}
        {page === "accounts" && <Accounts key={arg ?? ""} initial={arg} />}
        {page === "keys" && <Keys />}
        {page === "filters" && <Filters />}
      </main>
    </div>
  );
}
