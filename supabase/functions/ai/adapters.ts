/**
 * The app speaks Claude's Messages format (system, messages with text/tool_use/tool_result/image blocks, tools).
 * These adapters turn that into OpenAI Chat Completions or Gemini generateContent requests,
 * and turn their answers back into Claude-shaped replies, so the app's tool loop works with any of them.
 * Pure functions: no network, no Deno APIs (tested under Node).
 */

export type Block =
  | { type: "text"; text: string; gemini_sig?: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown>; gemini_sig?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
export interface Msg { role: "user" | "assistant"; content: string | Block[] }
export interface Tool { name: string; description?: string; input_schema: Record<string, unknown> }
export interface Req { system?: string | { type: "text"; text: string }[]; messages: Msg[]; tools?: Tool[]; max_tokens: number }
export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface Reply { content: Block[]; stop_reason: "end_turn" | "tool_use" | "max_tokens"; usage: Usage }

export const systemText = (s: Req["system"]) => (typeof s === "string" ? s : (s ?? []).map((b) => b.text).join("\n\n"));
const blocks = (c: Msg["content"]): Block[] => (typeof c === "string" ? [{ type: "text", text: c }] : c);

// ---------- Claude ----------

/** Keeps only the fields Claude accepts (drops our gemini_sig etc.). */
export function toClaude(req: Req, model: string, guard: string) {
  const clean = (b: Block): Record<string, unknown> => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} };
    if (b.type === "tool_result") return { type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, ...(b.is_error ? { is_error: true } : {}) };
    return { type: "image", source: b.source };
  };
  const sys = typeof req.system === "string" ? [{ type: "text", text: req.system }] : (req.system ?? []);
  const tools = (req.tools ?? []).map((t, i, all) => ({ name: t.name, description: t.description, input_schema: t.input_schema, ...(i === all.length - 1 ? { cache_control: { type: "ephemeral" } } : {}) }));
  return {
    model,
    max_tokens: req.max_tokens,
    system: [...(guard ? [{ type: "text", text: guard }] : []), ...sys],
    ...(tools.length ? { tools } : {}),
    messages: req.messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content.map(clean) })),
  };
}

export function fromClaude(data: any): Reply {
  const u = data?.usage ?? {};
  return {
    content: (data?.content ?? []).filter((b: any) => b.type === "text" || b.type === "tool_use"),
    stop_reason: data?.stop_reason === "tool_use" ? "tool_use" : data?.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
    usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
  };
}

// ---------- OpenAI (Chat Completions) ----------

export function toOpenAI(req: Req, model: string, guard: string) {
  const messages: any[] = [{ role: "system", content: [guard, systemText(req.system)].filter(Boolean).join("\n\n") }];
  for (const m of req.messages) {
    const bs = blocks(m.content);
    if (m.role === "assistant") {
      const text = bs.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");
      const calls = bs.filter((b) => b.type === "tool_use").map((b: any) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      messages.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const b of bs) if (b.type === "tool_result") messages.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.content });
    const parts = bs.flatMap((b): any[] =>
      b.type === "text" ? [{ type: "text", text: b.text }] : b.type === "image" ? [{ type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } }] : [],
    );
    if (parts.length) messages.push({ role: "user", content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts });
  }
  const tools = (req.tools ?? []).map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema } }));
  return { model, messages, max_completion_tokens: req.max_tokens, ...(tools.length ? { tools } : {}) };
}

export function fromOpenAI(data: any): Reply {
  const ch = data?.choices?.[0] ?? {};
  const msg = ch.message ?? {};
  const content: Block[] = [];
  if (typeof msg.content === "string" && msg.content.trim()) content.push({ type: "text", text: msg.content });
  for (const c of msg.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(c.function?.arguments || "{}"); } catch { /* leave empty; the app reports a tool error */ }
    content.push({ type: "tool_use", id: c.id, name: c.function?.name, input });
  }
  const u = data?.usage ?? {};
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    content,
    stop_reason: (msg.tool_calls ?? []).length ? "tool_use" : ch.finish_reason === "length" ? "max_tokens" : "end_turn",
    usage: { input: (u.prompt_tokens ?? 0) - cached, output: u.completion_tokens ?? 0, cacheRead: cached, cacheWrite: 0 },
  };
}

