import { addDays, nowMin, toMin, today } from "./dates";
import type { Item, Leg, Trip } from "./types";

export function tripDays(t: Trip): string[] {
  const out: string[] = [];
  for (let i = 0; i <= (t.nights || 0); i++) out.push(addDays(t.start, i));
  return out;
}
export function tripEnd(t: Trip): string {
  return addDays(t.start, t.nights || 0);
}
export function byTime(a: Item, b: Item): number {
  return (toMin(a.start) ?? 9999) - (toMin(b.start) ?? 9999) || a.order - b.order;
}
export function itemsOfDay(items: Item[], day: string): Item[] {
  return items.filter((i) => i.day === day).sort(byTime);
}
export function hasGeo(it: Pick<Item, "lat" | "lng">): it is Item & { lat: number; lng: number } {
  return typeof it.lat === "number" && typeof it.lng === "number" && isFinite(it.lat) && isFinite(it.lng);
}
export type TripPhase = "before" | "during" | "after";
export function phase(t: Trip, day = today()): TripPhase {
  if (day < t.start) return "before";
  if (day > tripEnd(t)) return "after";
  return "during";
}
export interface LegOnDay extends Leg { key: "out" | "back"; sortMin: number }
export function legsOn(t: Trip, day: string): LegOnDay[] {
  const out: LegOnDay[] = [];
  (["out", "back"] as const).forEach((k) => {
    const l = t.legs?.[k];
    if (!l) return;
    const when = l.dep || l.arr;
    if (!when || when.slice(0, 10) !== day) return;
    out.push({ ...l, key: k, sortMin: toMin(when.slice(11, 16)) ?? 0 });
  });
  return out;
}
export interface NowInfo { day: string; min: number; cur: Item | null; next: Item | null; later: Item[]; preview: boolean }
/**
 * What is happening "now". When the trip is not running today, `preview` simulates
 * the first day a little after its first item so the in-trip screen can be tried out.
 */
export function nowInfo(t: Trip, items: Item[]): NowInfo | null {
  let day = today();
  let min = nowMin();
  let preview = false;
  if (phase(t) !== "during") {
    day = t.start;
    const first = itemsOfDay(items, day).find((i) => toMin(i.start) != null);
    if (!first) return { day, min: 10 * 60, cur: null, next: null, later: [], preview: true };
    min = (toMin(first.start) ?? 600) + 30;
    preview = true;
  }
  const list = itemsOfDay(items, day).filter((i) => toMin(i.start) != null);
  let cur: Item | null = null;
  let nextIdx = -1;
  list.forEach((it, k) => {
    const s = toMin(it.start)!;
    const e = toMin(it.end) ?? (list[k + 1] ? toMin(list[k + 1].start)! : s + 60);
    if (s <= min && min < e) cur = it;
    if (s > min && nextIdx < 0) nextIdx = k;
  });
  const next = nextIdx >= 0 ? list[nextIdx] : null;
  const later = nextIdx >= 0 ? list.slice(nextIdx + 1) : [];
  return { day, min, cur, next, later, preview };
}
/** Straight-line distance in metres. */
export function distance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Rough walking minutes: straight line × 1.3 detour at 4.5 km/h. */
export function walkMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.max(1, Math.round((distance(a, b) * 1.3) / 75));
}
export function routeLabel(t: Trip): string {
  const o = t.legs?.out, b = t.legs?.back;
  if (t.kind === "overseas") {
    if (o && (o.from || o.to)) return `${o.from || "?"} → ${o.to || "?"}${b?.to ? ` → ${b.to}` : ""}`;
    return [t.country, t.city].filter(Boolean).join(" ");
  }
  return [t.origin && `${t.origin} → ${t.city}`, t.transport].filter(Boolean).join(" · ") || t.city;
}
