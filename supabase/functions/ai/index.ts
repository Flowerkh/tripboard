/**
 * Tripboard AI server (Supabase Edge Function "ai").
 *
 * Members never hold API keys. The app sends Claude-format requests here with the member's login token;
 * this function checks the login, the member's limits and the chat filter, calls the AI the member chose
 * (Claude, Gemini or OpenAI, with the key the admin registered), falls back to another AI if that fails,
 * logs tokens and cost in ai_usage, and answers in Claude format.
 *
 * Actions:
 *   messages     — one round of the app's tool loop
 *   check_key    — admin: test a provider key (lists its models)
 *   list_models  — admin: model ids the key can use
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { costOf, fromClaude, fromGemini, fromOpenAI, toClaude, toGemini, toOpenAI, type Reply, type Req } from "./adapters.ts";
import { check, GUARD, OFF_MARK, type FilterConfig } from "./filter.ts";

const SECRET = (() => {
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default as string | undefined; } catch { return undefined; }
})() ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(Deno.env.get("SUPABASE_URL")!, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });

/** feature -> which model slot it uses and the most it may write */
const FEATURES: Record<string, { slot: string; max: number }> = {
  plan: { slot: "plan", max: 16000 },
  day: { slot: "plan", max: 16000 },
  chat: { slot: "chat", max: 1500 },
  geo: { slot: "geo", max: 4000 },
  recs: { slot: "recs", max: 4000 },
  ticket: { slot: "ticket", max: 600 },
};

interface Provider {
  id: "claude" | "openai" | "gemini"; label: string; sort: number; enabled: boolean; api_key: string | null;
  status: string; models: Record<string, string>; prices: Record<string, [number, number]>;
}

class AiFail extends Error {
  constructor(msg: string, public keyProblem = false) { super(msg); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth, error: authErr } = token ? await db.auth.getUser(token) : { data: null, error: true };
  if (authErr || !auth?.user) return json({ code: "login", error: "카카오로 로그인하면 AI를 쓸 수 있어요." }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "요청을 읽지 못했어요." }, 400); }
  try {
    if (body.action === "check_key" || body.action === "list_models") return await adminAction(auth.user.id, body);
    if (body.action === "messages") return await messages(auth.user.id, body);
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ code: "server", error: `서버 오류: ${(e as Error).message}` }, 500);
  }
});

async function messages(uid: string, body: any) {
  const feature = FEATURES[body.feature];
  if (!feature || !body.body?.messages) return json({ error: "잘못된 요청이에요." }, 400);
  const first = !body.round;
  const requestId = String(body.request_id ?? crypto.randomUUID()).slice(0, 64);
  const userText = typeof body.user_text === "string" ? body.user_text.slice(0, 300) : "";

  const [sRes, lRes, pRes] = await Promise.all([
    db.from("ai_settings").select("*").eq("id", 1).single(),
    db.from("member_limits").select("*").eq("user_id", uid).maybeSingle(),
    db.from("ai_providers").select("*").order("sort"),
  ]);
  const settings = sRes.data as { default_provider: string; daily_limit: number; monthly_limit: number; filter: FilterConfig };
  const limits = lRes.data as { daily: number | null; monthly: number | null; paused: boolean } | null;
  const providers = (pRes.data ?? []) as Provider[];
  const log = (row: Record<string, unknown>) =>
    db.from("ai_usage").insert({ user_id: uid, request_id: requestId, first_round: first, feature: body.feature, ...row }).then(({ error }) => error && console.error("log", error));

  if (first) {
    if (limits?.paused) {
      await log({ status: "limit", snippet: "AI 멈춤" });
      return json({ code: "paused", error: "관리자가 이 계정의 AI 사용을 멈췄어요." }, 403);
    }
    const { data: counts } = await db.rpc("usage_counts", { p_user: uid });
    const c = (Array.isArray(counts) ? counts[0] : counts) ?? { today: 0, month: 0 };
    const daily = limits?.daily ?? settings.daily_limit;
    const monthly = limits?.monthly ?? settings.monthly_limit;
    if (c.today >= daily) {
      await log({ status: "limit", snippet: `하루 ${daily}회` });
      return json({ code: "limit", error: `오늘 쓸 수 있는 AI ${daily}번을 다 썼어요. 내일 다시 쓸 수 있어요.` }, 429);
    }
    if (c.month >= monthly) {
      await log({ status: "limit", snippet: `한 달 ${monthly}회` });
      return json({ code: "limit", error: `이번 달 쓸 수 있는 AI ${monthly}번을 다 썼어요.` }, 429);
    }
    if (body.feature === "chat" && settings.filter?.stage1 && userText) {
      const hit = check(userText, settings.filter);
      if (hit) {
        await log({ status: "blocked_app", topic: hit.topic, snippet: userText.slice(0, 120) });
        return json({ blocked: true, reply: settings.filter.reply, topic: hit.topic });
      }
    }
  }

  const usable = providers.filter((p) => p.enabled && p.api_key && p.status !== "error" && p.models?.[feature.slot]);
  if (!usable.length) return json({ code: "no_ai", error: "아직 쓸 수 있는 AI가 없어요. 관리자에게 알려 주세요." }, 503);
  const rank = (p: Provider) => (p.id === body.provider ? 0 : p.id === settings.default_provider ? 1 : 2 + p.sort);
  const order = [...usable].sort((a, b) => rank(a) - rank(b)).slice(0, 2); // the chosen one, then one fallback

  const guard = body.feature === "chat" && settings.filter?.stage2 !== false ? GUARD : "";
  const req: Req = {
    system: body.body.system,
    messages: body.body.messages,
    tools: body.body.tools,
    max_tokens: Math.min(Number(body.body.max_tokens) || feature.max, feature.max),
  };
  let lastErr = "";
  for (const p of order) {
    const model = p.models[feature.slot];
    try {
      const reply = await callProvider(p, model, req, guard);
      const text = reply.content.filter((b) => b.type === "text").map((b: any) => b.text).join(" ").trim();
      const refused = body.feature === "chat" && text.startsWith(OFF_MARK);
      await log({
        provider: p.id, model,
        input_tokens: reply.usage.input, output_tokens: reply.usage.output, cache_read: reply.usage.cacheRead, cache_write: reply.usage.cacheWrite,
        cost_usd: Number(costOf(reply.usage, p.prices?.[model]).toFixed(6)),
        status: refused ? "blocked_ai" : "ok",
        ...(refused ? { topic: "(AI 판단)", snippet: userText.slice(0, 120) } : {}),
      });
      return json({ ...reply, provider: p.id, model, fallback: p.id !== order[0].id });
    } catch (e) {
      lastErr = (e as Error).message;
      if (e instanceof AiFail && e.keyProblem) {
        await db.from("ai_providers").update({ status: "error", status_note: lastErr.slice(0, 200), checked_at: new Date().toISOString() }).eq("id", p.id);
      }
    }
  }
  await log({ status: "error", snippet: lastErr.slice(0, 200) });
  return json({ code: "ai_error", error: `AI가 답하지 못했어요. ${lastErr}` }, 502);
}

