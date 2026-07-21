/**
 * Compact tabbed UI:
 *   Search | Chat | Topics | Live | Mood   (+ settings gear)
 * Only one section is open at a time so it doesn't eat the player.
 */

import type { RawCaptionSegment, SearchResult } from "../types/schema";
import type { VideoTopic } from "../topics/extractTopics";
import type { SentimentReport } from "../comments/analyzeSentiment";
import type { ChatMessage } from "../qa/chatRag";
import {
  DEFAULT_LLM_SETTINGS,
  loadLlmSettings,
  maskKey,
  saveLlmSettings,
  type LlmSettings,
} from "../settings/llmSettings";
import { LiveTranscript } from "./LiveTranscript";
import { ChatPane } from "./ChatPane";

export type PanelStatus =
  | { kind: "idle" }
  | { kind: "indexing"; message: string; ratio?: number }
  | {
      kind: "ready";
      chunkCount: number;
      fromCache: boolean;
      topics: VideoTopic[];
      topicSource?: "chapters" | "llm" | "local" | "mixed";
    }
  | { kind: "no-captions"; message: string }
  | { kind: "error"; message: string }
  | { kind: "searching" }
  | { kind: "results"; results: SearchResult[]; query: string }
  | {
      kind: "qa";
      answer: string;
      usedLlm: boolean;
      results: SearchResult[];
      query: string;
    }
  | { kind: "no-results"; query: string };

export type QueryMode = "auto" | "search" | "ask";

export type CommentsPanelState =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "ready"; report: SentimentReport }
  | { kind: "error"; message: string }
  | { kind: "empty"; message: string };

export interface SearchPanelHandlers {
  onSearch: (query: string, mode: QueryMode) => void;
  onSeek: (startTime: number) => void;
  onRetry: () => void;
  onToggle?: (open: boolean) => void;
  onTopicClick?: (topic: VideoTopic) => void;
  onSettingsSaved?: () => void;
  /** Load / refresh comment sentiment when Mood tab opens or user retries */
  onLoadComments?: (force?: boolean) => void;
  /** Chat-with-Video RAG turn */
  onChatSend?: (text: string) => void;
  onChatClear?: () => void;
}

type TabId =
  | "search"
  | "chat"
  | "topics"
  | "transcript"
  | "comments"
  | "settings";

const SEARCH_DEBOUNCE_MS = 700;
const MIN_QUERY_LEN = 2;

export class SearchPanel {
  readonly root: HTMLElement;
  private statusEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private topicsEl: HTMLElement;
  private resultsEl: HTMLElement;
  private settingsEl: HTMLElement;
  private panelBody: HTMLElement;
  private badgeEl: HTMLElement;
  private tabSearch: HTMLButtonElement;
  private tabTopics: HTMLButtonElement;
  private tabTranscript: HTMLButtonElement;
  private tabComments: HTMLButtonElement;
  private paneSearch: HTMLElement;
  private paneTopics: HTMLElement;
  private paneTranscript: HTMLElement;
  private paneComments: HTMLElement;
  private paneChat: HTMLElement;
  private paneSettings: HTMLElement;
  private commentsEl: HTMLElement;
  private handlers: SearchPanelHandlers;
  private debounceTimer: number | null = null;
  private expanded = true;
  private activeTab: TabId = "search";
  private lastTopics: VideoTopic[] = [];
  private inputLocked = true;
  private liveTranscript: LiveTranscript;
  private chatPane: ChatPane;
  private answerEl: HTMLElement;
  private queryMode: QueryMode = "auto";
  private commentsState: CommentsPanelState = { kind: "idle" };
  private commentsLoadedOnce = false;
  /** True once a searchable index exists — topic/mood loading must not re-lock search */
  private hasSearchableIndex = false;

