import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import type { HelpScreen } from "../lib/help";

/**
 * 화면 설명: the "?" button in a screen's header. Pressing it dims the screen and walks through the
 * numbered controls one at a time: a spotlight slides to the current control (a yellow ring that
 * pulses), the other numbers stay visible but faded, and a small card next to it says what the
 * control does. Tapping anywhere goes to the next number; tapping a number jumps to it.
 * Targets are elements with data-help="<id>"; ids missing from the screen right now are skipped.
 * A control that is scrolled away or hidden under the bottom bar is scrolled into view first.
 * Some screens open it by themselves the first time (remembered per device).
 */

const KEY = "tripboard:help-seen";

function seen(): Set<string> | "all" {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "*") return "all";
    return new Set(v ? (JSON.parse(v) as string[]) : []);
  } catch {
    return new Set();
  }
}
export function wasSeen(screen: string): boolean {
  const s = seen();
  return s === "all" || s.has(screen);
}
function markSeen(screen: string) {
  const s = seen();
  if (s === "all" || s.has(screen)) return;
  s.add(screen);
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* private mode: it just shows again */ }
}
/** Settings › 화면 설명 다시 보기 */
export function resetHelp() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to reset */ }
}

type Box = { x: number; y: number; w: number; h: number; r: number };

const target = (id: string) => document.querySelector<HTMLElement>(`[data-help="${id}"]`);
function boxOf(el: HTMLElement | null): Box | null {
  if (!el) return null;
  const b = el.getBoundingClientRect();
  if (b.width < 1 || b.height < 1) return null;
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return { x: b.left, y: b.top, w: b.width, h: b.height, r: Math.min(r, b.width / 2, b.height / 2) };
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const same = (a: (Box | null)[], b: (Box | null)[]) =>
  a.length === b.length && a.every((x, i) => {
    const y = b[i];
    if (!x || !y) return x === y;
    return Math.abs(x.x - y.x) < 0.5 && Math.abs(x.y - y.y) < 0.5 && Math.abs(x.w - y.w) < 0.5 && Math.abs(x.h - y.h) < 0.5;
  });

/** the part of the screen not covered by the fixed bars (bottom input bar / button dock) */
function clearArea(el: HTMLElement) {
  let top = 56;
  let bottom = innerHeight - 12;
  for (const bar of document.querySelectorAll<HTMLElement>(".askbar-wrap, .dock-bottom")) {
    if (bar.contains(el)) continue;
    const r = bar.getBoundingClientRect();
    if (r.height && r.top < innerHeight) bottom = Math.min(bottom, r.top - 8);
  }
  return { top, bottom };
}
/** scroll so the control is fully visible and not under a fixed bar */
function reveal(el: HTMLElement) {
  if (el.closest(".askbar-wrap, .dock-bottom, .now-top")) return; // fixed: always on screen
  const b = el.getBoundingClientRect();
  const { top, bottom } = clearArea(el);
  if (b.top >= top && b.bottom <= bottom) return;
  if (el.closest(".sheet")) { el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior }); return; }
  const want = b.height > bottom - top ? top : top + (bottom - top - b.height) / 2;
  window.scrollBy({ top: b.top - want, behavior: "instant" as ScrollBehavior });
}

const RING = 2; // the lit area sits this far outside the control; the ring is drawn on its edge

