/**
 * Content script — ALWAYS shows a green VideoSearch AI control on watch pages.
 * ML code is lazy-loaded so model failures never hide the UI.
 */

import {
  SearchPanel,
  injectSearchPanelStyles,
  type QueryMode,
} from "../ui/SearchPanel";
import type { VideoTopic } from "../topics/extractTopics";
import type { RawCaptionSegment, VideoIndex } from "../types/schema";
import type { SentimentReport } from "../comments/analyzeSentiment";
// Type-only — do NOT value-import chatRag (it pulls MiniLM into the UI bundle)
import type { ChatMessage } from "../qa/chatRag";

function newMessageId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const ROOT_ID = "videosearch-ai-root";
const LOG = "[VideoSearch AI]";

const sessionIndex = new Map<string, VideoIndex>();
const sessionSegments = new Map<string, RawCaptionSegment[]>();
const sessionTopics = new Map<
  string,
  { topics: VideoTopic[]; source: "chapters" | "llm" | "local" | "mixed" }
>();
const sessionComments = new Map<string, SentimentReport>();
const sessionChat = new Map<string, ChatMessage[]>();
const commentJobs = new Map<string, Promise<void>>();
const indexingJobs = new Map<string, Promise<VideoIndex | null>>();
let chatBusy = false;

async function ensureTopics(
  videoId: string,
  index: VideoIndex,
  panel: SearchPanel,
  force = false
): Promise<{
  topics: VideoTopic[];
  source: "chapters" | "llm" | "local" | "mixed";
}> {
  if (!force && sessionTopics.has(videoId)) {
    return sessionTopics.get(videoId)!;
  }

  // Soft progress only — SearchPanel keeps search unlocked once index exists
  panel.setStatus({
    kind: "indexing",
    message: "Finding main topics…",
  });

  // Dynamic import keeps LLM helpers out of the first paint path
  const { resolveTopics } = await import("../topics/resolveTopics");
  const result = await resolveTopics(
    videoId,
    index.chunks,
    index.captionTrackHash,
    (msg) => panel.setStatus({ kind: "indexing", message: msg })
  );

  sessionTopics.set(videoId, result);
  console.info(
    LOG,
    `Topics (${result.source}) for ${videoId}:`,
    result.topics.map((t) => t.label)
  );
  return result;
}

function readyStatus(
  index: VideoIndex,
  fromCache: boolean,
  topics: VideoTopic[],
  topicSource: "chapters" | "llm" | "local" | "mixed"
) {
  return {
    kind: "ready" as const,
    chunkCount: index.chunks.length,
    fromCache,
    topics,
    topicSource,
  };
}

/**
 * Lazy-load comments + ML sentiment for THIS video only.
 * Cache is keyed by videoId + fingerprint so moods never leak across videos.
 */
async function loadComments(
  videoId: string,
  panel: SearchPanel,
  force = false
): Promise<void> {
  // Stale cache guard
  const cached = sessionComments.get(videoId);
  if (!force && cached && cached.videoId === videoId) {
    panel.setCommentsState({ kind: "ready", report: cached });
    return;
  }
  if (force) sessionComments.delete(videoId);

  if (!force && commentJobs.has(videoId)) {
    return commentJobs.get(videoId)!;
  }

  const job = (async () => {
    // Bail if user navigated away mid-job
    const stillHere = () => activeVideoId === videoId && activePanel === panel;

    panel.setCommentsState({
      kind: "loading",
      message: "Fetching this video’s comments…",
    });

    try {
      const { fetchYouTubeComments } = await import(
        "../comments/fetchYouTubeComments"
      );
      const { analyzeComments } = await import(
        "../comments/analyzeSentiment"
      );

      const fetched = await fetchYouTubeComments(videoId, {
        maxComments: 120,
        onProgress: (n) => {
          if (!stillHere()) return;
          panel.setCommentsState({
            kind: "loading",
            message: n
              ? `Reading comments… ${n}`
              : "Fetching this video’s comments…",
          });
        },
      });

      if (!stillHere()) return;

      if (fetched.videoId !== videoId) {
        throw new Error("Comment fetch returned a different video id");
      }

      if (fetched.comments.length === 0) {
        panel.setCommentsState({
          kind: "empty",
          message:
            "No comments found for this video yet. Scroll the comments section, then tap Refresh.",
        });
        return;
      }

      panel.setCommentsState({
        kind: "loading",
        message: `AI scoring ${fetched.comments.length} comments…`,
      });

      const report = await analyzeComments(videoId, fetched.comments, {
        totalReported: fetched.totalReported,
        truncated: fetched.truncated,
        onProgress: (msg, ratio) => {
          if (!stillHere()) return;
          panel.setCommentsState({
            kind: "loading",
            message:
              typeof ratio === "number"
                ? `${msg} (${Math.round(ratio * 100)}%)`
                : msg,
          });
        },
      });

      if (!stillHere()) return;

      // Hard guard against cross-video pollution
      if (report.videoId !== videoId) {
        throw new Error("Sentiment report video mismatch");
      }

      sessionComments.set(videoId, report);
      console.info(
        LOG,
        `Mood for ${videoId}:`,
        report.engine,
        report.overallLabel,
        `${report.positivePct}% / ${report.negativePct}% / ${report.neutralPct}%`,
        "fp:",
        report.fingerprint.slice(0, 40),
        "themes:",
        report.themes.map((t) => t.phrase)
      );
      panel.setCommentsState({ kind: "ready", report });
    } catch (err) {
      if (!stillHere()) return;
      console.error(LOG, "Comment sentiment failed:", err);
      panel.setCommentsState({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to analyze comments",
      });
    }
  })();

  commentJobs.set(videoId, job);
  try {
    await job;
  } finally {
    commentJobs.delete(videoId);
  }
}

