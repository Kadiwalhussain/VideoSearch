/**
 * Compact tabbed UI:
 *   Search | Chat | Topics | Live | Mood   (+ settings gear)
 * Only one section is open at a time so it doesn't eat the player.
 */

import type { RawCaptionSegment, SearchResult } from "../types/schema";
import type { VideoTopic } from "../topics/extractTopics";
import type { SentimentReport } from "../comments/analyzeSentiment";
import type { ChatMessage } from "../qa/chatRag";
import type { VideoHighlight } from "../storage/highlightsStore";
import type { VideoScreenshot } from "../storage/screenshotStore";
import {
  DEFAULT_LLM_SETTINGS,
  loadLlmSettings,
  maskKey,
  saveLlmSettings,
  type LlmSettings,
} from "../settings/llmSettings";
import {
  loadCloudSettings,
  vaultAuth,
  clearCloudSession,
  refreshSession,
  accountInitials,
  DEFAULT_CLOUD_SETTINGS,
  type CloudSettings,
} from "../settings/cloudSettings";
import { LiveTranscript } from "./LiveTranscript";
import { ChatPane } from "./ChatPane";
import { HighlightsPane } from "./HighlightsPane";
import { VSA_STYLES, VSA_FONT_HREF } from "./vsaStyles";
import { iconHtml, iconSvg, type IconName } from "./icons";
import { isKeepableCcSource } from "../youtube/ccSources";
import { isUsefulSourceLink } from "../youtube/descriptionLinks";

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
  /** Timeline highlights + notes + screenshots */
  onAddHighlight?: () => void;
  onCaptureFrame?: () => void;
  /** Optional force cloud sync (account panel) */
  onSyncCloud?: () => void;
  onHighlightNote?: (id: string, note: string) => void;
  onDeleteHighlight?: (id: string) => void;
  onHighlightSeek?: (seconds: number) => void;
  onDeleteScreenshot?: (id: string) => void;
  onScreenshotNote?: (id: string, note: string) => void;
  onCloudSettingsSaved?: () => void;
  onToggleWatchLater?: () => void;
  onToggleSave?: () => void;
  onAddToPlaylist?: (name: string) => void;
  onRemoveFromPlaylist?: (name: string) => void;
  onTogglePlaylist?: (name: string) => void;
  onRequestPlaylists?: () => void;
  onSaveYoutubePlaylist?: () => void;
  onSaveDescriptionLinks?: () => void;
}

