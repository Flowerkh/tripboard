/**
 * Minimal Claude Messages API client for the browser.
 *
 * For testing, the key is typed into Settings and kept in this browser only.
 * Never ship an app with a key inside it: for the Android/production build,
 * send these same requests through your own server (see README).
 */
const API = "https://api.anthropic.com/v1/messages";

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
export interface Msg { role: "user" | "assistant"; content: string | Block[] }

export class AiError extends Error {}

function explain(status: number, body: string): string {
  let detail = "";
  try { detail = JSON.parse(body)?.error?.message ?? ""; } catch { /* not JSON */ }
  if (status === 401) return "API 키가 맞지 않아요. 설정에서 다시 넣어 주세요.";
  if (status === 403) return "이 API 키로는 이 요청을 쓸 수 없어요.";
  if (status === 404) return "모델을 찾을 수 없어요. 설정에서 모델을 다시 골라 주세요.";
  if (status === 429) return "요청이 너무 많아요. 잠시 뒤에 다시 해 주세요.";
  if (status === 529 || status >= 500) return "Claude 서버가 바빠요. 잠시 뒤에 다시 해 주세요.";
  if (/credit|balance/i.test(detail)) return "API 크레딧이 부족해요. Claude 콘솔에서 결제 정보를 확인해 주세요.";
  return detail ? `요청이 거절됐어요: ${detail}` : `요청이 실패했어요 (${status}).`;
}

/** Either a personal key (testing in the browser) or your own server that holds the key. */
export interface Conn { apiKey: string; proxyUrl: string }

async function call(conn: Conn, body: Record<string, unknown>, signal?: AbortSignal) {
  let res: Response;
  const viaProxy = !!conn.proxyUrl.trim();
  try {
    res = await fetch(viaProxy ? conn.proxyUrl.trim() : API, {
      method: "POST",
      signal,
      headers: viaProxy
        ? { "content-type": "application/json" }
        : {
            "content-type": "application/json",
            "x-api-key": conn.apiKey.trim(),
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new AiError("인터넷 연결을 확인해 주세요.");
  }
  const text = await res.text();
  if (!res.ok) throw new AiError(explain(res.status, text));
  return JSON.parse(text) as { content: Block[]; stop_reason: string; usage?: Record<string, number> };
}

export interface AgentOpts {
  conn: Conn;
  model: string;
  system: string;
  context: string;
  messages: Msg[];
  tools: { name: string; description: string; input_schema: unknown }[];
  run: Record<string, (input: Record<string, unknown>) => unknown>;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Calls Claude, runs the tools it asks for, and repeats until it answers in text. */
export async function runAgent(o: AgentOpts): Promise<string> {
  const msgs: Msg[] = [...o.messages];
  // Rules and tool definitions never change, so they are cached; the trip context changes every turn.
  const tools = o.tools.map((t, i) => (i === o.tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t));
  const system = [
    { type: "text", text: o.system, cache_control: { type: "ephemeral" } },
    { type: "text", text: o.context },
  ];
  const texts: string[] = [];
  for (let round = 0; round < 6; round++) {
    const data = await call(o.conn, { model: o.model, max_tokens: o.maxTokens ?? 4000, system, tools, messages: msgs }, o.signal);
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
export async function readTicket(conn: Conn, model: string, file: File, prompt: string, signal?: AbortSignal) {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new AiError("이미지를 읽지 못했어요."));
    r.readAsDataURL(file);
  });
  const media = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) ? file.type : "image/jpeg";
  const res = await call(conn, {
    model,
    max_tokens: 600,
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: media, data } }, { type: "text", text: prompt }] }],
  }, signal);
  const text = res.content.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("\n");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new AiError("항공권에서 정보를 찾지 못했어요. 직접 넣어 주세요.");
  return JSON.parse(m[0]) as { out?: Record<string, string>; back?: Record<string, string> };
}
