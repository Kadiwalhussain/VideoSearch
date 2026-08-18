/**
 * Server-side LLM proxy (OpenAI-compatible).
 * Supports:
 *  - Mistral: LLM_API_KEY + https://api.mistral.ai/v1
 *  - xAI: XAI_API_KEY + https://api.x.ai/v1
 *  - Groq / custom OpenAI-compatible hosts
 */

const XAI_BASE = "https://api.x.ai/v1";
const MISTRAL_BASE = "https://api.mistral.ai/v1";

export function getLlmConfig() {
  const xai = (process.env.XAI_API_KEY || "").trim();
  const groq = (process.env.GROQ_API_KEY || "").trim();
  const llm = (process.env.LLM_API_KEY || "").trim();
  const mistralEnv = (process.env.MISTRAL_API_KEY || "").trim();

  const apiKey = xai || mistralEnv || llm || groq;
  let baseUrl = (process.env.LLM_BASE_URL || "").trim().replace(/\/$/, "");
  let provider = "none";
  let defaultModel = "mistral-small-latest";

  if (xai) {
    provider = "xai";
    baseUrl = baseUrl || XAI_BASE;
    defaultModel = "grok-4.5";
  } else if (mistralEnv || (llm && /mistral/i.test(baseUrl || ""))) {
    provider = "mistral";
    baseUrl = baseUrl || MISTRAL_BASE;
    defaultModel = "mistral-small-latest";
  } else if (groq) {
    provider = "groq";
    baseUrl = baseUrl || "https://api.groq.com/openai/v1";
    defaultModel = "llama-3.3-70b-versatile";
  } else if (llm) {
    provider = "custom";
    baseUrl = baseUrl || MISTRAL_BASE;
  }

  const model = (process.env.LLM_MODEL || defaultModel).trim();

  return {
    configured: Boolean(apiKey && apiKey.length > 8 && baseUrl),
    baseUrl,
    model,
    provider,
  };
}

/**
 * Chat completions via server key. Returns assistant text.
 * @param {{ messages: Array<{role:string,content:string}>, temperature?: number, max_tokens?: number, model?: string }} opts
 */
export async function serverChatCompletions(opts) {
  const cfg = getLlmConfig();
  if (!cfg.configured) {
    const err = new Error(
      "AI not configured. Set MISTRAL_API_KEY or LLM_API_KEY + LLM_BASE_URL in server/.env"
    );
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }

  const apiKey = (
    process.env.XAI_API_KEY ||
    process.env.MISTRAL_API_KEY ||
    process.env.LLM_API_KEY ||
    process.env.GROQ_API_KEY ||
    ""
  ).trim();

  const model = opts.model || cfg.model;
  const url = `${cfg.baseUrl}/chat/completions`;
  const body = {
    model,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? 1200,
    messages: opts.messages,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      text?.slice(0, 200) ||
      `LLM HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = "AI_UPSTREAM";
    throw err;
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty model response");
  }
  return {
    content,
    model,
    provider: cfg.provider,
    usage: data.usage || null,
  };
}

/**
 * Build a compact vault context string for RAG-style Q&A (no base64 images).
 */
export function buildVaultSearchContext(rows, maxChars = 14000) {
  const lines = [];
  for (const r of rows || []) {
    const title = r.videoTitle || r.videoId;
    const ch = r.channelTitle ? ` | channel: ${r.channelTitle}` : "";
    lines.push(`VIDEO id=${r.videoId} title="${title}"${ch}`);
    for (const h of r.highlights || []) {
      const note = (h.note || "").trim();
      const t = Math.floor(Number(h.startTime) || 0);
      if (note) lines.push(`  MARK t=${t}s id=${h.id || ""}: ${note.slice(0, 240)}`);
      else lines.push(`  MARK t=${t}s id=${h.id || ""} (no text)`);
    }
    for (const s of r.screenshots || []) {
      const note = (s.note || "").trim();
      const t = Math.floor(Number(s.videoTime) || 0);
      if (note) lines.push(`  SHOT t=${t}s: ${note.slice(0, 160)}`);
      else lines.push(`  SHOT t=${t}s`);
    }
  }
  let out = lines.join("\n");
  if (out.length > maxChars) out = out.slice(0, maxChars) + "\n…[truncated]";
  return out;
}
