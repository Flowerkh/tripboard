import { KakaoButton } from "../components/Account";
import { Icon, type IconKey } from "../components/Icon";
import { go } from "../components/ui";
import { useApp } from "../lib/store";
import { Filters } from "./Filters";
import { Keys } from "./Keys";
import { Members } from "./Members";
import { Usage } from "./Usage";
import "./admin.css";

const NAV: [id: string, label: string, icon: IconKey][] = [
  ["usage", "사용량", "chart"],
  ["members", "회원", "users"],
  ["keys", "AI 키 · 모델", "key"],
  ["filters", "대화 필터", "shield"],
];

/** #/admin/... — only admins get past the gate; the database refuses everyone else anyway. */
export default function AdminApp({ sub }: { sub?: string }) {
  const s = useApp();
  const page = NAV.some(([id]) => id === sub) ? sub! : "usage";

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
          {NAV.map(([id, label, icon]) => (
            <a key={id} href={`#/admin/${id}`} aria-current={page === id ? "page" : undefined}><Icon name={icon} size={18} />{label}</a>
          ))}
        </div>
        <div className="adm-me">
          <span>{s.user.name} · 관리자</span>
          <a href="#/">앱으로 돌아가기</a>
        </div>
      </nav>
      <main className="adm-main">
        {page === "usage" && <Usage />}
        {page === "members" && <Members />}
        {page === "keys" && <Keys />}
        {page === "filters" && <Filters />}
      </main>
    </div>
  );
}