console.info(LOG, "content script evaluating", location.href);

function isWatchPage(): boolean {
  try {
    return (
      window.location.pathname === "/watch" &&
      new URLSearchParams(window.location.search).has("v")
    );
  } catch {
    return false;
  }
}

function extractVideoId(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("v");
  } catch {
    return null;
  }
}

/**
 * Compact floating widget overlaid on the watch page (near the player).
 * Never injects into the document flow under the title — keeps the page clean.
 */
function placeRoot(wrap: HTMLElement): void {
  wrap.setAttribute("data-vsa-float", "1");
  wrap.setAttribute("data-vsa-compact", "1");
  // Fixed overlay lives on <html> so it stays above YT chrome
  if (wrap.parentElement !== document.documentElement) {
    document.documentElement.appendChild(wrap);
  }
}

function seekTo(seconds: number): void {
  // MAIN-world player.seekTo + <video> fallback (see src/player/seekTo.ts)
  void import("../player/seekTo").then(({ seekTo: doSeek }) => {
    doSeek(seconds);
  });
}

/**
 * Load heavy pipeline (transformers.js) only when needed.
 * Vite emits a separate chunk (runIndex.js); CRX marks it web-accessible.
 * Do NOT use @vite-ignore here — that drops the chunk from the build.
 */
async function loadPipeline() {
  return import("../pipeline/runIndex");
}

async function indexVideo(
  videoId: string,
  panel: SearchPanel,
  force = false
): Promise<VideoIndex | null> {
  if (!force && sessionIndex.has(videoId)) {
    const index = sessionIndex.get(videoId)!;
    const segs = sessionSegments.get(videoId);
    if (segs?.length) panel.setTranscript(segs);
    const { topics, source } = await ensureTopics(videoId, index, panel, false);
    panel.setStatus(readyStatus(index, true, topics, source));
    return index;
  }

  if (!force && indexingJobs.has(videoId)) {
    return indexingJobs.get(videoId)!;
  }

  const job = (async (): Promise<VideoIndex | null> => {
    panel.setStatus({
      kind: "indexing",
      message: "Loading search engine…",
    });

    let pipeline: Awaited<ReturnType<typeof loadPipeline>>;
    try {
      pipeline = await loadPipeline();
    } catch (err) {
      console.error(LOG, "Failed to load pipeline module", err);
      panel.setStatus({
        kind: "error",
        message:
          "Could not load embedding engine. Remove + re-load the extension from dist/, then refresh YouTube.",
      });
      return null;
    }

    try {
      const { index, fromCache, segments } = await pipeline.runEnsureIndex(
        videoId,
        (p) => {
          if (
            p.stage === "ready" ||
            p.stage === "error" ||
            p.stage === "no-captions"
          ) {
            return;
          }
          panel.setStatus({
            kind: "indexing",
            message: p.message,
            ratio: p.ratio,
          });
        },
        force
      );

      sessionIndex.set(videoId, index);
      sessionSegments.set(videoId, segments);
      panel.setTranscript(segments);

      // Unlock Search / Live ASAP — topics can finish in the background
      const cachedTopics = !force ? sessionTopics.get(videoId) : undefined;
      panel.setStatus(
        readyStatus(
          index,
          fromCache,
          cachedTopics?.topics ?? [],
          cachedTopics?.source ?? "local"
        )
      );

      if (force) sessionTopics.delete(videoId);
      const { topics, source } = await ensureTopics(
        videoId,
        index,
        panel,
        force
      );
      // Re-apply ready with real topics (does not re-lock search)
      panel.setStatus(readyStatus(index, fromCache, topics, source));
      return index;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(LOG, "Indexing failed:", err);

      if (/no captions/i.test(message)) {
        panel.setStatus({ kind: "no-captions", message });
      } else {
        panel.setStatus({ kind: "error", message });
      }
      return null;
    }
  })();

  indexingJobs.set(videoId, job);
  try {
    return await job;
  } finally {
    indexingJobs.delete(videoId);
  }
}

