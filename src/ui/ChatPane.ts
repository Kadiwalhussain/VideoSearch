/**
 * Chat-with-Video UI — multi-turn RAG conversation for one video.
 */

import type { ChatMessage, ChatSource } from "../qa/chatRag";
import { formatTimestamp } from "../player/seekTo";

/** Local copy so ChatPane does not pull the full RAG/embed graph into first paint */
const CHAT_SUGGESTIONS = [
  "Summarize this video in simple terms",
  "What are the main points?",
  "Explain the hardest concept simply",
  "Give me interview questions from this lecture",
  "What are the advantages mentioned?",
  "Create a short quiz (5 questions)",
] as const;

export interface ChatPaneHandlers {
  onSend: (text: string) => void;
  onSeek: (seconds: number) => void;
  onClear?: () => void;
}

export class ChatPane {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private statusEl: HTMLElement;
  private handlers: ChatPaneHandlers;
  private busy = false;

  constructor(handlers: ChatPaneHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "vsa-chat";
    this.root.innerHTML = `
      <div class="vsa-chat-head">
        <div class="vsa-chat-title">Chat with this video</div>
        <button type="button" class="vsa-chat-clear" title="Clear conversation">Clear</button>
      </div>
      <div class="vsa-chat-status" hidden></div>
      <div class="vsa-chat-list" role="log" aria-live="polite"></div>
      <div class="vsa-chat-suggest"></div>
      <div class="vsa-chat-composer">
        <textarea
          class="vsa-chat-input"
          rows="2"
          placeholder="Ask anything about this video…"
          enterkeyhint="send"
        ></textarea>
        <button type="button" class="vsa-chat-send">Send</button>
      </div>
    `;

    this.listEl = this.root.querySelector(".vsa-chat-list") as HTMLElement;
    this.inputEl = this.root.querySelector(
      ".vsa-chat-input"
    ) as HTMLTextAreaElement;
    this.sendBtn = this.root.querySelector(
      ".vsa-chat-send"
    ) as HTMLButtonElement;
    this.statusEl = this.root.querySelector(
      ".vsa-chat-status"
    ) as HTMLElement;

    this.renderSuggestions();
    this.bind();
  }

  setMessages(messages: ChatMessage[]): void {
    this.listEl.innerHTML = "";
    if (!messages.length) {
      this.listEl.innerHTML = `
        <div class="vsa-chat-empty">
          <strong>Ask the video</strong>
          <p>Uses local semantic search + AI over captions. Answers include clickable timestamps.</p>
        </div>`;
      this.root.querySelector(".vsa-chat-suggest")?.removeAttribute("hidden");
      return;
    }

    this.root
      .querySelector(".vsa-chat-suggest")
      ?.setAttribute("hidden", "");

    for (const m of messages) {
      this.listEl.appendChild(this.renderMessage(m));
    }
    this.scrollToBottom();
  }

  setBusy(busy: boolean, status?: string): void {
    this.busy = busy;
    this.sendBtn.disabled = busy;
    this.inputEl.disabled = busy;
    if (busy && status) {
      this.statusEl.hidden = false;
      this.statusEl.innerHTML = `<span class="vsa-spinner"></span> ${escapeHtml(status)}`;
    } else {
      this.statusEl.hidden = true;
      this.statusEl.textContent = "";
    }
  }

  setError(message: string): void {
    this.statusEl.hidden = false;
    this.statusEl.textContent = message;
    this.statusEl.classList.add("is-error");
    window.setTimeout(() => {
      this.statusEl.classList.remove("is-error");
      if (!this.busy) this.statusEl.hidden = true;
    }, 5000);
  }

  focusInput(): void {
    this.inputEl.focus({ preventScroll: true });
  }

  private bind(): void {
    this.sendBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.fireSend();
    });

    this.inputEl.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.fireSend();
      }
    });

    // Isolate from YouTube hotkeys
    for (const type of ["keydown", "keyup", "keypress", "input"] as const) {
      this.inputEl.addEventListener(type, (e) => e.stopPropagation(), true);
    }

    this.root
      .querySelector(".vsa-chat-clear")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlers.onClear?.();
      });
  }

  private fireSend(): void {
    if (this.busy) return;
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = "";
    this.handlers.onSend(text);
  }

  private renderSuggestions(): void {
    const wrap = this.root.querySelector(".vsa-chat-suggest") as HTMLElement;
    wrap.innerHTML = "";
    for (const s of CHAT_SUGGESTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vsa-chat-chip";
      btn.textContent = s;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.busy) return;
        this.handlers.onSend(s);
      });
      wrap.appendChild(btn);
    }
  }

  private renderMessage(m: ChatMessage): HTMLElement {
    const row = document.createElement("div");
    row.className = `vsa-chat-msg role-${m.role}`;
    row.dataset.id = m.id;

    if (m.role === "user") {
      row.innerHTML = `
        <div class="vsa-chat-bubble user">
          <div class="vsa-chat-bubble-text"></div>
        </div>`;
      (
        row.querySelector(".vsa-chat-bubble-text") as HTMLElement
      ).textContent = m.content;
      return row;
    }

    // assistant
    const bubble = document.createElement("div");
    bubble.className = "vsa-chat-bubble assistant";
    const meta = document.createElement("div");
    meta.className = "vsa-chat-meta";
    meta.textContent = m.usedLlm ? "AI · grounded in captions" : "Local sources";
    const body = document.createElement("div");
    body.className = "vsa-chat-bubble-text";
    fillWithTimeLinks(body, m.content, (t) => this.handlers.onSeek(t));
    bubble.append(meta, body);

    if (m.sources?.length) {
      const src = document.createElement("div");
      src.className = "vsa-chat-sources";
      const label = document.createElement("div");
      label.className = "vsa-chat-sources-label";
      label.textContent = "Sources — click to jump";
      src.appendChild(label);
      for (const s of m.sources.slice(0, 6)) {
        src.appendChild(this.renderSource(s));
      }
      bubble.appendChild(src);
    }

    row.appendChild(bubble);
    return row;
  }

  private renderSource(s: ChatSource): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vsa-chat-source";
    btn.innerHTML = `
      <span class="vsa-time">${formatTimestamp(s.startTime)}</span>
      <span class="vsa-snippet">${escapeHtml(truncate(s.text, 90))}</span>
    `;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onSeek(s.startTime);
    });
    return btn;
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.listEl.scrollTop = this.listEl.scrollHeight;
    });
  }
}

function fillWithTimeLinks(
  container: HTMLElement,
  answer: string,
  onSeek: (seconds: number) => void
): void {
  const re =
    /(\bat\s+)?(\[|\()?(\d{1,2}:\d{2}(?::\d{2})?)(\]|\))?/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  const text = answer;

  while ((match = re.exec(text)) !== null) {
    const timeStr = match[3];
    const seconds = parseTimestampToken(timeStr);
    if (seconds == null) continue;

    if (match.index > last) {
      container.appendChild(
        document.createTextNode(text.slice(last, match.index))
      );
    }

    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "vsa-time-pill";
    pill.textContent = timeStr;
    pill.title = `Jump to ${timeStr}`;
    const t = seconds;
    pill.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSeek(t);
    });
    container.appendChild(pill);
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    container.appendChild(document.createTextNode(text.slice(last)));
  }
  if (!container.childNodes.length) {
    container.textContent = answer;
  }
}

function parseTimestampToken(token: string): number | null {
  const m = token.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  if (m[3] != null) {
    return (
      parseInt(m[1], 10) * 3600 +
      parseInt(m[2], 10) * 60 +
      parseInt(m[3], 10)
    );
  }
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
