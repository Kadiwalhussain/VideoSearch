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
import type { VideoHighlight } from "../storage/highlightsStore";
import type { VideoScreenshot } from "../storage/screenshotStore";

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
const sessionHighlights = new Map<string, VideoHighlight[]>();
const sessionScreenshots = new Map<string, VideoScreenshot[]>();
const commentJobs = new Map<string, Promise<void>>();
const indexingJobs = new Map<string, Promise<VideoIndex | null>>();
let chatBusy = false;
let timelineReady = false;

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
        maxComments: 200,
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

async function paintHighlights(
  videoId: string,
  panel: SearchPanel,
  list?: VideoHighlight[]
): Promise<void> {
  const items = list ?? sessionHighlights.get(videoId) ?? [];
  sessionHighlights.set(videoId, items);
  panel.setHighlights(items);

  const shots = sessionScreenshots.get(videoId) ?? [];
  panel.setScreenshots(shots);

  const { setTimelineHighlights } = await import(
    "../player/timelineHighlights"
  );
  setTimelineHighlights(items, {
    shots,
    // Red mark / note pin on progress bar → seek + open Notes
    onClick: (hl) => {
      seekTo(hl.startTime);
      panel.openHighlightsTab();
      panel.flashHighlight(hl.id);
    },
    // Cyan camera pin on progress bar → seek + open Notes (shots list)
    onShotClick: (shot) => {
      seekTo(shot.videoTime);
      panel.openHighlightsTab();
      panel.flashScreenshot(shot.id);
    },
    onAdd: () => {
      void addHighlightAtNow(videoId, panel);
    },
    onCapture: () => {
      void captureFrameNow(videoId, panel);
    },
  });
  timelineReady = true;
}

async function loadHighlightsForVideo(
  videoId: string,
  panel: SearchPanel
): Promise<void> {
  try {
    const { loadHighlights } = await import("../storage/highlightsStore");
    const { loadScreenshots } = await import("../storage/screenshotStore");
    const items = await loadHighlights(videoId);
    const shots = await loadScreenshots(videoId);
    sessionScreenshots.set(videoId, shots);
    panel.setScreenshots(shots);
    await paintHighlights(videoId, panel, items);
  } catch (err) {
    console.warn(LOG, "load highlights failed", err);
    panel.setHighlights([]);
    panel.setScreenshots([]);
  }
}

async function addHighlightAtNow(
  videoId: string,
  panel: SearchPanel
): Promise<void> {
  try {
    const { getCurrentTime, getDuration } = await import("../player/seekTo");
    const { addHighlightWithMeta, updateHighlight } = await import(
      "../storage/highlightsStore"
    );
    const { showMarkNotePopup } = await import("../ui/captureFx");

    const t = getCurrentTime();
    const dur = getDuration();
    const end = dur > 0 ? Math.min(dur, t + 2.5) : t + 2.5;

    // 1) Place pin immediately so the timeline feels instant
    const created = await addHighlightWithMeta(videoId, {
      startTime: t,
      endTime: end,
      note: "",
    });
    let list = created.list;
    let newest = created.highlight;
    await paintHighlights(videoId, panel, list);

    // 2) Animated popup — optional note (Skip keeps the mark)
    const popup = await showMarkNotePopup({ videoTime: t });
    const noteText = (popup.note || "").trim();
    if (newest?.id && noteText) {
      list = await updateHighlight(videoId, newest.id, { note: noteText });
      newest = list.find((h) => h.id === newest.id) ?? newest;
      await paintHighlights(videoId, panel, list);
    } else {
      // Refresh list in case storage changed while popup was open
      await paintHighlights(videoId, panel, list);
    }

    // 3) Open Notes list + flash the row (note fully visible)
    panel.openHighlightsTab();
    if (newest?.id) {
      window.setTimeout(() => panel.flashHighlight(newest.id), 80);
    }
    panel.setVaultSyncMessage(
      noteText ? "Mark + note saved locally" : "Mark saved locally"
    );
    // Immediate vault upload (not only debounced) so Studio always gets the mark
    await flushSyncToVault(videoId, panel);
    console.info(
      LOG,
      "Highlight saved",
      newest.id,
      "at",
      t.toFixed(1),
      "s",
      noteText ? `note=${noteText.slice(0, 40)}` : "(no note)"
    );
  } catch (err) {
    console.error(LOG, "add highlight failed", err);
    try {
      panel.setVaultSyncMessage(
        err instanceof Error ? `Mark failed: ${err.message}` : "Mark failed",
        true
      );
    } catch {
      /* ignore */
    }
  }
}

