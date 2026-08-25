/**
 * MV3 service worker — privileged network for vault API.
 *
 * Content scripts on https://youtube.com cannot reliably fetch
 * http://127.0.0.1 (Private Network Access). All vault HTTP goes through here.
 */

import { loadOnboarding } from "../welcome/onboardingStore";

export {};

type VaultFetchMsg = {
  type: "VAULT_FETCH";
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
};

type VaultFetchResult =
  | {
      ok: true;
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
    }
  | {
      ok: false;
      error: string;
    };

function isAllowedVaultUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    // Local vault + common private LAN ranges for home hosting
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (u.hostname === "[::1]" || u.hostname === "::1") return true;
    // 10.x, 192.168.x, 172.16–31.x
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(u.hostname)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(u.hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(u.hostname))
      return true;
    // Allow configured public hosts (supabase / future deploy)
    if (u.hostname.endsWith("supabase.co")) return true;
    return false;
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "VAULT_FETCH") return false;

  const msg = message as VaultFetchMsg;
  void (async () => {
    try {
      if (!msg.url || !isAllowedVaultUrl(msg.url)) {
        const result: VaultFetchResult = {
          ok: false,
          error: "Vault URL not allowed by extension",
        };
        sendResponse(result);
        return;
      }

      const method = (msg.method || "GET").toUpperCase();
      const res = await fetch(msg.url, {
        method,
        headers: msg.headers || {},
        body:
          msg.body != null && method !== "GET" && method !== "HEAD"
            ? msg.body
            : undefined,
        // Chrome 142+ Local Network Access (loopback vault on this machine)
        targetAddressSpace: "loopback",
      } as RequestInit);

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const body = await res.text();
      const result: VaultFetchResult = {
        ok: true,
        status: res.status,
        statusText: res.statusText,
        headers,
        body,
      };
      sendResponse(result);
    } catch (err) {
      const result: VaultFetchResult = {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Vault fetch failed in background",
      };
      sendResponse(result);
    }
  })();

  // Keep the message channel open for async sendResponse
  return true;
});

function openWelcome(): void {
  try {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
  } catch {
    /* fall through */
  }
  const url = chrome.runtime.getURL("src/welcome/index.html");
  void chrome.tabs.create({ url });
}

chrome.runtime.onStartup?.addListener(() => {
  console.info("[VideoSearch AI] background woke");
});

chrome.runtime.onInstalled.addListener((details) => {
  console.info("[VideoSearch AI] background ready (vault proxy)", details.reason);
  if (details.reason === "install") {
    openWelcome();
    return;
  }
  if (details.reason === "update") {
    void loadOnboarding().then((s) => {
      if (!s.seenAt) openWelcome();
    });
  }
});

/**
 * Toolbar icon. YouTube → in-page panel. Anywhere else → welcome / account.
 */
if (chrome.action?.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    const tabId = tab.id;
    const url = tab.url || "";
    if (tabId != null && /youtube\.com|youtu\.be/i.test(url)) {
      chrome.tabs.sendMessage(tabId, { type: "VSA_OPEN" }, () => {
        void chrome.runtime.lastError;
      });
      return;
    }
    openWelcome();
  });
}

function sendToYoutubeTab(type: "VSA_MARK" | "VSA_CAPTURE"): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    const url = tab.url || "";
    if (!/youtube\.com|youtu\.be/i.test(url)) return;
    chrome.tabs.sendMessage(tab.id, { type }, () => {
      void chrome.runtime.lastError;
    });
  });
}

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command === "mark-moment") sendToYoutubeTab("VSA_MARK");
    if (command === "capture-frame") sendToYoutubeTab("VSA_CAPTURE");
  });
}