/** Ignore stale search results if user kept typing. */
let searchSeq = 0;

/**
 * Chat-with-Video RAG turn for the active video.
 */
async function runChat(
  videoId: string,
  text: string,
  panel: SearchPanel
): Promise<void> {
  const q = text.trim();
  if (!q || chatBusy) return;

  let index = sessionIndex.get(videoId) ?? null;
  if (!index) {
    index = await indexVideo(videoId, panel);
    if (!index) {
      panel.setChatError("Index the video first (wait until Ready).");
      return;
    }
  }

  chatBusy = true;
  const history = sessionChat.get(videoId) ?? [];
  const userMsg: ChatMessage = {
    id: newMessageId(),
    role: "user",
    content: q,
    at: Date.now(),
  };
  const nextHistory = [...history, userMsg];
  sessionChat.set(videoId, nextHistory);
  panel.setChatMessages(nextHistory);
  panel.setChatBusy(true, "Retrieving captions…");

  try {
    const pipeline = await loadPipeline();
    const topics = sessionTopics.get(videoId)?.topics ?? [];
    const result = await pipeline.runChatTurn(q, index, {
      history,
      topicHints: topics.map((t) => ({
        label: t.label,
        startTime: t.startTime,
      })),
      onProgress: (msg) => {
        if (activeVideoId !== videoId) return;
        panel.setChatBusy(true, msg);
      },
    });

    if (activeVideoId !== videoId) return;

    const assistant: ChatMessage = {
      id: newMessageId(),
      role: "assistant",
      content: result.answer,
      sources: result.sources,
      usedLlm: result.usedLlm,
      at: Date.now(),
    };
    const finalHist = [...nextHistory, assistant];
    sessionChat.set(videoId, finalHist);
    panel.setChatMessages(finalHist);
    panel.setChatBusy(false);
    console.info(
      LOG,
      `Chat “${q.slice(0, 60)}” · llm=${result.usedLlm} · sources=${result.sources.length}`
    );
  } catch (err) {
    if (activeVideoId !== videoId) return;
    console.error(LOG, "Chat RAG failed:", err);
    panel.setChatBusy(false);
    panel.setChatError(
      err instanceof Error ? err.message : "Chat failed"
    );
    // Keep user message; append error note
    const errMsg: ChatMessage = {
      id: newMessageId(),
      role: "assistant",
      content:
        "Sorry — I couldn’t answer that. Check Settings (API key / model) or try again.",
      usedLlm: false,
      at: Date.now(),
    };
    const finalHist = [...nextHistory, errMsg];
    sessionChat.set(videoId, finalHist);
    panel.setChatMessages(finalHist);
  } finally {
    chatBusy = false;
  }
}

