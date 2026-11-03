import { Icon } from "../components/Icon";
import { ConfirmButton, go, Switch } from "../components/ui";
import { loadSamples, resetAll, setSettings, toast, useApp } from "../lib/store";
import type { ThemePref } from "../lib/types";
import { stopShareQuietly } from "../lib/share";
import { logout, sync } from "../lib/cloud";
import { Avatar, KakaoButton, NameEditor, WithdrawSheet } from "../components/Account";
import { useState } from "react";
import { ago } from "./ShareSheet";

function Mini({ mode }: { mode: ThemePref }) {
  const half = (cls: "l" | "d") => <span className={cls}><b /><i style={{ width: "80%" }} /><i style={{ width: "60%" }} /><u /></span>;
  return <span className="mini" aria-hidden="true">{mode === "dark" ? half("d") : half("l")}{mode === "system" && half("d")}</span>;
}

export function Settings() {
  const s = useApp();
  const { settings, trips } = s;
  const [withdraw, setWithdraw] = useState(false);
  return (
    <main className="screen">
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="icon-btn" aria-label="뒤로" onClick={() => (history.length > 1 ? history.back() : go("/"))}><Icon name="back" /></button>
        <h1 style={{ fontSize: 24, letterSpacing: "-0.02em" }}>설정</h1>
      </header>

      <section className="sec">
        <h2>계정</h2>
        {s.user ? (
          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar user={s.user} size={44} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                <NameEditor key={s.user.id} user={s.user} />
                <span className="muted" style={{ fontSize: 13 }}>카카오 계정으로 로그인됨</span>
              </span>
            </div>
            <p role="status" style={{ fontSize: 13, fontWeight: 700, color: s.sync.state === "error" ? "var(--bad)" : s.sync.state === "syncing" ? "var(--muted)" : "var(--good)" }}>
              {s.sync.state === "error" ? `✕ 계정에 저장하지 못했어요: ${s.sync.error}`
                : s.sync.state === "syncing" ? "계정과 맞추는 중…"
                : `✓ 여행 ${s.trips.length}개가 계정에 저장돼 있어요${s.sync.at ? ` · ${ago(s.sync.at)}` : ""}`}
            </p>
            {s.sync.state === "error" && <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => sync()}>다시 시도</button>}
            {s.ai?.is_admin && <button type="button" className="btn" onClick={() => go("/admin")}><Icon name="shield" size={18} />관리자 페이지</button>}
            <p className="muted" style={{ fontSize: 12 }}>같은 카카오 계정으로 로그인하면 휴대폰·PC 어디서나 같은 여행이 보여요. AI 대화 기록은 기기마다 따로예요.</p>
            <ConfirmButton className="btn sm" confirmText="한 번 더 누르면 로그아웃 · 이 기기에서 여행이 지워져요 (계정엔 남아요)" onConfirm={logout}>로그아웃</ConfirmButton>
            {s.ai?.is_admin
              ? <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>관리자 계정은 탈퇴할 수 없어요</p>
              : <button type="button" className="link-btn quiet" style={{ alignSelf: "center" }} onClick={() => setWithdraw(true)}>탈퇴하기</button>}
            {withdraw && <WithdrawSheet onClose={() => setWithdraw(false)} />}
          </div>
        ) : (
          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <KakaoButton />
            <p className="muted" style={{ fontSize: 13 }}>
              로그인하면 여행이 계정에 저장돼서 휴대폰·PC 어디서나 같은 여행을 보고 고칠 수 있어요.
              {s.trips.length ? ` 지금 이 기기에 있는 여행 ${s.trips.length}개도 계정으로 옮겨져요.` : ""} 로그인하지 않아도 이 기기에서는 다 쓸 수 있어요.
            </p>
          </div>
        )}
      </section>

      <section className="sec">
        <h2>화면 모드</h2>
        <div className="theme-pick" role="radiogroup" aria-label="화면 모드">
          {(["system", "light", "dark"] as ThemePref[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={settings.theme === m} className={settings.theme === m ? "on" : ""} onClick={() => setSettings({ theme: m })}>
              <Mini mode={m} />{{ system: "시스템", light: "밝게", dark: "어둡게" }[m]}
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>시스템을 고르면 휴대폰 설정이 바뀔 때 앱도 따라가요. 지도도 같은 모드로 보여요.</p>
      </section>

      <section className="sec">
        <h2>길찾기 지도 앱</h2>
        <div className="card list-card">
          <div className="list-row"><span>해외 여행</span><span className="muted">구글맵</span></div>
          <div className="list-row">
            <span>국내 여행</span>
            <div className="segmented" role="radiogroup" aria-label="국내 지도 앱">
              {(["kakao", "naver"] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={settings.domesticMap === p} className={settings.domesticMap === p ? "on" : ""} onClick={() => setSettings({ domesticMap: p })}>{p === "kakao" ? "카카오맵" : "네이버지도"}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <h2>AI</h2>
        {!s.user ? (
          <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 14 }}>AI로 일정 짜기·고치기는 <b>카카오로 로그인한 회원</b>만 쓸 수 있어요. 키를 넣을 필요는 없어요.</p>
            <KakaoButton label="카카오로 로그인하고 AI 쓰기" />
          </div>
        ) : (
          <>
            <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              <span className="label">쓸 AI 고르기</span>
              {!s.ai ? <p className="muted" style={{ fontSize: 13 }}>불러오는 중…</p>
                : !s.ai.providers.length ? <p style={{ fontSize: 13, color: "var(--warn)", fontWeight: 700 }}>아직 쓸 수 있는 AI가 없어요. 관리자가 준비하는 중이에요.</p>
                : (
                  <div className="seg" role="radiogroup" aria-label="쓸 AI" style={{ gridTemplateColumns: `repeat(${s.ai.providers.length}, minmax(0, 1fr))` }}>
                    {s.ai.providers.map((p) => {
                      const on = (settings.aiProvider && s.ai!.providers.some((x) => x.id === settings.aiProvider) ? settings.aiProvider : s.ai!.default_provider) === p.id;
                      return (
                        <button key={p.id} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} style={{ height: 52 }} onClick={() => setSettings({ aiProvider: p.id })}>
                          {p.label}{p.id === s.ai!.default_provider && <small style={{ display: "block", fontSize: 11, opacity: 0.8 }}>기본</small>}
                        </button>
                      );
                    })}
                  </div>
                )}
              {s.ai && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span className="muted">이번 달 AI 사용</span>
                    <b className="mono">{s.ai.used_month} / {s.ai.monthly_limit}회 · 오늘 {s.ai.used_today} / {s.ai.daily_limit}회</b>
                  </div>
                  <div className="usage-bar" role="progressbar" aria-label="이번 달 AI 사용" aria-valuemin={0} aria-valuemax={s.ai.monthly_limit} aria-valuenow={s.ai.used_month}>
                    <i style={{ width: `${Math.min(100, (s.ai.used_month / Math.max(1, s.ai.monthly_limit)) * 100)}%` }} className={s.ai.used_month >= s.ai.monthly_limit ? "full" : ""} />
                  </div>
                  {s.ai.paused && <p style={{ fontSize: 13, color: "var(--bad)", fontWeight: 700 }}>관리자가 이 계정의 AI 사용을 멈춰 두었어요.</p>}
                  <p className="muted" style={{ fontSize: 12 }}>여행과 상관없는 말은 AI에게 보내지 않고 바로 안내해요. 이런 말은 횟수에 들어가지 않아요.</p>
                </div>
              )}
            </div>
            <div className="card list-card">
              <label className="list-row" htmlFor="confirm-ai">
                <span>AI가 바꾸기 전에 확인 받기<small>끄면 바로 바꾸고 되돌리기를 남겨요</small></span>
                <Switch id="confirm-ai" checked={settings.confirmAI} onChange={(v) => setSettings({ confirmAI: v })} label="AI가 바꾸기 전에 확인 받기" />
              </label>
            </div>
          </>
        )}
      </section>

      <section className="sec">
        <h2>데이터</h2>
        <p className="muted" style={{ fontSize: 13 }}>여행은 이 기기의 브라우저에만 저장돼요. 다른 기기와 같이 보는 기능은 앱 단계에서 서버를 붙이면 생겨요.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button type="button" className="btn" onClick={loadSamples}>샘플 여행 넣기</button>
          <ConfirmButton className="btn danger" confirmText={s.user ? "한 번 더 누르면 계정에서도 삭제" : "한 번 더 누르면 삭제"} onConfirm={() => { trips.forEach(stopShareQuietly); resetAll(); toast("모든 여행을 지웠어요"); go("/"); }}>모든 여행 지우기</ConfirmButton>
        </div>
      </section>
    </main>
  );
}
