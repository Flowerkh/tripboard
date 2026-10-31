import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { ConfirmButton, Sheet } from "../components/ui";
import { copyText, createShare, nativeShare, pushShare, shareUrl, stopShare, tripText } from "../lib/share";
import { syncing } from "../lib/shareSync";
import { toast, useApp } from "../lib/store";
import type { Trip } from "../lib/types";

export function ago(ms?: number | string) {
  if (!ms) return "";
  const t = typeof ms === "string" ? Date.parse(ms) : ms;
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

export function ShareSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const s = useApp();
  const items = s.items.filter((i) => i.tripId === trip.id);
  const sh = trip.share;
  const [busy, setBusy] = useState<"" | "make" | "retry" | "stop">("");
  const [err, setErr] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 5000); // refresh "n분 전" and the syncing state
    return () => clearInterval(t);
  }, []);

  const link = sh ? shareUrl(sh.id) : "";
  const text = tripText(trip, items, link || undefined);
  const make = async () => {
    setBusy("make");
    setErr("");
    try {
      await createShare(trip.id);
      toast("공유 링크를 만들었어요");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const copy = async (what: string, label: string) => toast((await copyText(what)) ? `${label} 복사했어요` : "복사하지 못했어요. 길게 눌러 직접 복사해 주세요.");
  const send = async (data: { text?: string; url?: string }, fallback: string, label: string) => {
    const r = await nativeShare({ title: trip.title, ...data });
    if (r === "unsupported") copy(fallback, label);
  };
  const pending = sh && syncing(trip.id);

  return (
    <Sheet onClose={onClose} label="일정 공유">
      <div className="sheet-head">
        <Icon name="share" />
        <b style={{ flex: 1 }}>일정 공유</b>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <div className="sheet-body">
        {!sh ? (
          <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="link" size={18} />링크로 공유</b>
            <p className="muted" style={{ fontSize: 14 }}>링크를 받은 사람은 앱 설치나 로그인 없이 지도와 일정을 볼 수 있어요. 일정을 고치면 받은 사람 화면에도 자동으로 반영돼요.</p>
            <button type="button" className="btn primary" disabled={!!busy} onClick={make}>{busy === "make" ? "링크 만드는 중…" : "공유 링크 만들기"}</button>
            {err && <p role="alert" style={{ color: "var(--bad)", fontSize: 13, fontWeight: 700 }}>{err}</p>}
          </section>
        ) : (
          <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="link" size={18} />공유 중인 링크</b>
            <input className="input mono" readOnly value={link} aria-label="공유 링크" onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 13 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" className="btn" onClick={() => copy(link, "링크를")}><Icon name="copy" size={16} />링크 복사</button>
              <button type="button" className="btn primary" onClick={() => send({ text: `${trip.title} 일정`, url: link }, link, "링크를")}><Icon name="share" size={16} />보내기</button>
            </div>
            <p role="status" style={{ fontSize: 13, fontWeight: 700, color: sh.error ? "var(--bad)" : "var(--good)" }}>
              {sh.error ? `✕ 최신 일정 반영 실패: ${sh.error}` : pending ? "고친 내용을 반영하는 중…" : `✓ 최신 일정이 반영돼 있어요 · ${ago(sh.at)}`}
            </p>
            {sh.error && (
              /지워졌어요/.test(sh.error)
                ? <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={async () => { setBusy("make"); try { await stopShare(trip.id); } catch { /* already gone */ } await make(); }}>새 링크 만들기</button>
                : <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={async () => { setBusy("retry"); try { await pushShare(trip.id); toast("반영했어요"); } catch { /* shown above */ } setBusy(""); }}>{busy === "retry" ? "다시 반영하는 중…" : "다시 시도"}</button>
            )}
            <ConfirmButton className="btn danger sm" confirmText="한 번 더 누르면 링크가 더 이상 열리지 않아요"
              onConfirm={async () => { setBusy("stop"); try { await stopShare(trip.id); toast("공유를 멈췄어요"); } catch (e) { toast((e as Error).message); } setBusy(""); }}>
              공유 멈추기
            </ConfirmButton>
          </section>
        )}

        <section className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="text" size={18} />글로 보내기</b>
          <p className="muted" style={{ fontSize: 14 }}>카톡이나 메모에 바로 붙여 넣을 수 있는 일정표예요.{sh ? " 끝에 공유 링크도 붙어 있어요." : ""}</p>
          <pre className="share-preview">{text}</pre>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button type="button" className="btn" onClick={() => copy(text, "일정표를")}><Icon name="copy" size={16} />글 복사</button>
            <button type="button" className="btn" onClick={() => send({ text }, text, "일정표를")}><Icon name="share" size={16} />보내기</button>
          </div>
        </section>
        <p className="muted" style={{ fontSize: 12 }}>공유되는 것: 여행 정보, 일정, 계절 추천, 완료 표시. 공유되지 않는 것: AI 대화, 요청 메모, 동행 정보, API 키.</p>
      </div>
    </Sheet>
  );
}
