import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Status } from "../lib/types";

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  n: number | string;
  status: Status;
  done?: boolean;
  role?: "now" | "next" | "later" | "past";
}
interface LatLng { lat: number; lng: number }

const COUNTRY_VIEW: Record<string, [number, number, number]> = {
  대한민국: [36.4, 127.9, 6], 일본: [36.2, 138.2, 5], 대만: [23.7, 121, 7], 베트남: [16, 107.8, 5], 태국: [15.8, 101, 5],
  필리핀: [12.9, 121.8, 5], 싱가포르: [1.35, 103.82, 11], 홍콩: [22.32, 114.17, 10], 미국: [39.8, -98.6, 3], 프랑스: [46.6, 2.2, 5],
};
export function fallbackView(country: string): [number, number, number] {
  return COUNTRY_VIEW[country] ?? [30, 120, 3];
}

export function MapView({
  pins, me, highlight, selectedId, onPin, fallback, interactive = true, route = true, className, label,
}: {
  pins: Pin[];
  me?: LatLng | null;
  highlight?: [LatLng, LatLng] | null;
  selectedId?: string | null;
  onPin?: (id: string) => void;
  fallback: [number, number, number];
  interactive?: boolean;
  route?: boolean;
  className?: string;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, {
      zoomControl: false,
      attributionControl: true,
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: false,
      keyboard: interactive,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, [interactive]);

  const key = JSON.stringify([pins, me, highlight, selectedId, fallback]);
  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts = pins.map((p) => L.latLng(p.lat, p.lng));
    if (route && pts.length > 1) L.polyline(pts, { className: "m-route", weight: 3, dashArray: "2 9", lineCap: "round", interactive: false }).addTo(g);
    if (highlight) L.polyline(highlight.map((h) => L.latLng(h.lat, h.lng)), { className: "m-hl", weight: 6, lineCap: "round", interactive: false }).addTo(g);
    pins.forEach((p) => {
      const cls = ["m-pin", `s-${p.status}`, p.done ? "done" : "", p.role ? `r-${p.role}` : "", selectedId === p.id ? "sel" : ""].join(" ");
      const size = p.role === "next" ? 34 : 28;
      const mk = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "", html: `<span class="${cls}">${p.n}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        keyboard: true,
        title: String(p.n),
        zIndexOffset: p.role === "next" || p.role === "now" ? 500 : 0,
      }).addTo(g);
      mk.on("click", () => onPinRef.current?.(p.id));
    });
    if (me) L.marker([me.lat, me.lng], { icon: L.divIcon({ className: "", html: '<span class="m-me"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, zIndexOffset: 800 }).addTo(g);
    const all = [...pts, ...(me ? [L.latLng(me.lat, me.lng)] : [])];
    if (all.length > 1) m.fitBounds(L.latLngBounds(all), { padding: [40, 40], maxZoom: 16 });
    else if (all.length === 1) m.setView(all[0], 15);
    else m.setView([fallback[0], fallback[1]], fallback[2]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={box} className={"map " + (className ?? "")} role="region" aria-label={label} />;
}