async function captureFrameNow(
  videoId: string,
  panel: SearchPanel
): Promise<void> {
  try {
    const { captureVideoFrame } = await import("../capture/frameCapture");
    const { playShutterFlash, showCapturePopup } = await import(
      "../ui/captureFx"
    );
    const { newScreenshotId, saveScreenshot } = await import(
      "../storage/screenshotStore"
    );
    const { addHighlight } = await import("../storage/highlightsStore");

    // 1) Flash first (feels instant), capture lighter JPEG for smooth UI
    playShutterFlash();
    const frame = await captureVideoFrame(0.72, 960);
    if (!frame) {
      panel.setVaultSyncMessage("Capture failed (video not ready)", true);
      return;
    }

    // 2) Photo review popup — user adds note (no storage yet)
    const popup = await showCapturePopup({
      dataUrl: frame.dataUrl,
      videoTime: frame.videoTime,
    });

    const shotId = newScreenshotId();
    const note = popup.note || "";
    const shot = {
      id: shotId,
      videoId,
      videoTime: frame.videoTime,
      dataUrl: frame.dataUrl,
      width: frame.width,
      height: frame.height,
      note,
      createdAt: frame.capturedAt,
    };

    // 3) Optimistic UI — open Notes + append card immediately (no full reload)
    panel.openHighlightsTab();
    const prev = sessionScreenshots.get(videoId) ?? [];
    const nextShots = [...prev.filter((s) => s.id !== shotId), shot].sort(
      (a, b) => a.videoTime - b.videoTime
    );
    sessionScreenshots.set(videoId, nextShots);
    panel.appendScreenshot(shot);
    window.setTimeout(() => panel.flashScreenshot(shotId), 40);
    panel.setVaultSyncMessage(
      note ? "Screenshot + note saved" : "Screenshot saved to Notes"
    );

    // 4) Persist off the critical path (IndexedDB + timeline), then auto-sync
    const persist = async () => {
      await saveScreenshot(shot);
      const list = await addHighlight(videoId, {
        startTime: frame.videoTime,
        endTime: frame.videoTime + 2.5,
        note: note || "Frame capture",
        screenshotId: shotId,
        color: "#38bdf8",
      });
      sessionHighlights.set(videoId, list);
      await paintHighlights(videoId, panel, list);
      // Push to cloud + website vault immediately
      await flushSyncToVault(videoId, panel);
    };

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => {
        void persist().catch((err) =>
          console.error(LOG, "persist screenshot failed", err)
        );
      }, { timeout: 800 });
    } else {
      window.setTimeout(() => {
        void persist().catch((err) =>
          console.error(LOG, "persist screenshot failed", err)
        );
      }, 0);
    }

    console.info(LOG, "Screenshot at", frame.videoTime.toFixed(1), "s");
  } catch (err) {
    console.error(LOG, "screenshot failed", err);
    panel.setVaultSyncMessage(
      err instanceof Error ? err.message : "Screenshot failed",
      true
    );
  }
}

function videoTitleFromPage(videoId: string): string {
  return (
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string")
      ?.textContent?.trim() ||
    document.title ||
    videoId
  );
}