  constructor(handlers: SearchPanelHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.id = "videosearch-ai-panel";
    this.root.setAttribute("data-vsa", "search-panel");
    this.root.dataset.tab = "search";

    this.root.innerHTML = `
      <div class="vsa-chrome">
        <div class="vsa-bar">
          <button type="button" class="vsa-brand" title="Collapse / expand panel">
            <span class="vsa-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            </span>
            <span class="vsa-title-wrap">
              <span class="vsa-title">VideoSearch</span>
              <span class="vsa-title-sub">AI</span>
            </span>
            <span class="vsa-badge">…</span>
          </button>
          <div class="vsa-status" role="status">Starting…</div>
          <button type="button" class="vsa-collapse-btn" title="Minimize" aria-label="Minimize">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/></svg>
          </button>
        </div>
        <div class="vsa-tabs" role="tablist" aria-label="VideoSearch sections">
          <button type="button" class="vsa-tab is-active" data-tab="search" role="tab" aria-selected="true">
            <span class="vsa-tab-ico" aria-hidden="true">⌕</span>
            <span class="vsa-tab-txt">Search</span>
          </button>
          <button type="button" class="vsa-tab" data-tab="chat" role="tab" aria-selected="false" title="Chat with video (RAG)">
            <span class="vsa-tab-ico" aria-hidden="true">💬</span>
            <span class="vsa-tab-txt">Chat</span>
          </button>
          <button type="button" class="vsa-tab" data-tab="topics" role="tab" aria-selected="false">
            <span class="vsa-tab-ico" aria-hidden="true">◈</span>
            <span class="vsa-tab-txt">Topics</span>
            <span class="vsa-tab-count" data-count="topics"></span>
          </button>
          <button type="button" class="vsa-tab" data-tab="transcript" role="tab" aria-selected="false">
            <span class="vsa-tab-ico" aria-hidden="true">☰</span>
            <span class="vsa-tab-txt">Live</span>
          </button>
          <button type="button" class="vsa-tab" data-tab="comments" role="tab" aria-selected="false" title="Comment sentiment">
            <span class="vsa-tab-ico" aria-hidden="true">☺</span>
            <span class="vsa-tab-txt">Mood</span>
            <span class="vsa-tab-count" data-count="comments"></span>
          </button>
          <button type="button" class="vsa-tab vsa-tab-gear" data-tab="settings" role="tab" aria-selected="false" title="Settings">
            <span class="vsa-tab-ico" aria-hidden="true">⚙</span>
          </button>
        </div>
      </div>
      <div class="vsa-panel-body">
        <div class="vsa-pane vsa-pane-search" data-pane="search">
          <div class="vsa-mode-row" role="group" aria-label="Query mode">
            <button type="button" class="vsa-mode is-active" data-mode="auto" title="Keywords search; questions get an AI answer">Auto</button>
            <button type="button" class="vsa-mode" data-mode="search" title="Only find timestamps">Search</button>
            <button type="button" class="vsa-mode" data-mode="ask" title="Always answer with AI + sources">Ask</button>
          </div>
          <div class="vsa-input-row">
            <input
              type="text"
              class="vsa-input"
              placeholder="Search what was said, or ask a question…"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              enterkeyhint="search"
            />
            <button type="button" class="vsa-search-btn">
              <span class="vsa-search-btn-txt">Go</span>
            </button>
          </div>
          <div class="vsa-answer" hidden></div>
          <div class="vsa-results" role="listbox" aria-label="Search results"></div>
        </div>
        <div class="vsa-pane vsa-pane-chat" data-pane="chat" hidden>
          <div class="vsa-chat-host"></div>
        </div>
        <div class="vsa-pane vsa-pane-topics" data-pane="topics" hidden>
          <div class="vsa-topics"></div>
        </div>
        <div class="vsa-pane vsa-pane-transcript" data-pane="transcript" hidden>
          <div class="vsa-transcript-host"></div>
        </div>
        <div class="vsa-pane vsa-pane-comments" data-pane="comments" hidden>
          <div class="vsa-comments"></div>
        </div>
        <div class="vsa-pane vsa-pane-settings" data-pane="settings" hidden>
          <div class="vsa-settings">
            <div class="vsa-settings-title">AI Chat &amp; topics</div>
            <p class="vsa-settings-help">
              OpenAI-compatible key for Chat RAG, topics, and Ask. Default: Groq. Embeddings stay on your device.
            </p>
            <label class="vsa-field">
              <span>API key</span>
              <input type="password" class="vsa-set-key" placeholder="••••••••" autocomplete="off" />
            </label>
            <label class="vsa-field">
              <span>Endpoint</span>
              <input type="text" class="vsa-set-url" autocomplete="off" />
            </label>
            <label class="vsa-field">
              <span>Model id</span>
              <input type="text" class="vsa-set-model" autocomplete="off" />
            </label>
            <div class="vsa-settings-actions">
              <button type="button" class="vsa-save-settings">Save &amp; refresh</button>
              <span class="vsa-settings-msg"></span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.statusEl = this.root.querySelector(".vsa-status") as HTMLElement;
    this.inputEl = this.root.querySelector(".vsa-input") as HTMLInputElement;
    this.topicsEl = this.root.querySelector(".vsa-topics") as HTMLElement;
    this.resultsEl = this.root.querySelector(".vsa-results") as HTMLElement;
    this.settingsEl = this.root.querySelector(".vsa-settings") as HTMLElement;
    this.panelBody = this.root.querySelector(".vsa-panel-body") as HTMLElement;
    this.badgeEl = this.root.querySelector(".vsa-badge") as HTMLElement;
    this.answerEl = this.root.querySelector(".vsa-answer") as HTMLElement;
    this.tabSearch = this.root.querySelector(
      '.vsa-tab[data-tab="search"]'
    ) as HTMLButtonElement;
    this.tabTopics = this.root.querySelector(
      '.vsa-tab[data-tab="topics"]'
    ) as HTMLButtonElement;
    this.tabTranscript = this.root.querySelector(
      '.vsa-tab[data-tab="transcript"]'
    ) as HTMLButtonElement;
    this.tabComments = this.root.querySelector(
      '.vsa-tab[data-tab="comments"]'
    ) as HTMLButtonElement;
    this.paneSearch = this.root.querySelector(
      '[data-pane="search"]'
    ) as HTMLElement;
    this.paneChat = this.root.querySelector(
      '[data-pane="chat"]'
    ) as HTMLElement;
    this.paneTopics = this.root.querySelector(
      '[data-pane="topics"]'
    ) as HTMLElement;
    this.paneTranscript = this.root.querySelector(
      '[data-pane="transcript"]'
    ) as HTMLElement;
    this.paneComments = this.root.querySelector(
      '[data-pane="comments"]'
    ) as HTMLElement;
    this.paneSettings = this.root.querySelector(
      '[data-pane="settings"]'
    ) as HTMLElement;
    this.commentsEl = this.root.querySelector(".vsa-comments") as HTMLElement;

    const host = this.root.querySelector(
      ".vsa-transcript-host"
    ) as HTMLElement;
    this.liveTranscript = new LiveTranscript((t) => this.handlers.onSeek(t));
    host.appendChild(this.liveTranscript.root);

    const chatHost = this.root.querySelector(".vsa-chat-host") as HTMLElement;
    this.chatPane = new ChatPane({
      onSend: (text) => this.handlers.onChatSend?.(text),
      onSeek: (t) => this.handlers.onSeek(t),
      onClear: () => this.handlers.onChatClear?.(),
    });
    chatHost.appendChild(this.chatPane.root);

    this.shieldEvents();
    this.bindInput();
    this.bindSettings();
    this.bindTabs();
    this.bindModes();

    this.root.querySelector(".vsa-brand")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setExpanded(!this.expanded);
    });
    this.root
      .querySelector(".vsa-collapse-btn")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setExpanded(false);
      });

    this.root.querySelector(".vsa-search-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.fireSearchNow();
    });

    // Tooltips for compact tabs
    this.tabSearch.title = "Search & Ask";
    this.tabTopics.title = "Topics / chapters";
    this.tabTranscript.title = "Live transcript";
    this.tabComments.title = "Comment mood (good / bad)";
    const gear = this.root.querySelector(
      '.vsa-tab[data-tab="settings"]'
    ) as HTMLElement | null;
    if (gear) gear.title = "Settings";

    // Start as a small floating pill so it doesn't dominate the video
    this.setExpanded(false);
  }

  setTranscript(segments: RawCaptionSegment[]): void {
    this.liveTranscript.setSegments(segments);
    const countEl = this.root.querySelector(
      '[data-count="transcript"]'
    ) as HTMLElement | null;
    // badge on transcript tab via title
    this.tabTranscript.title = `${segments.length} lines`;
  }

  clearTranscript(): void {
    this.liveTranscript.clear();
  }

  /** Update Mood tab (comment sentiment). Lazy-loaded when tab opens. */
  setCommentsState(state: CommentsPanelState): void {
    // Ignore ready reports that don't look valid (defensive)
    if (state.kind === "ready") {
      if (!state.report?.videoId || !state.report.fingerprint) {
        console.warn("[VideoSearch AI] Ignoring invalid mood report");
        return;
      }
      this.commentsLoadedOnce = true;
    }
    this.commentsState = state;
    this.renderComments();
    const countBadge = this.root.querySelector(
      '[data-count="comments"]'
    ) as HTMLElement | null;
    if (countBadge) {
      if (state.kind === "ready" && state.report.totalAnalyzed > 0) {
        countBadge.textContent = String(state.report.totalAnalyzed);
        countBadge.dataset.mood = state.report.overallLabel;
      } else if (state.kind === "loading") {
        countBadge.textContent = "…";
        delete countBadge.dataset.mood;
      } else {
        countBadge.textContent = "";
        delete countBadge.dataset.mood;
      }
    }
  }

  resetComments(): void {
    this.commentsLoadedOnce = false;
    this.commentsState = { kind: "idle" };
    this.commentsEl.innerHTML = `<div class="vsa-hint">Open this tab to scan viewer comments for good / bad sentiment.</div>`;
    const countBadge = this.root.querySelector(
      '[data-count="comments"]'
    ) as HTMLElement | null;
    if (countBadge) {
      countBadge.textContent = "";
      delete countBadge.dataset.mood;
    }
  }

  /** Call when force-reindexing so search locks again until ready. */
  resetIndexState(): void {
    this.hasSearchableIndex = false;
    this.lastTopics = [];
    this.lockInput(true);
    this.resultsEl.innerHTML = "";
    this.answerEl.hidden = true;
    this.answerEl.innerHTML = "";
  }

  /**
   * True only when the user is typing in an input — not when a tab button is focused.
   * (Broad “any focus inside panel” was blocking remounts / video switches.)
   */
  isInputFocused(): boolean {
    const el = document.activeElement;
    if (!el || !this.root.contains(el)) return false;
    return (
      el === this.inputEl ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement
    );
  }

  setChatMessages(messages: ChatMessage[]): void {
    this.chatPane.setMessages(messages);
  }

  setChatBusy(busy: boolean, status?: string): void {
    this.chatPane.setBusy(busy, status);
  }

  setChatError(message: string): void {
    this.chatPane.setError(message);
  }

  openChatTab(): void {
    if (!this.expanded) this.setExpanded(true);
    this.switchTab("chat");
    this.chatPane.focusInput();
  }

  setStatus(status: PanelStatus): void {
    const hadFocus = document.activeElement === this.inputEl;
    const selStart = this.inputEl.selectionStart;
    const selEnd = this.inputEl.selectionEnd;
    this.root.dataset.kind = status.kind;

    if (status.kind === "ready") {
      this.lastTopics = status.topics;
      this.renderTopics(status.topics, status.topicSource);
      const countBadge = this.root.querySelector(
        '[data-count="topics"]'
      ) as HTMLElement;
      if (countBadge) {
        countBadge.textContent =
          status.topics.length > 0 ? String(status.topics.length) : "";
      }
    } else if (
      (status.kind === "searching" ||
        status.kind === "results" ||
        status.kind === "no-results") &&
      this.lastTopics.length &&
      !this.topicsEl.querySelector(".vsa-topic-chip")
    ) {
      this.renderTopics(this.lastTopics);
    }

    switch (status.kind) {
      case "idle":
        this.hasSearchableIndex = false;
        this.lockInput(true);
        this.statusEl.textContent = "Starting…";
        this.badgeEl.textContent = "…";
        this.setBrandState("loading");
        break;

      case "indexing": {
        // Keep search usable once the index is ready (topics/mood can load in background)
        if (!this.hasSearchableIndex) {
          this.lockInput(true);
          this.setBrandState("loading");
          this.badgeEl.textContent = "…";
        } else {
          this.lockInput(false);
          this.setBrandState("ready");
        }
        const pct =
          typeof status.ratio === "number"
            ? ` ${Math.round(status.ratio * 100)}%`
            : "";
        this.statusEl.innerHTML = `<span class="vsa-spinner"></span> ${escapeHtml(status.message)}${pct}`;
        break;
      }

      case "ready":
        this.hasSearchableIndex = true;
        this.lockInput(false);
        {
          const src =
            status.topicSource === "chapters"
              ? "chapters"
              : status.topicSource === "mixed"
                ? "chapters+"
                : status.topicSource === "llm"
                  ? "AI"
                  : status.topicSource === "local"
                    ? "local"
                    : "";
          this.statusEl.textContent = status.fromCache
            ? `Ready · ${status.topics.length} topics${src ? ` · ${src}` : ""}`
            : `Ready · ${status.chunkCount} chunks · ${status.topics.length} topics`;
        }
        this.badgeEl.textContent = String(
          status.topics.length || status.chunkCount
        );
        this.setBrandState("ready");
        if (
          this.activeTab === "search" &&
          !this.resultsEl.querySelector(".vsa-result") &&
          !this.resultsEl.querySelector(".vsa-empty")
        ) {
          this.resultsEl.innerHTML = `<div class="vsa-hint">
            <strong>Search</strong> for moments, or <strong>Ask</strong> questions like
            “What happened in this episode?” / “How did this person behave?”
          </div>`;
        }
        break;

      case "no-captions":
        this.hasSearchableIndex = false;
        this.lockInput(true);
        this.statusEl.textContent = "No captions";
        this.badgeEl.textContent = "!";
        this.setBrandState("warn");
        this.ensureSearchTabForResults();
        this.resultsEl.innerHTML = `
          <div class="vsa-empty">
            <strong>No captions on this video</strong>
            <p>${escapeHtml(status.message)}</p>
            <button type="button" class="vsa-retry">Retry</button>
          </div>`;
        this.bindRetry();
        break;

      case "error":
        // Keep index usable if we already had one (e.g. search glitch)
        this.lockInput(false);
        this.statusEl.textContent = "Error";
        this.badgeEl.textContent = "✕";
        this.setBrandState("error");
        this.ensureSearchTabForResults();
        this.resultsEl.innerHTML = `
          <div class="vsa-empty">
            <strong>Something went wrong</strong>
            <p>${escapeHtml(status.message)}</p>
            <button type="button" class="vsa-retry">Retry</button>
          </div>`;
        this.bindRetry();
        break;

      case "searching":
        this.lockInput(false);
        this.statusEl.innerHTML = `<span class="vsa-spinner"></span> Working…`;
        this.setBrandState("ready");
        this.ensureSearchTabForResults();
        this.answerEl.hidden = true;
        break;

      case "results":
        this.lockInput(false);
        this.statusEl.textContent = `${status.results.length} moment${status.results.length === 1 ? "" : "s"}`;
        this.setBrandState("ready");
        this.ensureSearchTabForResults();
        this.answerEl.hidden = true;
        this.answerEl.innerHTML = "";
        this.renderResults(status.results, "Jump to moment");
        break;

      case "qa":
        this.lockInput(false);
        this.statusEl.textContent = status.usedLlm
          ? "Answer ready"
          : "Answer (local sources)";
        this.setBrandState("ready");
        this.ensureSearchTabForResults();
        this.renderAnswer(status.answer, status.usedLlm);
        this.renderResults(status.results, "Source moment");
        break;

      case "no-results":
        this.lockInput(false);
        this.statusEl.textContent = "No strong matches";
        this.setBrandState("ready");
        this.ensureSearchTabForResults();
        this.answerEl.hidden = true;
        this.resultsEl.innerHTML = `
          <div class="vsa-empty">
            <strong>No matches for “${escapeHtml(status.query)}”</strong>
            <p class="vsa-muted">Try Ask mode, the Topics tab, or different words.</p>
          </div>`;
        break;
    }

    if (hadFocus && !this.inputLocked && this.activeTab === "search") {
      this.inputEl.focus({ preventScroll: true });
      try {
        if (selStart != null && selEnd != null) {
          this.inputEl.setSelectionRange(selStart, selEnd);
        }
      } catch {
        // ignore
      }
    }
  }

  /** Show the Search pane for results / errors (Topics / Live / Mood stay put for ready/indexing). */
  private ensureSearchTabForResults(): void {
    this.switchTab("search");
  }

  setQuery(query: string): void {
    this.inputEl.value = query;
  }

  private setBrandState(state: string): void {
    const brand = this.root.querySelector(".vsa-brand") as HTMLElement | null;
    if (brand) brand.dataset.state = state;
  }

  private setExpanded(open: boolean): void {
    this.expanded = open;
    this.panelBody.hidden = !open;
    const tabs = this.root.querySelector(".vsa-tabs") as HTMLElement | null;
    if (tabs) {
      if (open) tabs.removeAttribute("hidden");
      else tabs.setAttribute("hidden", "");
    }
    this.root.classList.toggle("is-collapsed", !open);
    this.root.classList.toggle("is-expanded", open);
    // Parent float wrapper
    const host = this.root.closest("#videosearch-ai-root") as HTMLElement | null;
    if (host) {
      host.classList.toggle("is-collapsed", !open);
      host.classList.toggle("is-expanded", open);
    }
    const btn = this.root.querySelector(
      ".vsa-collapse-btn"
    ) as HTMLButtonElement | null;
    if (btn) {
      btn.title = open ? "Minimize" : "Expand";
      btn.setAttribute("aria-label", open ? "Minimize" : "Expand");
      btn.hidden = !open;
      btn.innerHTML = open
        ? `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14"/></svg>`
        : `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>`;
    }
    this.handlers.onToggle?.(open);
  }

  private switchTab(tab: TabId): void {
    this.activeTab = tab;
    this.root.dataset.tab = tab;

    const tabs = this.root.querySelectorAll(".vsa-tab");
    tabs.forEach((t) => {
      const el = t as HTMLButtonElement;
      const on = el.dataset.tab === tab;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-selected", String(on));
    });

    this.paneSearch.hidden = tab !== "search";
    this.paneChat.hidden = tab !== "chat";
    this.paneTopics.hidden = tab !== "topics";
    this.paneTranscript.hidden = tab !== "transcript";
    this.paneComments.hidden = tab !== "comments";
    this.paneSettings.hidden = tab !== "settings";

    if (tab === "settings") {
      void loadLlmSettings().then((s) => this.fillSettingsForm(s));
    }
    if (tab === "comments") {
      this.renderComments();
      // Lazy-load on first open
      if (
        !this.commentsLoadedOnce &&
        this.commentsState.kind !== "loading" &&
        this.commentsState.kind !== "ready"
      ) {
        this.handlers.onLoadComments?.(false);
      }
    }
    if (tab === "chat" && this.expanded) {
      this.chatPane.focusInput();
    }
    if (tab === "search" && !this.inputLocked && this.expanded) {
      this.inputEl.focus({ preventScroll: true });
    }
  }

  private bindTabs(): void {
    this.root.querySelectorAll(".vsa-tab").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.expanded) this.setExpanded(true);
        const tab = (btn as HTMLElement).dataset.tab as TabId;
        if (tab) this.switchTab(tab);
      });
    });
  }

  private fireSearchNow(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.switchTab("search");
    this.handlers.onSearch(this.inputEl.value, this.queryMode);
  }

  private bindModes(): void {
    this.root.querySelectorAll(".vsa-mode").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mode = (btn as HTMLElement).dataset.mode as QueryMode;
        if (!mode) return;
        this.queryMode = mode;
        this.root.querySelectorAll(".vsa-mode").forEach((b) => {
          b.classList.toggle("is-active", (b as HTMLElement).dataset.mode === mode);
        });
        this.inputEl.placeholder =
          mode === "ask"
            ? "Ask anything about this video…"
            : mode === "search"
              ? "Find moments by keyword…"
              : "Search moments, or ask a question…";
      });
    });
  }

  private lockInput(locked: boolean): void {
    this.inputLocked = locked;
    this.inputEl.readOnly = locked;
    this.inputEl.classList.toggle("vsa-input-locked", locked);
  }

  private shieldEvents(): void {
    // IMPORTANT: never stopPropagation in *capture* on the root — that blocks
    // child buttons/inputs from ever receiving the event.
    const stopBubble = (e: Event) => e.stopPropagation();

    // Keys: capture on the focused field only (after the event reached the input)
    for (const type of [
      "keydown",
      "keyup",
      "keypress",
      "input",
      "beforeinput",
      "compositionstart",
      "compositionupdate",
      "compositionend",
    ] as const) {
      this.inputEl.addEventListener(type, stopBubble, true);
    }
    // Settings fields also need YouTube hotkey isolation
    this.root.querySelectorAll("input, textarea").forEach((el) => {
      if (el === this.inputEl) return;
      for (const type of ["keydown", "keyup", "keypress", "input"] as const) {
        el.addEventListener(type, stopBubble, true);
      }
    });

    // Pointer: bubble phase only — child handlers run first, then we stop YT
    for (const type of [
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "pointerdown",
      "pointerup",
      "wheel",
    ] as const) {
      this.root.addEventListener(type, stopBubble, false);
    }
  }

  private bindInput(): void {
    this.inputEl.addEventListener("input", () => {
      if (this.inputLocked) return;
      const q = this.inputEl.value;
      if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => {
        if (q.trim().length < MIN_QUERY_LEN && q.trim().length > 0) return;
        // Auto-debounce only for keyword search; questions wait for Enter / Go
        if (this.queryMode === "ask") return;
        this.handlers.onSearch(this.inputEl.value, this.queryMode);
      }, SEARCH_DEBOUNCE_MS);
    });

    this.inputEl.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        this.fireSearchNow();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.inputEl.value = "";
        this.fireSearchNow();
      }
    });
  }

  private bindSettings(): void {
    this.root
      .querySelector(".vsa-save-settings")
      ?.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const keyInput = this.root.querySelector(
          ".vsa-set-key"
        ) as HTMLInputElement;
        const urlInput = this.root.querySelector(
          ".vsa-set-url"
        ) as HTMLInputElement;
        const modelInput = this.root.querySelector(
          ".vsa-set-model"
        ) as HTMLInputElement;
        const msg = this.root.querySelector(
          ".vsa-settings-msg"
        ) as HTMLElement;

        msg.textContent = "Saving…";
        try {
          const saved = await saveLlmSettings({
            apiKey: keyInput.value.trim(),
            baseUrl: urlInput.value.trim() || DEFAULT_LLM_SETTINGS.baseUrl,
            model: modelInput.value.trim() || DEFAULT_LLM_SETTINGS.model,
          });
          msg.textContent = saved.enabled
            ? `Saved (${maskKey(saved.apiKey)}). Refreshing…`
            : "Saved (local topics only).";
          this.handlers.onSettingsSaved?.();
        } catch (err) {
          msg.textContent =
            err instanceof Error ? err.message : "Failed to save";
        }
      });
  }

  private fillSettingsForm(s: LlmSettings): void {
    const keyInput = this.root.querySelector(".vsa-set-key") as HTMLInputElement;
    const urlInput = this.root.querySelector(".vsa-set-url") as HTMLInputElement;
    const modelInput = this.root.querySelector(
      ".vsa-set-model"
    ) as HTMLInputElement;
    keyInput.value = s.apiKey;
    keyInput.placeholder = s.apiKey
      ? `Saved (${maskKey(s.apiKey)})`
      : "Paste API key";
    urlInput.value = s.baseUrl || DEFAULT_LLM_SETTINGS.baseUrl;
    modelInput.value = s.model || DEFAULT_LLM_SETTINGS.model;
  }

  private bindRetry(): void {
    this.resultsEl.querySelector(".vsa-retry")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onRetry();
    });
  }

  private renderTopics(
    topics: VideoTopic[],
    source?: "chapters" | "llm" | "local" | "mixed"
  ): void {
    this.topicsEl.innerHTML = "";
    if (!topics.length) {
      this.topicsEl.innerHTML = `<div class="vsa-hint">No topics yet. Wait until Ready, or check Settings.</div>`;
      return;
    }

    const heading = document.createElement("div");
    heading.className = "vsa-topics-label";
    if (source === "chapters") {
      heading.textContent = `Video chapters (${topics.length}) — click to jump`;
    } else if (source === "mixed") {
      heading.textContent = `Chapters + topics (${topics.length}) — click to jump`;
    } else if (source === "llm") {
      heading.textContent = `Main topics (${topics.length}) — click to jump & search`;
    } else {
      heading.textContent = `Topics (${topics.length}) — click to jump & search`;
    }
    this.topicsEl.appendChild(heading);

    const row = document.createElement("div");
    row.className = "vsa-topics-row";

    for (const topic of topics) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "vsa-topic-chip";
      chip.style.pointerEvents = "auto";
      chip.style.cursor = "pointer";
      chip.title = `Search “${topic.query}” · ~${formatTimestamp(topic.startTime)}`;

      const label = document.createElement("span");
      label.className = "vsa-topic-label";
      label.textContent = topic.label;
      const time = document.createElement("span");
      time.className = "vsa-topic-time";
      time.textContent = formatTimestamp(topic.startTime);
      chip.append(label, time);

      let lastActivate = 0;
      const activate = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastActivate < 400) return;
        lastActivate = now;
        this.setQuery(topic.query);
        this.switchTab("search");
        if (this.handlers.onTopicClick) this.handlers.onTopicClick(topic);
        else this.handlers.onSearch(topic.query, "search");
      };
      chip.addEventListener("pointerup", activate);
      chip.addEventListener("click", activate);
      row.appendChild(chip);
    }
    this.topicsEl.appendChild(row);
  }

  private renderAnswer(answer: string, usedLlm: boolean): void {
    this.answerEl.hidden = false;
    this.answerEl.innerHTML = "";
    const head = document.createElement("div");
    head.className = "vsa-answer-head";
    head.textContent = usedLlm
      ? "Answer · click green times to jump"
      : "Answer · click green times to jump";
    const body = document.createElement("div");
    body.className = "vsa-answer-body";
    fillAnswerWithTimeLinks(body, answer, (sec) => this.handlers.onSeek(sec));
    this.answerEl.append(head, body);
  }

  private renderResults(results: SearchResult[], _label = "Jump"): void {
    this.resultsEl.innerHTML = "";
    if (results.length === 0) return;

    const label = document.createElement("div");
    label.className = "vsa-results-label";
    label.textContent = "Moments in the video — click to jump";
    this.resultsEl.appendChild(label);

    for (const r of results) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "vsa-result";
      const scorePct = Math.round(Math.max(0, r.score) * 100);
      row.innerHTML = `
        <span class="vsa-time">${formatTimestamp(r.startTime)}</span>
        <span class="vsa-snippet">${escapeHtml(truncate(r.text, 160))}</span>
        <span class="vsa-score">${scorePct}%</span>
      `;
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlers.onSeek(r.startTime);
        row.classList.add("vsa-result-active");
        window.setTimeout(() => row.classList.remove("vsa-result-active"), 400);
      });
      this.resultsEl.appendChild(row);
    }
  }

  private renderComments(): void {
    const state = this.commentsState;
    this.commentsEl.innerHTML = "";

    if (state.kind === "idle") {
      this.commentsEl.innerHTML = `
        <div class="vsa-hint">
          <strong>Viewer mood</strong>
          <p class="vsa-muted">We’ll scan comments and show what’s good, bad, and what people talk about — all on your device.</p>
          <button type="button" class="vsa-comments-load">Analyze comments</button>
        </div>`;
      this.bindCommentsLoad();
      return;
    }

    if (state.kind === "loading") {
      this.commentsEl.innerHTML = `
        <div class="vsa-hint">
          <span class="vsa-spinner"></span> ${escapeHtml(state.message)}
        </div>`;
      return;
    }

    if (state.kind === "error") {
      this.commentsEl.innerHTML = `
        <div class="vsa-empty">
          <strong>Couldn’t load comments</strong>
          <p>${escapeHtml(state.message)}</p>
          <button type="button" class="vsa-comments-load">Retry</button>
        </div>`;
      this.bindCommentsLoad(true);
      return;
    }

    if (state.kind === "empty") {
      this.commentsEl.innerHTML = `
        <div class="vsa-empty">
          <strong>No comments</strong>
          <p>${escapeHtml(state.message)}</p>
          <button type="button" class="vsa-comments-load">Retry</button>
        </div>`;
      this.bindCommentsLoad(true);
      return;
    }

    const r = state.report;
    const moodClass =
      r.overallLabel === "positive"
        ? "is-pos"
        : r.overallLabel === "negative"
          ? "is-neg"
          : "is-neu";

    const head = document.createElement("div");
    head.className = `vsa-mood-head ${moodClass}`;
    head.innerHTML = `
      <div class="vsa-mood-title">
        <span class="vsa-mood-emoji" aria-hidden="true">${
          r.overallLabel === "positive"
            ? "😊"
            : r.overallLabel === "negative"
              ? "😕"
              : "😐"
        }</span>
        <div>
          <div class="vsa-mood-label">${escapeHtml(
            r.overallLabel === "positive"
              ? "Mostly positive"
              : r.overallLabel === "negative"
                ? "Mostly critical"
                : "Mixed reactions"
          )}</div>
          <div class="vsa-mood-meta">${r.totalAnalyzed} comments analyzed${
            r.totalReported
              ? ` · ${formatCount(r.totalReported)} total`
              : ""
          }${r.truncated ? " · sample" : ""}${
            r.videoId ? ` · ${escapeHtml(r.videoId.slice(0, 6))}…` : ""
          }</div>
        </div>
      </div>
      <div class="vsa-mood-bar" role="img" aria-label="Sentiment split">
        <span class="vsa-mood-seg vsa-mood-pos" style="flex:${Math.max(r.positivePct, 1)}" title="Positive ${r.positivePct}%"></span>
        <span class="vsa-mood-seg vsa-mood-neu" style="flex:${Math.max(r.neutralPct, 1)}" title="Neutral ${r.neutralPct}%"></span>
        <span class="vsa-mood-seg vsa-mood-neg" style="flex:${Math.max(r.negativePct, 1)}" title="Negative ${r.negativePct}%"></span>
      </div>
      <div class="vsa-mood-legend">
        <span class="vsa-leg-pos">${r.positivePct}% good</span>
        <span class="vsa-leg-neu">${r.neutralPct}% mixed</span>
        <span class="vsa-leg-neg">${r.negativePct}% bad</span>
      </div>
      <p class="vsa-mood-summary">${escapeHtml(r.summary)}</p>
      <div class="vsa-mood-engine">${
        r.engine === "ml"
          ? "On-device ML · DistilBERT"
          : r.engine === "mixed"
            ? "On-device ML + lexicon"
            : "Local lexicon"
      }</div>
    `;
    this.commentsEl.appendChild(head);

    if (r.themes.length > 0) {
      const themesWrap = document.createElement("div");
      themesWrap.className = "vsa-mood-section";
      themesWrap.innerHTML = `<div class="vsa-mood-section-title">What people talk about</div>`;
      const chips = document.createElement("div");
      chips.className = "vsa-theme-chips";
      for (const t of r.themes) {
        const chip = document.createElement("span");
        chip.className = `vsa-theme-chip lean-${t.lean}`;
        chip.title = `${t.count} mentions · lean ${t.lean}`;
        chip.innerHTML = `${escapeHtml(t.phrase)} <em>${t.count}</em>`;
        chips.appendChild(chip);
      }
      themesWrap.appendChild(chips);
      this.commentsEl.appendChild(themesWrap);
    }

    if (r.topPositive.length > 0) {
      this.commentsEl.appendChild(
        this.renderCommentList("Praised", r.topPositive, "pos")
      );
    }
    if (r.topNegative.length > 0) {
      this.commentsEl.appendChild(
        this.renderCommentList("Criticized", r.topNegative, "neg")
      );
    }
    if (
      r.samples.length > 0 &&
      r.topPositive.length === 0 &&
      r.topNegative.length === 0
    ) {
      this.commentsEl.appendChild(
        this.renderCommentList("Sample comments", r.samples, "neu")
      );
    }

    const actions = document.createElement("div");
    actions.className = "vsa-mood-actions";
    actions.innerHTML = `<button type="button" class="vsa-comments-load vsa-comments-refresh">Refresh</button>
      <span class="vsa-muted vsa-mood-note">Local analysis · no extra API key</span>`;
    this.commentsEl.appendChild(actions);
    this.bindCommentsLoad(true);
  }

  private renderCommentList(
    title: string,
    items: SentimentReport["topPositive"],
    tone: "pos" | "neg" | "neu"
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "vsa-mood-section";
    wrap.innerHTML = `<div class="vsa-mood-section-title">${escapeHtml(title)}</div>`;
    const list = document.createElement("div");
    list.className = "vsa-comment-list";
    for (const c of items) {
      const row = document.createElement("div");
      row.className = `vsa-comment-card tone-${tone}`;
      row.innerHTML = `
        <div class="vsa-comment-meta">
          <span class="vsa-comment-author">${escapeHtml(c.author)}</span>
          ${c.likes > 0 ? `<span class="vsa-comment-likes">♥ ${formatCount(c.likes)}</span>` : ""}
          ${c.publishedText ? `<span class="vsa-comment-when">${escapeHtml(c.publishedText)}</span>` : ""}
        </div>
        <div class="vsa-comment-text">${escapeHtml(truncate(c.text, 220))}</div>
      `;
      list.appendChild(row);
    }
    wrap.appendChild(list);
    return wrap;
  }

  private bindCommentsLoad(force = false): void {
    this.commentsEl
      .querySelectorAll(".vsa-comments-load")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handlers.onLoadComments?.(force);
        });
      });
  }
}

