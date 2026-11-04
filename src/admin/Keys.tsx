import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { toast } from "../lib/store";
import { clearKey, FEATURES, keyAction, providers, saveProvider, saveSettings, setKey, settings, shortWhen, type Provider, type ProviderId } from "./api";

const MARK: Record<ProviderId, { bg: string; ch: string; hint: string; where: string }> = {
  claude: { bg: "#c4562a", ch: "C", hint: "sk-ant-...", where: "platform.claude.com" },
  gemini: { bg: "#1d5aa6", ch: "G", hint: "AIza...", where: "aistudio.google.com" },
  openai: { bg: "#12704f", ch: "O", hint: "sk-...", where: "platform.openai.com" },
};

export function Keys() {
  const [list, setList] = useState<Provider[] | null>(null);
  const [def, setDef] = useState<ProviderId>("claude");
  const [err, setErr] = useState("");
  const load = () => Promise.all([providers(), settings()]).then(([p, s]) => { setList(p); setDef(s.default_provider); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const usable = (list ?? []).filter((p) => p.enabled && p.key_last4 && p.status !== "error" && p.models.chat);

  return (
    <div className="adm-page">
      <header className="adm-head">
        <div><h1>AI 키 · 모델</h1><p>회원은 키 없이 AI를 쓰고, 요청은 여기 등록한 키로 서버에서 처리돼요. 회원은 앱 설정에서 켜진 AI 중 하나를 골라요.</p></div>
      </header>
      {err && <p className="adm-err">{err}</p>}

      <section className="adm-card" aria-labelledby="def-title">
        <h2 id="def-title">기본 AI</h2>
        <p className="adm-muted" style={{ margin: 0, fontSize: 13 }}>AI를 고르지 않은 회원이 쓰는 AI예요. 회원이 고른 AI가 실패하면 이 AI가 대신 답해요.</p>
        <div className="adm-chips" role="radiogroup" aria-label="기본 AI">
          {(list ?? []).map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={def === p.id} onClick={async () => {
              try { await saveSettings({ default_provider: p.id }); setDef(p.id); toast(`기본 AI를 ${p.label}로 바꿨어요`); } catch (e) { toast((e as Error).message); }
            }}>{p.label}{!usable.some((u) => u.id === p.id) ? " (아직 못 씀)" : ""}</button>
          ))}
        </div>
      </section>

      {!list ? <p className="adm-muted">불러오는 중…</p> : list.map((p) => <ProviderCard key={p.id} p={p} onChange={load} />)}
      <p className="adm-muted" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, margin: 0 }}>
        <Icon name="lock" size={16} />키는 서버에만 저장되고 이 화면에서도 끝 4자리만 보여요. 바꾸면 모든 회원에게 바로 적용돼요.
      </p>
    </div>
  );
}

