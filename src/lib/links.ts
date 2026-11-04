import { hasGeo } from "./trip";
import type { Item, Settings, Trip } from "./types";

type Place = Pick<Item, "place" | "title" | "lat" | "lng">;
export type Provider = "google" | "kakao" | "naver";

export function providerFor(trip: Trip, settings: Settings): Provider {
  return trip.kind === "domestic" ? settings.domesticMap : "google";
}
export const providerName = (p: Provider) => ({ google: "구글맵", kakao: "카카오맵", naver: "네이버지도" })[p];
/** "카카오맵으로" / "네이버지도로": 으로 after a final consonant other than ㄹ, else 로 */
export function withRo(word: string): string {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  if (c < 0 || c > 11171) return `${word}로`;
  const tail = c % 28;
  return `${word}${tail === 0 || tail === 8 ? "로" : "으로"}`;
}

// ---------- Naver Map app links ----------
// Naver documents links only for its phone app (nmap://, start + end + up to 5 stops); there is no documented
// web link for a route, so on a computer a Naver day route is shown with Kakao Map instead.
const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);
const isAndroid = () => /Android/i.test(ua());
export const onPhone = () => /Android|iPhone|iPad|iPod/i.test(ua()) || (typeof navigator !== "undefined" && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/** Naver's app only takes coordinates inside Korea. */
const inKorea = (s: Place) => hasGeo(s) && s.lat! >= 31.43 && s.lat! <= 44.35 && s.lng! >= 122.37 && s.lng! <= 132;
const nName = (it: Place) => encodeURIComponent(String(it.place || it.title).trim());
function nmap(path: string, params: string[]): string {
  // appname is required; for a web page it is the page's address
  const qs = [...params, `appname=${encodeURIComponent(location.origin + location.pathname)}`].join("&");
  // Android: an intent link opens the app, or the Play Store when it is not installed
  return isAndroid()
    ? `intent://${path}?${qs}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`
    : `nmap://${path}?${qs}`;
}
const nMode = (trip: Trip) => (trip.transport === "자차" ? "car" : "walk");
const nPoint = (k: string, s: Place) => [`${k}lat=${s.lat}`, `${k}lng=${s.lng}`, `${k}name=${nName(s)}`];

/** Which map a day route opens in: Naver routes need the phone app, so computers get Kakao Map. */
export const routeProvider = (p: Provider): Provider => (p === "naver" && !onPhone() ? "kakao" : p);
/** Web links open in a new tab; app links (nmap://, intent://) must open in place. */
export const linkProps = (url: string) => (/^https?:/.test(url) ? { target: "_blank", rel: "noopener noreferrer" } : {});

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
  if (p === "naver") {
    if (!onPhone() || !inKorea(it)) return mapLink(p, it, trip);
    const start = from && inKorea(from) ? nPoint("s", from) : []; // no start: the app starts from where you are
    return nmap(`route/${nMode(trip)}`, [...start, ...nPoint("d", it)]);
  }
  const q = new URLSearchParams({ api: "1", destination: gLoc(it, trip), travelmode: gMode(trip) });
  if (from && (from.place || hasGeo(from))) q.set("origin", gLoc(from, trip));
  return "https://www.google.com/maps/dir/?" + q.toString();
}

/** Whole-day route; Google allows 3 waypoints on phones, Kakao 1, Naver 5, so long days are split. Pass routeProvider(p). */
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
  if (p === "naver" && onPhone()) {
    const stops = list.filter(inKorea);
    const out: string[] = [];
    for (let i = 0; i < stops.length - 1; i += 6) {
      const seg = stops.slice(i, i + 7); // start, up to 5 stops, end
      if (seg.length < 2) break;
      const via = seg.slice(1, -1).flatMap((s, k) => nPoint(`v${k + 1}`, s));
      out.push(nmap(`route/${nMode(trip)}`, [...nPoint("s", seg[0]), ...nPoint("d", seg[seg.length - 1]), ...via]));
    }
    return out;
  }
  return [];
}
