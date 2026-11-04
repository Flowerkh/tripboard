/** Admin data. Every table here is readable/writable only by admins (RLS); keys are only ever written, never read back. */
import { supabase } from "../lib/cloud";
import { SUPABASE_KEY, SUPABASE_URL } from "../lib/config";

export type ProviderId = "claude" | "gemini" | "openai";
export const FEATURES: [slot: string, label: string, hint: string][] = [
  ["plan", "일정 처음 짜기", "여행 전체를 한 번에 (최대 16,000토큰)"],
  ["chat", "대화로 고치기", "\"점심 바꿔줘\" 같은 말 (최대 1,500토큰)"],
  ["geo", "위치 채우기", "지도 좌표 넣기"],
  ["recs", "계절 추천", "이 계절에 좋은 곳"],
  ["ticket", "항공권 사진 읽기", "e-티켓에서 비행 정보"],
];

export interface UsageRow {
  at: string; user_id: string | null; request_id: string | null; first_round: boolean; feature: string; provider: string | null; model: string | null;
  input_tokens: number; output_tokens: number; cache_read: number; cache_write: number; cost_usd: number; status: string; topic: string | null; snippet: string | null;
}
export interface Member {
  user_id: string; name: string; avatar: string; created_at: string; last_sign_in_at: string | null; trips: number; shares: number;
  used_today: number; used_month: number; cost_month: number; daily: number | null; monthly: number | null; paused: boolean; is_admin: boolean;
  note: string; banned_until: string | null; ban_reason: string;
}
export interface Topic { name: string; on: boolean; words: string[] }
export interface FilterConfig { stage1: boolean; stage2: boolean; reply: string; topics: Topic[]; allow: string[] }
export interface Settings { default_provider: ProviderId; daily_limit: number; monthly_limit: number; budget_usd: number; filter: FilterConfig }
export interface Provider {
  id: ProviderId; label: string; sort: number; enabled: boolean; key_last4: string | null; status: "none" | "unchecked" | "ok" | "error";
  status_note: string | null; checked_at: string | null; models: Record<string, string>; prices: Record<string, [number, number]>;
}

const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export async function usageSince(since: Date): Promise<UsageRow[]> {
  const rows: UsageRow[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const page = must(await supabase.from("ai_usage")
      .select("at,user_id,request_id,first_round,feature,provider,model,input_tokens,output_tokens,cache_read,cache_write,cost_usd,status,topic,snippet")
      .gte("at", since.toISOString()).order("at").range(from, from + 999)) as UsageRow[];
    rows.push(...page.map((r) => ({ ...r, cost_usd: Number(r.cost_usd) })));
    if (page.length < 1000) break;
  }
  return rows;
}
export const memberUsage = async (uid: string) =>
  must(await supabase.from("ai_usage").select("at,feature,provider,model,input_tokens,output_tokens,cache_read,cache_write,cost_usd,status,topic,snippet,first_round")
    .eq("user_id", uid).order("at", { ascending: false }).limit(12)) as UsageRow[];
export const blockedLog = async () =>
  must(await supabase.from("ai_usage").select("at,user_id,status,topic,snippet").in("status", ["blocked_app", "blocked_ai"]).order("at", { ascending: false }).limit(30)) as UsageRow[];

export const members = async () => (must(await supabase.rpc("admin_members")) as Member[]).map((m) => ({ ...m, cost_month: Number(m.cost_month) }));
export async function saveLimits(uid: string, v: { daily: number | null; monthly: number | null; paused: boolean }) {
  must(await supabase.from("member_limits").upsert({ user_id: uid, ...v, updated_at: new Date().toISOString() }, { onConflict: "user_id" }));
}
export const resetMonth = async (uid: string) => must(await supabase.rpc("admin_reset_month", { p_user: uid }));
export async function saveNote(uid: string, note: string) {
  must(await supabase.from("member_limits").upsert({ user_id: uid, note: note.trim().slice(0, 300), updated_at: new Date().toISOString() }, { onConflict: "user_id" }));
}

/** Nickname, log out everywhere, ban, unban and delete need the Auth admin API: the "account" server function does them. */
export async function accountAction(action: "rename" | "sign_out" | "ban" | "unban" | "delete", userId: string, extra: Record<string, unknown> = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/account`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SUPABASE_KEY, authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ action, user_id: userId, ...extra }),
  }).catch(() => null);
  if (!res) throw new Error("서버에 연결하지 못했어요.");
  const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Record<string, unknown>;
  if (!res.ok || !out.ok) throw new Error(out.error ?? `오류 ${res.status}`);
  return out;
}

export const settings = async () => {
  const s = must(await supabase.from("ai_settings").select("default_provider,daily_limit,monthly_limit,budget_usd,filter").eq("id", 1).single()) as Settings;
  return { ...s, budget_usd: Number(s.budget_usd) };
};
export async function saveSettings(patch: Partial<Settings>) {
  must(await supabase.from("ai_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1));
}

export const providers = async () =>
  must(await supabase.from("ai_providers").select("id,label,sort,enabled,key_last4,status,status_note,checked_at,models,prices").order("sort")) as Provider[];
export async function saveProvider(id: ProviderId, patch: Partial<Pick<Provider, "enabled" | "models" | "prices">>) {
  must(await supabase.from("ai_providers").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
}
export const setKey = async (id: ProviderId, key: string) => must(await supabase.rpc("admin_set_key", { p_provider: id, p_key: key }));
export const clearKey = async (id: ProviderId) => must(await supabase.rpc("admin_clear_key", { p_provider: id }));

/** Asks the AI server to test a key / list the models it can use. */
export async function keyAction(action: "check_key" | "list_models", provider: ProviderId): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SUPABASE_KEY, authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ action, provider }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "AI 서버에 연결하지 못했어요." };
  return res.json().catch(() => ({ ok: false, error: `오류 ${res.status}` }));
}

// ---------- helpers ----------
export const money = (v: number) => (v >= 100 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2)}` : v > 0 ? `$${v.toFixed(3)}` : "$0");
export const big = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(n));
export const counted = (r: UsageRow) => r.first_round && (r.status === "ok" || r.status === "blocked_ai");
/** Start of today / this month in Korea time */
export function kstStart(kind: "day" | "month", daysBack = 0): Date {
  const now = new Date(Date.now() + 9 * 3600e3);
  const d = kind === "day" ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack) : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return new Date(d - 9 * 3600e3);
}
export const kstDayKey = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);
export const kstHour = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).getUTCHours();
export const shortWhen = (iso: string) => {
  const d = new Date(Date.parse(iso) + 9 * 3600e3);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
/** "11.11까지", or "무기한" for a ban with no end */
export const banLabel = (iso: string) => (new Date(iso).getUTCFullYear() - new Date().getUTCFullYear() > 50 ? "무기한" : `${shortWhen(iso).split(" ")[0]}까지`);
export const PROVIDER_COLOR: Record<string, string> = { gemini: "var(--s-gemini)", claude: "var(--s-claude)", openai: "var(--s-openai)" };
export const PROVIDER_LABEL: Record<string, string> = { claude: "Claude", gemini: "Gemini", openai: "OpenAI" };
