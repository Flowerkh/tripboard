/**
 * Kakao login (Supabase Auth) and keeping trips in the account.
 *
 * Without signing in, everything stays on this device as before.
 * Once signed in, every trip is saved to the account (table user_trips, one row per trip)
 * and the same trips appear on every device that signs in with the same Kakao account.
 *
 * Sync rules (one person, several devices):
 *  - local changes are uploaded ~1.5 s later
 *  - the account is checked on sign-in, when the app comes back to the front, and every minute
 *  - if a trip changed in both places since the last sync, the newer edit wins
 *  - a deleted trip leaves a tombstone so other devices delete it too
 * AI chat history stays on each device.
 */
import { createClient, type User } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";
import { clearAccountData, getState, setState, subscribe, toast, type Account, type CloudMeta } from "./store";
import type { Item, Trip } from "./types";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: "tripboard-auth" },
});

const RETURN_KEY = "tripboard:return-to";
const PUSH_DELAY = 1500;
const PULL_EVERY = 60_000;

// ---------- auth ----------

function account(u: User | null | undefined): Account | null {
  if (!u) return null;
  const m = (u.user_metadata ?? {}) as Record<string, string>;
  const name = m.full_name || m.name || m.nickname || m.preferred_username || m.user_name || "카카오 사용자";
  const avatar = (m.avatar_url || m.picture || "").replace(/^http:\/\//, "https://");
  return { id: u.id, name, avatar };
}

export async function loginWithKakao() {
  try { sessionStorage.setItem(RETURN_KEY, location.hash || "#/"); } catch { /* ignore */ }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: `${location.origin}${location.pathname}` },
  });
  if (error) toast(`카카오 로그인을 시작하지 못했어요: ${error.message}`);
}

export async function logout() {
  await flush().catch(() => {});
  await supabase.auth.signOut().catch(() => {});
  clearAccountData();
  setState({ user: null });
  toast("로그아웃했어요 · 다시 로그인하면 여행이 돌아와요");
}

/** Shows a readable message when Kakao/Supabase sent the user back with an error. */
function readRedirectError() {
  const q = new URLSearchParams(location.search);
  const err = q.get("error_description") || q.get("error");
  if (!q.has("error") && !q.has("error_description") && !q.has("error_code")) return;
  ["error", "error_code", "error_description", "code", "state"].forEach((k) => q.delete(k));
  const rest = q.toString();
  history.replaceState(history.state, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
  setTimeout(() => toast(`로그인하지 못했어요: ${err}`), 300);
}

function restoreRoute() {
  let to: string | null = null;
  try { to = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY); } catch { /* ignore */ }
  if (to && to !== location.hash) location.hash = to;
}

export function installCloud() {
  readRedirectError();
  supabase.auth.onAuthStateChange((event, session) => {
    const user = account(session?.user);
    const prev = getState().user;
    if (prev?.id !== user?.id || prev === undefined) setState({ user });
    if (event === "SIGNED_IN" && user && prev?.id !== user.id) {
      restoreRoute();
      toast(`${user.name}님, 반가워요`);
    }
    if (user) setTimeout(() => sync(), 0);
  });
  subscribe(onChange);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && sync());
  window.addEventListener("online", () => sync());
  setInterval(() => document.visibilityState === "visible" && sync(), PULL_EVERY);
}

// ---------- sync ----------

interface Doc { v: 1; trip: Trip; items: Item[] }
interface Row { id: string; updated_at: string; deleted: boolean; data?: Doc }

/** JSON with sorted keys, so the same content always gives the same fingerprint. */
function stable(x: unknown): string {
  if (x === undefined) return "null";
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(stable).join(",")}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}
function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

/** The account copy of a trip. Share link id/token travel along so any of your devices can update it. */
function docOf(t: Trip, items: Item[]): Doc {
  const share = t.share ? { id: t.share.id, token: t.share.token } : undefined;
  const list = items
    .filter((i) => i.tripId === t.id)
    .sort((a, b) => (a.day + a.start + a.id < b.day + b.start + b.id ? -1 : 1));
  return { v: 1, trip: { ...t, share }, items: list };
}
const sigOf = (d: Doc) => hash(stable(d));

/** When each local trip first became different from the account (for "newer edit wins"). */
const dirtySince = new Map<string, number>();
let timer = 0;
let running: Promise<void> | null = null;

function onChange() {
  const s = getState();
  if (!s.user) return;
  const now = Date.now();
  let dirty = s.cloud.deleted.length > 0;
  for (const t of s.trips) {
    if (s.cloud.trips[t.id]?.sig !== sigOf(docOf(t, s.items))) {
      if (!dirtySince.has(t.id)) dirtySince.set(t.id, now);
      dirty = true;
    } else dirtySince.delete(t.id);
  }
  // trips that were in the account but are gone here → delete in the account
  const gone = Object.keys(s.cloud.trips).filter((id) => !s.trips.some((t) => t.id === id) && !s.cloud.deleted.includes(id));
  if (gone.length) {
    setState((st) => ({ cloud: { ...st.cloud, deleted: [...st.cloud.deleted, ...gone] } }));
    return; // the setState above calls onChange again
  }
  if (dirty && !running) {
    clearTimeout(timer);
    timer = window.setTimeout(() => sync(), s.sync.state === "error" ? 30_000 : PUSH_DELAY); // back off while failing
  }
}

const setCloud = (f: (c: CloudMeta) => CloudMeta) => setState((st) => ({ cloud: f(st.cloud) }));