function Tour({ screen, auto, onClose }: { screen: HelpScreen; auto: boolean; onClose: () => void }) {
  // the marks that are on this screen right now (one below the fold is scrolled to when its turn comes)
  const marks = useMemo(() => screen.marks.filter((m) => boxOf(target(m.id))), [screen]);
  const [step, setStep] = useState(0);
  const [boxes, setBoxes] = useState<(Box | null)[]>(() => marks.map((m) => boxOf(target(m.id))));
  const [cardH, setCardH] = useState(170);
  const [ready, setReady] = useState(false);
  const card = useRef<HTMLElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const last = step >= marks.length - 1;

  const go = useCallback((i: number) => setStep(clamp(i, 0, Math.max(0, marks.length - 1))), [marks.length]);
  const next = useCallback(() => (last ? onClose() : go(step + 1)), [last, onClose, go, step]);

  // bring the current control into view before it's lit
  useLayoutEffect(() => {
    const el = marks[step] && target(marks[step].id);
    if (el) reveal(el);
    setBoxes(marks.map((m) => boxOf(target(m.id))));
  }, [step, marks]);

  // follow the controls every frame: fonts loading, the address bar sliding, a list filling in
  useEffect(() => {
    let raf = 0;
    let prev: (Box | null)[] = [];
    const tick = () => {
      const now = marks.map((m) => boxOf(target(m.id)));
      if (!same(now, prev)) { prev = now; setBoxes(now); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const on = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true))); // no slide-in on the first frame
    return () => { cancelAnimationFrame(raf); cancelAnimationFrame(on); };
  }, [marks]);

  useLayoutEffect(() => {
    const h = card.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 1) setCardH(h);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); } // a sheet underneath listens for Escape too
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(step - 1); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, go, step, onClose]);

  useEffect(() => {
    nextBtn.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const vw = innerWidth, vh = innerHeight;
  const cur = boxes[step] ?? null;
  const spot = cur
    ? { left: cur.x - RING, top: cur.y - RING, width: cur.w + RING * 2, height: cur.h + RING * 2, borderRadius: cur.r + RING }
    : { left: vw / 2, top: vh / 2, width: 0, height: 0, borderRadius: 0 };
  const col = document.querySelector(".app")?.getBoundingClientRect();
  const left = (col && col.width ? col.left : 0) + 12;
  const width = (col && col.width ? col.width : vw) - 24;
  let top = vh - cardH - 16;
  if (cur) {
    const below = cur.y + cur.h + RING + 18;
    const above = cur.y - RING - 18 - cardH;
    if (below + cardH <= vh - 10) top = below;
    else if (above >= 10) top = above;
    else top = cur.y + cur.h / 2 < vh / 2 ? vh - cardH - 16 : 16; // a very tall control: the far end
  }
  const m = marks[step];

  return createPortal(
    <div className={"help-layer" + (ready ? " ready" : "")} role="dialog" aria-modal="true" aria-labelledby="help-title"
      onClick={(e) => { if (!card.current?.contains(e.target as Node)) next(); }}>
      <div className="help-spot" aria-hidden="true" style={spot}>
        {cur && <span key={step} className="help-pulse" />}
      </div>
      {boxes.map((b, i) => {
        if (!b || b.y + b.h < 0 || b.y > vh) return null; // scrolled away: no number pinned to the screen edge
        const k = b.r * 0.293 - RING; // on the ring at the top-left corner, also for round controls
        return (
          <button key={marks[i].id} type="button" tabIndex={-1} className={"help-num" + (i === step ? " on" : "")}
            aria-label={`${i + 1}번 설명 보기`} onClick={(e) => { e.stopPropagation(); go(i); }}
            style={{ left: clamp(b.x + k - 12, 2, vw - 26), top: clamp(b.y + k - 12, 2, vh - 26) }}>
            {i + 1}
          </button>
        );
      })}
      <section ref={card} className="help-card" style={{ top, left, width }}>
        <div className="help-head">
          <span className="help-count" aria-hidden="true">{marks.length ? step + 1 : 0}<i> / {marks.length}</i></span>
          <span className="help-where" id="help-title">{screen.title}</span>
          <button type="button" className="icon-btn" aria-label="설명 닫기" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div key={step} className="help-body" aria-live="polite">
          {m ? <><b>{m.title}</b><p>{m.text}</p></> : <p>이 화면에서 설명할 버튼이 지금은 없어요.</p>}
          {step === 0 && marks.length > 1 && <p className="help-foot">화면 아무 곳이나 누르면 다음 번호로 넘어가요</p>}
          {last && auto && <p className="help-foot">? 를 누르면 언제든 다시 볼 수 있어요</p>}
        </div>
        <div className="help-nav">
          <span className="help-dots" aria-hidden="true">{marks.map((x, i) => <i key={x.id} className={i === step ? "on" : ""} />)}</span>
          {step > 0 && <button type="button" className="btn sm" onClick={() => go(step - 1)}>이전</button>}
          <button ref={nextBtn} type="button" className="btn sm primary" onClick={next}>{last ? "다 봤어요" : "다음"}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/**
 * The "?" button and its tour. auto: open by itself the first time this screen is seen on this
 * device (after the launch screen is gone and when nothing else is open on top).
 */
export function Help({ screen, auto, className, scrollTop = true }: { screen: HelpScreen; auto?: boolean; className?: string; scrollTop?: boolean }) {
  const [open, setOpen] = useState<null | "auto" | "tap">(null);
  const btn = useRef<HTMLButtonElement>(null);

  const show = useCallback((how: "auto" | "tap") => {
    markSeen(screen.id);
    if (scrollTop && window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    requestAnimationFrame(() => setOpen(how));
  }, [screen.id, scrollTop]);

  useEffect(() => {
    if (!auto || wasSeen(screen.id)) return;
    let tries = 0;
    let t = 0;
    const tick = () => {
      const me = btn.current;
      if (!me || tries++ > 25) return;
      const sheet = document.querySelector(".sheet");
      const busy = document.getElementById("splash") || document.querySelector(".help-layer") || (sheet && !sheet.contains(me));
      if (busy) { t = window.setTimeout(tick, 400); return; }
      show("auto");
    };
    t = window.setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, [auto, screen.id, show]);

  const close = useCallback(() => {
    setOpen(null);
    if (scrollTop) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    btn.current?.focus({ preventScroll: true });
  }, [scrollTop]);

  return (
    <>
      <button ref={btn} type="button" className={"icon-btn help-btn" + (open ? " on" : "") + (className ? " " + className : "")}
        aria-label="이 화면 설명" title="이 화면 설명" aria-pressed={!!open} onClick={() => (open ? close() : show("tap"))}>
        <Icon name="help" size={21} />
      </button>
      {open && <Tour screen={screen} auto={open === "auto"} onClose={close} />}
    </>
  );
}
