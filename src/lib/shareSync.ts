/**
 * Keeps shared trips up to date: whenever a shared trip or its items change
 * (by hand, by the AI, or by undo), the new version is uploaded a moment later.
 */
import { payloadOf, pushShare, sigOf } from "./share";
import { getState, subscribe } from "./store";

const DELAY = 1500;
const RETRY = 30_000;
const timers = new Map<string, number>();
const busy = new Set<string>();

function check() {
  const s = getState();
  for (const t of s.trips) {
    if (!t.share || busy.has(t.id) || timers.has(t.id)) continue;
    if (t.share.error && /지워졌어요/.test(t.share.error)) continue; // link is gone; wait for the user
    if (sigOf(payloadOf(t, s.items)) === t.share.sig) continue;
    schedule(t.id, t.share.error ? RETRY : DELAY);
  }
}

function schedule(tripId: string, ms: number) {
  timers.set(
    tripId,
    window.setTimeout(async () => {
      timers.delete(tripId);
      busy.add(tripId);
      try {
        await pushShare(tripId);
      } catch {
        /* the error is stored on the trip and shown in the share sheet; retried later */
      } finally {
        busy.delete(tripId);
        check();
      }
    }, ms),
  );
}

export function installShareSync() {
  subscribe(check);
  check();
  window.addEventListener("online", check);
}

/** For the share sheet: is an upload waiting or running for this trip? */
export function syncing(tripId: string) {
  return busy.has(tripId) || timers.has(tripId);
}
