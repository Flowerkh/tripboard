import { useState } from "react";
import { Icon } from "../components/Icon";
import { ConfirmButton, go, Switch } from "../components/ui";
import { loadSamples, resetAll, setSettings, toast, useApp } from "../lib/store";
import type { ThemePref } from "../lib/types";
import { checkKey, hasKey } from "../lib/ai/run";
import { stopShareQuietly } from "../lib/share";
import { logout, sync } from "../lib/cloud";
import { Avatar, KakaoButton, NameEditor } from "../components/Account";
import { ago } from "./ShareSheet";

const MODELS: [string, string][] = [
  ["claude-sonnet-5-5", "Sonnet 5.5 · 추천"],
  ["claude-haiku-5-5", "Haiku 5.5 · 가장 저렴"],
  ["claude-opus-5-5", "Opus 5.5 · 가장 똑똑함"],
];

function Mini({ mode }: { mode: ThemePref }) {
  const half = (cls: "l" | "d") => <span className={cls}><b /><i style={{ width: "80%" }} /><i style={{ width: "60%" }} /><u /></span>;
  return <span className="mini" aria-hidden="true">{mode === "dark" ? half("d") : half("l")}{mode === "system" && half("d")}</span>;
}

export function Settings() {
  const s = useApp();
  const { settings, trips } = s;
  const [show, setShow] = useState(false);
  const [key, setKey] = useState(settings.apiKey);
  const [check, setCheck] = useState<{ state: "busy" | "ok" | "bad"; msg?: string } | null>(null);
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
            <p className="muted" style={{ fontSize: 12 }}>같은 카카오 계정으로 로그인하면 휴대폰·PC 어디서나 같은 여행이 보여요. AI 대화 기록은 기기마다 따로예요.</p>
            <ConfirmButton className="btn sm" confirmText="한 번 더 누르면 로그아웃 · 이 기기에서 여행이 지워져요 (계정엔 남아요)" onConfirm={logout}>로그아웃</ConfirmButton>
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
        <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="label" htmlFor="api-key" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="key" size={15} />Claude API 키</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input id="api-key" className="input mono" type={show ? "text" : "password"} value={key} placeholder="sk-ant-..." autoComplete="off" spellCheck={false}
              onChange={(e) => { setKey(e.target.value); setSettings({ apiKey: e.target.value.trim() }); setCheck(null); }} style={{ fontSize: 14 }} />
            <button type="button" className="btn" onClick={() => setShow(!show)}>{show ? "숨기기" : "보기"}</button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn primary" style={{ flex: 1 }} disabled={!hasKey() || check?.state === "busy"}
              onClick={async () => { setCheck({ state: "busy" }); const err = await checkKey(); setCheck(err ? { state: "bad", msg: err } : { state: "ok" }); }}>
              {check?.state === "busy" ? "확인하는 중…" : "키 확인"}
            </button>
            {settings.apiKey && <button type="button" className="btn" onClick={() => { setKey(""); setSettings({ apiKey: "" }); setCheck(null); toast("API 키를 지웠어요 · 데모 모드"); }}>지우기</button>}
          </div>
          <p role="status" style={{ fontSize: 13, fontWeight: 700, color: check?.state === "ok" ? "var(--good)" : check?.state === "bad" ? "var(--bad)" : settings.apiKey ? "var(--ink)" : "var(--warn)" }}>
            {check?.state === "ok" ? "✓ 키가 잘 돼요. 이제 AI가 실제 장소로 일정을 짜요."
              : check?.state === "bad" ? `✕ ${check.msg}`
              : settings.apiKey ? `저장된 키 ···${settings.apiKey.slice(-4)} · '키 확인'으로 잘 되는지 볼 수 있어요.`
              : "지금은 데모 모드예요. 키를 붙여 넣으면 바로 저장돼요."}
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            키는 이 브라우저에만 저장되고 Claude API로만 보내져요. 여러 사람이 쓰는 기기에서는 넣지 마세요. 키는 <a href="https://platform.claude.com" target="_blank" rel="noopener noreferrer">Claude 콘솔</a>에서 만들어요. 키 확인은 아주 작은 요청 한 번이라 비용이 거의 없어요.
          </p>
        </div>
        <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <label className="label" htmlFor="proxy-url">AI 서버 주소 (선택 · 안드로이드 앱용)</label>
          <input id="proxy-url" className="input mono" type="url" inputMode="url" value={settings.proxyUrl} placeholder="https://your-worker.workers.dev" autoComplete="off" spellCheck={false} onChange={(e) => setSettings({ proxyUrl: e.target.value })} style={{ fontSize: 14 }} />
          <p className="muted" style={{ fontSize: 12 }}>넣으면 API 키 대신 이 서버로 요청을 보내요. 키를 서버에만 두는 방법은 README의 server 폴더 예시를 보세요.</p>
        </div>
        <div className="card list-card">
          <div className="list-row">
            <label htmlFor="plan-model">일정 짜기 모델<small>처음 짜기 · 계절 추천</small></label>
            <select id="plan-model" className="input" style={{ width: "auto", height: 40, fontSize: 13 }} value={settings.planModel} onChange={(e) => setSettings({ planModel: e.target.value })}>
              {MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="list-row">
            <label htmlFor="edit-model">대화 수정 모델<small>Haiku로 바꾸면 훨씬 싸요</small></label>
            <select id="edit-model" className="input" style={{ width: "auto", height: 40, fontSize: 13 }} value={settings.editModel} onChange={(e) => setSettings({ editModel: e.target.value })}>
              {MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <label className="list-row" htmlFor="confirm-ai">
            <span>AI가 바꾸기 전에 확인 받기<small>끄면 바로 바꾸고 되돌리기를 남겨요</small></span>
            <Switch id="confirm-ai" checked={settings.confirmAI} onChange={(v) => setSettings({ confirmAI: v })} label="AI가 바꾸기 전에 확인 받기" />
          </label>
        </div>
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