/** Pull what changed in the account, then push what changed here. Runs one at a time. */
export function sync(): Promise<void> {
  if (!getState().user) return Promise.resolve();
  if (running) return running;
  clearTimeout(timer);
  let done!: () => void;
  running = new Promise<void>((r) => (done = r));
  (async () => {
    setState({ sync: { ...getState().sync, state: "syncing" } });
    try {
      await pull();
      await push();
      setState({ sync: { state: "idle", at: Date.now() } });
    } catch (e) {
      setState({ sync: { state: "error", at: getState().sync.at, error: message(e) } });
    } finally {
      running = null;
      done();
      onChange(); // anything edited while this ran gets its own upload
    }
  })();
  return running;
}

/** Waits for pending changes to reach the account (used before signing out). */
export async function flush() {
  clearTimeout(timer);
  await sync();
}

function message(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/fetch|network|Failed to/i.test(m)) return "인터넷 연결을 확인해 주세요.";
  if (/JWT|session|auth/i.test(m)) return "로그인이 풀렸어요. 다시 로그인해 주세요.";
  return m;
}

async function pull() {
  const me = getState().user;
  if (!me) return;
  // switching accounts on one device: start the bookkeeping over
  if (getState().cloud.userId !== me.id) setCloud(() => ({ userId: me.id, trips: {}, deleted: [] }));

  const { data: heads, error } = await supabase.from("user_trips").select("id,updated_at,deleted");
  if (error) throw error;
  const s0 = getState();
  const changed = (heads as Row[]).filter((r) =>
    r.deleted ? !!s0.cloud.trips[r.id] || s0.trips.some((t) => t.id === r.id) : s0.cloud.trips[r.id]?.at !== r.updated_at,
  );
  if (!changed.length) return;

  const needData = changed.filter((r) => !r.deleted).map((r) => r.id);
  const full = new Map<string, Row>();
  if (needData.length) {
    const { data, error: e2 } = await supabase.from("user_trips").select("id,updated_at,deleted,data").in("id", needData);
    if (e2) throw e2;
    for (const r of data as Row[]) full.set(r.id, r);
  }

  let added = 0;
  setState((s) => {
    let trips = s.trips;
    let items = s.items;
    const cloud: CloudMeta = { ...s.cloud, trips: { ...s.cloud.trips }, deleted: [...s.cloud.deleted] };
    for (const head of changed) {
      const local = trips.find((t) => t.id === head.id);
      const known = cloud.trips[head.id];
      const localDirty = !!local && known?.sig !== sigOf(docOf(local, items));
      const remoteTime = Date.parse(head.updated_at);
      const localWins = localDirty && (dirtySince.get(head.id) ?? Date.now()) > remoteTime;

      if (head.deleted) {
        if (local && localWins) { delete cloud.trips[head.id]; continue; } // edited here after it was deleted elsewhere: keep, re-upload
        trips = trips.filter((t) => t.id !== head.id);
        items = items.filter((i) => i.tripId !== head.id);
        delete cloud.trips[head.id];
        cloud.deleted = cloud.deleted.filter((x) => x !== head.id);
        continue;
      }
      const row = full.get(head.id);
      if (!row?.data?.trip) continue;
      if (cloud.deleted.includes(head.id)) continue; // deleted here; the push will delete it there
      if (localWins) { cloud.trips[head.id] = { sig: known?.sig ?? "", at: head.updated_at }; continue; }

      const remoteTrip: Trip = { ...row.data.trip, id: head.id };
      // keep this device's share bookkeeping when it's the same link
      if (local?.share && remoteTrip.share?.id === local.share.id) remoteTrip.share = local.share;
      const remoteItems = (row.data.items ?? []).map((i) => ({ ...i, tripId: head.id }));
      if (!local) added++;
      trips = local ? trips.map((t) => (t.id === head.id ? remoteTrip : t)) : [...trips, remoteTrip];
      items = [...items.filter((i) => i.tripId !== head.id), ...remoteItems];
      cloud.trips[head.id] = { sig: sigOf(docOf(remoteTrip, remoteItems)), at: head.updated_at };
      dirtySince.delete(head.id);
    }
    return { trips, items, cloud };
  });
  if (added) toast(`계정에서 여행 ${added}개를 불러왔어요`);
}

async function push() {
  const s = getState();
  const me = s.user;
  if (!me) return;
  const rows: { user_id: string; id: string; data: Doc | Record<string, never>; deleted: boolean }[] = [];
  const sigs = new Map<string, string>();
  for (const t of s.trips) {
    const d = docOf(t, s.items);
    const sig = sigOf(d);
    if (s.cloud.trips[t.id]?.sig === sig) continue;
    rows.push({ user_id: me.id, id: t.id, data: d, deleted: false });
    sigs.set(t.id, sig);
  }
  for (const id of s.cloud.deleted) rows.push({ user_id: me.id, id, data: {}, deleted: true });
  if (!rows.length) return;

  const { data, error } = await supabase.from("user_trips").upsert(rows, { onConflict: "user_id,id" }).select("id,updated_at,deleted");
  if (error) throw error;
  setCloud((c) => {
    const trips = { ...c.trips };
    let deleted = c.deleted;
    for (const r of data as Row[]) {
      if (r.deleted) {
        delete trips[r.id];
        deleted = deleted.filter((x) => x !== r.id);
      } else if (sigs.has(r.id)) {
        trips[r.id] = { sig: sigs.get(r.id)!, at: r.updated_at };
        dirtySince.delete(r.id);
      }
    }
    return { ...c, trips, deleted };
  });
}