/** Debounced auto-sync to Mongo/R2 → website vault */
function queueAutoSync(
  videoId: string,
  panel: SearchPanel,
  delayMs = 1200
): void {
  void import("../cloud/cloudSync").then(({ scheduleAutoSync }) => {
    scheduleAutoSync(videoId, {
      delayMs,
      getTitle: () => videoTitleFromPage(videoId),
      onStatus: (msg, isError) => panel.setVaultSyncMessage(msg, isError),
    });
  });
}

/** Force sync current video to vault now (awaitable). */
async function flushSyncToVault(
  videoId: string,
  panel: SearchPanel
): Promise<void> {
  try {
    const { loadCloudSettings } = await import("../settings/cloudSettings");
    const settings = await loadCloudSettings();
    if (!settings.enabled || !settings.apiKey) {
      panel.setVaultSyncMessage(
        "Saved on this device · sign in (Account) to upload to vault",
        true
      );
      return;
    }
    panel.setVaultSyncMessage("Uploading to vault…");
    const { loadHighlights } = await import("../storage/highlightsStore");
    const { loadScreenshots } = await import("../storage/screenshotStore");
    const { syncVideoToCloud } = await import("../cloud/cloudSync");
    const highlights = await loadHighlights(videoId);
    const screenshots = await loadScreenshots(videoId);
    const result = await syncVideoToCloud({
      videoId,
      videoTitle: videoTitleFromPage(videoId),
      highlights,
      screenshots,
    });
    panel.setVaultSyncMessage(
      result.ok
        ? result.message || "Synced to vault"
        : result.message || "Vault sync failed",
      !result.ok
    );
  } catch (err) {
    panel.setVaultSyncMessage(
      err instanceof Error ? err.message : "Vault sync failed",
      true
    );
  }
}

/** After login: push every local mark/shot to the cloud vault. */
async function pushAllMarksToVault(panel: SearchPanel): Promise<void> {
  try {
    const { pushAllLocalToCloud } = await import("../cloud/cloudSync");
    panel.setVaultSyncMessage("Uploading all local marks to vault…");
    const result = await pushAllLocalToCloud({
      onStatus: (msg, isError) => panel.setVaultSyncMessage(msg, isError),
      getTitleFor: (id) =>
        id === activeVideoId ? videoTitleFromPage(id) : id,
    });
    panel.setVaultSyncMessage(result.message, !result.ok);
  } catch (err) {
    panel.setVaultSyncMessage(
      err instanceof Error ? err.message : "Bulk upload failed",
      true
    );
  }
}

async function refreshLibraryUi(
  videoId: string,
  panel: SearchPanel
): Promise<void> {
  try {
    const { getLibraryEntry } = await import("../storage/libraryStore");
    const entry = await getLibraryEntry(videoId);
    panel.setLibraryState({
      saved: Boolean(entry?.saved),
      watchLater: Boolean(entry?.watchLater),
      playlists: entry?.playlists || [],
    });
  } catch {
    panel.setLibraryState({ saved: false, watchLater: false, playlists: [] });
  }
}

async function loadPlaylistsForPanel(panel: SearchPanel): Promise<void> {
  try {
    const { fetchUserPlaylists } = await import("../cloud/cloudSync");
    const res = await fetchUserPlaylists();
    panel.setKnownPlaylists(res.playlists || []);
  } catch {
    panel.setKnownPlaylists([]);
  }
}

