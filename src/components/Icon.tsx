import type { IconName } from "../lib/types";

const P = {
  back: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7",
  sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  nav: "M12 3l7 18-7-4-7 4 7-18z",
  locate: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 2v2M12 20v2M2 12h2M20 12h2",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z",
  mic: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  send: "M4 12l16-8-6 16-3-6zM11 14l9-10",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  leaf: "M5 19C5 11 10 5 19 5c0 9-6 14-14 14zM5 19l7-7",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  edit: "M4 20h4L19 9l-4-4L4 16z",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  stop: "M7 7h10v10H7z",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  rain: "M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 0 7zM8 18l-1 2M12 18l-1 2M16 18l-1 2",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  chat: "M4 5h16v11H9l-5 4z",
  key: "M14 10a4 4 0 1 0-3.9 4L8 16H6v2H4v2H2v-3l6.1-6.1A4 4 0 0 0 14 10zM15.5 8.5h.01",
  // item categories
  flight: "M22 12l-3-1h-5L9 4H7.5l2.5 7H5L3 8H2l1 4-1 4h1l2-3h5l-2.5 7H9l5-7h5z",
  train: "M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 10h14M9 21l1.5-4M15 21l-1.5-4",
  car: "M5 17h14v-5l-2-5H7l-2 5zM5 12h14M7 17v2M17 17v2",
  bus: "M6 3h12a1 1 0 0 1 1 1v13H5V4a1 1 0 0 1 1-1zM5 10h14M8 17v3M16 17v3",
  walk: "M12 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 21l1.5-6 2.5 2v4M8 12l2-4h3l2 3 2 1M11.5 15L10 8",
  food: "M7 3v7M5 3v4a2 2 0 0 0 4 0V3M7 10v11M17 21V3c-2 1.5-3 4-3 7h3",
  cafe: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3",
  shop: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
  sight: "M4 21h16M6 21V10M18 21V10M10 21v-5h4v5M4 10l8-6 8 6",
  nature: "M5 19C5 11 10 5 19 5c0 9-6 14-14 14zM5 19l7-7",
  beach: "M3 10c2 0 2-1.5 4.5-1.5S9.5 10 12 10s2.5-1.5 4.5-1.5S19 10 21 10M3 15c2 0 2-1.5 4.5-1.5S9.5 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15",
  night: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  stay: "M3 19V6M3 14h18v5M21 14v-2a3 3 0 0 0-3-3h-7v5M7 12.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  activity: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
} satisfies Record<string, string>;

export type IconKey = keyof typeof P | IconName;

export function Icon({ name, size = 20, stroke = 1.8, className, fill }: { name: IconKey; size?: number; stroke?: number; className?: string; fill?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={P[name as keyof typeof P] ?? P.pin} />
    </svg>
  );
}