// ---------- Gemini (generateContent) ----------

const GEMINI_KEYS = new Set(["type", "description", "properties", "items", "enum", "required", "nullable", "format", "minimum", "maximum", "minItems", "maxItems"]);
/** Gemini takes an OpenAPI subset: drop keywords it rejects (e.g. additionalProperties). */
export function geminiSchema(s: any): any {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== "object") return s;
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (!GEMINI_KEYS.has(k)) continue;
    if (k === "properties") out.properties = Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, geminiSchema(pv)]));
    else if (k === "items") out.items = geminiSchema(v);
    else out[k] = v;
  }
  return out;
}

export function toGemini(req: Req, guard: string, maxTokens = req.max_tokens) {
  const names = new Map<string, string>(); // tool_use id -> tool name (Gemini answers by name)
  const contents: any[] = [];
  for (const m of req.messages) {
    const parts: any[] = [];
    for (const b of blocks(m.content)) {
      if (b.type === "text") { if (b.text) parts.push({ text: b.text, ...(b.gemini_sig ? { thoughtSignature: b.gemini_sig } : {}) }); }
      else if (b.type === "image") parts.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
      else if (b.type === "tool_use") {
        names.set(b.id, b.name);
        parts.push({ functionCall: { name: b.name, args: b.input ?? {} }, ...(b.gemini_sig ? { thoughtSignature: b.gemini_sig } : {}) });
      } else if (b.type === "tool_result") {
        let result: unknown = b.content;
        try { result = JSON.parse(b.content); } catch { /* plain text */ }
        parts.push({ functionResponse: { name: names.get(b.tool_use_id) ?? "tool", response: b.is_error ? { error: b.content } : { result } } });
      }
    }
    if (parts.length) contents.push({ role: m.role === "assistant" ? "model" : "user", parts });
  }
  const tools = req.tools?.length ? [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description ?? "", parameters: geminiSchema(t.input_schema) })) }] : undefined;
  return {
    systemInstruction: { parts: [{ text: [guard, systemText(req.system)].filter(Boolean).join("\n\n") }] },
    contents,
    ...(tools ? { tools } : {}),
    generationConfig: { maxOutputTokens: maxTokens },
  };
}

export function fromGemini(data: any): Reply {
  const cand = data?.candidates?.[0] ?? {};
  const content: Block[] = [];
  let n = 0;
  for (const p of cand.content?.parts ?? []) {
    if (p.thought) continue; // thinking summaries are not answers
    if (typeof p.text === "string" && p.text) content.push({ type: "text", text: p.text, ...(p.thoughtSignature ? { gemini_sig: p.thoughtSignature } : {}) });
    if (p.functionCall) content.push({ type: "tool_use", id: p.functionCall.id || `gm_${Date.now().toString(36)}_${n++}`, name: p.functionCall.name, input: p.functionCall.args ?? {}, ...(p.thoughtSignature ? { gemini_sig: p.thoughtSignature } : {}) });
  }
  const u = data?.usageMetadata ?? {};
  const cached = u.cachedContentTokenCount ?? 0;
  return {
    content,
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : cand.finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn",
    usage: { input: (u.promptTokenCount ?? 0) - cached, output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), cacheRead: cached, cacheWrite: 0 },
  };
}

// ---------- cost ----------

/** USD for one call. prices = [per 1M input, per 1M output]; cache reads ≈10%, cache writes ≈125% of input. */
export function costOf(u: Usage, price?: [number, number] | null): number {
  if (!price) return 0;
  const [pin, pout] = price;
  return (u.input * pin + u.cacheRead * pin * 0.1 + u.cacheWrite * pin * 1.25 + u.output * pout) / 1e6;
}