type TabId =
  | "search"
  | "chat"
  | "topics"
  | "transcript"
  | "comments"
  | "highlights"
  | "account"
  | "settings"
  | "sources"
  | "more";

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
  private paneHighlights: HTMLElement;
  private paneAccount: HTMLElement;
  private paneSettings: HTMLElement;
  private paneMore: HTMLElement;
  private paneSources: HTMLElement;
  private commentsEl: HTMLElement;
  private handlers: SearchPanelHandlers;
  private authMode: "login" | "register" = "login";
  private cloudSession: CloudSettings = { ...DEFAULT_CLOUD_SETTINGS };
  private debounceTimer: number | null = null;
  private expanded = true;
  private activeTab: TabId = "search";
  private lastTopics: VideoTopic[] = [];
  private inputLocked = true;
  private liveTranscript: LiveTranscript;
  private chatPane: ChatPane;
  private highlightsPane: HighlightsPane;
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
          <button type="button" class="vsa-brand" title="Expand / collapse">
            <span class="vsa-logo" data-logo-ico aria-hidden="true"></span>
            <span class="vsa-title-wrap">
              <span class="vsa-title">VideoSearch</span>
              <span class="vsa-badge">…</span>
            </span>
          </button>
          <div class="vsa-status" role="status">Starting…</div>
          <button type="button" class="vsa-account-chip" data-account-chip title="Account" aria-label="Account">
            <span class="vsa-account-chip-av" data-account-av>?</span>
          </button>
          <button type="button" class="vsa-collapse-btn" title="Minimize" aria-label="Minimize" data-collapse-ico></button>
        </div>
        <nav class="vsa-tabs" role="tablist" aria-label="Main">
          <button type="button" class="vsa-tab is-active" data-tab="search" role="tab" aria-selected="true">
            <span class="vsa-tab-ico" data-tab-ico="search"></span>
            <span class="vsa-tab-txt">Search</span>
          </button>
          <button type="button" class="vsa-tab" data-tab="highlights" role="tab" aria-selected="false" title="Notes & screenshots">
            <span class="vsa-tab-ico" data-tab-ico="notes"></span>
            <span class="vsa-tab-txt">Notes</span>
            <span class="vsa-tab-count" data-count="highlights"></span>
          </button>
          <button type="button" class="vsa-tab" data-tab="chat" role="tab" aria-selected="false" title="Chat with this video">
            <span class="vsa-tab-ico" data-tab-ico="chat"></span>
            <span class="vsa-tab-txt">Chat</span>
          </button>
          <button type="button" class="vsa-tab vsa-tab-more" data-tab="more" role="tab" aria-selected="false" title="More tools">
            <span class="vsa-tab-ico" data-tab-ico="more"></span>
            <span class="vsa-tab-txt">More</span>
          </button>
        </nav>
      </div>
      <div class="vsa-panel-body">
        <div class="vsa-pane vsa-pane-search" data-pane="search">
          <div class="vsa-mode-row" role="group" aria-label="Query mode">
            <button type="button" class="vsa-mode is-active" data-mode="auto">Auto</button>
            <button type="button" class="vsa-mode" data-mode="search">Search</button>
            <button type="button" class="vsa-mode" data-mode="ask">Ask AI</button>
          </div>
          <div class="vsa-input-row">
            <span class="vsa-input-ico" data-search-ico></span>
            <input type="text" class="vsa-input" placeholder="Search what was said…" autocomplete="off" spellcheck="false" enterkeyhint="search" />
            <button type="button" class="vsa-search-btn"><span class="vsa-search-btn-txt">Go</span></button>
          </div>
          <div class="vsa-answer" hidden></div>
          <div class="vsa-results" role="listbox" aria-label="Results"></div>
        </div>
        <div class="vsa-pane vsa-pane-highlights" data-pane="highlights" hidden>
          <div class="vsa-highlights-host"></div>
        </div>
        <div class="vsa-pane vsa-pane-chat" data-pane="chat" hidden>
          <div class="vsa-chat-host"></div>
        </div>
        <div class="vsa-pane vsa-pane-more" data-pane="more" hidden>
          <div class="vsa-more-grid">
            <button type="button" class="vsa-more-card" data-goto="topics">
              <span class="vsa-more-ico" data-more-ico="topics"></span>
              <strong>Topics</strong>
              <span>Chapters across the video</span>
              <em class="vsa-tab-count" data-count="topics"></em>
            </button>
            <button type="button" class="vsa-more-card" data-goto="transcript">
              <span class="vsa-more-ico" data-more-ico="live"></span>
              <strong>Live</strong>
              <span>Follow the transcript</span>
            </button>
            <button type="button" class="vsa-more-card" data-goto="sources">
              <span class="vsa-more-ico" data-more-ico="link"></span>
              <strong>Sources</strong>
              <span>Bio + spoken links</span>
              <em class="vsa-tab-count" data-count="sources"></em>
            </button>
            <button type="button" class="vsa-more-card" data-goto="comments">
              <span class="vsa-more-ico" data-more-ico="mood"></span>
              <strong>Mood</strong>
              <span>Comment sentiment</span>
              <em class="vsa-tab-count" data-count="comments"></em>
            </button>
            <button type="button" class="vsa-more-card" data-goto="settings">
              <span class="vsa-more-ico" data-more-ico="settings"></span>
              <strong>Settings</strong>
              <span>AI key &amp; model</span>
            </button>
            <button type="button" class="vsa-more-card vsa-more-vault" data-open-vault>
              <span class="vsa-more-ico" data-more-ico="vault"></span>
              <strong>Full vault</strong>
              <span>Open notes &amp; shots in the browser</span>
            </button>
          </div>
        </div>
        <div class="vsa-pane vsa-pane-topics" data-pane="topics" hidden>
          <button type="button" class="vsa-back" data-back="more"><span data-back-ico></span> More</button>
          <div class="vsa-topics"></div>
        </div>
        <div class="vsa-pane vsa-pane-transcript" data-pane="transcript" hidden>
          <button type="button" class="vsa-back" data-back="more"><span data-back-ico></span> More</button>
          <div class="vsa-transcript-host"></div>
        </div>
        <div class="vsa-pane vsa-pane-sources" data-pane="sources" hidden>
          <button type="button" class="vsa-back" data-back="more"><span data-back-ico></span> More</button>
          <div class="vsa-src-host" data-sources-host>
            <div class="vsa-src-empty">No sources yet — sync bio or wait for captions.</div>
          </div>
        </div>
        <div class="vsa-pane vsa-pane-comments" data-pane="comments" hidden>
          <button type="button" class="vsa-back" data-back="more"><span data-back-ico></span> More</button>
          <div class="vsa-comments"></div>
        </div>
        <div class="vsa-pane vsa-pane-settings" data-pane="settings" hidden>
          <button type="button" class="vsa-back" data-back="more"><span data-back-ico></span> More</button>
          <div class="vsa-settings">
            <div class="vsa-settings-title">AI model</div>
            <p class="vsa-settings-help">Key for Chat &amp; Ask. Embeddings stay on-device.</p>
            <label class="vsa-field"><span>API key</span>
              <input type="password" class="vsa-set-key" placeholder="••••••••" autocomplete="off" />
            </label>
            <label class="vsa-field"><span>Endpoint</span>
              <input type="text" class="vsa-set-url" autocomplete="off" />
            </label>
            <label class="vsa-field"><span>Model</span>
              <input type="text" class="vsa-set-model" autocomplete="off" />
            </label>
            <label class="vsa-field"><span>Ask in (full transcript)</span>
              <select class="vsa-set-ask-provider" data-ask-provider></select>
            </label>
            <p class="vsa-settings-help">Opens ChatGPT or another chat in a new tab with this video’s transcript pasted. Default is ChatGPT. No VideoSearch server.</p>
            <div class="vsa-settings-actions">
              <button type="button" class="vsa-save-settings">Save</button>
              <span class="vsa-settings-msg"></span>
            </div>
          </div>
        </div>
        <div class="vsa-pane vsa-pane-account" data-pane="account" hidden>
          <button type="button" class="vsa-back" data-back="search"><span data-back-ico></span> Back</button>
          <div class="vsa-auth">
            <div class="vsa-auth-gate" data-auth-gate>
              <div class="vsa-auth-hero">
                <div class="vsa-auth-mark" data-auth-mark></div>
                <div class="vsa-auth-title" data-auth-title>Sign in</div>
                <p class="vsa-auth-sub" data-auth-sub>Sync notes &amp; screenshots to your private vault.</p>
              </div>
              <div class="vsa-auth-modes">
                <button type="button" class="vsa-auth-mode is-on" data-auth-mode="login">Log in</button>
                <button type="button" class="vsa-auth-mode" data-auth-mode="register">Sign up</button>
              </div>
              <form class="vsa-auth-form" data-auth-form autocomplete="on">
                <label class="vsa-field" data-auth-name-wrap hidden><span>Name</span>
                  <input type="text" class="vsa-cloud-name" autocomplete="nickname" />
                </label>
                <label class="vsa-field"><span>Email</span>
                  <input type="email" class="vsa-cloud-email" placeholder="you@example.com" autocomplete="username" required />
                </label>
                <label class="vsa-field"><span>Password</span>
                  <div class="vsa-pass-row">
                    <input type="password" class="vsa-cloud-pass" placeholder="Password" autocomplete="current-password" required minlength="6" />
                    <button type="button" class="vsa-pass-toggle" data-pass-toggle title="Show password"></button>
                  </div>
                </label>
                <label class="vsa-field" data-auth-confirm-wrap hidden><span>Confirm</span>
                  <input type="password" class="vsa-cloud-pass2" autocomplete="new-password" />
                </label>
                <button type="submit" class="vsa-auth-submit" data-auth-submit>Log in</button>
                <p class="vsa-cloud-msg" data-auth-msg role="status"></p>
              </form>
              <details class="vsa-auth-advanced">
                <summary>Server URL</summary>
                <label class="vsa-field"><span>API</span>
                  <input type="text" class="vsa-cloud-url" placeholder="http://localhost:8787" autocomplete="off" />
                </label>
              </details>
            </div>
            <div class="vsa-auth-profile" data-auth-profile hidden>
              <div class="vsa-profile-hero">
                <div class="vsa-profile-glow" aria-hidden="true"></div>
                <div class="vsa-profile-top">
                  <div class="vsa-profile-av-wrap">
                    <div class="vsa-profile-av" data-profile-av>—</div>
                    <span class="vsa-profile-online" title="Signed in"></span>
                  </div>
                  <div class="vsa-profile-meta">
                    <div class="vsa-profile-kicker">Cloud vault</div>
                    <div class="vsa-profile-name" data-profile-name>Account</div>
                    <div class="vsa-profile-email" data-profile-email></div>
                  </div>
                </div>
                <div class="vsa-profile-badges">
                  <span class="vsa-profile-badge is-live"><span class="vsa-pulse"></span> Synced</span>
                  <span class="vsa-profile-badge">Private</span>
                </div>
              </div>

              <div class="vsa-profile-stats">
                <div class="vsa-profile-stat">
                  <span class="vsa-profile-stat-ico" data-stat-ico-v></span>
                  <b data-stat-videos>0</b>
                  <span>Videos</span>
                </div>
                <div class="vsa-profile-stat">
                  <span class="vsa-profile-stat-ico" data-stat-ico-m></span>
                  <b data-stat-marks>0</b>
                  <span>Marks</span>
                </div>
                <div class="vsa-profile-stat">
                  <span class="vsa-profile-stat-ico" data-stat-ico-s></span>
                  <b data-stat-shots>0</b>
                  <span>Shots</span>
                </div>
              </div>

              <div class="vsa-profile-actions">
                <button type="button" class="vsa-btn-primary vsa-btn-vault" data-open-vault>
                  <span data-vault-ico></span>
                  <span class="vsa-btn-label">
                    <strong>Open full vault</strong>
                    <em>Notes, shots &amp; analytics</em>
                  </span>
                </button>
                <div class="vsa-profile-row">
                  <button type="button" class="vsa-btn-secondary vsa-auth-sync-now" data-auth-sync>
                    <span data-sync-ico></span> Sync this video
                  </button>
                  <button type="button" class="vsa-btn-ghost vsa-cloud-logout" data-auth-logout>
                    <span data-logout-ico></span> Log out
                  </button>
                </div>
              </div>
              <p class="vsa-cloud-msg" data-auth-profile-msg role="status"></p>
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
      '.vsa-more-card[data-goto="topics"]'
    ) as HTMLButtonElement;
    this.tabTranscript = this.root.querySelector(
      '.vsa-more-card[data-goto="transcript"]'
    ) as HTMLButtonElement;
    this.tabComments = this.root.querySelector(
      '.vsa-more-card[data-goto="comments"]'
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
    this.paneHighlights = this.root.querySelector(
      '[data-pane="highlights"]'
    ) as HTMLElement;
    this.paneAccount = this.root.querySelector(
      '[data-pane="account"]'
    ) as HTMLElement;
    this.paneSettings = this.root.querySelector(
      '[data-pane="settings"]'
    ) as HTMLElement;
    this.paneMore = this.root.querySelector(
      '[data-pane="more"]'
    ) as HTMLElement;
    this.paneSources = this.root.querySelector(
      '[data-pane="sources"]'
    ) as HTMLElement;
    this.commentsEl = this.root.querySelector(".vsa-comments") as HTMLElement;

    this.mountIcons();
    void this.hydrateAskProvider();

    const host = this.root.querySelector(
      ".vsa-transcript-host"
    ) as HTMLElement;
    this.liveTranscript = new LiveTranscript((t) => this.handlers.onSeek(t));
    this.liveTranscript.setAskHandler(() => {
      void this.openExternalAsk();
    });
    this.liveTranscript.setAskProviderHandler((id) => {
      void this.saveAskProviderId(id);
    });
    host.appendChild(this.liveTranscript.root);

    const chatHost = this.root.querySelector(".vsa-chat-host") as HTMLElement;
    this.chatPane = new ChatPane({
      onSend: (text) => this.handlers.onChatSend?.(text),
      onSeek: (t) => this.handlers.onSeek(t),
      onClear: () => this.handlers.onChatClear?.(),
      onAskExternal: () => {
        void this.openExternalAsk();
      },
    });
    chatHost.appendChild(this.chatPane.root);

    const hlHost = this.root.querySelector(
      ".vsa-highlights-host"
    ) as HTMLElement;
    this.highlightsPane = new HighlightsPane({
      onAddHighlight: () => this.handlers.onAddHighlight?.(),
      onCaptureFrame: () => this.handlers.onCaptureFrame?.(),
      onSeek: (t) =>
        this.handlers.onHighlightSeek?.(t) ?? this.handlers.onSeek(t),
      onUpdateNote: (id, note) => this.handlers.onHighlightNote?.(id, note),
      onDelete: (id) => this.handlers.onDeleteHighlight?.(id),
      onDeleteScreenshot: (id) => this.handlers.onDeleteScreenshot?.(id),
      onUpdateScreenshotNote: (id, note) =>
        this.handlers.onScreenshotNote?.(id, note),
      onToggleWatchLater: () => this.handlers.onToggleWatchLater?.(),
      onToggleSave: () => this.handlers.onToggleSave?.(),
      onAddToPlaylist: (name) => this.handlers.onAddToPlaylist?.(name),
      onRemoveFromPlaylist: (name) => this.handlers.onRemoveFromPlaylist?.(name),
      onTogglePlaylist: (name) => this.handlers.onTogglePlaylist?.(name),
      onRequestPlaylists: () => this.handlers.onRequestPlaylists?.(),
      onSaveYoutubePlaylist: () => this.handlers.onSaveYoutubePlaylist?.(),
      onSaveDescriptionLinks: () => this.handlers.onSaveDescriptionLinks?.(),
    });
    hlHost.appendChild(this.highlightsPane.root);

    this.shieldEvents();
    this.bindInput();
    this.bindSettings();
    this.bindAuth();
    this.bindTabs();
    this.bindModes();
    this.bindMoreNav();

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

    this.root.querySelector("[data-account-chip]")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.expanded) this.setExpanded(true);
      this.switchTab("account");
    });

    this.root.querySelectorAll("[data-open-vault]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openFullVault();
      });
    });

    void this.bootstrapAuth();
    this.setExpanded(false);
  }

  /** Fill Lucide icons into data-* placeholders */
  private mountIcons(): void {
    const set = (sel: string, name: IconName, size = 16) => {
      this.root.querySelectorAll(sel).forEach((el) => {
        el.innerHTML = iconHtml(name, size);
      });
    };
    const logo = this.root.querySelector("[data-logo-ico]");
    if (logo) logo.innerHTML = iconSvg("search", 14, 2.25);
    const collapse = this.root.querySelector("[data-collapse-ico]");
    if (collapse) collapse.innerHTML = iconSvg("minimize", 16, 2.25);

    this.root.querySelectorAll("[data-tab-ico]").forEach((el) => {
      const name = (el as HTMLElement).dataset.tabIco as IconName;
      if (name) el.innerHTML = iconHtml(name, 14);
    });
    set("[data-search-ico]", "search", 15);
    this.root.querySelectorAll("[data-more-ico]").forEach((el) => {
      const name = (el as HTMLElement).dataset.moreIco as IconName;
      if (name) el.innerHTML = iconHtml(name, 18);
    });
    set("[data-back-ico]", "back", 14);
    set("[data-auth-mark]", "user", 22);
    set("[data-vault-ico]", "external", 15);
    set("[data-sync-ico]", "refresh", 14);
    set("[data-logout-ico]", "logout", 14);
    set("[data-stat-ico-v]", "topics", 12);
    set("[data-stat-ico-m]", "highlight", 12);
    set("[data-stat-ico-s]", "camera", 12);

    const passToggle = this.root.querySelector(
      "[data-pass-toggle]"
    ) as HTMLElement | null;
    if (passToggle) {
      passToggle.innerHTML = iconHtml("eye", 15);
      passToggle.dataset.shown = "0";
    }
  }

  private bindMoreNav(): void {
    this.root.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tab = (btn as HTMLElement).dataset.goto as TabId | undefined;
        if (tab) this.switchTab(tab);
      });
    });
    this.root.querySelectorAll("[data-back]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tab = (btn as HTMLElement).dataset.back as TabId | undefined;
        if (tab) this.switchTab(tab);
      });
    });
  }

  /** Open web vault dashboard with current session token */
  private openFullVault(): void {
    const c = this.cloudSession;
    const base = (c.projectUrl || DEFAULT_CLOUD_SETTINGS.projectUrl).replace(
      /\/$/,
      ""
    );
    if (!c.enabled || !c.apiKey) {
      this.switchTab("account");
      const msg = this.root.querySelector(
        "[data-auth-msg]"
      ) as HTMLElement | null;
      if (msg) {
        msg.textContent = "Sign in first to open your full vault";
        msg.classList.add("is-error");
      }
      return;
    }
    const url = `${base}/app/?token=${encodeURIComponent(c.apiKey)}`;
    window.open(url, "_blank", "noopener,noreferrer");
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

  setHighlights(items: VideoHighlight[]): void {
    this.highlightsPane.setHighlights(items);
    this.updateVaultBadge();
  }

  setScreenshots(items: VideoScreenshot[]): void {
    this.highlightsPane.setScreenshots(items);
    this.updateVaultBadge();
  }

  /** Optimistic single-shot append (smooth capture path) */
  appendScreenshot(item: VideoScreenshot): void {
    this.highlightsPane.appendScreenshot(item);
    this.updateVaultBadge();
  }

  setVaultSyncMessage(msg: string, isError = false): void {
    this.highlightsPane.setSyncMessage(msg, isError);
  }

  setLibraryState(state: {
    saved: boolean;
    watchLater: boolean;
    playlists: string[];
  }): void {
    this.highlightsPane.setLibraryState(state);
  }

  setKnownPlaylists(
    list: Array<{ name: string; count?: number }>
  ): void {
    this.highlightsPane.setKnownPlaylists(list);
  }

  setYoutubePlaylistAvailable(on: boolean, label?: string): void {
    this.highlightsPane.setYoutubePlaylistAvailable(on, label);
  }

  setDescriptionLinksAvailable(
    on: boolean,
    count = 0,
    previews?: Array<{
      label: string;
      kind: string;
      url: string;
      source?: string;
      startTime?: number;
    }>
  ): void {
    const bioCount = (previews || []).filter((p) => p.source !== "cc").length;
    this.highlightsPane.setDescriptionLinksAvailable(
      on && bioCount > 0,
      bioCount || count,
      undefined
    );
    const badge = this.root.querySelector(
      '[data-count="sources"]'
    ) as HTMLElement | null;
    if (badge) badge.textContent = on && count > 0 ? String(count) : "";
    this.renderSourcesPane(on ? previews || [] : []);
  }

  private renderSourcesPane(
    items: Array<{
      label: string;
      kind: string;
      url: string;
      source?: string;
      startTime?: number;
    }>
  ): void {
    const host = this.root.querySelector(
      "[data-sources-host]"
    ) as HTMLElement | null;
    if (!host) return;
    if (!items.length) {
      host.innerHTML =
        '<div class="vsa-src-empty">No sources yet — sync bio or wait for captions.</div>';
      return;
    }
    const keep = items.filter((p) =>
      p.source === "cc"
        ? isKeepableCcSource(p)
        : isUsefulSourceLink(p.url, p.kind)
    );
    const bio = keep.filter((p) => p.source !== "cc");
    const spoken = keep.filter((p) => p.source === "cc");
    if (!keep.length) {
      host.innerHTML =
        '<div class="vsa-src-empty">No usable links yet. Open “Show more” on the description, then Sync bio.</div>';
      return;
    }
    const block = (
      title: string,
      list: typeof items,
      spokenBlock: boolean
    ) => {
      if (!list.length) return "";
      const rows = list
        .map((p) => {
          const kind = (p.kind || "link").replace(/^CC · /i, "");
          const t =
            spokenBlock && typeof p.startTime === "number"
              ? `<button type="button" class="vsa-src-time" data-src-seek="${p.startTime}">${formatTimestamp(p.startTime)}</button>`
              : `<span class="vsa-src-from">bio</span>`;
          return `<div class="vsa-src-row">
            ${t}
            <a class="vsa-src-main" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(p.url)}">
              <span class="vsa-src-kind">${escapeHtml(kind)}</span>
              <span class="vsa-src-label">${escapeHtml(p.label || kind)}</span>
            </a>
          </div>`;
        })
        .join("");
      return `<div class="vsa-src-block"><div class="vsa-src-h">${title} · ${list.length}</div>${rows}</div>`;
    };
    host.innerHTML =
      block("Description", bio, false) +
      block("Spoken in captions", spoken, true);
    host.querySelectorAll("[data-src-seek]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = Number((btn as HTMLElement).dataset.srcSeek);
        if (Number.isFinite(t)) this.handlers.onSeek(t);
      });
    });
  }

  setSyncClock(opts: {
    lastCloudSyncAt?: number | null;
    lastLocalSaveAt?: number | null;
    offline?: boolean;
  }): void {
    this.highlightsPane.setSyncClock(opts);
  }

  private updateVaultBadge(): void {
    const badge = this.root.querySelector(
      '[data-count="highlights"]'
    ) as HTMLElement | null;
    if (!badge) return;
    // Show total marks from count element inside pane if possible
    const n = Number(
      this.root.querySelector(".vsa-hl-count")?.textContent || "0"
    );
    const s = Number(
      this.root.querySelector(".vsa-ss-count")?.textContent || "0"
    );
    const total = n + s;
    badge.textContent = total > 0 ? String(total) : "";
  }

  flashHighlight(id: string): void {
    this.highlightsPane.flashNew(id);
  }

  flashScreenshot(id: string): void {
    this.highlightsPane.flashShot(id);
  }

  openHighlightsTab(): void {
    if (!this.expanded) this.setExpanded(true);
    this.switchTab("highlights");
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
      !this.topicsEl.querySelector(".vsa-topic-item") &&
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
        this.statusEl.textContent = "No transcript";
        this.badgeEl.textContent = "!";
        this.setBrandState("warn");
        this.ensureSearchTabForResults();
        this.resultsEl.innerHTML = noTranscriptCard();
        this.topicsEl.innerHTML = noTranscriptCard();
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

    // Primary nav only (Search / Notes / Chat / More) — nested tools keep More active
    const primaryFor =
      tab === "topics" ||
      tab === "transcript" ||
      tab === "sources" ||
      tab === "comments" ||
      tab === "settings"
        ? "more"
        : tab === "account"
          ? null
          : tab;

    const tabs = this.root.querySelectorAll(".vsa-tab");
    tabs.forEach((t) => {
      const el = t as HTMLButtonElement;
      const on = primaryFor != null && el.dataset.tab === primaryFor;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-selected", String(on));
    });

    this.paneSearch.hidden = tab !== "search";
    this.paneChat.hidden = tab !== "chat";
    this.paneTopics.hidden = tab !== "topics";
    this.paneTranscript.hidden = tab !== "transcript";
    this.paneComments.hidden = tab !== "comments";
    this.paneHighlights.hidden = tab !== "highlights";
    this.paneAccount.hidden = tab !== "account";
    this.paneSettings.hidden = tab !== "settings";
    this.paneMore.hidden = tab !== "more";
    this.paneSources.hidden = tab !== "sources";

    if (tab === "settings") {
      void loadLlmSettings().then((s) => this.fillSettingsForm(s));
    }
    if (tab === "account") {
      void this.bootstrapAuth();
    }
    if (tab === "comments") {
      this.renderComments();
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
          const askSel = this.root.querySelector(
            "[data-ask-provider]"
          ) as HTMLSelectElement | null;
          if (askSel?.value) {
            const { saveAskProvider } = await import(
              "../settings/askExternalSettings"
            );
            const p = await saveAskProvider(
              askSel.value as import("../settings/askExternalSettings").AskProviderId
            );
            this.liveTranscript.setAskLabel(p.label);
            this.chatPane.setAskLabel(p.label);
          }
          this.handlers.onSettingsSaved?.();
        } catch (err) {
          msg.textContent =
            err instanceof Error ? err.message : "Failed to save";
        }
      });

    this.root
      .querySelector("[data-ask-provider]")
      ?.addEventListener("change", async (e) => {
        const sel = e.target as HTMLSelectElement;
        const { saveAskProvider } = await import(
          "../settings/askExternalSettings"
        );
        const p = await saveAskProvider(
          sel.value as import("../settings/askExternalSettings").AskProviderId
        );
        this.liveTranscript.setAskLabel(p.label);
        this.chatPane.setAskLabel(p.label);
      });
  }

  private async hydrateAskProvider(): Promise<void> {
    try {
      const { ASK_PROVIDERS, loadAskProvider } = await import(
        "../settings/askExternalSettings"
      );
      const sel = this.root.querySelector(
        "[data-ask-provider]"
      ) as HTMLSelectElement | null;
      const current = await loadAskProvider();
      if (sel && !sel.options.length) {
        for (const p of ASK_PROVIDERS) {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.label;
          if (p.id === current.id) opt.selected = true;
          sel.appendChild(opt);
        }
      } else if (sel) {
        sel.value = current.id;
      }
      this.liveTranscript.setAskLabel(current.label);
      this.liveTranscript.setAskProvider(current.id);
      this.chatPane.setAskLabel(current.label);
    } catch {
      /* optional */
    }
  }

  private async saveAskProviderId(id: string): Promise<void> {
    try {
      const { saveAskProvider } = await import(
        "../settings/askExternalSettings"
      );
      const p = await saveAskProvider(
        id as import("../settings/askExternalSettings").AskProviderId
      );
      this.liveTranscript.setAskLabel(p.label);
      this.liveTranscript.setAskProvider(p.id);
      this.chatPane.setAskLabel(p.label);
      const sel = this.root.querySelector(
        "[data-ask-provider]"
      ) as HTMLSelectElement | null;
      if (sel) sel.value = p.id;
    } catch {
      /* optional */
    }
  }

  private async openExternalAsk(): Promise<void> {
    const segs = this.liveTranscript.getSegments();
    const root = this.root.closest("[data-video-id]");
    const videoId = root?.getAttribute("data-video-id") || "";
    const title =
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string")
        ?.textContent?.trim() ||
      document.title.replace(/ - YouTube$/i, "").trim();
    try {
      const { openExternalAsk } = await import("../llm/openExternalAsk");
      const result = await openExternalAsk({
        segments: segs,
        videoId,
        title,
      });
      this.statusEl.textContent = result.ok
        ? `Ask ${result.provider.label}`
        : result.message;
      this.liveTranscript.setHint(result.message);
    } catch (err) {
      this.statusEl.textContent =
        err instanceof Error ? err.message : "Could not open chat";
    }
  }

  private bindAuth(): void {
    const setMsg = (text: string, isError = false) => {
      const msg = this.root.querySelector(
        "[data-auth-msg]"
      ) as HTMLElement | null;
      if (!msg) return;
      msg.textContent = text;
      msg.classList.toggle("is-error", isError);
      msg.classList.toggle("is-ok", !isError && Boolean(text));
    };

    this.root.querySelectorAll("[data-auth-mode]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mode = (btn as HTMLElement).dataset.authMode as
          | "login"
          | "register";
        if (mode) this.setAuthMode(mode);
      });
    });

    this.root
      .querySelector("[data-pass-toggle]")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pass = this.root.querySelector(
          ".vsa-cloud-pass"
        ) as HTMLInputElement | null;
        const btn = e.currentTarget as HTMLButtonElement;
        if (!pass) return;
        const show = pass.type === "password";
        pass.type = show ? "text" : "password";
        const pass2 = this.root.querySelector(
          ".vsa-cloud-pass2"
        ) as HTMLInputElement | null;
        if (pass2) pass2.type = pass.type;
        btn.innerHTML = iconHtml(show ? "eyeOff" : "eye", 15);
        btn.title = show ? "Hide password" : "Show password";
      });

    this.root
      .querySelector("[data-auth-form]")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.submitAuth(setMsg);
      });

    this.root
      .querySelector("[data-auth-logout]")
      ?.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const saved = await clearCloudSession();
        this.applyAuthSession(saved);
        this.setAuthMode("login");
        setMsg("Signed out");
        const pmsg = this.root.querySelector(
          "[data-auth-profile-msg]"
        ) as HTMLElement | null;
        if (pmsg) pmsg.textContent = "";
      });

    this.root
      .querySelector("[data-auth-sync]")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlers.onSyncCloud?.();
      });

    this.setAuthMode("login");
  }

  private setAuthMode(mode: "login" | "register"): void {
    this.authMode = mode;
    this.root.querySelectorAll("[data-auth-mode]").forEach((btn) => {
      btn.classList.toggle(
        "is-on",
        (btn as HTMLElement).dataset.authMode === mode
      );
    });
    const nameWrap = this.root.querySelector(
      "[data-auth-name-wrap]"
    ) as HTMLElement | null;
    const confirmWrap = this.root.querySelector(
      "[data-auth-confirm-wrap]"
    ) as HTMLElement | null;
    const title = this.root.querySelector(
      "[data-auth-title]"
    ) as HTMLElement | null;
    const sub = this.root.querySelector(
      "[data-auth-sub]"
    ) as HTMLElement | null;
    const submit = this.root.querySelector(
      "[data-auth-submit]"
    ) as HTMLButtonElement | null;
    const pass = this.root.querySelector(
      ".vsa-cloud-pass"
    ) as HTMLInputElement | null;

    if (nameWrap) nameWrap.hidden = mode !== "register";
    if (confirmWrap) confirmWrap.hidden = mode !== "register";
    if (title) {
      title.textContent =
        mode === "register" ? "Create your account" : "Welcome back";
    }
    if (sub) {
      sub.textContent =
        mode === "register"
          ? "One free account · notes & board shots stay private in your vault."
          : "Sign in to sync notes, highlights & screenshots to your private vault.";
    }
    if (submit) {
      submit.textContent =
        mode === "register" ? "Create account" : "Log in";
    }
    if (pass) {
      pass.autocomplete =
        mode === "register" ? "new-password" : "current-password";
    }
  }

  private async submitAuth(
    setMsg: (text: string, isError?: boolean) => void
  ): Promise<void> {
    const urlRaw = (
      this.root.querySelector(".vsa-cloud-url") as HTMLInputElement | null
    )?.value.trim();
    const url = urlRaw || DEFAULT_CLOUD_SETTINGS.projectUrl;
    const email = (
      this.root.querySelector(".vsa-cloud-email") as HTMLInputElement
    ).value.trim();
    const password = (
      this.root.querySelector(".vsa-cloud-pass") as HTMLInputElement
    ).value;
    const displayName = (
      this.root.querySelector(".vsa-cloud-name") as HTMLInputElement
    ).value.trim();
    const pass2 = (
      this.root.querySelector(".vsa-cloud-pass2") as HTMLInputElement | null
    )?.value;

    if (this.authMode === "register" && pass2 !== undefined && password !== pass2) {
      setMsg("Passwords do not match", true);
      return;
    }

    const submit = this.root.querySelector(
      "[data-auth-submit]"
    ) as HTMLButtonElement | null;
    if (submit) submit.disabled = true;
    setMsg(
      this.authMode === "login" ? "Signing in…" : "Creating account…"
    );

    try {
      const saved = await vaultAuth(this.authMode, {
        projectUrl: url,
        email,
        password,
        displayName,
      });
      // Clear password fields after success
      const passEl = this.root.querySelector(
        ".vsa-cloud-pass"
      ) as HTMLInputElement | null;
      const pass2El = this.root.querySelector(
        ".vsa-cloud-pass2"
      ) as HTMLInputElement | null;
      if (passEl) passEl.value = "";
      if (pass2El) pass2El.value = "";
      this.applyAuthSession(saved);
      setMsg(`Signed in as ${saved.email}`);
      this.handlers.onCloudSettingsSaved?.();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Auth failed", true);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  private async bootstrapAuth(): Promise<void> {
    let c = await loadCloudSettings();
    if (c.enabled) {
      c = await refreshSession();
    }
    this.applyAuthSession(c);
  }

  private applyAuthSession(c: CloudSettings): void {
    this.cloudSession = c;
    const url = this.root.querySelector(
      ".vsa-cloud-url"
    ) as HTMLInputElement | null;
    const email = this.root.querySelector(
      ".vsa-cloud-email"
    ) as HTMLInputElement | null;
    if (url && !url.value) url.value = c.projectUrl || DEFAULT_CLOUD_SETTINGS.projectUrl;
    if (url && c.projectUrl) url.value = c.projectUrl;
    if (email && c.email) email.value = c.email;

    const gate = this.root.querySelector(
      "[data-auth-gate]"
    ) as HTMLElement | null;
    const profile = this.root.querySelector(
      "[data-auth-profile]"
    ) as HTMLElement | null;
    const signedIn = Boolean(c.enabled && c.email);

    if (gate) gate.hidden = signedIn;
    if (profile) profile.hidden = !signedIn;

    if (signedIn) {
      const av = this.root.querySelector(
        "[data-profile-av]"
      ) as HTMLElement | null;
      const name = this.root.querySelector(
        "[data-profile-name]"
      ) as HTMLElement | null;
      const em = this.root.querySelector(
        "[data-profile-email]"
      ) as HTMLElement | null;
      const id = this.root.querySelector(
        "[data-profile-id]"
      ) as HTMLElement | null;
      if (av) av.textContent = accountInitials(c);
      if (name) name.textContent = c.displayName || c.email.split("@")[0];
      if (em) em.textContent = c.email;
      if (id) id.textContent = c.userId ? `ID ${c.userId}` : "";
      const sv = this.root.querySelector(
        "[data-stat-videos]"
      ) as HTMLElement | null;
      const sm = this.root.querySelector(
        "[data-stat-marks]"
      ) as HTMLElement | null;
      const ss = this.root.querySelector(
        "[data-stat-shots]"
      ) as HTMLElement | null;
      if (sv) sv.textContent = String(c.videoCount ?? 0);
      if (sm) sm.textContent = String(c.highlightCount ?? 0);
      if (ss) ss.textContent = String(c.screenshotCount ?? 0);
    }

    // Header avatar chip only
    const chip = this.root.querySelector(
      "[data-account-chip]"
    ) as HTMLElement | null;
    const chipAv = this.root.querySelector(
      "[data-account-av]"
    ) as HTMLElement | null;
    if (chip) {
      chip.dataset.state = signedIn ? "in" : "out";
      chip.title = signedIn
        ? `${c.displayName || c.email} · Account`
        : "Sign in";
    }
    if (chipAv) chipAv.textContent = signedIn ? accountInitials(c) : "?";

    this.highlightsPane.setSyncMessage(
      signedIn ? "Cloud ready" : "Sign in (avatar) to auto-sync",
      !signedIn
    );
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
    this.root.querySelectorAll(".vsa-retry").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlers.onRetry();
      });
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

    const head = document.createElement("div");
    head.className = "vsa-topics-head";
    const title = document.createElement("div");
    title.className = "vsa-topics-title";
    if (source === "chapters") {
      title.textContent = "Video chapters";
    } else if (source === "mixed") {
      title.textContent = "Chapters & topics";
    } else if (source === "llm") {
      title.textContent = "Main topics";
    } else {
      title.textContent = "Topics";
    }
    const meta = document.createElement("div");
    meta.className = "vsa-topics-meta";
    meta.textContent = `${topics.length} · click to jump`;
    head.append(title, meta);
    this.topicsEl.appendChild(head);

    const list = document.createElement("div");
    list.className = "vsa-topics-list";

    topics.forEach((topic, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "vsa-topic-item";
      item.title = `Jump · search “${topic.query}”`;

      const idx = document.createElement("span");
      idx.className = "vsa-topic-idx";
      idx.textContent = String(i + 1).padStart(2, "0");

      const body = document.createElement("span");
      body.className = "vsa-topic-body";
      const label = document.createElement("span");
      label.className = "vsa-topic-label";
      label.textContent = topic.label;
      body.appendChild(label);

      const time = document.createElement("span");
      time.className = "vsa-topic-time";
      time.textContent = formatTimestamp(topic.startTime);

      item.append(idx, body, time);

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
      item.addEventListener("pointerup", activate);
      item.addEventListener("click", activate);
      list.appendChild(item);
    });

    this.topicsEl.appendChild(list);
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

    // More comments: samples not already listed in praised/criticized
    const shown = new Set([
      ...r.topPositive.map((c) => c.id),
      ...r.topNegative.map((c) => c.id),
    ]);
    const more = (r.samples || []).filter((c) => !shown.has(c.id));
    if (more.length > 0) {
      this.commentsEl.appendChild(
        this.renderCommentList("More comments", more, "neu")
      );
    } else if (
      r.samples.length > 0 &&
      r.topPositive.length === 0 &&
      r.topNegative.length === 0
    ) {
      this.commentsEl.appendChild(
        this.renderCommentList("Comments", r.samples, "neu")
      );
    }

    const actions = document.createElement("div");
    actions.className = "vsa-mood-actions";
    actions.innerHTML = `<button type="button" class="vsa-comments-load vsa-comments-refresh">Refresh</button>
      <span class="vsa-muted vsa-mood-note">Local analysis · ${r.totalAnalyzed} scored</span>`;
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
    const head = document.createElement("div");
    head.className = "vsa-mood-section-title";
    head.innerHTML = `<span>${escapeHtml(title)}</span><em>${items.length}</em>`;
    wrap.appendChild(head);

    const list = document.createElement("div");
    list.className = "vsa-comment-list";
    for (const c of items) {
      const row = document.createElement("article");
      row.className = `vsa-comment-card tone-${tone}`;

      const av = document.createElement("div");
      av.className = "vsa-comment-av";
      av.textContent = commentInitials(c.author);

      const main = document.createElement("div");
      main.className = "vsa-comment-main";

      const meta = document.createElement("div");
      meta.className = "vsa-comment-meta";
      const author = document.createElement("span");
      author.className = "vsa-comment-author";
      author.textContent = c.author || "Viewer";
      meta.appendChild(author);
      if (c.likes > 0) {
        const likes = document.createElement("span");
        likes.className = "vsa-comment-likes";
        likes.textContent = `♥ ${formatCount(c.likes)}`;
        meta.appendChild(likes);
      }
      if (c.publishedText) {
        const when = document.createElement("span");
        when.className = "vsa-comment-when";
        when.textContent = c.publishedText;
        meta.appendChild(when);
      }
      const badge = document.createElement("span");
      badge.className = `vsa-comment-tone tone-${tone}`;
      badge.textContent =
        tone === "pos" ? "Positive" : tone === "neg" ? "Critical" : "Mixed";
      meta.appendChild(badge);

      const text = document.createElement("p");
      text.className = "vsa-comment-text";
      text.textContent = c.text || "";

      main.append(meta, text);
      row.append(av, main);
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
  document.getElementById("videosearch-ai-styles")?.remove();
  document.getElementById("videosearch-ai-fonts")?.remove();

  const fonts = document.createElement("link");
  fonts.id = "videosearch-ai-fonts";
  fonts.rel = "stylesheet";
  fonts.href = VSA_FONT_HREF;
  document.documentElement.appendChild(fonts);

  const style = document.createElement("style");
  style.id = "videosearch-ai-styles";
  style.textContent = VSA_STYLES;
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

function commentInitials(author: string): string {
  const parts = (author || "?").trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

function noTranscriptCard(): string {
  return `
    <div class="vsa-empty vsa-empty-transcript">
      <strong>No transcript on this video</strong>
      <p>
        YouTube did not publish captions for this video, so VideoSearch cannot
        search what was said or build topics from speech.
      </p>
      <p>
        Marks, shots, and bio still work. If the creator adds captions later,
        tap Retry.
      </p>
      <button type="button" class="vsa-retry">Retry</button>
    </div>`;
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