async function runLibraryAction(
  videoId: string,
  panel: SearchPanel,
  action:
    | "toggle_save"
    | "toggle_watch_later"
    | "add_playlist"
    | "remove_playlist"
    | "toggle_playlist",
  playlist?: string
): Promise<void> {
  const title = videoTitleFromPage(videoId);
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  panel.setVaultSyncMessage(
    action.includes("playlist") ? "Updating playlist…" : "Saving to library…"
  );
  try {
    const { updateLibraryOnCloud } = await import("../cloud/cloudSync");
    const result = await updateLibraryOnCloud({
      videoId,
      videoTitle: title,
      videoUrl,
      action,
      playlist,
    });
    if (result.ok && result.library) {
      panel.setLibraryState(result.library);
      panel.setVaultSyncMessage(result.message);
      void loadPlaylistsForPanel(panel);
    } else if (result.ok) {
      await refreshLibraryUi(videoId, panel);
      panel.setVaultSyncMessage(result.message);
      void loadPlaylistsForPanel(panel);
    } else {
      panel.setVaultSyncMessage(result.message, true);
      // Local fallback when offline / not signed in
      if (/offline|sign in/i.test(result.message)) {
        const { getLibraryEntry, applyLibraryFlags } = await import(
          "../storage/libraryStore"
        );
        const prev = await getLibraryEntry(videoId);
        if (action === "toggle_watch_later") {
          const on = !prev?.watchLater;
          await applyLibraryFlags(videoId, {
            videoTitle: title,
            videoUrl,
            watchLater: on,
            watchLaterAt: on ? Date.now() : null,
          });
        } else if (action === "toggle_save") {
          const on = !prev?.saved;
          await applyLibraryFlags(videoId, {
            videoTitle: title,
            videoUrl,
            saved: on,
            savedAt: on ? Date.now() : null,
          });
        } else if (
          (action === "add_playlist" ||
            action === "toggle_playlist" ||
            action === "remove_playlist") &&
          playlist
        ) {
          let list = [...(prev?.playlists || [])];
          const key = playlist.toLowerCase();
          const idx = list.findIndex((p) => p.toLowerCase() === key);
          if (action === "remove_playlist") {
            list = list.filter((p) => p.toLowerCase() !== key);
          } else if (action === "toggle_playlist") {
            if (idx >= 0) list.splice(idx, 1);
            else list.push(playlist);
          } else if (idx < 0) {
            list.push(playlist);
          }
          await applyLibraryFlags(videoId, {
            videoTitle: title,
            videoUrl,
            saved: true,
            savedAt: prev?.savedAt || Date.now(),
            playlists: list,
          });
        }
        await refreshLibraryUi(videoId, panel);
        void loadPlaylistsForPanel(panel);
      }
    }
  } catch (err) {
    panel.setVaultSyncMessage(
      err instanceof Error ? err.message : "Library update failed",
      true
    );
  }
}