export function injectSearchPanelStyles(): void {
  // Allow hot-reload of styles during iteration
  document.getElementById("videosearch-ai-styles")?.remove();
  document.getElementById("videosearch-ai-fonts")?.remove();

  // Distinctive type — loaded once for any page
  const fonts = document.createElement("link");
  fonts.id = "videosearch-ai-fonts";
  fonts.rel = "stylesheet";
  fonts.href =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Sora:wght@400;500;600;700&display=swap";
  document.documentElement.appendChild(fonts);

  const style = document.createElement("style");
  style.id = "videosearch-ai-styles";
  style.textContent = VSA_STYLES;
  document.documentElement.appendChild(style);
}

/** Broadcast-studio UI: ink glass + signal mint. Fully scoped under #videosearch-ai-*. */
const VSA_STYLES = `
  /* ═══════════════════════════════════════════════════════════
     Compact floating widget — lives on the video, not the page
     ═══════════════════════════════════════════════════════════ */
  #videosearch-ai-root {
    --vsa-font: "Sora", system-ui, -apple-system, "Segoe UI", sans-serif;
    --vsa-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
    --vsa-bg: #0a0d10;
    --vsa-bg-elevated: #10151b;
    --vsa-surface: #161c24;
    --vsa-surface-2: #1c2430;
    --vsa-border: rgba(255,255,255,0.09);
    --vsa-border-strong: rgba(255,255,255,0.14);
    --vsa-text: #f2f5f7;
    --vsa-muted: #8b98a5;
    --vsa-faint: #5c6b78;
    --vsa-accent: #2dd4a8;
    --vsa-accent-2: #22b8cf;
    --vsa-accent-dim: rgba(45, 212, 168, 0.14);
    --vsa-accent-glow: rgba(45, 212, 168, 0.4);
    --vsa-radius: 18px;
    --vsa-ease: cubic-bezier(0.22, 1, 0.36, 1);
    --vsa-shadow:
      0 0 0 1px rgba(255,255,255,0.06) inset,
      0 18px 50px rgba(0,0,0,0.55),
      0 0 40px rgba(45,212,168,0.08);

    position: fixed !important;
    z-index: 2147483646;
    box-sizing: border-box;
    font-family: var(--vsa-font);
    -webkit-font-smoothing: antialiased;
    /* Dock over the player — bottom-right of viewport */
    right: max(16px, env(safe-area-inset-right, 0px));
    bottom: max(88px, env(safe-area-inset-bottom, 0px));
    left: auto;
    top: auto;
    width: min(380px, calc(100vw - 24px));
    max-height: min(78vh, 620px);
    margin: 0;
    pointer-events: auto !important;
  }

  #videosearch-ai-root *,
  #videosearch-ai-root *::before,
  #videosearch-ai-root *::after { box-sizing: border-box; }

  /* Collapsed = tiny glowing pill only */
  #videosearch-ai-root.is-collapsed,
  #videosearch-ai-panel.is-collapsed {
    width: auto;
    max-width: none;
  }
  #videosearch-ai-root.is-collapsed {
    bottom: max(96px, env(safe-area-inset-bottom, 0px));
  }

  #videosearch-ai-panel {
    position: relative;
    border-radius: var(--vsa-radius);
    background:
      radial-gradient(120% 90% at 0% 0%, rgba(45,212,168,0.18), transparent 50%),
      radial-gradient(100% 80% at 100% 0%, rgba(34,184,207,0.12), transparent 45%),
      linear-gradient(165deg, var(--vsa-bg-elevated) 0%, var(--vsa-bg) 100%);
    color: var(--vsa-text);
    border: 1px solid var(--vsa-border);
    box-shadow: var(--vsa-shadow);
    overflow: hidden;
    isolation: isolate;
    backdrop-filter: blur(20px) saturate(1.2);
    -webkit-backdrop-filter: blur(20px) saturate(1.2);
    max-height: inherit;
    display: flex;
    flex-direction: column;
    transition: box-shadow 0.25s var(--vsa-ease), transform 0.25s var(--vsa-ease);
  }

  #videosearch-ai-panel::before {
    content: "";
    pointer-events: none;
    position: absolute;
    inset: 0;
    opacity: 0.28;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E");
    mix-blend-mode: soft-light;
    z-index: 0;
  }
  #videosearch-ai-panel > * { position: relative; z-index: 1; }

  /* ── Collapsed pill mode ── */
  #videosearch-ai-root.is-collapsed #videosearch-ai-panel {
    border-radius: 999px;
    background: linear-gradient(135deg, #3ee6b5 0%, #2dd4a8 40%, #1eb8c9 100%);
    border: none;
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.2) inset,
      0 10px 32px rgba(45,212,168,0.45),
      0 0 48px rgba(45,212,168,0.2);
    animation: vsa-pulse-glow 2.8s ease-in-out infinite;
  }
  #videosearch-ai-root.is-collapsed #videosearch-ai-panel::before { display: none; }
  #videosearch-ai-root.is-collapsed .vsa-tabs,
  #videosearch-ai-root.is-collapsed .vsa-panel-body,
  #videosearch-ai-root.is-collapsed .vsa-status,
  #videosearch-ai-root.is-collapsed .vsa-collapse-btn { display: none !important; }

  #videosearch-ai-root.is-collapsed .vsa-bar {
    padding: 0;
    gap: 0;
  }
  #videosearch-ai-root.is-collapsed .vsa-brand {
    background: transparent;
    box-shadow: none;
    color: #04120e;
    padding: 10px 16px 10px 10px;
    gap: 8px;
  }
  #videosearch-ai-root.is-collapsed .vsa-logo {
    width: 28px;
    height: 28px;
    background: rgba(0,0,0,0.15);
  }
  #videosearch-ai-root.is-collapsed .vsa-title { font-size: 13px; color: #04120e; }
  #videosearch-ai-root.is-collapsed .vsa-title-sub { color: #04120e; opacity: 0.7; }
  #videosearch-ai-root.is-collapsed .vsa-badge {
    background: rgba(0,0,0,0.18);
    color: #04120e;
  }

  @keyframes vsa-pulse-glow {
    0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.2) inset, 0 10px 32px rgba(45,212,168,0.4), 0 0 40px rgba(45,212,168,0.15); }
    50% { box-shadow: 0 0 0 1px rgba(255,255,255,0.25) inset, 0 12px 40px rgba(45,212,168,0.55), 0 0 56px rgba(45,212,168,0.28); }
  }

  /* ── Header (expanded) ── */
  #videosearch-ai-panel .vsa-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 6px;
    flex-shrink: 0;
  }
  #videosearch-ai-panel .vsa-brand {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: none;
    cursor: pointer;
    padding: 4px 10px 4px 4px;
    border-radius: 999px;
    color: #04120e;
    background: linear-gradient(135deg, #3ee6b5 0%, #2dd4a8 45%, #1fb8c9 100%);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.12) inset, 0 4px 14px var(--vsa-accent-glow);
    transition: transform 0.18s var(--vsa-ease), filter 0.18s;
  }
  #videosearch-ai-panel .vsa-brand:hover { filter: brightness(1.06); transform: translateY(-1px); }
  #videosearch-ai-panel .vsa-brand[data-state="loading"] {
    background: linear-gradient(135deg, #60a5fa, #a78bfa);
    color: #0b1020;
  }
  #videosearch-ai-panel .vsa-brand[data-state="error"] {
    background: linear-gradient(135deg, #f87171, #ef4444);
    color: #1a0505;
  }
  #videosearch-ai-panel .vsa-brand[data-state="warn"] {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: #1a1000;
  }
  #videosearch-ai-panel .vsa-logo {
    display: inline-flex;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.16);
    flex-shrink: 0;
  }
  #videosearch-ai-panel .vsa-title-wrap {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    line-height: 1;
  }
  #videosearch-ai-panel .vsa-title {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  #videosearch-ai-panel .vsa-title-sub {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    opacity: 0.72;
  }
  #videosearch-ai-panel .vsa-badge {
    min-width: 18px;
    padding: 1px 5px;
    border-radius: 999px;
    background: rgba(0,0,0,0.18);
    font-family: var(--vsa-mono);
    font-size: 9.5px;
    font-weight: 600;
    text-align: center;
  }
  #videosearch-ai-panel .vsa-status {
    flex: 1;
    min-width: 0;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--vsa-muted);
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #videosearch-ai-panel .vsa-collapse-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border: 1px solid var(--vsa-border);
    border-radius: 9px;
    background: var(--vsa-surface);
    color: var(--vsa-muted);
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  #videosearch-ai-panel .vsa-collapse-btn:hover {
    color: var(--vsa-text);
    background: var(--vsa-surface-2);
  }

  /* ── Tabs: Search · Chat · Topics · Live · Mood · ⚙ ── */
  #videosearch-ai-panel .vsa-tabs {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr)) 30px;
    gap: 2px;
    padding: 0 6px 8px;
    flex-shrink: 0;
  }
  #videosearch-ai-panel .vsa-tab {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    min-height: 36px;
    min-width: 0;
    padding: 4px 2px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--vsa-muted);
    font-family: var(--vsa-font);
    font-size: 9.5px;
    font-weight: 600;
    cursor: pointer;
    pointer-events: auto !important;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    line-height: 1.1;
  }
  #videosearch-ai-panel .vsa-tab:hover {
    color: var(--vsa-text);
    background: rgba(255,255,255,0.04);
  }
  #videosearch-ai-panel .vsa-tab.is-active {
    color: var(--vsa-accent);
    background: var(--vsa-accent-dim);
    border-color: rgba(45,212,168,0.28);
  }
  #videosearch-ai-panel .vsa-tab-ico { font-size: 12px; opacity: 0.95; line-height: 1; }
  #videosearch-ai-panel .vsa-tab-txt {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #videosearch-ai-panel .vsa-tab-count:not(:empty) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 999px;
    background: rgba(45,212,168,0.22);
    color: var(--vsa-accent);
    font-family: var(--vsa-mono);
    font-size: 8.5px;
    font-weight: 600;
    position: absolute;
    top: 2px;
    right: 2px;
  }
  #videosearch-ai-panel .vsa-tab { position: relative; }
  #videosearch-ai-panel .vsa-tab-gear {
    padding: 0;
    flex-direction: row;
    min-height: 36px;
  }

  /* ── Body ── */
  #videosearch-ai-panel .vsa-panel-body {
    padding: 0 10px 10px;
    overflow: auto;
    flex: 1;
    min-height: 0;
    animation: vsa-fade-in 0.22s var(--vsa-ease);
  }
  #videosearch-ai-panel .vsa-pane { min-height: 0; }

  #videosearch-ai-panel .vsa-mode-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    margin-bottom: 8px;
    padding: 2px;
    border-radius: 10px;
    background: rgba(0,0,0,0.35);
    border: 1px solid var(--vsa-border);
  }
  #videosearch-ai-panel .vsa-mode {
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--vsa-muted);
    font-family: var(--vsa-font);
    font-size: 10.5px;
    font-weight: 600;
    padding: 6px 4px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  #videosearch-ai-panel .vsa-mode.is-active {
    color: var(--vsa-text);
    background: var(--vsa-surface-2);
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }

  #videosearch-ai-panel .vsa-input-row {
    display: flex;
    gap: 6px;
    align-items: stretch;
  }
  #videosearch-ai-panel .vsa-input {
    flex: 1;
    min-width: 0;
    padding: 9px 12px;
    border-radius: 12px;
    border: 1px solid var(--vsa-border-strong);
    background: rgba(0,0,0,0.4);
    color: var(--vsa-text);
    font-family: var(--vsa-font);
    font-size: 12.5px;
    font-weight: 500;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    pointer-events: auto !important;
    -webkit-user-select: text !important;
    user-select: text !important;
  }
  #videosearch-ai-panel .vsa-input::placeholder { color: var(--vsa-faint); }
  #videosearch-ai-panel .vsa-input:focus {
    border-color: rgba(45,212,168,0.55);
    box-shadow: 0 0 0 3px var(--vsa-accent-dim);
  }
  #videosearch-ai-panel .vsa-input.vsa-input-locked { opacity: 0.55; cursor: wait; }
  #videosearch-ai-panel .vsa-search-btn {
    flex-shrink: 0;
    min-width: 48px;
    padding: 0 12px;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    color: #04120e;
    font-family: var(--vsa-font);
    font-size: 12px;
    font-weight: 700;
    background: linear-gradient(135deg, #3ee6b5, #2dd4a8 50%, #22c3c0);
    box-shadow: 0 4px 14px var(--vsa-accent-glow);
    transition: transform 0.15s, filter 0.15s;
  }
  #videosearch-ai-panel .vsa-search-btn:hover { filter: brightness(1.06); transform: translateY(-1px); }

  /* Answer */
  #videosearch-ai-panel .vsa-answer {
    margin-top: 8px;
    padding: 10px 11px;
    border-radius: 12px;
    border: 1px solid rgba(45,212,168,0.28);
    background: linear-gradient(135deg, rgba(45,212,168,0.12), rgba(34,184,207,0.06));
  }
  #videosearch-ai-panel .vsa-answer-head {
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--vsa-accent);
    margin-bottom: 6px;
  }
  #videosearch-ai-panel .vsa-answer-body {
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--vsa-text);
    white-space: pre-wrap;
  }
  #videosearch-ai-panel .vsa-time-link {
    display: inline-flex;
    margin: 0 1px;
    padding: 1px 7px;
    border-radius: 999px;
    border: 1px solid rgba(45,212,168,0.45);
    background: rgba(45,212,168,0.16);
    color: var(--vsa-accent);
    font-family: var(--vsa-mono);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    vertical-align: baseline;
    pointer-events: auto !important;
  }
  #videosearch-ai-panel .vsa-time-link:hover {
    background: rgba(45,212,168,0.3);
    color: #6eecc4;
  }

  #videosearch-ai-panel .vsa-results-label {
    margin: 8px 0 5px;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--vsa-faint);
  }
  #videosearch-ai-panel .vsa-results {
    display: flex;
    flex-direction: column;
    gap: 5px;
    max-height: min(180px, 28vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--vsa-faint) transparent;
  }
  #videosearch-ai-panel .vsa-result {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 32px;
    gap: 8px;
    align-items: start;
    width: 100%;
    padding: 8px 9px;
    text-align: left;
    border: 1px solid var(--vsa-border);
    border-radius: 10px;
    background: var(--vsa-surface);
    color: var(--vsa-text);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, transform 0.12s;
  }
  #videosearch-ai-panel .vsa-result:hover,
  #videosearch-ai-panel .vsa-result-active {
    border-color: rgba(45,212,168,0.4);
    background: var(--vsa-surface-2);
    transform: translateY(-1px);
  }
  #videosearch-ai-panel .vsa-time {
    font-family: var(--vsa-mono);
    font-size: 11px;
    font-weight: 600;
    color: var(--vsa-accent);
  }
  #videosearch-ai-panel .vsa-snippet {
    font-size: 11.5px;
    line-height: 1.35;
    color: var(--vsa-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  #videosearch-ai-panel .vsa-score {
    font-family: var(--vsa-mono);
    font-size: 9.5px;
    font-weight: 600;
    color: var(--vsa-faint);
    text-align: right;
  }

  /* Topics */
  #videosearch-ai-panel .vsa-topics-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--vsa-muted);
    margin-bottom: 8px;
    line-height: 1.35;
  }
  #videosearch-ai-panel .vsa-topics-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: min(260px, 40vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    pointer-events: auto !important;
  }
  #videosearch-ai-panel .vsa-topic-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--vsa-border);
    background: var(--vsa-surface);
    color: var(--vsa-text);
    font-family: var(--vsa-font);
    font-size: 11.5px;
    font-weight: 550;
    cursor: pointer !important;
    pointer-events: auto !important;
    transition: border-color 0.15s, background 0.15s, transform 0.12s;
  }
  #videosearch-ai-panel .vsa-topic-chip:hover {
    border-color: rgba(45,212,168,0.45);
    background: var(--vsa-accent-dim);
    transform: translateY(-1px);
  }
  #videosearch-ai-panel .vsa-topic-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }
  #videosearch-ai-panel .vsa-topic-time {
    font-family: var(--vsa-mono);
    font-size: 10px;
    font-weight: 600;
    color: var(--vsa-accent);
    flex-shrink: 0;
  }

  /* Transcript */
  #videosearch-ai-panel .vsa-transcript {
    border: 1px solid var(--vsa-border);
    border-radius: 12px;
    background: rgba(0,0,0,0.3);
    overflow: hidden;
    margin: 0;
  }
  #videosearch-ai-panel .vsa-transcript-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--vsa-border);
    background: var(--vsa-accent-dim);
  }
  #videosearch-ai-panel .vsa-transcript-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--vsa-accent);
  }
  #videosearch-ai-panel .vsa-transcript-follow {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 500;
    color: var(--vsa-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  #videosearch-ai-panel .vsa-transcript-meta {
    padding: 4px 10px;
    font-family: var(--vsa-mono);
    font-size: 10px;
    color: var(--vsa-faint);
    border-bottom: 1px solid var(--vsa-border);
  }
  #videosearch-ai-panel .vsa-transcript-list {
    max-height: min(220px, 34vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 2px 0;
    scrollbar-width: thin;
  }
  #videosearch-ai-panel .vsa-transcript-line {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 8px;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--vsa-text);
    padding: 6px 10px;
    cursor: pointer;
    font-family: var(--vsa-font);
    font-size: 11.5px;
    line-height: 1.35;
    border-left: 3px solid transparent;
    transition: background 0.12s, border-color 0.12s;
  }
  #videosearch-ai-panel .vsa-transcript-line:hover { background: rgba(255,255,255,0.03); }
  #videosearch-ai-panel .vsa-transcript-line.is-active {
    background: var(--vsa-accent-dim);
    border-left-color: var(--vsa-accent);
  }
  #videosearch-ai-panel .vsa-transcript-line.is-active .vsa-transcript-text {
    font-weight: 600;
    color: var(--vsa-text);
  }
  #videosearch-ai-panel .vsa-transcript-time {
    font-family: var(--vsa-mono);
    font-size: 10px;
    font-weight: 600;
    color: var(--vsa-accent);
  }
  #videosearch-ai-panel .vsa-transcript-text { color: var(--vsa-muted); }

  /* Comments / Mood */
  #videosearch-ai-panel .vsa-comments {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: min(360px, 48vh);
    overflow-y: auto;
    padding-right: 2px;
    scrollbar-width: thin;
  }
  #videosearch-ai-panel .vsa-comments-load {
    margin-top: 8px;
    border: none;
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
    color: #04120e;
    font-family: var(--vsa-font);
    font-weight: 700;
    font-size: 12px;
    background: linear-gradient(135deg, #3ee6b5, #2dd4a8);
    box-shadow: 0 4px 14px var(--vsa-accent-glow);
  }
  #videosearch-ai-panel .vsa-comments-refresh {
    background: var(--vsa-surface-2);
    color: var(--vsa-text);
    box-shadow: none;
    border: 1px solid var(--vsa-border-strong);
    font-weight: 600;
  }
  #videosearch-ai-panel .vsa-mood-head {
    padding: 10px;
    border-radius: 12px;
    background: rgba(0,0,0,0.28);
    border: 1px solid var(--vsa-border);
  }
  #videosearch-ai-panel .vsa-mood-head.is-pos {
    background: linear-gradient(160deg, rgba(45,212,168,0.16), rgba(0,0,0,0.2));
  }
  #videosearch-ai-panel .vsa-mood-head.is-neg {
    background: linear-gradient(160deg, rgba(248,113,113,0.14), rgba(0,0,0,0.2));
  }
  #videosearch-ai-panel .vsa-mood-title {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-bottom: 10px;
  }
  #videosearch-ai-panel .vsa-mood-emoji { font-size: 22px; line-height: 1; }
  #videosearch-ai-panel .vsa-mood-label {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  #videosearch-ai-panel .vsa-mood-meta {
    font-size: 10.5px;
    color: var(--vsa-muted);
    margin-top: 2px;
  }
  #videosearch-ai-panel .vsa-mood-bar {
    display: flex;
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
    gap: 2px;
    background: rgba(0,0,0,0.25);
  }
  #videosearch-ai-panel .vsa-mood-seg { min-width: 2px; }
  #videosearch-ai-panel .vsa-mood-pos { background: #2dd4a8; }
  #videosearch-ai-panel .vsa-mood-neu { background: #64748b; }
  #videosearch-ai-panel .vsa-mood-neg { background: #f87171; }
  #videosearch-ai-panel .vsa-mood-legend {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin-top: 6px;
    font-size: 10px;
    font-weight: 600;
  }
  #videosearch-ai-panel .vsa-leg-pos { color: #2dd4a8; }
  #videosearch-ai-panel .vsa-leg-neu { color: var(--vsa-muted); }
  #videosearch-ai-panel .vsa-leg-neg { color: #f87171; }
  #videosearch-ai-panel .vsa-mood-summary {
    margin: 10px 0 0;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--vsa-text);
  }
  #videosearch-ai-panel .vsa-mood-engine {
    margin-top: 6px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--vsa-faint);
  }
  #videosearch-ai-panel .vsa-mood-section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--vsa-faint);
    margin-bottom: 6px;
  }
  #videosearch-ai-panel .vsa-theme-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  #videosearch-ai-panel .vsa-theme-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: var(--vsa-surface);
    border: 1px solid var(--vsa-border);
    color: var(--vsa-text);
  }
  #videosearch-ai-panel .vsa-theme-chip em {
    font-style: normal;
    font-family: var(--vsa-mono);
    font-size: 10px;
    color: var(--vsa-muted);
  }
  #videosearch-ai-panel .vsa-theme-chip.lean-positive {
    border-color: rgba(45,212,168,0.35);
    background: rgba(45,212,168,0.1);
  }
  #videosearch-ai-panel .vsa-theme-chip.lean-negative {
    border-color: rgba(248,113,113,0.35);
    background: rgba(248,113,113,0.1);
  }
  #videosearch-ai-panel .vsa-comment-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  #videosearch-ai-panel .vsa-comment-card {
    padding: 8px 9px;
    border-radius: 10px;
    background: rgba(0,0,0,0.22);
    border: 1px solid var(--vsa-border);
  }
  #videosearch-ai-panel .vsa-comment-card.tone-pos {
    border-left: 2px solid #2dd4a8;
  }
  #videosearch-ai-panel .vsa-comment-card.tone-neg {
    border-left: 2px solid #f87171;
  }
  #videosearch-ai-panel .vsa-comment-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-bottom: 4px;
    font-size: 10px;
    color: var(--vsa-faint);
  }
  #videosearch-ai-panel .vsa-comment-author {
    font-weight: 700;
    color: var(--vsa-muted);
  }
  #videosearch-ai-panel .vsa-comment-likes { color: #f472b6; }
  #videosearch-ai-panel .vsa-comment-text {
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--vsa-text);
    word-break: break-word;
  }
  #videosearch-ai-panel .vsa-mood-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding-top: 2px;
  }
  #videosearch-ai-panel .vsa-mood-note { font-size: 10px; }
  #videosearch-ai-panel .vsa-tab-count[data-mood="positive"] { color: #2dd4a8; }
  #videosearch-ai-panel .vsa-tab-count[data-mood="negative"] { color: #f87171; }

  /* Chat RAG */
  #videosearch-ai-panel .vsa-chat {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 220px;
    max-height: min(420px, 52vh);
  }
  #videosearch-ai-panel .vsa-chat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  #videosearch-ai-panel .vsa-chat-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  #videosearch-ai-panel .vsa-chat-clear {
    border: 1px solid var(--vsa-border);
    background: transparent;
    color: var(--vsa-muted);
    font-size: 10px;
    font-weight: 600;
    border-radius: 8px;
    padding: 4px 8px;
    cursor: pointer;
    font-family: var(--vsa-font);
  }
  #videosearch-ai-panel .vsa-chat-clear:hover { color: var(--vsa-text); }
  #videosearch-ai-panel .vsa-chat-status {
    font-size: 11px;
    color: var(--vsa-muted);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  #videosearch-ai-panel .vsa-chat-status.is-error { color: #f87171; }
  #videosearch-ai-panel .vsa-chat-list {
    flex: 1;
    min-height: 120px;
    max-height: min(260px, 36vh);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 2px;
    scrollbar-width: thin;
  }
  #videosearch-ai-panel .vsa-chat-empty {
    font-size: 11.5px;
    color: var(--vsa-muted);
    line-height: 1.45;
    padding: 6px 2px;
  }
  #videosearch-ai-panel .vsa-chat-empty strong {
    display: block;
    color: var(--vsa-text);
    margin-bottom: 4px;
  }
  #videosearch-ai-panel .vsa-chat-msg.role-user {
    display: flex;
    justify-content: flex-end;
  }
  #videosearch-ai-panel .vsa-chat-bubble {
    max-width: 96%;
    border-radius: 12px;
    padding: 8px 10px;
    font-size: 12px;
    line-height: 1.45;
  }
  #videosearch-ai-panel .vsa-chat-bubble.user {
    background: linear-gradient(135deg, rgba(45,212,168,0.28), rgba(34,184,207,0.18));
    border: 1px solid rgba(45,212,168,0.3);
    color: var(--vsa-text);
  }
  #videosearch-ai-panel .vsa-chat-bubble.assistant {
    background: rgba(0,0,0,0.28);
    border: 1px solid var(--vsa-border);
  }
  #videosearch-ai-panel .vsa-chat-meta {
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--vsa-faint);
    margin-bottom: 4px;
  }
  #videosearch-ai-panel .vsa-chat-bubble-text { white-space: pre-wrap; word-break: break-word; }
  #videosearch-ai-panel .vsa-time-pill {
    display: inline-flex;
    align-items: center;
    margin: 0 2px;
    padding: 1px 6px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    font-family: var(--vsa-mono);
    font-size: 10.5px;
    font-weight: 600;
    color: #04120e;
    background: linear-gradient(135deg, #3ee6b5, #2dd4a8);
    vertical-align: baseline;
  }
  #videosearch-ai-panel .vsa-chat-sources {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  #videosearch-ai-panel .vsa-chat-sources-label {
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--vsa-faint);
  }
  #videosearch-ai-panel .vsa-chat-source {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    text-align: left;
    width: 100%;
    border: 1px solid var(--vsa-border);
    background: rgba(0,0,0,0.2);
    border-radius: 8px;
    padding: 5px 7px;
    cursor: pointer;
    color: var(--vsa-text);
    font-family: var(--vsa-font);
  }
  #videosearch-ai-panel .vsa-chat-source:hover {
    border-color: rgba(45,212,168,0.35);
  }
  #videosearch-ai-panel .vsa-chat-source .vsa-time {
    font-family: var(--vsa-mono);
    font-size: 10px;
    font-weight: 600;
    color: var(--vsa-accent);
    flex-shrink: 0;
  }
  #videosearch-ai-panel .vsa-chat-source .vsa-snippet {
    font-size: 10.5px;
    color: var(--vsa-muted);
    line-height: 1.3;
  }
  #videosearch-ai-panel .vsa-chat-suggest {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  #videosearch-ai-panel .vsa-chat-suggest[hidden] { display: none !important; }
  #videosearch-ai-panel .vsa-chat-chip {
    border: 1px solid var(--vsa-border);
    background: var(--vsa-surface);
    color: var(--vsa-muted);
    font-size: 10px;
    font-weight: 600;
    border-radius: 999px;
    padding: 4px 8px;
    cursor: pointer;
    font-family: var(--vsa-font);
    line-height: 1.25;
    text-align: left;
  }
  #videosearch-ai-panel .vsa-chat-chip:hover {
    color: var(--vsa-accent);
    border-color: rgba(45,212,168,0.35);
  }
  #videosearch-ai-panel .vsa-chat-composer {
    display: flex;
    gap: 6px;
    align-items: flex-end;
  }
  #videosearch-ai-panel .vsa-chat-input {
    flex: 1;
    min-width: 0;
    resize: none;
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid var(--vsa-border-strong);
    background: rgba(0,0,0,0.4);
    color: var(--vsa-text);
    font-family: var(--vsa-font);
    font-size: 12.5px;
    line-height: 1.35;
    outline: none;
  }
  #videosearch-ai-panel .vsa-chat-input:focus {
    border-color: rgba(45,212,168,0.55);
    box-shadow: 0 0 0 3px var(--vsa-accent-dim);
  }
  #videosearch-ai-panel .vsa-chat-send {
    flex-shrink: 0;
    min-width: 52px;
    height: 40px;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    color: #04120e;
    font-family: var(--vsa-font);
    font-size: 12px;
    font-weight: 700;
    background: linear-gradient(135deg, #3ee6b5, #2dd4a8);
    box-shadow: 0 4px 14px var(--vsa-accent-glow);
  }
  #videosearch-ai-panel .vsa-chat-send:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  /* Settings */
  #videosearch-ai-panel .vsa-settings-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 3px;
  }
  #videosearch-ai-panel .vsa-settings-help {
    font-size: 11px;
    color: var(--vsa-muted);
    margin: 0 0 10px;
    line-height: 1.4;
  }
  #videosearch-ai-panel .vsa-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--vsa-faint);
  }
  #videosearch-ai-panel .vsa-field input {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--vsa-border-strong);
    background: rgba(0,0,0,0.35);
    color: var(--vsa-text);
    font-family: var(--vsa-mono);
    font-size: 12px;
    font-weight: 500;
    text-transform: none;
    letter-spacing: 0;
  }
  #videosearch-ai-panel .vsa-field input:focus {
    outline: none;
    border-color: rgba(45,212,168,0.5);
    box-shadow: 0 0 0 3px var(--vsa-accent-dim);
  }
  #videosearch-ai-panel .vsa-settings-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  #videosearch-ai-panel .vsa-save-settings {
    border: none;
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
    color: #04120e;
    font-family: var(--vsa-font);
    font-weight: 700;
    font-size: 12px;
    background: linear-gradient(135deg, #3ee6b5, #2dd4a8);
    box-shadow: 0 4px 14px var(--vsa-accent-glow);
  }
  #videosearch-ai-panel .vsa-settings-msg { font-size: 11px; color: var(--vsa-muted); }

  #videosearch-ai-panel .vsa-hint,
  #videosearch-ai-panel .vsa-empty {
    font-size: 11.5px;
    color: var(--vsa-muted);
    padding: 8px 2px;
    line-height: 1.45;
  }
  #videosearch-ai-panel .vsa-empty strong {
    color: var(--vsa-text);
    display: block;
    margin-bottom: 3px;
    font-size: 12px;
  }
  #videosearch-ai-panel .vsa-retry {
    margin-top: 8px;
    padding: 7px 12px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, #3ee6b5, #2dd4a8);
    color: #04120e;
    font-family: var(--vsa-font);
    font-weight: 700;
    cursor: pointer;
  }
  #videosearch-ai-panel .vsa-spinner {
    display: inline-block;
    width: 9px;
    height: 9px;
    border: 2px solid var(--vsa-faint);
    border-top-color: var(--vsa-accent);
    border-radius: 50%;
    animation: vsa-spin 0.65s linear infinite;
    vertical-align: -1px;
    margin-right: 4px;
  }

  @keyframes vsa-spin { to { transform: rotate(360deg); } }
  @keyframes vsa-fade-in {
    from { opacity: 0; transform: translateY(6px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* Light YouTube theme */
  html:not([dark]) #videosearch-ai-panel {
    --vsa-bg: #f4f7fa;
    --vsa-bg-elevated: #ffffff;
    --vsa-surface: #eef2f6;
    --vsa-surface-2: #e3e9ef;
    --vsa-border: rgba(15,23,32,0.08);
    --vsa-border-strong: rgba(15,23,32,0.12);
    --vsa-text: #0f1720;
    --vsa-muted: #5b6b7a;
    --vsa-faint: #7d8c9a;
    --vsa-accent: #0d9f7a;
    --vsa-accent-dim: rgba(13,159,122,0.1);
    --vsa-accent-glow: rgba(13,159,122,0.22);
    --vsa-shadow: 0 16px 40px rgba(15,23,32,0.14), 0 0 0 1px rgba(15,23,32,0.05);
  }
  html:not([dark]) #videosearch-ai-panel .vsa-mode-row,
  html:not([dark]) #videosearch-ai-panel .vsa-input,
  html:not([dark]) #videosearch-ai-panel .vsa-field input,
  html:not([dark]) #videosearch-ai-panel .vsa-transcript {
    background: rgba(255,255,255,0.9);
  }
  html:not([dark]) #videosearch-ai-root.is-collapsed #videosearch-ai-panel {
    box-shadow: 0 10px 32px rgba(13,159,122,0.35);
  }

  /* Mobile */
  @media (max-width: 560px) {
    #videosearch-ai-root {
      right: 10px;
      left: 10px;
      width: auto;
      max-width: none;
      bottom: max(72px, env(safe-area-inset-bottom, 0px));
    }
    #videosearch-ai-root.is-collapsed {
      left: auto;
      right: 12px;
      width: auto;
    }
    #videosearch-ai-panel .vsa-status { display: none; }
    #videosearch-ai-panel .vsa-tab-txt { font-size: 8.5px; }
    #videosearch-ai-panel .vsa-tab { min-height: 34px; }
    #videosearch-ai-panel .vsa-tab-ico { font-size: 13px; }
    #videosearch-ai-panel .vsa-tabs {
      grid-template-columns: repeat(5, minmax(0, 1fr)) 28px;
    }
    #videosearch-ai-panel .vsa-tab-txt { font-size: 8px; }
    #videosearch-ai-panel .vsa-input { font-size: 16px; } /* no iOS zoom */
    #videosearch-ai-panel .vsa-results,
    #videosearch-ai-panel .vsa-transcript-list {
      max-height: min(160px, 28vh);
    }
    #videosearch-ai-panel .vsa-topic-label { max-width: 42vw; }
  }

  @media (prefers-reduced-motion: reduce) {
    #videosearch-ai-panel *,
    #videosearch-ai-root.is-collapsed #videosearch-ai-panel {
      animation: none !important;
      transition: none !important;
    }
  }
`;

