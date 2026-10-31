export type Kind = "overseas" | "domestic";
export type Status = "confirmed" | "optional" | "check" | "todo";
export type IconName =
  | "flight" | "train" | "car" | "bus" | "walk"
  | "food" | "cafe" | "shop" | "sight" | "nature" | "beach" | "night"
  | "stay" | "activity" | "pin";

export interface Leg {
  mode: string; // "flight" | "KTX·기차" | "자차" | "고속버스" | "비행기"
  from: string;
  to: string;
  dep: string; // YYYY-MM-DDTHH:MM (local)
  arr: string;
  no?: string;
}

export interface Rec {
  id: string;
  title: string;
  why: string;
  icon: IconName;
  area: string;
}

export interface Trip {
  id: string;
  title: string;
  kind: Kind;
  country: string;
  city: string;
  start: string; // YYYY-MM-DD
  nights: number;
  season: string;
  origin: string;
  transport: string;
  companions: string;
  styles: string[];
  pace: string;
  memo: string;
  legs: { out?: Leg; back?: Leg };
  dayLabels: Record<string, string>;
  notice: string;
  recs: Rec[];
  createdAt: number;
}

export interface Item {
  id: string;
  tripId: string;
  day: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string;
  title: string;
  icon: IconName;
  status: Status;
  place: string;
  lat: number | null;
  lng: number | null;
  note: string;
  done: boolean;
  order: number;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "note";
  text: string;
  changes?: string[];
  at: number;
}

export type ThemePref = "system" | "light" | "dark";

export interface Settings {
  theme: ThemePref;
  domesticMap: "kakao" | "naver";
  apiKey: string;
  /** Your own server that forwards requests to Claude (for the Android app). Used instead of apiKey when set. */
  proxyUrl: string;
  planModel: string;
  editModel: string;
  confirmAI: boolean;
}

export const STATUS_LABEL: Record<Status, string> = {
  confirmed: "확정",
  optional: "선택",
  check: "확인 필요",
  todo: "미정",
};
