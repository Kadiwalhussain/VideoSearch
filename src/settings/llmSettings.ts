/**
 * Optional LLM settings for smart topic labels.
 * Endpoint is OpenAI-compatible chat/completions.
 * UI never shows a vendor brand name.
 */

export interface LlmSettings {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Defaults — never commit real API keys. Users paste a key in ⚙ Settings.
 * UI labels stay brand-neutral ("Smart topics" / "AI topics").
 */
export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  enabled: false,
  apiKey: "",
  baseUrl: "https://api.mistral.ai/v1",
  model: "mistral-small-latest",
};

const STORAGE_KEY = "vsa_llm_settings";
const SETTINGS_VERSION = 4; // bump when defaults change

export async function loadLlmSettings(): Promise<LlmSettings> {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY, "vsa_llm_ver"]);
    const ver = data.vsa_llm_ver as number | undefined;
    const raw = data[STORAGE_KEY] as Partial<LlmSettings> | undefined;

    // First install or settings schema bump → apply built-in defaults
    if (!raw || ver !== SETTINGS_VERSION) {
      const seeded = { ...DEFAULT_LLM_SETTINGS };
      seeded.enabled = Boolean(seeded.apiKey && seeded.apiKey.length > 8);
      await chrome.storage.local.set({
        [STORAGE_KEY]: seeded,
        vsa_llm_ver: SETTINGS_VERSION,
      });
      return seeded;
    }

    const merged: LlmSettings = {
      apiKey:
        typeof raw.apiKey === "string" && raw.apiKey.trim()
          ? raw.apiKey.trim()
          : DEFAULT_LLM_SETTINGS.apiKey,
      baseUrl:
        typeof raw.baseUrl === "string" && raw.baseUrl.trim()
          ? raw.baseUrl.trim().replace(/\/$/, "")
          : DEFAULT_LLM_SETTINGS.baseUrl,
      model:
        typeof raw.model === "string" && raw.model.trim()
          ? raw.model.trim()
          : DEFAULT_LLM_SETTINGS.model,
      enabled: false,
    };
    merged.enabled = Boolean(merged.apiKey && merged.apiKey.length > 8);
    return merged;
  } catch {
    return {
      ...DEFAULT_LLM_SETTINGS,
      enabled: Boolean(DEFAULT_LLM_SETTINGS.apiKey),
    };
  }
}

export async function saveLlmSettings(
  settings: Partial<LlmSettings>
): Promise<LlmSettings> {
  const current = await loadLlmSettings();
  const next: LlmSettings = {
    ...current,
    ...settings,
    baseUrl: (settings.baseUrl ?? current.baseUrl).replace(/\/$/, ""),
  };
  next.enabled = Boolean(next.apiKey && next.apiKey.length > 8);
  await chrome.storage.local.set({
    [STORAGE_KEY]: next,
    vsa_llm_ver: SETTINGS_VERSION,
  });
  return next;
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}…${key.slice(-3)}`;
}
