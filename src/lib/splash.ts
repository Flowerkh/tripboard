/**
 * Launch screen (#splash in index.html, design "로딩 A · 브랜드").
 * It is in the HTML so it shows instantly; this removes it once the app has something to show:
 *  - right after the first render, but on screen for at least MIN so it doesn't flicker,
 *  - when signed in on a device with no trips yet, after the first download from the account
 *    (so the home doesn't flash "여행 없음" and then fill in), at most MAX_WAIT.
 */
import { getState, subscribe } from "./store";

const MIN = 450;
const MAX_WAIT = 3000;

function ready(): boolean {
  const s = getState();
  if (s.user === undefined) return false; // still checking the saved login
  if (s.user && !s.trips.length && !s.sync.at && s.sync.state !== "error") return false; // first download not done yet
  return true;
}

export function installSplash() {
  const el = document.getElementById("splash");
  if (!el) return;
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    unsub();
    clearTimeout(cap);
    setTimeout(() => {
      el.classList.add("out");
      const remove = () => el.remove();
      el.addEventListener("transitionend", remove, { once: true });
      setTimeout(remove, 600); // reduced motion has no transition
    }, Math.max(0, MIN - performance.now()));
  };
  const unsub = subscribe(() => ready() && hide());
  const cap = setTimeout(hide, MAX_WAIT);
  // first render happens on the next frame; check then
  requestAnimationFrame(() => ready() && hide());
}