async function runSearch(
  videoId: string,
  query: string,
  panel: SearchPanel,
  mode: QueryMode = "auto"
): Promise<void> {
  const q = query.trim();
  if (!q) {
    const index = sessionIndex.get(videoId);
    if (index) {
      const cached = sessionTopics.get(videoId);
      panel.setStatus(
        readyStatus(
          index,
          true,
          cached?.topics ?? [],
          cached?.source ?? "local"
        )
      );
    }
    return;
  }

  // Don't burn CPU on 1-character queries while typing
  if (q.length < 2) {
    return;
  }

  let index = sessionIndex.get(videoId) ?? null;
  if (!index) {
    index = await indexVideo(videoId, panel);
    if (!index) return;
  }

  const seq = ++searchSeq;
  panel.setStatus({ kind: "searching" });
  const t0 = performance.now();

  try {
    await new Promise<void>((r) => setTimeout(r, 0));
    if (seq !== searchSeq) return;

    const pipeline = await loadPipeline();
    if (seq !== searchSeq) return;

    const forceAsk = mode === "ask";
    const forceSearch = mode === "search";

    if (forceSearch) {
      const results = await pipeline.runSearch(q, index);
      if (seq !== searchSeq) return;
      const ms = Math.round(performance.now() - t0);
      console.info(LOG, `Search “${q}” → ${results.length} hits in ${ms}ms`);
      if (results.length === 0) {
        panel.setStatus({ kind: "no-results", query: q });
      } else {
        panel.setStatus({ kind: "results", results, query: q });
      }
      return;
    }

    const out = await pipeline.runSmartQuery(q, index, { forceAsk });
    if (seq !== searchSeq) return;

    const ms = Math.round(performance.now() - t0);
    if (out.mode === "qa") {
      console.info(LOG, `Ask “${q}” in ${ms}ms · llm=${out.answer.usedLlm}`);
      if (!out.answer.answer && out.results.length === 0) {
        panel.setStatus({ kind: "no-results", query: q });
      } else {
        panel.setStatus({
          kind: "qa",
          answer: out.answer.answer,
          usedLlm: out.answer.usedLlm,
          results: out.results,
          query: q,
        });
      }
      return;
    }

    console.info(LOG, `Search “${q}” → ${out.results.length} hits in ${ms}ms`);
    if (out.results.length === 0) {
      panel.setStatus({ kind: "no-results", query: q });
    } else {
      panel.setStatus({ kind: "results", results: out.results, query: q });
    }
  } catch (err) {
    if (seq !== searchSeq) return;
    console.error(LOG, "Search/Ask failed:", err);
    panel.setStatus({
      kind: "error",
      message: err instanceof Error ? err.message : "Search failed",
    });
  }
}

function mountEmergencyPill(videoId: string, reason: string): void {
  document.getElementById(ROOT_ID)?.remove();
  injectSearchPanelStyles();

  const wrap = document.createElement("div");
  wrap.id = ROOT_ID;
  wrap.setAttribute("data-video-id", videoId);
  wrap.setAttribute("data-vsa-float", "1");
  wrap.innerHTML = `
    <div id="videosearch-ai-panel">
      <div class="vsa-bar">
        <button type="button" class="vsa-toggle" data-state="error">
          <span class="vsa-logo">⌕</span>
          <span class="vsa-title">VideoSearch AI</span>
          <span class="vsa-badge">!</span>
        </button>
        <div class="vsa-status">${reason}</div>
      </div>
    </div>
  `;
  document.documentElement.appendChild(wrap);
  console.warn(LOG, "Emergency pill mounted:", reason);
}

/** Keep panel instance so we can detect focus and avoid remounting mid-type. */
let activePanel: SearchPanel | null = null;
let activeVideoId: string | null = null;

