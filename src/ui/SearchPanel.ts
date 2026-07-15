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
          <button type="button" class="vsa-brand" title="Collapse / expand">
            <span class="vsa-logo" aria-hidden="true">⌕</span>
            <span class="vsa-title">VideoSearch AI</span>
            <span class="vsa-badge">…</span>
          </button>
          <div class="vsa-status" role="status">Starting…</div>
          <button type="button" class="vsa-collapse-btn" title="Minimize" aria-label="Minimize">−</button>
        </div>
        <div class="vsa-tabs" role="tablist">
          <button type="button" class="vsa-tab is-active" data-tab="search" role="tab" aria-selected="true">Search</button>
          <button type="button" class="vsa-tab" data-tab="topics" role="tab" aria-selected="false">Topics <span class="vsa-tab-count" data-count="topics"></span></button>
          <button type="button" class="vsa-tab" data-tab="transcript" role="tab" aria-selected="false">Transcript</button>
          <button type="button" class="vsa-tab vsa-tab-gear" data-tab="settings" role="tab" aria-selected="false" title="Settings">⚙</button>
        </div>
      </div>
      <div class="vsa-panel-body">
        <div class="vsa-pane vsa-pane-search" data-pane="search">
          <div class="vsa-mode-row">
            <button type="button" class="vsa-mode is-active" data-mode="auto" title="Keywords search; questions get an AI answer">Auto</button>
            <button type="button" class="vsa-mode" data-mode="search" title="Only find timestamps">Search</button>
            <button type="button" class="vsa-mode" data-mode="ask" title="Always answer with AI + sources">Ask</button>
          </div>
          <div class="vsa-input-row">
            <input
              type="text"
              class="vsa-input"
              placeholder="Search moments, or ask: What was her behavior?"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              enterkeyhint="search"
            />
            <button type="button" class="vsa-search-btn">Go</button>
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
            <div class="vsa-settings-title">Smart topics</div>
            <p class="vsa-settings-help">
              API key powers main-topic labels. Search stays on your device.
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
              <button type="button" class="vsa-save-settings">Save &amp; refresh topics</button>
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
    const btn = this.root.querySelector(
      ".vsa-collapse-btn"
    ) as HTMLButtonElement | null;
    if (btn) btn.textContent = open ? "−" : "+";
    if (btn) btn.title = open ? "Minimize" : "Expand";
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
    if (tab === "search" && !this.inputLocked) {
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
  if (document.getElementById("videosearch-ai-styles")) return;
  const style = document.createElement("style");
  style.id = "videosearch-ai-styles";
  style.textContent = `
    #videosearch-ai-root {
      position: relative;
      z-index: 2147483646;
      margin: 8px 0 10px;
      font-family: "Roboto", "Arial", sans-serif;
      width: 100%;
      max-width: 640px;
      box-sizing: border-box;
    }
    #videosearch-ai-root[data-vsa-float="1"] {
      position: fixed !important;
      top: 72px;
      right: 12px;
      width: min(380px, calc(100vw - 24px));
      margin: 0;
      z-index: 2147483647;
      filter: drop-shadow(0 8px 24px rgba(0,0,0,0.45));
    }
    #videosearch-ai-panel {
      --vsa-bg: #0f0f0f;
      --vsa-surface: #212121;
      --vsa-border: #303030;
      --vsa-text: #f1f1f1;
      --vsa-muted: #aaaaaa;
      border: 1px solid var(--vsa-border);
      border-radius: 12px;
      background: var(--vsa-bg);
      color: var(--vsa-text);
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    }

    /* Header */
    #videosearch-ai-panel .vsa-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 8px;
      background: linear-gradient(90deg, rgba(16,185,129,0.16), rgba(59,130,246,0.12));
    }
    #videosearch-ai-panel .vsa-brand {
      display: inline-flex; align-items: center; gap: 7px;
      border: none; cursor: pointer; padding: 4px 10px 4px 4px;
      border-radius: 999px; font-size: 12px; font-weight: 600; color: #fff;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
    #videosearch-ai-panel .vsa-brand[data-state="loading"] {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
    }
    #videosearch-ai-panel .vsa-brand[data-state="error"] {
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
    }
    #videosearch-ai-panel .vsa-brand[data-state="warn"] {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    }
    #videosearch-ai-panel .vsa-logo {
      display: inline-flex; width: 22px; height: 22px; border-radius: 50%;
      align-items: center; justify-content: center;
      background: rgba(255,255,255,0.2); font-size: 13px;
    }
    #videosearch-ai-panel .vsa-badge {
      min-width: 18px; padding: 0 5px; border-radius: 9px;
      background: rgba(0,0,0,0.25); font-size: 10px; font-weight: 700; text-align: center;
    }
    #videosearch-ai-panel .vsa-status {
      flex: 1; font-size: 11px; color: var(--vsa-muted); text-align: right;
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #videosearch-ai-panel .vsa-collapse-btn {
      border: none; background: var(--vsa-surface); color: var(--vsa-muted);
      width: 26px; height: 26px; border-radius: 8px; cursor: pointer; font-size: 16px; line-height: 1;
    }
    #videosearch-ai-panel .vsa-collapse-btn:hover { color: var(--vsa-text); }

    /* Tabs */
    #videosearch-ai-panel .vsa-tabs {
      display: flex; gap: 2px; padding: 0 6px 6px;
      border-bottom: 1px solid var(--vsa-border);
      background: linear-gradient(90deg, rgba(16,185,129,0.06), transparent);
    }
    #videosearch-ai-panel .vsa-tab {
      flex: 1; border: none; background: transparent; color: var(--vsa-muted);
      font-size: 12px; font-weight: 600; padding: 7px 6px; border-radius: 8px;
      cursor: pointer; transition: background 0.12s, color 0.12s;
    }
    #videosearch-ai-panel .vsa-tab:hover { color: var(--vsa-text); background: var(--vsa-surface); }
    #videosearch-ai-panel .vsa-tab.is-active {
      color: #fff; background: rgba(16,185,129,0.28);
    }
    #videosearch-ai-panel .vsa-tab-gear { flex: 0 0 36px; font-size: 14px; }
    #videosearch-ai-panel .vsa-tab-count:not(:empty)::before { content: ""; }
    #videosearch-ai-panel .vsa-tab-count:not(:empty) {
      display: inline-block; margin-left: 3px; min-width: 16px; padding: 0 5px;
      border-radius: 8px; background: rgba(16,185,129,0.35); font-size: 10px;
    }

    /* Panes */
    #videosearch-ai-panel .vsa-panel-body { padding: 8px 10px 10px; }
    #videosearch-ai-panel .vsa-pane { min-height: 0; }

    #videosearch-ai-panel .vsa-mode-row {
      display: flex; gap: 4px; margin-bottom: 8px;
    }
    #videosearch-ai-panel .vsa-mode {
      flex: 1; border: 1px solid var(--vsa-border); background: var(--vsa-surface);
      color: var(--vsa-muted); font-size: 11px; font-weight: 600;
      padding: 5px 6px; border-radius: 8px; cursor: pointer;
    }
    #videosearch-ai-panel .vsa-mode.is-active {
      color: #fff; border-color: #10b981; background: rgba(16,185,129,0.28);
    }
    #videosearch-ai-panel .vsa-answer {
      margin: 8px 0; padding: 10px 12px; border-radius: 10px;
      border: 1px solid rgba(16,185,129,0.35);
      background: rgba(16,185,129,0.1);
    }
    #videosearch-ai-panel .vsa-answer-head {
      font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
      text-transform: uppercase; color: #34d399; margin-bottom: 6px;
    }
    #videosearch-ai-panel .vsa-answer-body {
      font-size: 13px; line-height: 1.5; color: var(--vsa-text);
      white-space: pre-wrap;
    }
    #videosearch-ai-panel .vsa-time-link {
      display: inline-flex; align-items: center; gap: 2px;
      margin: 0 1px; padding: 1px 7px; border-radius: 999px;
      border: 1px solid rgba(16,185,129,0.55);
      background: rgba(16,185,129,0.18); color: #34d399;
      font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
      cursor: pointer; text-decoration: none; vertical-align: baseline;
      pointer-events: auto !important;
    }
    #videosearch-ai-panel .vsa-time-link:hover {
      background: rgba(16,185,129,0.35); border-color: #10b981; color: #6ee7b7;
    }
    #videosearch-ai-panel .vsa-time-link:active { transform: scale(0.96); }
    #videosearch-ai-panel .vsa-results-label {
      font-size: 10px; font-weight: 600; color: var(--vsa-muted);
      text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px;
    }
    #videosearch-ai-panel .vsa-input-row { display: flex; gap: 6px; }
    #videosearch-ai-panel .vsa-input {
      flex: 1; box-sizing: border-box; padding: 8px 12px; border-radius: 18px;
      border: 1px solid var(--vsa-border); background: var(--vsa-surface);
      color: var(--vsa-text); font-size: 13px; outline: none;
      pointer-events: auto !important; user-select: text !important;
    }
    #videosearch-ai-panel .vsa-input:focus { border-color: #10b981; box-shadow: 0 0 0 1px #10b981; }
    #videosearch-ai-panel .vsa-input.vsa-input-locked { opacity: 0.65; cursor: wait; }
    #videosearch-ai-panel .vsa-search-btn {
      border: none; border-radius: 18px; padding: 0 12px; cursor: pointer;
      background: linear-gradient(135deg, #10b981, #059669); color: #fff;
      font-weight: 600; font-size: 12px; white-space: nowrap;
    }

    #videosearch-ai-panel .vsa-results {
      margin-top: 8px; display: flex; flex-direction: column; gap: 5px;
      max-height: 200px; overflow-y: auto;
    }
    #videosearch-ai-panel .vsa-result {
      display: grid; grid-template-columns: 48px 1fr 36px; gap: 8px; align-items: start;
      text-align: left; width: 100%; padding: 8px 10px; border: 1px solid var(--vsa-border);
      border-radius: 9px; background: var(--vsa-surface); color: var(--vsa-text); cursor: pointer;
    }
    #videosearch-ai-panel .vsa-result:hover, #videosearch-ai-panel .vsa-result-active {
      border-color: #10b981; background: #2a2a2a;
    }
    #videosearch-ai-panel .vsa-time { font-variant-numeric: tabular-nums; font-weight: 700; color: #34d399; font-size: 12px; }
    #videosearch-ai-panel .vsa-snippet {
      font-size: 12px; line-height: 1.35; display: -webkit-box;
      -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    #videosearch-ai-panel .vsa-score { font-size: 10px; color: var(--vsa-muted); text-align: right; }

    /* Topics pane */
    #videosearch-ai-panel .vsa-topics-label {
      font-size: 11px; font-weight: 600; color: var(--vsa-muted); margin-bottom: 8px;
    }
    #videosearch-ai-panel .vsa-topics-row {
      display: flex; flex-wrap: wrap; gap: 6px; max-height: 220px; overflow-y: auto;
      pointer-events: auto !important;
    }
    #videosearch-ai-panel .vsa-topic-chip {
      display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
      padding: 6px 11px; border-radius: 999px; border: 1px solid var(--vsa-border);
      background: var(--vsa-surface); color: var(--vsa-text); font-size: 12px; font-weight: 500;
      cursor: pointer !important; pointer-events: auto !important;
    }
    #videosearch-ai-panel .vsa-topic-chip:hover {
      border-color: #10b981; background: rgba(16,185,129,0.18);
    }
    #videosearch-ai-panel .vsa-topic-label {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;
    }
    #videosearch-ai-panel .vsa-topic-time {
      font-variant-numeric: tabular-nums; font-size: 10px; font-weight: 700; color: #34d399;
    }

    /* Transcript pane — fill the tab only */
    #videosearch-ai-panel .vsa-transcript {
      border: 1px solid var(--vsa-border); border-radius: 10px;
      background: var(--vsa-surface); overflow: hidden; margin: 0;
    }
    #videosearch-ai-panel .vsa-transcript-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 10px; border-bottom: 1px solid var(--vsa-border);
      background: rgba(16,185,129,0.08);
    }
    #videosearch-ai-panel .vsa-transcript-title {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em;
    }
    #videosearch-ai-panel .vsa-transcript-follow {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; color: var(--vsa-muted); cursor: pointer;
    }
    #videosearch-ai-panel .vsa-transcript-meta {
      padding: 3px 10px; font-size: 10px; color: var(--vsa-muted);
      border-bottom: 1px solid var(--vsa-border);
    }
    #videosearch-ai-panel .vsa-transcript-list {
      max-height: 240px; overflow-y: auto; padding: 2px 0;
    }
    #videosearch-ai-panel .vsa-transcript-line {
      display: grid; grid-template-columns: 44px 1fr; gap: 8px;
      width: 100%; text-align: left; border: none; background: transparent;
      color: var(--vsa-text); padding: 6px 10px; cursor: pointer;
      font-size: 12px; line-height: 1.35; border-left: 3px solid transparent;
    }
    #videosearch-ai-panel .vsa-transcript-line:hover { background: rgba(16,185,129,0.08); }
    #videosearch-ai-panel .vsa-transcript-line.is-active {
      background: rgba(16,185,129,0.18); border-left-color: #10b981;
    }
    #videosearch-ai-panel .vsa-transcript-line.is-active .vsa-transcript-text { font-weight: 600; color: var(--vsa-text); }
    #videosearch-ai-panel .vsa-transcript-time {
      font-variant-numeric: tabular-nums; font-size: 10px; font-weight: 700; color: #34d399;
    }
    #videosearch-ai-panel .vsa-transcript-text { color: var(--vsa-muted); }

    /* Settings */
    #videosearch-ai-panel .vsa-settings { padding: 2px 0; }
    #videosearch-ai-panel .vsa-settings-title { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
    #videosearch-ai-panel .vsa-settings-help { font-size: 11px; color: var(--vsa-muted); margin: 0 0 8px; line-height: 1.4; }
    #videosearch-ai-panel .vsa-field {
      display: flex; flex-direction: column; gap: 3px; margin-bottom: 8px;
      font-size: 11px; color: var(--vsa-muted);
    }
    #videosearch-ai-panel .vsa-field input {
      padding: 7px 10px; border-radius: 8px; border: 1px solid var(--vsa-border);
      background: var(--vsa-surface); color: var(--vsa-text); font-size: 12px;
    }
    #videosearch-ai-panel .vsa-settings-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    #videosearch-ai-panel .vsa-save-settings {
      border: none; border-radius: 14px; padding: 6px 12px; cursor: pointer;
      background: linear-gradient(135deg, #10b981, #059669); color: #fff; font-weight: 600; font-size: 12px;
    }
    #videosearch-ai-panel .vsa-settings-msg { font-size: 11px; color: var(--vsa-muted); }

    #videosearch-ai-panel .vsa-hint, #videosearch-ai-panel .vsa-empty {
      font-size: 12px; color: var(--vsa-muted); padding: 6px 2px; line-height: 1.4;
    }
    #videosearch-ai-panel .vsa-empty strong { color: var(--vsa-text); display: block; margin-bottom: 4px; }
    #videosearch-ai-panel .vsa-retry {
      margin-top: 8px; padding: 6px 12px; border-radius: 14px; border: none;
      background: linear-gradient(135deg, #10b981, #059669); color: white; font-weight: 600; cursor: pointer;
    }
    #videosearch-ai-panel .vsa-spinner {
      display: inline-block; width: 9px; height: 9px; border: 2px solid var(--vsa-muted);
      border-top-color: #10b981; border-radius: 50%; animation: vsa-spin 0.7s linear infinite;
      vertical-align: -1px; margin-right: 4px;
    }
    @keyframes vsa-spin { to { transform: rotate(360deg); } }

    html:not([dark]) #videosearch-ai-panel {
      --vsa-bg: #ffffff; --vsa-surface: #f2f2f2; --vsa-border: #e5e5e5;
      --vsa-text: #0f0f0f; --vsa-muted: #606060;
    }
  `;
  document.documentElement.appendChild(style);
}

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
