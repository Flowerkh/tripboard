import { useSyncExternalStore } from "react";
import { uid } from "./dates";
import { buildSamples } from "./sample";
import type { ChatMsg, Item, Settings, Trip } from "./types";

const KEY = "tripboard:v1";

export interface Draft { trip: Trip; items: Item[] }
export interface Pending { draft: Draft; before: Draft; changes: string[]; msgId: string }
export interface Run {
  tripId: string;
  kind: "plan" | "chat" | "recs" | "flights" | "geo";
  status: string;
  startedAt: number;
  stage: number; // plan progress: 0 thinking, 1 trip info saved, 2 items added
  error?: string;
}

export interface State {
  trips: Trip[];
  items: Item[];
  chats: Record<string, ChatMsg[]>;
  settings: Settings;
  undo: Record<string, { msgId: string; before: Draft }>;
  pending: Record<string, Pending>;
  run: Run | null;
  toast: string | null;
  /** signed-in Kakao account (null = not signed in, undefined = still checking) */
  user: Account | null | undefined;
  /** what is already in the account, per trip (saved on this device) */
  cloud: CloudMeta;
  sync: SyncStatus;
  /** what the signed-in member may use (from the server); null when signed out or not loaded */
  ai: AiStatus | null;
}

export interface AiStatus {
  providers: { id: "claude" | "gemini" | "openai"; label: string }[];
  default_provider: string;
  daily_limit: number;
  monthly_limit: number;
  used_today: number;
  used_month: number;
  paused: boolean;
  is_admin: boolean;
}

export interface Account {
  id: string;
  name: string;
  avatar: string;
  /** false when Kakao gave no nickname and none was set in the app ("카카오 사용자") */
  named: boolean;
}
export interface CloudMeta {
  userId: string;
  /** fingerprint + server time of the version both sides agree on */
  trips: Record<string, { sig: string; at: string }>;
  /** trips deleted here that still need deleting in the account */
  deleted: string[];
}
export interface SyncStatus { state: "idle" | "syncing" | "error"; at?: number; error?: string }
export const EMPTY_CLOUD: CloudMeta = { userId: "", trips: {}, deleted: [] };

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  domesticMap: "kakao",
  aiProvider: "",
  confirmAI: false,
};

function load(): State {
  let saved: Partial<State> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = JSON.parse(raw);
  } catch {
    /* storage can be unavailable; start fresh */
  }
  return {
    trips: saved.trips ?? [],
    items: saved.items ?? [],
    chats: saved.chats ?? {},
    // older versions kept an API key and model names here; drop them so the key leaves this device
    settings: (() => {
      const { apiKey: _k, proxyUrl: _p, planModel: _m1, editModel: _m2, ...rest } = (saved.settings ?? {}) as Partial<Settings> & Record<string, unknown>;
      return { ...DEFAULT_SETTINGS, ...rest } as Settings;
    })(),
    undo: {},
    pending: {},
    run: null,
    toast: null,
    user: undefined,
    cloud: { ...EMPTY_CLOUD, ...(saved.cloud ?? {}) },
    sync: { state: "idle" },
    ai: null,
  };
}

let state: State = load();
const subs = new Set<() => void>();
let saveTimer = 0;

function save() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    const { trips, items, chats, settings, cloud } = state;
    localStorage.setItem(KEY, JSON.stringify({ trips, items, chats, settings, cloud }));
  } catch {
    /* quota or private mode: keep working in memory */
  }
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 150);
}
// a change made just before the tab closes or reloads is not lost
window.addEventListener("pagehide", () => saveTimer && save());