function mountPanel(videoId: string): void {
  try {
    const existing = document.getElementById(ROOT_ID);
    if (
      existing?.getAttribute("data-video-id") === videoId &&
      existing.isConnected &&
      activePanel &&
      activeVideoId === videoId
    ) {
      // Never tear down while the user is typing
      if (activePanel.isInputFocused()) return;
      return;
    }

    // Don't destroy a focused panel for a transient DOM blip
    if (
      activePanel?.isInputFocused() &&
      activeVideoId === videoId &&
      existing?.isConnected
    ) {
      return;
    }

    existing?.remove();
    activePanel = null;

    injectSearchPanelStyles();

    const wrap = document.createElement("div");
    wrap.id = ROOT_ID;
    wrap.setAttribute("data-video-id", videoId);
    wrap.setAttribute("data-vsa-step", "full");

    const panel = new SearchPanel({
      onSearch: (q, mode) => {
        void runSearch(videoId, q, panel, mode);
      },
      onSeek: (t) => seekTo(t),
      onRetry: () => {
        sessionIndex.delete(videoId);
        sessionSegments.delete(videoId);
        sessionTopics.delete(videoId);
        sessionComments.delete(videoId);
        panel.clearTranscript();
        panel.resetComments();
        panel.resetIndexState();
        void indexVideo(videoId, panel, true);
      },
      onTopicClick: (topic) => {
        seekTo(topic.startTime);
        void runSearch(videoId, topic.query, panel, "search");
      },
      onLoadComments: (force) => {
        void loadComments(videoId, panel, Boolean(force));
      },
      onChatSend: (text) => {
        void runChat(videoId, text, panel);
      },
      onChatClear: () => {
        sessionChat.set(videoId, []);
        panel.setChatMessages([]);
        panel.setChatBusy(false);
      },
      onSettingsSaved: () => {
        // Clear topic caches so LLM re-runs with new key
        sessionTopics.delete(videoId);
        void chrome.storage.local.remove(`vsa_topics_${videoId}`);
        const index = sessionIndex.get(videoId);
        if (index) {
          void (async () => {
            const { topics, source } = await ensureTopics(
              videoId,
              index,
              panel,
              true
            );
            panel.setStatus(readyStatus(index, true, topics, source));
          })();
        }
      },
    });

    // Restore cached mood only for THIS video id
    const mood = sessionComments.get(videoId);
    if (mood && mood.videoId === videoId) {
      panel.setCommentsState({ kind: "ready", report: mood });
    } else {
      panel.resetComments();
    }

    // Restore chat history for this video
    panel.setChatMessages(sessionChat.get(videoId) ?? []);

    activePanel = panel;
    activeVideoId = videoId;

    wrap.appendChild(panel.root);
    placeRoot(wrap);
    // Compact pill by default (after host exists so classes stick on #videosearch-ai-root)
    wrap.classList.add("is-collapsed");
    panel.root.classList.add("is-collapsed");

    panel.setStatus({ kind: "indexing", message: "Preparing…" });
    console.info(LOG, "Panel MOUNTED for", videoId);

    void indexVideo(videoId, panel);
  } catch (err) {
    console.error(LOG, "mountPanel crashed:", err);
    mountEmergencyPill(
      videoId,
      err instanceof Error ? err.message : "UI failed to mount"
    );
  }
}

function removePanel(force = false): void {
  if (!force && activePanel?.isInputFocused()) return;
  document.getElementById(ROOT_ID)?.remove();
  activePanel = null;
  activeVideoId = null;
}

function injectOrUpdate(): void {
  try {
    if (!isWatchPage()) {
      removePanel(true);
      return;
    }
    const videoId = extractVideoId();
    if (!videoId) {
      removePanel(true);
      return;
    }
    // Hard switch when the watch id changes — drop old mood/index UI state
    if (activeVideoId && activeVideoId !== videoId) {
      console.info(LOG, "Video changed", activeVideoId, "→", videoId);
      // Cancel in-flight comment jobs for old id by clearing map
      commentJobs.clear();
      document.getElementById(ROOT_ID)?.remove();
      activePanel = null;
      activeVideoId = null;
    }
    mountPanel(videoId);
  } catch (err) {
    console.error(LOG, "injectOrUpdate error:", err);
  }
}

function startWatchers(): void {
  let lastUrl = location.href;

  const onNavigate = (): void => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      window.setTimeout(injectOrUpdate, 300);
    }
  };

  try {
    new MutationObserver(onNavigate).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (err) {
    console.warn(LOG, "MutationObserver failed", err);
  }

  window.addEventListener("yt-navigate-finish", () => {
    window.setTimeout(injectOrUpdate, 200);
  });
  window.addEventListener("popstate", onNavigate);

  let tries = 0;
  const boot = window.setInterval(() => {
    tries += 1;
    // Never remount while typing — that kills the cursor
    if (activePanel?.isInputFocused()) return;

    if (isWatchPage() && !document.getElementById(ROOT_ID)) {
      injectOrUpdate();
    }
    const root = document.getElementById(ROOT_ID);
    if (isWatchPage() && root && !root.isConnected) {
      injectOrUpdate();
    }
    if (tries > 80) window.clearInterval(boot);
  }, 400);

  injectOrUpdate();
}

/** CRXJS loader may call this; side-effect boot also runs on import. */
export function onExecute(): void {
  console.info(LOG, "onExecute()");
  startWatchers();
}

// Always boot (covers both CRX loader and direct inject)
try {
  startWatchers();
} catch (err) {
  console.error(LOG, "startWatchers failed:", err);
  // Last-ditch fixed green pill so user sees *something*
  try {
    const id = extractVideoId() ?? "unknown";
    mountEmergencyPill(id, "Boot error — open console");
  } catch {
    // ignore
  }
}
