/**
 * AI client. The app no longer holds any API key: every request goes to the "ai" server function
 * (supabase/functions/ai) with the member's login token. The server checks limits and the filter,
 * calls the AI the member chose (Claude, Gemini or OpenAI) and answers in Claude's message format,
 * so the tool loop below is the same whichever AI answers.
 */
import { SUPABASE_KEY, SUPABASE_URL } from "../config";
import { supabase } from "../cloud";
import { OFF_MARK } from "./guard";

const FN = `${SUPABASE_URL}/functions/v1/ai`;

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
export interface Msg { role: "user" | "assistant"; content: string | Block[] }

export class AiError extends Error {
  constructor(message: string, public code = "") { super(message); }
}

export type Feature = "plan" | "day" | "chat" | "geo" | "recs" | "ticket";
export interface ServerReply { content: Block[]; stop_reason: string; provider?: string; model?: string; fallback?: boolean; blocked?: boolean; reply?: string }

/** Stops a request that hangs, so the app never waits forever. */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof AbortSignal.timeout !== "function" || !any) return signal;
  const t = AbortSignal.timeout(ms);
  return signal ? any([signal, t]) : t;
}

interface CallOpts { feature: Feature; provider: string; requestId: string; round: number; userText?: string; signal?: AbortSignal }

async function call(body: Record<string, unknown>, o: CallOpts): Promise<ServerReply> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) throw new AiError("카카오로 로그인하면 AI를 쓸 수 있어요.", "login");
  let res: Response;
  try {
    res = await fetch(FN, {
      method: "POST",
      signal: withTimeout(o.signal, 170_000),
      headers: { "content-type": "application/json", apikey: SUPABASE_KEY, authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "messages", feature: o.feature, provider: o.provider, request_id: o.requestId, round: o.round, user_text: o.userText, body }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError" && o.signal?.aborted) throw e;
    if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") throw new AiError("응답이 너무 오래 걸려서 멈췄어요. 다시 해 보세요.");
    throw new AiError("AI 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
  }
  let data: any = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new AiError(data.error || `AI 서버 오류예요 (${res.status}).`, data.code || "");
  return data as ServerReply;
}

export interface AgentOpts {
  feature: Feature;
  provider: string;
  system: string;
  context: string;
  messages: Msg[];
  tools: { name: string; description: string; input_schema: unknown }[];
  run: Record<string, (input: Record<string, unknown>) => unknown>;
  maxTokens?: number;
  userText?: string;
  signal?: AbortSignal;
  onReply?: (r: ServerReply) => void;
}

/** Calls the AI, runs the tools it asks for, and repeats until it answers in text. */
export async function runAgent(o: AgentOpts): Promise<string> {
  const msgs: Msg[] = [...o.messages];
  // Rules never change, so they are cached (Claude); the trip context changes every turn.
  const system = [
    { type: "text", text: o.system, cache_control: { type: "ephemeral" } },
    { type: "text", text: o.context },
  ];
  const requestId = crypto.randomUUID();
  const texts: string[] = [];
  for (let round = 0; round < 6; round++) {
    const data = await call(
      { system, tools: o.tools, messages: msgs, max_tokens: o.maxTokens ?? 1500 },
      { feature: o.feature, provider: o.provider, requestId, round, userText: o.userText, signal: o.signal },
    );
    if (data.blocked) return `${OFF_MARK} ${data.reply ?? ""}`; // stopped by the server's filter, no AI call
    o.onReply?.(data);
    msgs.push({ role: "assistant", content: data.content });
    for (const b of data.content) if (b.type === "text" && b.text.trim()) texts.push(b.text.trim());
    const uses = data.content.filter((b): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use");
    if (data.stop_reason !== "tool_use" || !uses.length) break;
    const results: Block[] = uses.map((u) => {
      const fn = o.run[u.name];
      try {
        if (!fn) throw new Error(`알 수 없는 도구: ${u.name}`);
        return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(fn(u.input ?? {}) ?? { ok: true }) };
      } catch (e) {
        return { type: "tool_result", tool_use_id: u.id, content: `Error: ${(e as Error).message}`, is_error: true };
      }
    });
    msgs.push({ role: "user", content: results });
  }
  return texts[texts.length - 1] ?? "";
}

/** Reads flight details from an e-ticket screenshot. */
export async function readTicket(provider: string, file: File, prompt: string, signal?: AbortSignal) {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new AiError("이미지를 읽지 못했어요."));
    r.readAsDataURL(file);
  });
  const media = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) ? file.type : "image/jpeg";
  const res = await call(
    { max_tokens: 600, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: media, data } }, { type: "text", text: prompt }] }] },
    { feature: "ticket", provider, requestId: crypto.randomUUID(), round: 0, signal },
  );
  const text = (res.content ?? []).filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new AiError("항공권에서 정보를 찾지 못했어요. 직접 넣어 주세요.");
  return JSON.parse(m[0]) as { out?: Record<string, string>; back?: Record<string, string> };
}