async function fail(res: Response, label: string): Promise<never> {
  const text = await res.text().catch(() => "");
  let detail = "";
  try { const j = JSON.parse(text); detail = j?.error?.message ?? j?.message ?? ""; } catch { detail = text.slice(0, 120); }
  throw new AiFail(`${label} ${res.status}${detail ? ` · ${detail}` : ""}`, res.status === 401 || res.status === 403);
}

async function callProvider(p: Provider, model: string, req: Req, guard: string): Promise<Reply> {
  const signal = AbortSignal.timeout(140_000);
  if (p.id === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "x-api-key": p.api_key!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(toClaude(req, model, guard)),
    });
    if (!res.ok) await fail(res, "Claude");
    return fromClaude(await res.json());
  }
  if (p.id === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal,
      headers: { authorization: `Bearer ${p.api_key}`, "content-type": "application/json" },
      body: JSON.stringify(toOpenAI(req, model, guard)),
    });
    if (!res.ok) await fail(res, "OpenAI");
    return fromOpenAI(await res.json());
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ""))}:generateContent`, {
    method: "POST", signal,
    headers: { "x-goog-api-key": p.api_key!, "content-type": "application/json" },
    body: JSON.stringify(toGemini(req, guard)),
  });
  if (!res.ok) await fail(res, "Gemini");
  return fromGemini(await res.json());
}

async function listModels(p: Provider): Promise<string[]> {
  const signal = AbortSignal.timeout(20_000);
  if (p.id === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", { signal, headers: { "x-api-key": p.api_key!, "anthropic-version": "2023-06-01" } });
    if (!res.ok) await fail(res, "Claude");
    return ((await res.json()).data ?? []).map((m: any) => m.id);
  }
  if (p.id === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", { signal, headers: { authorization: `Bearer ${p.api_key}` } });
    if (!res.ok) await fail(res, "OpenAI");
    return ((await res.json()).data ?? []).map((m: any) => m.id).filter((id: string) => /^(gpt|o\d|chatgpt)/.test(id)).sort().reverse();
  }
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { signal, headers: { "x-goog-api-key": p.api_key! } });
  if (!res.ok) await fail(res, "Gemini");
  return ((await res.json()).models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m: any) => String(m.name).replace(/^models\//, ""));
}

async function adminAction(uid: string, body: any) {
  const { data: admin } = await db.from("admins").select("user_id").eq("user_id", uid).maybeSingle();
  if (!admin) return json({ error: "관리자만 할 수 있어요." }, 403);
  const { data: p } = await db.from("ai_providers").select("*").eq("id", body.provider).maybeSingle();
  if (!p) return json({ error: "알 수 없는 AI예요." }, 400);
  if (!p.api_key) return json({ ok: false, error: "등록된 키가 없어요." }, 400);
  try {
    const models = await listModels(p as Provider);
    if (body.action === "check_key") {
      await db.from("ai_providers").update({ status: "ok", status_note: `모델 ${models.length}개 확인`, checked_at: new Date().toISOString() }).eq("id", p.id);
    }
    return json({ ok: true, models });
  } catch (e) {
    const msg = (e as Error).message;
    await db.from("ai_providers").update({ status: "error", status_note: msg.slice(0, 200), checked_at: new Date().toISOString() }).eq("id", p.id);
    return json({ ok: false, error: msg });
  }
}
