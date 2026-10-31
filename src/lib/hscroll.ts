/**
 * Sideways rows (day tabs, season picks, chips) swipe fine on a phone,
 * but a mouse can't move them. This adds, for every such row on the page:
 *  - mouse wheel → scrolls the row sideways (until its end, then the page scrolls as usual)
 *  - click-and-drag with the mouse, without triggering the button under the cursor
 * Touch and trackpad behaviour is left alone.
 */
const ROWS = ".days, .recs-row, .chips.scroll";

const scroller = (t: EventTarget | null) => {
  const el = (t as Element | null)?.closest?.(ROWS) as HTMLElement | null;
  return el && el.scrollWidth > el.clientWidth + 1 ? el : null;
};

export function installHScroll() {
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // pinch-zoom or a trackpad already scrolling sideways
      const el = scroller(e.target);
      if (!el) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1);
      const max = el.scrollWidth - el.clientWidth;
      if ((dy < 0 && el.scrollLeft <= 0) || (dy > 0 && el.scrollLeft >= max - 1)) return; // at the end: let the page scroll
      e.preventDefault();
      el.scrollLeft += dy;
    },
    { passive: false },
  );

  let drag: { el: HTMLElement; x: number; left: number; moved: boolean } | null = null;
  let swallowClick = false;

  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = scroller(e.target);
    if (el) drag = { el, x: e.clientX, left: el.scrollLeft, moved: false };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add("dragging");
    }
    drag.el.scrollLeft = drag.left - dx;
  });
  const end = () => {
    if (!drag) return;
    if (drag.moved) {
      swallowClick = true;
      setTimeout(() => (swallowClick = false), 0);
      drag.el.classList.remove("dragging");
    }
    drag = null;
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  // A drag shouldn't count as a tap on the tab it started on.
  document.addEventListener(
    "click",
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}
