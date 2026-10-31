/**
 * Share links, stored in Supabase.
 *
 * Making a link uploads the trip and gives back a short id (#/t/<id>) plus a secret
 * token that stays in this browser. While the trip is shared, every change is uploaded
 * again (lib/shareSync.ts), so people with the link always see the latest plan.
 * Stopping the share deletes it from the database and the link stops working.
 *
 * Not shared: AI chat, the private memo, companions, settings and the API key.
 */
import { SUPABASE_KEY, SUPABASE_URL } from "./config";
import { durLabel, fmtDay } from "./dates";
import { getState, setState } from "./store";
import { byTime, legsOn, tripDays, tripEnd } from "./trip";
import type { Item, Trip } from "./types";

export type SharedTrip = Omit<Trip, "id" | "createdAt" | "share">;
export type SharedItem = Omit<Item, "id" | "tripId">;
export interface SharedPayload { v: 1; trip: SharedTrip; items: SharedItem[] }
export interface Fetched { data: SharedPayload; updatedAt: string }

export class ShareError extends Error {}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "content-type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout?.(20_000),
    });
  } catch {
    throw new ShareError("공유 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = "";
    try { msg = JSON.parse(text)?.message ?? ""; } catch { /* not JSON */ }
    if (/not found or not allowed/.test(msg)) throw new ShareError("gone");
    if (/too large/.test(msg)) throw new ShareError("일정이 너무 커서 공유할 수 없어요.");
    if (/too many/.test(msg)) throw new ShareError("지금 공유 요청이 많아요. 잠시 뒤에 다시 해 주세요.");
    throw new ShareError(`공유 서버 오류예요 (${res.status}).`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** What goes into the database: the plan, without private bits. */
export function payloadOf(trip: Trip, items: Item[]): SharedPayload {
  const { id: _id, createdAt: _c, share: _s, memo: _m, companions: _p, ...rest } = trip;
  const days = tripDays(trip);
  const list = items
    .filter((i) => i.tripId === trip.id && days.includes(i.day))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : byTime(a, b)))
    .map(({ id: _i, tripId: _t, ...it }) => it);
  return { v: 1, trip: { ...rest, memo: "", companions: "" }, items: list };
}

/** Short fingerprint, to know whether the shared copy is out of date. */
export function sigOf(p: SharedPayload): string {
  const s = JSON.stringify(p);
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

const setShare = (tripId: string, share: Trip["share"]) =>
  setState((s) => ({ trips: s.trips.map((t) => (t.id === tripId ? { ...t, share } : t)) }));

const current = (tripId: string) => {
  const s = getState();
  const trip = s.trips.find((t) => t.id === tripId);
  if (!trip) throw new ShareError("여행을 찾을 수 없어요.");
  return { trip, payload: payloadOf(trip, s.items) };
};

export async function createShare(tripId: string): Promise<string> {
  const { payload } = current(tripId);
  const r = await rpc<{ id: string; token: string }>("share_create", { p_data: payload });
  setShare(tripId, { id: r.id, token: r.token, sig: sigOf(payload), at: Date.now() });
  return r.id;
}

/** Uploads the latest version. Called automatically while a trip is shared. */
export async function pushShare(tripId: string): Promise<void> {
  const { trip, payload } = current(tripId);
  const sh = trip.share;
  if (!sh) return;
  const sig = sigOf(payload);
  try {
    await rpc("share_update", { p_id: sh.id, p_token: sh.token, p_data: payload });
    const now = getState().trips.find((t) => t.id === tripId)?.share;
    if (now?.id === sh.id) setShare(tripId, { ...now, sig, at: Date.now(), error: undefined });
  } catch (e) {
    const now = getState().trips.find((t) => t.id === tripId)?.share;
    const msg = (e as Error).message;
    if (now?.id === sh.id) setShare(tripId, { ...now, error: msg === "gone" ? "공유 링크가 지워졌어요. 새로 만들어 주세요." : msg });
    throw e;
  }
}

export async function stopShare(tripId: string): Promise<void> {
  const trip = getState().trips.find((t) => t.id === tripId);
  const sh = trip?.share;
  if (!sh) return;
  try {
    await rpc("share_delete", { p_id: sh.id, p_token: sh.token });
  } finally {
    // forget it locally even if the server call failed; the link may already be gone
    setShare(tripId, undefined);
  }
}

/** Best effort, for when a shared trip is deleted from this device. */
export function stopShareQuietly(trip: Trip) {
  if (trip.share) rpc("share_delete", { p_id: trip.share.id, p_token: trip.share.token }).catch(() => {});
}

export async function fetchShared(id: string): Promise<Fetched | null> {
  const r = await rpc<{ data: SharedPayload; updated_at: string } | null>("share_get", { p_id: id });
  if (!r || !r.data?.trip || !Array.isArray(r.data.items)) return null;
  return { data: r.data, updatedAt: r.updated_at };
}

export function shareUrl(id: string) {
  return `${location.origin}${location.pathname}#/t/${id}`;
}

/** Plain-text itinerary for KakaoTalk, notes, etc. */
export function tripText(trip: SharedTrip | Trip, items: Pick<Item, "day" | "start" | "title" | "place">[], link?: string): string {
  const t = { id: "", createdAt: 0, ...trip } as Trip;
  const where = t.kind === "overseas" ? [t.country, t.city].filter(Boolean).join(" ") : t.city;
  const L: string[] = [`${t.kind === "overseas" ? "✈️" : "🚆"} ${t.title}`, `${fmtDay(t.start)} – ${fmtDay(tripEnd(t))} · ${durLabel(t.nights)}${where ? ` · ${where}` : ""}`];
  tripDays(t).forEach((d, i) => {
    L.push("", `[${i + 1}일차 · ${fmtDay(d)}]${t.dayLabels[d] ? ` ${t.dayLabels[d]}` : ""}`);
    const rows: [string, string][] = [];
    const hm = (s: string) => s.slice(11, 16);
    for (const l of legsOn(t, d)) {
      const what = t.kind === "overseas" ? (l.key === "out" ? "가는 편" : "오는 편") : l.key === "out" ? "가는 길" : "오는 길";
      rows.push([hm(l.dep) || hm(l.arr), `${what} ${l.from} ${hm(l.dep)} → ${l.to} ${hm(l.arr)}${l.no ? ` (${l.no})` : ""}`.replace(/\s+/g, " ").trim()]);
    }
    for (const it of items.filter((x) => (x as Item).day === d)) {
      rows.push([it.start, `${it.title}${it.place && !it.title.includes(it.place) ? ` · ${it.place}` : ""}`]);
    }
    rows.sort((a, b) => (a[0] || "99").localeCompare(b[0] || "99"));
    if (!rows.length) L.push("아직 비어 있어요");
    for (const [time, text] of rows) L.push(`${time || "--:--"} ${text}`);
  });
  if (t.notice) L.push("", `※ ${t.notice}`);
  if (link) L.push("", `지도와 함께 보기: ${link}`);
  return L.join("\n");
}

/** Copies text; falls back to a hidden textarea where the Clipboard API isn't allowed. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Opens the phone's share sheet (KakaoTalk, messages…) when there is one. */
export async function nativeShare(data: { title: string; text?: string; url?: string }): Promise<"shared" | "cancelled" | "unsupported"> {
  if (!navigator.share) return "unsupported";
  try {
    await navigator.share(data);
    return "shared";
  } catch (e) {
    return (e as Error).name === "AbortError" ? "cancelled" : "unsupported";
  }
}
