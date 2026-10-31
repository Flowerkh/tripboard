import { hasGeo } from "./trip";
import type { Item, Settings, Trip } from "./types";

type Place = Pick<Item, "place" | "title" | "lat" | "lng">;
export type Provider = "google" | "kakao" | "naver";

export function providerFor(trip: Trip, settings: Settings): Provider {
  return trip.kind === "domestic" ? settings.domesticMap : "google";
}
export const providerName = (p: Provider) => ({ google: "구글맵", kakao: "카카오맵", naver: "네이버지도" })[p];

function query(it: Place, trip: Trip): string {
  if (it.place) return it.place;
  const bare = it.title.replace(/^[^:]{1,8}:\s*/, "");
  return `${bare} ${trip.city || trip.country || ""}`.trim();
}
function gLoc(it: Place, trip: Trip): string {
  return it.place ? it.place : hasGeo(it) ? `${it.lat},${it.lng}` : query(it, trip);
}
const gMode = (trip: Trip) => (trip.kind === "domestic" && trip.transport === "자차" ? "driving" : "transit");
const kName = (it: Place) => encodeURIComponent(String(it.place || it.title).replace(/[,/]/g, " ").trim());

export function mapLink(p: Provider, it: Place, trip: Trip): string {
  if (p === "kakao") return hasGeo(it) ? `https://map.kakao.com/link/map/${kName(it)},${it.lat},${it.lng}` : `https://map.kakao.com/link/search/${encodeURIComponent(query(it, trip))}`;
  if (p === "naver") return `https://map.naver.com/p/search/${encodeURIComponent(query(it, trip))}`;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(gLoc(it, trip));
}

/** Directions to `it`, from `from` when given, otherwise from the phone's current location. */
export function dirLink(p: Provider, it: Place, trip: Trip, from?: Place | null): string {
  if (p === "kakao") {
    if (!hasGeo(it)) return mapLink(p, it, trip);
    if (from && hasGeo(from)) return `https://map.kakao.com/link/from/${kName(from)},${from.lat},${from.lng}/to/${kName(it)},${it.lat},${it.lng}`;
    return `https://map.kakao.com/link/to/${kName(it)},${it.lat},${it.lng}`;
  }
  if (p === "naver") return mapLink(p, it, trip);
  const q = new URLSearchParams({ api: "1", destination: gLoc(it, trip), travelmode: gMode(trip) });
  if (from && (from.place || hasGeo(from))) q.set("origin", gLoc(from, trip));
  return "https://www.google.com/maps/dir/?" + q.toString();
}

/** Whole-day route; Google allows 3 waypoints on phones, so long days are split. */
export function dayRouteLinks(p: Provider, list: Place[], trip: Trip): string[] {
  if (p === "google") {
    const stops = list.filter((s) => s.place || hasGeo(s));
    const out: string[] = [];
    for (let i = 0; i < stops.length - 1; i += 4) {
      const seg = stops.slice(i, i + 5);
      if (seg.length < 2) break;
      const q = new URLSearchParams({ api: "1", origin: gLoc(seg[0], trip), destination: gLoc(seg[seg.length - 1], trip), travelmode: gMode(trip) });
      if (seg.length > 2) q.set("waypoints", seg.slice(1, -1).map((s) => gLoc(s, trip)).join("|"));
      out.push("https://www.google.com/maps/dir/?" + q.toString());
    }
    return out;
  }
  if (p === "kakao") {
    const stops = list.filter(hasGeo);
    const out: string[] = [];
    const mode = trip.transport === "자차" ? "car" : "walk";
    for (let i = 0; i < stops.length - 1; i += 2) {
      const seg = stops.slice(i, i + 3);
      if (seg.length < 2) break;
      out.push(`https://map.kakao.com/link/by/${mode}/` + seg.map((s) => `${kName(s)},${s.lat},${s.lng}`).join("/"));
    }
    return out;
  }
  return [];
}
