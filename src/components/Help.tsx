import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import type { HelpMark, HelpScreen } from "../lib/help";

/**
 * 화면 설명 레이어: the "?" button in a screen's header. Pressing it dims the screen, leaves the
 * explained controls lit with a yellow ring and a number, and lists what each number does on a
 * small card placed in the largest free gap (so it doesn't cover what it explains).
 * Targets are elements with data-help="<id>"; ids that aren't on screen right now are skipped and
 * the numbers close up. Some screens open it by themselves the first time (per device).
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
type Spot = Box & HelpMark;

const PAD = 4; // the lit area and ring sit a little outside the control
const GAP = 8; // between rows on the card (.help-card ol gap)

function boxOf(el: Element | null): Box | null {
  if (!el) return null;
  const b = el.getBoundingClientRect();
  if (b.width < 1 || b.height < 1) return null;
  if (b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth) return null;
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return { x: b.left - PAD, y: b.top - PAD, w: b.width + PAD * 2, h: b.height + PAD * 2, r: Math.max(10, Math.min(r, b.height / 2, b.width / 2) + PAD) };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** free vertical bands of the viewport, between the lit boxes (the card spans the column's width) */
function freeBands(boxes: Box[]): [number, number][] {
  const busy = boxes.map((b) => [b.y - 16, b.y + b.h + 10] as const).sort((a, b) => a[0] - b[0]);
  const free: [number, number][] = [];
  let at = 10;
  for (const [a, b] of busy) {
    if (a > at) free.push([at, a]);
    at = Math.max(at, b);
  }
  if (innerHeight - 10 > at) free.push([at, innerHeight - 10]);
  return free;
}

type Fit = { ids: string[]; top: number; left: number; width: number; maxH?: number };

function Layer({ screen, anchor, foot, onClose }: { screen: HelpScreen; anchor: HTMLElement | null; foot: boolean; onClose: () => void }) {
  const [all, setAll] = useState<{ marks: Spot[]; anchor: Box | null } | null>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const card = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const focused = useRef(false);

  const measure = useCallback(() => {
    const marks: Spot[] = [];
    for (const m of screen.marks) {
      const b = boxOf(document.querySelector(`[data-help="${m.id}"]`));
      if (b) marks.push({ ...b, ...m });
    }
    setAll({ marks, anchor: boxOf(anchor) });
    setFit(null);
  }, [screen, anchor]);

  useLayoutEffect(measure, [measure]);

  // First pass renders every row (hidden) so each row can be measured. Then pick the marks and the
  // place: the lowest free band the card fits in; when none, drop marks in screen.drop order.
  useLayoutEffect(() => {
    if (!all || fit || !card.current) return;
    const el = card.current;
    const rowH = new Map([...el.querySelectorAll("li")].map((li, i) => [all.marks[i]?.id, li.getBoundingClientRect().height]));
    const rowsSum = [...rowH.values()].reduce((a, b) => a + b, 0);
    const base = el.scrollHeight - rowsSum - GAP * Math.max(0, rowH.size - 1);
    const heightOf = (ids: string[]) => base + ids.reduce((a, id) => a + (rowH.get(id) ?? 0), 0) + GAP * Math.max(0, ids.length - 1);
    const col = document.querySelector(".app")?.getBoundingClientRect();
    const left = (col && col.width ? col.left : 0) + 12;
    const width = (col && col.width ? col.width : innerWidth) - 24;
    const boxesOf = (ids: string[]) => [...all.marks.filter((m) => ids.includes(m.id)), ...(all.anchor ? [all.anchor] : [])];

    let ids = all.marks.map((m) => m.id);
    const drop = screen.drop.filter((id) => ids.includes(id));
    for (;;) {
      const H = heightOf(ids);
      const fits = freeBands(boxesOf(ids)).filter(([a, b]) => b - a >= H);
      if (fits.length) {
        setFit({ ids, top: fits[fits.length - 1][1] - H, left, width });
        return;
      }
      const next = drop.shift();
      if (!next || ids.length <= 2) break;
      ids = ids.filter((id) => id !== next);
    }
    const H = heightOf(ids);
    const big = freeBands(boxesOf(ids)).sort((x, y) => y[1] - y[0] - (x[1] - x[0]))[0];
    if (big && big[1] - big[0] >= 180) setFit({ ids, top: big[0], left, width, maxH: big[1] - big[0] });
    else setFit({ ids, top: Math.max(10, innerHeight - H - 10), left, width });
  }, [all, fit, screen]);

  useEffect(() => {
    if (!fit || focused.current) return;
    focused.current = true;
    closeBtn.current?.focus({ preventScroll: true });
  }, [fit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); // a sheet underneath listens for Escape too
      onClose();
    };
    let raf = 0;
    const again = (e: Event) => {
      if (e.target instanceof Node && card.current?.contains(e.target)) return; // scrolling the card itself
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
      document.body.style.overflow = prev;
    };
  }, [measure, onClose]);

  if (!all) return null;
  const shown = fit ? all.marks.filter((m) => fit.ids.includes(m.id)) : [];
  const rows = fit ? shown : all.marks;
  const holes = [...shown, ...(fit && all.anchor ? [all.anchor] : [])];
  return createPortal(
    <div className="help-layer" role="dialog" aria-modal="true" aria-labelledby="help-title"
      onClick={(e) => { if (!card.current?.contains(e.target as Node)) onClose(); }}>
      <svg className="help-dim" aria-hidden="true">
        <defs>
          <mask id="help-holes">
            <rect width="100%" height="100%" fill="#fff" />
            {holes.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.r} fill="#000" />)}
          </mask>
        </defs>
        <rect width="100%" height="100%" mask="url(#help-holes)" />
      </svg>
      {shown.map((s) => <span key={"r" + s.id} className="help-ring" aria-hidden="true" style={{ left: s.x, top: s.y, width: s.w, height: s.h, borderRadius: s.r }} />)}
      {shown.map((s, i) => (
        <span key={"n" + s.id} className="help-num" aria-hidden="true"
          style={{ left: clamp(s.x - 9, 4, innerWidth - 28), top: clamp(s.y - 9, 4, innerHeight - 28) }}>{i + 1}</span>
      ))}
      <section ref={card} className="help-card"
        style={fit ? { top: fit.top, left: fit.left, width: fit.width, maxHeight: fit.maxH } : { top: 0, left: 0, width: Math.min(456, innerWidth - 24), visibility: "hidden" }}>
        <div className="help-head">
          <b id="help-title">{screen.title}</b>
          <button ref={closeBtn} type="button" className="icon-btn" aria-label="설명 닫기" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <ol>
          {rows.map((s, i) => (
            <li key={s.id}>
              <span className="help-num static" aria-hidden="true">{i + 1}</span>
              <span><b>{s.title}</b><span>{s.text}</span></span>
            </li>
          ))}
        </ol>
        {foot && <p className="help-foot">? 를 누르면 언제든 다시 볼 수 있어요</p>}
      </section>
    </div>,
    document.body,
  );
}

/**
 * The "?" button and its layer. auto: open by itself the first time this screen is seen on this
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
    btn.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      <button ref={btn} type="button" className={"icon-btn help-btn" + (open ? " on" : "") + (className ? " " + className : "")}
        aria-label="이 화면 설명" title="이 화면 설명" aria-pressed={!!open} onClick={() => (open ? close() : show("tap"))}>
        <Icon name="help" size={21} />
      </button>
      {open && <Layer screen={screen} anchor={btn.current} foot={open === "auto"} onClose={close} />}
    </>
  );
}
