import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export function go(path: string) {
  location.hash = path;
}
export function useRoute(): string[] {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h.replace(/^#\/?/, "").split("/").filter(Boolean);
}

export function Sheet({ onClose, label, tall, children }: { onClose: () => void; label: string; tall?: boolean; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className={"sheet" + (tall ? " tall" : "")} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </>,
    document.body,
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const SR: any = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export function AskBar({ placeholder, onSend, disabled, autoFocus, id }: { placeholder: string; onSend: (text: string) => void; disabled?: boolean; autoFocus?: boolean; id: string }) {
  const [v, setV] = useState("");
  const [listening, setListening] = useState(false);
  const rec = useRef<any>(null);
  const submit = () => {
    const t = v.trim();
    if (!t || disabled) return;
    onSend(t);
    setV("");
  };
  const mic = () => {
    if (!SR) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SR();
    r.lang = "ko-KR";
    r.interimResults = true;
    r.onresult = (e: any) => setV(Array.from(e.results as ArrayLike<any>).map((x: any) => x[0].transcript).join(""));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };
  return (
    <form className="askbar" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {SR && (
        <button type="button" className={"icon-btn" + (listening ? " accent" : "")} aria-label={listening ? "말하기 멈추기" : "음성으로 말하기"} aria-pressed={listening} onClick={mic}>
          <Icon name="mic" />
        </button>
      )}
      <label htmlFor={id}>
        <Icon name="sparkle" size={18} />
        <span className="sr">AI에게 말하기</span>
        <input id={id} value={v} onChange={(e) => setV(e.target.value)} placeholder={listening ? "듣고 있어요…" : placeholder} autoFocus={autoFocus} enterKeyHint="send" autoComplete="off" disabled={disabled} />
      </label>
      <button type="submit" className="icon-btn accent" aria-label="보내기" disabled={disabled || !v.trim()}>
        <Icon name="send" />
      </button>
    </form>
  );
}

export function Switch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input id={id} type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

/** A button that needs a second tap before it acts. */
export function ConfirmButton({ className, children, confirmText, onConfirm }: { className?: string; children: ReactNode; confirmText: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 8000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={`${className ?? ""}${armed ? " armed" : ""}`} aria-live="polite" onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? <><b aria-hidden="true">👆</b>{confirmText}</> : children}
    </button>
  );
}

/** "930" → "09:30", "1430" / "14:30" / "14" → "14:30" / "14:00"; "" stays empty; null when it isn't a time. */
export function parseTime24(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "";
  let h: number, m: number;
  if (s.includes(":")) {
    const [a, b] = s.split(":");
    if (!/^\d{1,2}$/.test(a) || !/^\d{0,2}$/.test(b ?? "")) return null;
    h = Number(a);
    m = Number(b || 0);
  } else {
    if (!/^\d{1,4}$/.test(s)) return null;
    h = Number(s.length <= 2 ? s : s.length === 3 ? s.slice(0, 1) : s.slice(0, 2));
    m = Number(s.length <= 2 ? 0 : s.slice(-2));
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 24-hour time box (00:00–23:59). The browser's own time picker follows the phone's
 * language and shows 오전/오후, so times are typed here instead: "1430" becomes "14:30".
 */
export function TimeInput({ id, value, onChange, required, style, placeholder = "14:30", label }: {
  id?: string; value: string; onChange: (v: string) => void; required?: boolean; style?: CSSProperties; placeholder?: string; label?: string;
}) {
  const [text, setText] = useState(value);
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(value); setBad(false); }, [value]);
  const commit = () => {
    const v = parseTime24(text);
    if (v === null) return setBad(true);
    setBad(false);
    setText(v);
    if (v !== value) onChange(v);
  };
  return (
    <input id={id} aria-label={label} className="input mono time24" type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={5}
      placeholder={placeholder} required={required} aria-invalid={bad || undefined} style={style} value={text}
      onChange={(e) => {
        let t = e.target.value.replace(/[^\d:]/g, "");
        if (/^\d{4}$/.test(t)) t = `${t.slice(0, 2)}:${t.slice(2)}`; // 4 digits are unambiguous: show the colon right away
        setText(t);
        setBad(false);
        const v = parseTime24(t);
        if (v && t.length === 5 && v !== value) onChange(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
    />
  );
}
