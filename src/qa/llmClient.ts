/**
 * Shared LLM client for Chat, Ask, and Topics.
 * Prefer vault server proxy (server XAI key) when signed in;
 * fall back to Settings key (browser-side OpenAI-compatible).
 */

import { loadCloudSettings } from "../settings/cloudSettings";
import { loadLlmSettings } from "../settings/llmSettings";
import { vaultHttp } from "../net/vaultHttp";

export type ChatMessageRole = "system" | "user" | "assistant";

export interface LlmChatMessage {
  role: ChatMessageRole;
  content: string;
}

export interface LlmChatResult {
  content: string;
  usedLlm: true;
  via: "vault" | "direct";
  model?: string;
  provider?: string;
}

/**
 * Run chat completions. Returns null if no AI is available.
 */
export async function llmChatCompletions(opts: {
  messages: LlmChatMessage[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
}): Promise<LlmChatResult | null> {
  // 1) Vault proxy (internal — best path)
  try {
    const cloud = await loadCloudSettings();
    if (cloud.enabled && cloud.apiKey && cloud.projectUrl) {
      const base = cloud.projectUrl.replace(/\/$/, "");
      const res = await vaultHttp(`${base}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cloud.apiKey}`,
        },
        body: JSON.stringify({
          messages: opts.messages,
          temperature: opts.temperature,
          max_tokens: opts.max_tokens,
          model: opts.model,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        content?: string;
        message?: string;
        model?: string;
        provider?: string;
        code?: string;
      };
      if (res.ok && data.content) {
        return {
          content: data.content,
          usedLlm: true,
          via: "vault",
          model: data.model,
          provider: data.provider,
        };
      }
      // 503 = not configured — fall through to direct key
      if (res.status !== 503) {
        console.warn(
          "[VideoSearch AI] vault AI failed",
          res.status,
          data.message || ""
        );
      }
    }
  } catch (err) {
    console.warn("[VideoSearch AI] vault AI unreachable", err);
  }

  // 2) Direct Settings key (user-pasted Groq/xAI/etc.)
  try {
    const s = await loadLlmSettings();
    if (!s.enabled || !s.apiKey) return null;
    const url = `${s.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model || s.model,
        temperature: opts.temperature ?? 0.28,
        max_tokens: opts.max_tokens ?? 1400,
        messages: opts.messages,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        "[VideoSearch AI] direct LLM HTTP",
        res.status,
        body.slice(0, 300)
      );
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return {
      content,
      usedLlm: true,
      via: "direct",
      model: s.model,
    };
  } catch (err) {
    console.warn("[VideoSearch AI] direct LLM failed", err);
    return null;
  }
}

/** True if vault AI or settings key can answer */
export async function isLlmAvailable(): Promise<{
  available: boolean;
  via: "vault" | "direct" | "none";
  detail?: string;
}> {
  try {
    const cloud = await loadCloudSettings();
    if (cloud.enabled && cloud.apiKey && cloud.projectUrl) {
      const base = cloud.projectUrl.replace(/\/$/, "");
      const res = await vaultHttp(`${base}/api/ai/status`, {
        headers: { Authorization: `Bearer ${cloud.apiKey}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        configured?: boolean;
        provider?: string;
        model?: string;
      };
      if (res.ok && data.configured) {
        return {
          available: true,
          via: "vault",
          detail: `${data.provider || "vault"} · ${data.model || "model"}`,
        };
      }
    }
  } catch {
    /* ignore */
  }
  const s = await loadLlmSettings();
  if (s.enabled && s.apiKey) {
    return { available: true, via: "direct", detail: s.model };
  }
  return {
    available: false,
    via: "none",
    detail: "Add XAI_API_KEY on the server or paste a key in Settings",
  };
}
