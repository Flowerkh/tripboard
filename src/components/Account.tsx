import { useState } from "react";
import { deleteMyAccount, loginWithKakao, NAME_MAX, setDisplayName } from "../lib/cloud";
import { getState, toast, type Account } from "../lib/store";
import { Icon } from "./Icon";
import { ConfirmButton, go, Sheet } from "./ui";

/** Kakao login button (yellow, per Kakao's login button guide). */
export function KakaoButton({ small, label = "카카오로 로그인", help }: { small?: boolean; label?: string; help?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={"kakao-btn" + (small ? " sm" : "")} data-help={help} disabled={busy} onClick={() => { setBusy(true); loginWithKakao().finally(() => setBusy(false)); }}>
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

/** Name shown in the app, editable. Opens by itself when Kakao gave no nickname. */
export function NameEditor({ user }: { user: Account }) {
  const [editing, setEditing] = useState(!user.named);
  const [val, setVal] = useState(user.named ? user.name : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!editing) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <b style={{ fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</b>
        <button type="button" className="link-btn" style={{ fontSize: 13, flex: "none" }} onClick={() => { setVal(user.name); setErr(""); setEditing(true); }}>이름 바꾸기</button>
      </span>
    );
  }
  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const problem = await setDisplayName(val);
        setBusy(false);
        if (problem) return setErr(problem);
        setErr("");
        setEditing(false);
        toast("이름을 바꿨어요");
      }}
    >
      <label className="label" htmlFor="display-name">앱에서 쓸 이름</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input id="display-name" className="input" value={val} maxLength={NAME_MAX} placeholder="예: 경하" autoComplete="nickname" autoFocus={user.named}
          onChange={(e) => { setVal(e.target.value); setErr(""); }} style={{ flex: 1, minWidth: 0 }} />
        <button type="submit" className="btn primary" disabled={busy || !val.trim()}>{busy ? "저장 중…" : "저장"}</button>
        {user.named && <button type="button" className="btn" onClick={() => setEditing(false)}>취소</button>}
      </div>
      {!user.named && !err && <p className="muted" style={{ fontSize: 12 }}>카카오 닉네임을 받지 않아서 지금은 '카카오 사용자'로 보여요. 정한 이름은 계정에 저장돼서 다른 기기에서도 같아요.</p>}
      {err && <p role="alert" style={{ color: "var(--bad)", fontSize: 13, fontWeight: 700 }}>{err}</p>}
    </form>
  );
}

/** Settings → 탈퇴하기: says what goes, then deletes the account on the server (two presses). */
export function WithdrawSheet({ onClose }: { onClose: () => void }) {
  const { trips } = getState();
  const shares = trips.filter((t) => t.share).length;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const gone = [
    "카카오 계정 연결과 트립보드 계정",
    `계정에 저장된 여행 ${trips.length}개 (이 기기와 다른 기기 모두)`,
    ...(shares ? [`내가 만든 공유 링크 ${shares}개 · 받은 사람도 더 이상 못 봐요`] : []),
    "AI 대화 기록",
  ];
  const run = async () => {
    setBusy(true);
    setErr("");
    const e = await deleteMyAccount();
    setBusy(false);
    if (e) { setErr(e); return; }
    onClose();
    go("/");
  };
  return (
    <Sheet onClose={busy ? () => {} : onClose} label="탈퇴하기">
      <div className="sheet-head">
        <b style={{ flex: 1, fontSize: 18 }}>트립보드에서 탈퇴할까요?</b>
        <button type="button" className="icon-btn" aria-label="닫기" disabled={busy} onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <div className="sheet-body">
        <div className="withdraw-list">
          <b>바로 지워지고 되돌릴 수 없어요</b>
          <ul>{gone.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>AI 사용 기록은 이름 없이 통계로만 남아요. 같은 카카오 계정으로 다시 가입하면 새 계정으로 시작해요.</p>
        {err && <p role="alert" style={{ color: "var(--bad)", fontSize: 14, fontWeight: 600 }}>{err}</p>}
        {busy
          ? <button type="button" className="btn danger armed" disabled>탈퇴하는 중…</button>
          : <ConfirmButton className="btn danger" confirmText="한 번 더 누르면 탈퇴돼요" onConfirm={run}>탈퇴하기</ConfirmButton>}
        <button type="button" className="btn" disabled={busy} onClick={onClose}>계속 쓸게요</button>
      </div>
    </Sheet>
  );
}