export function getState(): State {
  return state;
}
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  persist();
  subs.forEach((f) => f());
}
export function subscribe(fn: () => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}
export function useApp(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

/* ---------- actions ---------- */
let toastTimer = 0;
export function toast(msg: string) {
  setState({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => setState({ toast: null }), 3000);
}

export function createTrip(t: Omit<Trip, "id" | "createdAt">): string {
  const id = uid("t");
  setState((s) => ({ trips: [...s.trips, { ...t, id, createdAt: Date.now() }] }));
  return id;
}
/** Saves a copy of someone else's shared trip as a new trip of your own. */
export function importTrip(trip: Omit<Trip, "id" | "createdAt" | "share">, items: Omit<Item, "id" | "tripId">[]): string {
  const id = createTrip(trip);
  const made = items.map((it, k) => ({ ...it, id: uid("i"), tripId: id, done: false, order: Date.now() + k }));
  setState((s) => ({ items: [...s.items, ...made] }));
  return id;
}
export function updateTrip(id: string, patch: Partial<Trip>) {
  setState((s) => ({ trips: s.trips.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
}
export function deleteTrip(id: string) {
  setState((s) => {
    const chats = { ...s.chats };
    delete chats[id];
    return { trips: s.trips.filter((t) => t.id !== id), items: s.items.filter((i) => i.tripId !== id), chats };
  });
}
export function upsertItem(item: Item) {
  setState((s) => {
    const exists = s.items.some((i) => i.id === item.id);
    return { items: exists ? s.items.map((i) => (i.id === item.id ? item : i)) : [...s.items, item] };
  });
}
export function deleteItem(id: string) {
  setState((s) => ({ items: s.items.filter((i) => i.id !== id) }));
}
export function toggleDone(id: string) {
  setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }));
}
export function addChat(tripId: string, msg: Omit<ChatMsg, "id" | "at">): string {
  const id = uid("m");
  setState((s) => {
    const list = [...(s.chats[tripId] ?? []), { ...msg, id, at: Date.now() }].slice(-80);
    return { chats: { ...s.chats, [tripId]: list } };
  });
  return id;
}
export function markChats(tripId: string, ids: string[], patch: Partial<ChatMsg>) {
  setState((s) => ({ chats: { ...s.chats, [tripId]: (s.chats[tripId] ?? []).map((m) => (ids.includes(m.id) ? { ...m, ...patch } : m)) } }));
}
export function snapshot(tripId: string): Draft {
  const s = getState();
  const trip = s.trips.find((t) => t.id === tripId)!;
  return { trip: structuredClone(trip), items: structuredClone(s.items.filter((i) => i.tripId === tripId)) };
}
/** Replace a trip and its items with a draft, remembering what was there for undo. */
export function commitDraft(tripId: string, draft: Draft, before: Draft, msgId: string) {
  setState((s) => ({
    // keep the live share info: it may have been created or synced after the draft was copied
    trips: s.trips.map((t) => (t.id === tripId ? { ...draft.trip, share: t.share } : t)),
    items: [...s.items.filter((i) => i.tripId !== tripId), ...draft.items],
    undo: { ...s.undo, [tripId]: { msgId, before } },
  }));
}
export function undoLast(tripId: string) {
  const u = getState().undo[tripId];
  if (!u) return;
  setState((s) => {
    const undo = { ...s.undo };
    delete undo[tripId];
    return {
      trips: s.trips.map((t) => (t.id === tripId ? { ...u.before.trip, share: t.share } : t)),
      items: [...s.items.filter((i) => i.tripId !== tripId), ...u.before.items],
      undo,
    };
  });
  addChat(tripId, { role: "note", text: "방금 AI가 바꾼 내용을 되돌렸어요." });
  toast("되돌렸어요");
}
export function setPending(tripId: string, p: Pending | null) {
  setState((s) => {
    const pending = { ...s.pending };
    if (p) pending[tripId] = p;
    else delete pending[tripId];
    return { pending };
  });
}
export function setSettings(patch: Partial<Settings>) {
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
}
export function loadSamples() {
  const { trips, items } = buildSamples();
  setState((s) => ({
    trips: [...s.trips.filter((t) => !trips.some((x) => x.id === t.id)), ...trips],
    items: [...s.items.filter((i) => !trips.some((x) => x.id === i.tripId)), ...items],
  }));
  toast("샘플 여행 2개를 넣었어요");
}
export function resetAll() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  // keep the account: trips deleted here are then deleted in the account too
  state = { ...load(), settings: { ...DEFAULT_SETTINGS, aiProvider: state.settings.aiProvider }, user: state.user, cloud: state.cloud, ai: state.ai };
  persist();
  subs.forEach((f) => f());
}

/** Sign-out: remove this account's trips from the device (they stay in the account). */
export function clearAccountData() {
  setState({ trips: [], items: [], chats: {}, undo: {}, pending: {}, run: null, cloud: { ...EMPTY_CLOUD }, sync: { state: "idle" }, ai: null });
}
