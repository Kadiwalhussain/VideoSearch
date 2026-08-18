/** Where “Ask in …” opens the full transcript. Default is ChatGPT. */

export type AskProviderId =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "grok"
  | "perplexity";

export type AskProvider = {
  id: AskProviderId;
  label: string;
  url: string;
};

export const ASK_PROVIDERS: AskProvider[] = [
  { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "claude", label: "Claude", url: "https://claude.ai/new" },
  { id: "gemini", label: "Gemini", url: "https://gemini.google.com/app" },
  { id: "grok", label: "Grok", url: "https://grok.com/" },
  { id: "perplexity", label: "Perplexity", url: "https://www.perplexity.ai/" },
];

const KEY = "vsa_ask_provider";
const DEFAULT_ID: AskProviderId = "chatgpt";

export function providerById(id: string | undefined): AskProvider {
  return ASK_PROVIDERS.find((p) => p.id === id) || ASK_PROVIDERS[0];
}

export async function loadAskProvider(): Promise<AskProvider> {
  try {
    const data = await chrome.storage.local.get(KEY);
    return providerById(data[KEY] as string | undefined);
  } catch {
    return providerById(DEFAULT_ID);
  }
}

export async function saveAskProvider(id: AskProviderId): Promise<AskProvider> {
  const p = providerById(id);
  try {
    await chrome.storage.local.set({ [KEY]: p.id });
  } catch {
    /* ignore */
  }
  return p;
}

export const PENDING_ASK_KEY = "vsa_pending_external_ask";

export type PendingAsk = {
  text: string;
  providerId: AskProviderId;
  at: number;
};

export async function setPendingAsk(payload: PendingAsk): Promise<void> {
  await chrome.storage.local.set({ [PENDING_ASK_KEY]: payload });
}

export async function peekPendingAsk(): Promise<PendingAsk | null> {
  try {
    const data = await chrome.storage.local.get(PENDING_ASK_KEY);
    const raw = data[PENDING_ASK_KEY] as PendingAsk | undefined;
    if (!raw || typeof raw.text !== "string" || !raw.text.trim()) return null;
    if (Date.now() - (raw.at || 0) > 180_000) {
      await chrome.storage.local.remove(PENDING_ASK_KEY);
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export async function clearPendingAsk(): Promise<void> {
  try {
    await chrome.storage.local.remove(PENDING_ASK_KEY);
  } catch {
    /* ignore */
  }
}
