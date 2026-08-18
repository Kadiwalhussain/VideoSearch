/**
 * Tiny helper on ChatGPT / Claude / Gemini / Grok / Perplexity.
 * If VideoSearch just queued a transcript, drop it into the composer.
 * Does not inject the VideoSearch UI.
 */

import {
  clearPendingAsk,
  peekPendingAsk,
} from "../settings/askExternalSettings";

const SELECTORS = [
  "#prompt-textarea",
  "div#prompt-textarea",
  "textarea#prompt-textarea",
  "div[contenteditable='true']#prompt-textarea",
  "div.ProseMirror[contenteditable='true']",
  "div[contenteditable='true'].ProseMirror",
  "textarea[placeholder*='Ask']",
  "textarea[placeholder*='Message']",
  "textarea[placeholder*='Ask anything']",
  "textarea[data-testid='textbox']",
  "div[contenteditable='true'][role='textbox']",
  "div[contenteditable='true']",
  "textarea",
];

function hostMatches(providerId: string): boolean {
  const h = location.hostname;
  if (providerId === "chatgpt")
    return h.includes("chatgpt.com") || h.includes("chat.openai.com");
  if (providerId === "claude") return h.includes("claude.ai");
  if (providerId === "gemini") return h.includes("gemini.google.com");
  if (providerId === "grok") return h.includes("grok.com") || h.includes("x.com");
  if (providerId === "perplexity") return h.includes("perplexity.ai");
  return true;
}

function findComposer(): HTMLElement | null {
  for (const sel of SELECTORS) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement && el.offsetParent !== null) return el;
  }
  for (const sel of SELECTORS) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

function fillComposer(el: HTMLElement, text: string): boolean {
  try {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      );
      proto?.set?.call(el, text);
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    el.focus();
    const ok = document.execCommand("selectAll") && document.execCommand("insertText", false, text);
    if (ok) return true;
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
    return true;
  } catch {
    return false;
  }
}

async function tryPaste(): Promise<boolean> {
  const pending = await peekPendingAsk();
  if (!pending) return false;
  if (!hostMatches(pending.providerId)) return false;

  for (let i = 0; i < 48; i++) {
    const el = findComposer();
    if (el && fillComposer(el, pending.text)) {
      await clearPendingAsk();
      return true;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

void tryPaste();
