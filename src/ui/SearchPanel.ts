/**
 * Compact tabbed UI:
 *   Search | Topics | Transcript   (+ settings gear)
 * Only one section is open at a time so it doesn't eat the player.
 */

import type { RawCaptionSegment, SearchResult } from "../types/schema";
import type { VideoTopic } from "../topics/extractTopics";
import {
  DEFAULT_LLM_SETTINGS,
  loadLlmSettings,
  maskKey,
  saveLlmSettings,
  type LlmSettings,
} from "../settings/llmSettings";
import { LiveTranscript } from "./LiveTranscript";

export type PanelStatus =
  | { kind: "idle" }
  | { kind: "indexing"; message: string; ratio?: number }
  | {
      kind: "ready";
      chunkCount: number;
      fromCache: boolean;
      topics: VideoTopic[];
      topicSource?: "llm" | "local";
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

export interface SearchPanelHandlers {
  onSearch: (query: string, mode: QueryMode) => void;
  onSeek: (startTime: number) => void;
  onRetry: () => void;
  onToggle?: (open: boolean) => void;
  onTopicClick?: (topic: VideoTopic) => void;
  onSettingsSaved?: () => void;
}

type TabId = "search" | "topics" | "transcript" | "settings";

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
  private paneSearch: HTMLElement;
  private paneTopics: HTMLElement;
  private paneTranscript: HTMLElement;
  private paneSettings: HTMLElement;
  private handlers: SearchPanelHandlers;
  private debounceTimer: number | null = null;
  private expanded = true;
  private activeTab: TabId = "search";
  private lastTopics: VideoTopic[] = [];
  private inputLocked = true;
  private liveTranscript: LiveTranscript;
  private answerEl: HTMLElement;
  private queryMode: QueryMode = "auto";

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
          <button type="button" class="vsa-tab" data-tab="topics" role="tab" aria-selected="false">
            <span class="vsa-tab-ico" aria-hidden="true">◈</span>
            <span class="vsa-tab-txt">Topics</span>
            <span class="vsa-tab-count" data-count="topics"></span>
          </button>
          <button type="button" class="vsa-tab" data-tab="transcript" role="tab" aria-selected="false">
            <span class="vsa-tab-ico" aria-hidden="true">☰</span>
            <span class="vsa-tab-txt">Live</span>
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
        <div class="vsa-pane vsa-pane-topics" data-pane="topics" hidden>
          <div class="vsa-topics"></div>
        </div>
        <div class="vsa-pane vsa-pane-transcript" data-pane="transcript" hidden>
          <div class="vsa-transcript-host"></div>
        </div>
        <div class="vsa-pane vsa-pane-settings" data-pane="settings" hidden>
          <div class="vsa-settings">
            <div class="vsa-settings-title">Smart topics &amp; Ask</div>
            <p class="vsa-settings-help">
              Optional API key for topic labels and answers. Search embeddings stay on your device.
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
    this.paneSearch = this.root.querySelector(
      '[data-pane="search"]'
    ) as HTMLElement;
    this.paneTopics = this.root.querySelector(
      '[data-pane="topics"]'
    ) as HTMLElement;
    this.paneTranscript = this.root.querySelector(
      '[data-pane="transcript"]'
    ) as HTMLElement;
    this.paneSettings = this.root.querySelector(
      '[data-pane="settings"]'
    ) as HTMLElement;

    const host = this.root.querySelector(
      ".vsa-transcript-host"
    ) as HTMLElement;
    this.liveTranscript = new LiveTranscript((t) => this.handlers.onSeek(t));
    host.appendChild(this.liveTranscript.root);

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

  isInputFocused(): boolean {
    return (
      document.activeElement === this.inputEl ||
      this.root.contains(document.activeElement)
    );
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
        this.lockInput(true);
        this.statusEl.textContent = "Starting…";
        this.badgeEl.textContent = "…";
        this.setBrandState("loading");
        break;

      case "indexing": {
        this.lockInput(true);
        const pct =
          typeof status.ratio === "number"
            ? ` ${Math.round(status.ratio * 100)}%`
            : "";
        this.statusEl.innerHTML = `<span class="vsa-spinner"></span> ${escapeHtml(status.message)}${pct}`;
        this.badgeEl.textContent = "…";
        this.setBrandState("loading");
        break;
      }

      case "ready":
        this.lockInput(false);
        {
          const src =
            status.topicSource === "llm"
              ? "AI"
              : status.topicSource === "local"
                ? "local"
                : "";
          this.statusEl.textContent = status.fromCache
            ? `Ready · ${status.topics.length} topics${src ? ` (${src})` : ""}`
            : `Ready · ${status.chunkCount} chunks`;
        }
        this.badgeEl.textContent = String(
          status.topics.length || status.chunkCount
        );
        this.setBrandState("ready");
        if (!this.resultsEl.querySelector(".vsa-result")) {
          this.resultsEl.innerHTML = `<div class="vsa-hint">
            <strong>Search</strong> for moments, or <strong>Ask</strong> questions like
            “What happened in this episode?” / “How did this person behave?”
          </div>`;
        }
        this.answerEl.hidden = true;
        break;

      case "no-captions":
        this.lockInput(true);
        this.statusEl.textContent = "No captions";
        this.badgeEl.textContent = "!";
        this.setBrandState("warn");
        this.switchTab("search");
        this.resultsEl.innerHTML = `
          <div class="vsa-empty">
            <strong>No captions on this video</strong>
            <p>${escapeHtml(status.message)}</p>
            <button type="button" class="vsa-retry">Retry</button>
          </div>`;
        this.bindRetry();
        break;

      case "error":
        this.lockInput(false);
        this.statusEl.textContent = "Error";
        this.badgeEl.textContent = "✕";
        this.setBrandState("error");
        this.switchTab("search");
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
        this.switchTab("search");
        this.answerEl.hidden = true;
        break;

      case "results":
        this.lockInput(false);
        this.statusEl.textContent = `${status.results.length} moment${status.results.length === 1 ? "" : "s"}`;
        this.setBrandState("ready");
        this.switchTab("search");
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
        this.switchTab("search");
        this.renderAnswer(status.answer, status.usedLlm);
        this.renderResults(status.results, "Source moment");
        break;

      case "no-results":
        this.lockInput(false);
        this.statusEl.textContent = "No strong matches";
        this.setBrandState("ready");
        this.switchTab("search");
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
    this.root.querySelector(".vsa-tabs")?.toggleAttribute("hidden", !open);
    this.root.classList.toggle("is-collapsed", !open);
    this.root.classList.toggle("is-expanded", open);
    // Parent float wrapper (same node if root is inside #videosearch-ai-root)
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
    this.paneTopics.hidden = tab !== "topics";
    this.paneTranscript.hidden = tab !== "transcript";
    this.paneSettings.hidden = tab !== "settings";

    if (tab === "settings") {
      void loadLlmSettings().then((s) => this.fillSettingsForm(s));
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
    const stop = (e: Event) => e.stopPropagation();
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
      this.inputEl.addEventListener(type, stop, true);
    }
    for (const type of ["mousedown", "mouseup", "click", "dblclick"] as const) {
      this.root.addEventListener(type, stop, false);
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
    source?: "llm" | "local"
  ): void {
    this.topicsEl.innerHTML = "";
    if (!topics.length) {
      this.topicsEl.innerHTML = `<div class="vsa-hint">No topics yet. Wait until Ready, or check Settings.</div>`;
      return;
    }

    const heading = document.createElement("div");
    heading.className = "vsa-topics-label";
    heading.textContent =
      source === "llm"
        ? "Main topics — click to jump & search"
        : "Topics — click to jump & search";
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
    width: min(340px, calc(100vw - 24px));
    max-height: min(72vh, 560px);
    margin: 0;
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

  /* ── Tabs (compact) ── */
  #videosearch-ai-panel .vsa-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 34px;
    gap: 3px;
    padding: 0 8px 8px;
    flex-shrink: 0;
  }
  #videosearch-ai-panel .vsa-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 30px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--vsa-muted);
    font-family: var(--vsa-font);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
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
  #videosearch-ai-panel .vsa-tab-ico { font-size: 11px; opacity: 0.9; }
  #videosearch-ai-panel .vsa-tab-count:not(:empty) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: rgba(45,212,168,0.22);
    color: var(--vsa-accent);
    font-family: var(--vsa-mono);
    font-size: 9px;
    font-weight: 600;
  }
  #videosearch-ai-panel .vsa-tab-gear { padding: 0; }

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
    #videosearch-ai-panel .vsa-tab-txt { display: none; }
    #videosearch-ai-panel .vsa-tab { position: relative; min-height: 32px; }
    #videosearch-ai-panel .vsa-tab-ico { font-size: 13px; }
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
