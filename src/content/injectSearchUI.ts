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

const ROOT_ID = "videosearch-ai-root";
const LOG = "[VideoSearch AI]";

const sessionIndex = new Map<string, VideoIndex>();
const sessionSegments = new Map<string, RawCaptionSegment[]>();
const sessionTopics = new Map<
  string,
  { topics: VideoTopic[]; source: "chapters" | "llm" | "local" | "mixed" }
>();
const indexingJobs = new Map<string, Promise<VideoIndex | null>>();

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
      if (force) sessionTopics.delete(videoId);
      const { topics, source } = await ensureTopics(
        videoId,
        index,
        panel,
        force
      );
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
        panel.clearTranscript();
        void indexVideo(videoId, panel, true);
      },
      onTopicClick: (topic) => {
        seekTo(topic.startTime);
        void runSearch(videoId, topic.query, panel, "search");
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

function removePanel(): void {
  if (activePanel?.isInputFocused()) return;
  document.getElementById(ROOT_ID)?.remove();
  activePanel = null;
  activeVideoId = null;
}

function injectOrUpdate(): void {
  try {
    if (!isWatchPage()) {
      removePanel();
      return;
    }
    const videoId = extractVideoId();
    if (!videoId) {
      removePanel();
      return;
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