function ProviderCard({ p, onChange }: { p: Provider; onChange: () => void }) {
  const [editing, setEditing] = useState(!p.key_last4);
  const [key, setKeyText] = useState("");
  const [busy, setBusy] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [slots, setSlots] = useState<Record<string, string>>(p.models ?? {});
  // prices are edited as text so "0." and "0.25" can be typed; they become numbers when saved
  const [priceText, setPriceText] = useState<Record<string, [string, string]>>(() =>
    Object.fromEntries(Object.entries(p.prices ?? {}).map(([k, v]) => [k, [String(v[0]), String(v[1])]])));
  const prices = Object.fromEntries(Object.entries(priceText).map(([k, v]) => [k, [Number(v[0]) || 0, Number(v[1]) || 0]])) as Record<string, [number, number]>;
  const m = MARK[p.id];
  const dirty = JSON.stringify(slots) !== JSON.stringify(p.models ?? {}) || JSON.stringify(prices) !== JSON.stringify(p.prices ?? {});

  useEffect(() => {
    if (p.key_last4 && p.status !== "error") keyAction("list_models", p.id).then((r) => r.ok && setModels(r.models ?? []));
  }, [p.id, p.key_last4, p.status]);

  const status = p.status === "ok" ? ["ok", "연결됨"] : p.status === "error" ? ["bad", "오류"] : p.status === "unchecked" ? ["warn", "확인 전"] : ["mute", "키 없음"];
  const check = async () => {
    setBusy("check");
    const r = await keyAction("check_key", p.id);
    setBusy("");
    toast(r.ok ? `${p.label} 키가 잘 돼요 · 모델 ${r.models?.length ?? 0}개` : `${p.label} 키 오류: ${r.error}`);
    if (r.ok) setModels(r.models ?? []);
    onChange();
  };

  return (
    <section className="adm-card" aria-labelledby={`p-${p.id}`} style={{ opacity: p.enabled ? 1 : 0.75 }}>
      <div className="adm-provider-head">
        <span className="adm-mark" style={{ background: m.bg }} aria-hidden="true">{m.ch}</span>
        <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><h2 id={`p-${p.id}`}>{p.label}</h2><small className="adm-muted">키 발급: {m.where}</small></span>
        <span className={`adm-pill ${status[0]}`}>{status[1]}</span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          회원에게 보이기
          <input type="checkbox" role="switch" checked={p.enabled} onChange={async (e) => { await saveProvider(p.id, { enabled: e.target.checked }).catch((x) => toast(x.message)); onChange(); }} style={{ width: 20, height: 20 }} />
        </label>
      </div>

      {p.key_last4 && !editing ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <span className="adm-key">••••••••{p.key_last4}</span>
          <span className="adm-muted" style={{ fontSize: 12, flex: 1 }}>{p.checked_at ? `마지막 확인 ${shortWhen(p.checked_at)}` : "아직 확인 안 함"}{p.status_note ? ` · ${p.status_note}` : ""}</span>
          <button type="button" className="btn sm" disabled={!!busy} onClick={check}>{busy === "check" ? "확인 중…" : "키 확인"}</button>
          <button type="button" className="btn sm" onClick={() => setEditing(true)}>바꾸기</button>
          <button type="button" className="btn sm danger" onClick={async () => {
            if (!confirm(`${p.label} 키를 지울까요? 이 AI를 고른 회원은 기본 AI로 넘어가요.`)) return;
            await clearKey(p.id).catch((x) => toast(x.message)); toast("키를 지웠어요"); setEditing(true); onChange();
          }}>삭제</button>
        </div>
      ) : (
        <form style={{ display: "flex", flexWrap: "wrap", gap: 8 }} onSubmit={async (e) => {
          e.preventDefault();
          if (key.trim().length < 12) return toast("키가 너무 짧아요.");
          setBusy("save");
          try { await setKey(p.id, key.trim()); setKeyText(""); setEditing(false); onChange(); await check(); } catch (x) { toast((x as Error).message); }
          setBusy("");
        }}>
          <label htmlFor={`key-${p.id}`} className="sr">{p.label} API 키</label>
          <input id={`key-${p.id}`} className="input" type="password" autoComplete="off" placeholder={`${p.label} API 키 붙여 넣기 (${m.hint})`} value={key} onChange={(e) => setKeyText(e.target.value)} style={{ flex: "1 1 280px", height: 44 }} />
          <button type="submit" className="btn primary" disabled={!!busy}>{busy === "save" ? "저장 중…" : "저장하고 확인"}</button>
          {p.key_last4 && <button type="button" className="btn" onClick={() => setEditing(false)}>취소</button>}
        </form>
      )}

      <div className="adm-models" role="group" aria-label={`${p.label} 기능별 모델`}>
        <span className="h">기능</span><span className="h">모델</span><span className="h p">입력 $/1M</span><span className="h p">출력 $/1M</span>
        {FEATURES.map(([slot, label, hint]) => {
          const model = slots[slot] ?? "";
          const price = priceText[model] ?? ["", ""];
          const setPrice = (i: 0 | 1, raw: string) => {
            const v = raw.replace(/,/g, ".").replace(/\s/g, "");
            if (!model || !/^\d*\.?\d*$/.test(v)) return; // numbers only, one decimal point
            setPriceText({ ...priceText, [model]: (i === 0 ? [v, price[1]] : [price[0], v]) as [string, string] });
          };
          return (
            <div key={slot} style={{ display: "contents" }}>
              <span style={{ display: "flex", flexDirection: "column" }}><b>{label}</b><small className="adm-muted">{hint}</small></span>
              <span>
                <label className="sr" htmlFor={`${p.id}-${slot}`}>{label} 모델</label>
                <input id={`${p.id}-${slot}`} className="input mono" list={`models-${p.id}`} placeholder={models.length ? "모델 고르기" : "모델 이름 (키 확인 후 목록)"} value={model} onChange={(e) => setSlots({ ...slots, [slot]: e.target.value.trim() })} />
              </span>
              <input className="input mono" aria-label={`${label} 입력 가격`} inputMode="decimal" placeholder={model ? "0" : ""} value={model ? price[0] : ""} disabled={!model} onChange={(e) => setPrice(0, e.target.value)} />
              <input className="input mono" aria-label={`${label} 출력 가격`} inputMode="decimal" placeholder={model ? "0" : ""} value={model ? price[1] : ""} disabled={!model} onChange={(e) => setPrice(1, e.target.value)} />
            </div>
          );
        })}
      </div>
      <datalist id={`models-${p.id}`}>{models.map((x) => <option key={x} value={x} />)}</datalist>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <small className="adm-muted">모델을 비워 둔 기능은 이 AI로 처리하지 않고 기본 AI가 맡아요. 가격은 사용량 비용 계산에만 써요.</small>
        <button type="button" className="btn primary sm" disabled={!dirty} onClick={async () => {
          const clean = Object.fromEntries(Object.entries(slots).filter(([, v]) => v));
          try { await saveProvider(p.id, { models: clean, prices }); toast(`${p.label} 모델 · 단가를 저장했어요`); onChange(); } catch (e) { toast((e as Error).message); }
        }}>모델 저장</button>
      </div>
    </section>
  );
}