async function syncVaultCloud(
  videoId: string,
  panel: SearchPanel
): Promise<void> {
  panel.setVaultSyncMessage("Syncing to cloud…");
  try {
    const { syncVideoToCloud } = await import("../cloud/cloudSync");
    const { loadHighlights } = await import("../storage/highlightsStore");
    const { loadScreenshots } = await import("../storage/screenshotStore");
    const highlights = await loadHighlights(videoId);
    const screenshots = await loadScreenshots(videoId);
    const result = await syncVideoToCloud({
      videoId,
      videoTitle: videoTitleFromPage(videoId),
      highlights,
      screenshots,
    });
    panel.setVaultSyncMessage(result.message, !result.ok);
    // Refresh shot badges after sync (cloud URLs may update)
    const shots = await loadScreenshots(videoId);
    sessionScreenshots.set(videoId, shots);
    panel.setScreenshots(shots);
  } catch (err) {
    panel.setVaultSyncMessage(
      err instanceof Error ? err.message : "Sync failed",
      true
    );
  }
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
      const detail =
        err instanceof Error
          ? err.message.slice(0, 120)
          : typeof err === "string"
            ? err.slice(0, 120)
            : "unknown error";
      panel.setStatus({
        kind: "error",
        message: `Could not load search engine (${detail}). Reload the extension from dist/ and hard-refresh YouTube.`,
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
      onAddHighlight: () => {
        void addHighlightAtNow(videoId, panel);
      },
      onCaptureFrame: () => {
        void captureFrameNow(videoId, panel);
      },
      onSyncCloud: () => {
        void (async () => {
          await flushSyncToVault(videoId, panel);
          await pushAllMarksToVault(panel);
        })();
      },
      onCloudSettingsSaved: () => {
        // Login / signup succeeded → push every local mark to Studio vault
        void pushAllMarksToVault(panel);
      },
      onHighlightSeek: (t) => seekTo(t),
      onHighlightNote: (id, note) => {
        void (async () => {
          const { updateHighlight } = await import(
            "../storage/highlightsStore"
          );
          const list = await updateHighlight(videoId, id, { note });
          await paintHighlights(videoId, panel, list);
          queueAutoSync(videoId, panel, 1400);
        })();
      },
      onDeleteHighlight: (id) => {
        void (async () => {
          const { deleteHighlight } = await import(
            "../storage/highlightsStore"
          );
          const list = await deleteHighlight(videoId, id);
          await paintHighlights(videoId, panel, list);
          queueAutoSync(videoId, panel, 500);
        })();
      },
      onDeleteScreenshot: (id) => {
        void (async () => {
          const { deleteScreenshot, loadScreenshots } = await import(
            "../storage/screenshotStore"
          );
          await deleteScreenshot(id);
          const shots = await loadScreenshots(videoId);
          sessionScreenshots.set(videoId, shots);
          panel.setScreenshots(shots);
          await paintHighlights(videoId, panel);
          queueAutoSync(videoId, panel, 500);
        })();
      },
      onScreenshotNote: (id, note) => {
        void (async () => {
          const { updateScreenshot, loadScreenshots } = await import(
            "../storage/screenshotStore"
          );
          await updateScreenshot(id, { note });
          const shots = await loadScreenshots(videoId);
          sessionScreenshots.set(videoId, shots);
          panel.setScreenshots(shots);
          await paintHighlights(videoId, panel);
          queueAutoSync(videoId, panel, 1400);
        })();
      },
      onToggleWatchLater: () => {
        void runLibraryAction(videoId, panel, "toggle_watch_later");
      },
      onToggleSave: () => {
        void runLibraryAction(videoId, panel, "toggle_save");
      },
      onAddToPlaylist: (name) => {
        void runLibraryAction(videoId, panel, "add_playlist", name);
      },
      onRemoveFromPlaylist: (name) => {
        void runLibraryAction(videoId, panel, "remove_playlist", name);
      },
      onTogglePlaylist: (name) => {
        void runLibraryAction(videoId, panel, "toggle_playlist", name);
      },
      onRequestPlaylists: () => {
        void loadPlaylistsForPanel(panel);
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

    // Load local highlights → red marks + inject screenshot/mark on player
    void loadHighlightsForVideo(videoId, panel);
    void refreshLibraryUi(videoId, panel);
    void loadPlaylistsForPanel(panel);
    // If already signed in, keep vault fresh for this video
    void (async () => {
      try {
        const { loadCloudSettings } = await import("../settings/cloudSettings");
        const s = await loadCloudSettings();
        if (s.enabled && s.apiKey) {
          queueAutoSync(videoId, panel, 1500);
        }
      } catch {
        /* ignore */
      }
    })();
    // Also inject player chrome ASAP (don't wait on IndexedDB)
    void import("../player/timelineHighlights").then((m) => {
      m.setTimelineHighlights(sessionHighlights.get(videoId) ?? [], {
        shots: sessionScreenshots.get(videoId) ?? [],
        onClick: (hl) => {
          seekTo(hl.startTime);
          panel.openHighlightsTab();
          panel.flashHighlight(hl.id);
        },
        onShotClick: (shot) => {
          seekTo(shot.videoTime);
          panel.openHighlightsTab();
          panel.flashScreenshot(shot.id);
        },
        onAdd: () => {
          void addHighlightAtNow(videoId, panel);
        },
        onCapture: () => {
          void captureFrameNow(videoId, panel);
        },
      });
      timelineReady = true;
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
      void import("../cloud/cloudSync").then(({ cancelAutoSync }) => {
        cancelAutoSync(activeVideoId || undefined);
      });
      if (timelineReady) {
        void import("../player/timelineHighlights").then((m) => {
          m.clearTimelineHighlights();
        });
        timelineReady = false;
      }
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
