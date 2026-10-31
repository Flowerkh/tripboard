import { useState } from "react";
import { loginWithKakao } from "../lib/cloud";
import type { Account } from "../lib/store";

/** Kakao login button (yellow, per Kakao's login button guide). */
export function KakaoButton({ small, label = "카카오로 로그인" }: { small?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={"kakao-btn" + (small ? " sm" : "")} disabled={busy} onClick={() => { setBusy(true); loginWithKakao().finally(() => setBusy(false)); }}>
      <svg viewBox="0 0 24 24" width={small ? 16 : 18} height={small ? 16 : 18} aria-hidden="true">
        <path fill="currentColor" d="M12 3.2c-5.2 0-9.4 3.3-9.4 7.4 0 2.6 1.7 4.9 4.3 6.2l-1 3.7c-.1.3.3.6.6.4l4.4-2.9c.4 0 .7.1 1.1.1 5.2 0 9.4-3.3 9.4-7.5S17.2 3.2 12 3.2z" />
      </svg>
      {busy ? "카카오로 가는 중…" : label}
    </button>
  );
}

export function Avatar({ user, size = 40 }: { user: Account; size?: number }) {
  const [broken, setBroken] = useState(false);
  return user.avatar && !broken ? (
    <img className="avatar" src={user.avatar} alt="" width={size} height={size} onError={() => setBroken(true)} referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{user.name.slice(0, 1)}</span>
  );
}