function formatTimestamp(seconds: number): string {
  let s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) s = 0;
  if (s > 100_000) s = s / 1000;
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Parse m:ss / h:mm:ss (optionally wrapped in () [] or after "at ") into seconds.
 */
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

/**
 * Render answer text with clickable timestamp pills.
 * Matches: (3:42), [1:05:30], 3:42, at 12:05
 */
function fillAnswerWithTimeLinks(
  container: HTMLElement,
  answer: string,
  onSeek: (seconds: number) => void
): void {
  // Global regex — capture full timestamp tokens
  const re =
    /(\bat\s+)?(\[|\()?(\d{1,2}:\d{2}(?::\d{2})?)(\]|\))?/gi;

  let last = 0;
  let match: RegExpExecArray | null;
  const text = answer;

  while ((match = re.exec(text)) !== null) {
    const full = match[0];
    const timeStr = match[3];
    const seconds = parseTimestampToken(timeStr);
    if (seconds == null) continue;

    // Skip bare numbers that look like ratios if no colon structure — already have colon
    // Avoid matching version-like if needed later

    if (match.index > last) {
      container.appendChild(
        document.createTextNode(text.slice(last, match.index))
      );
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vsa-time-link";
    btn.textContent = timeStr;
    btn.title = `Jump to ${timeStr}`;
    let lastJumpAt = 0;
    const jump = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastJumpAt < 350) return;
      lastJumpAt = now;
      console.info("[VideoSearch AI] Answer timestamp click →", timeStr, seconds);
      onSeek(seconds);
    };
    btn.addEventListener("click", jump);
    btn.addEventListener("pointerup", jump);
    container.appendChild(btn);

    last = match.index + full.length;
  }

  if (last < text.length) {
    container.appendChild(document.createTextNode(text.slice(last)));
  }

  // If no timestamps found, still show plain text
  if (!container.childNodes.length) {
    container.textContent = answer;
  }
}

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
