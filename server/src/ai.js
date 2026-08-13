/**
 * Server-side LLM proxy (OpenAI-compatible).
 * Prefers SpaceXAI / xAI: XAI_API_KEY + https://api.x.ai/v1
 * Optional overrides: LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
 */

const XAI_BASE = "https://api.x.ai/v1";
const DEFAULT_MODEL = process.env.LLM_MODEL || "grok-4.5";

export function getLlmConfig() {
  const apiKey = (
    process.env.XAI_API_KEY ||
    process.env.LLM_API_KEY ||
    process.env.GROQ_API_KEY ||
    ""
  ).trim();
  const baseUrl = (
    process.env.LLM_BASE_URL ||
    (process.env.XAI_API_KEY ? XAI_BASE : "") ||
    "https://api.x.ai/v1"
  )
    .trim()
    .replace(/\/$/, "");
  const model = (process.env.LLM_MODEL || DEFAULT_MODEL).trim();
  return {
    configured: Boolean(apiKey && apiKey.length > 8),
    baseUrl,
    model,
    provider: process.env.XAI_API_KEY
      ? "xai"
      : process.env.GROQ_API_KEY
        ? "groq"
        : process.env.LLM_API_KEY
          ? "custom"
          : "none",
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
      "AI not configured. Add XAI_API_KEY to server/.env (https://console.x.ai)"
    );
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }

  const apiKey = (
    process.env.XAI_API_KEY ||
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
