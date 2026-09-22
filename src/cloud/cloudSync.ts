/**
 * Sync vault to auth-based MongoDB + R2 API.
 * Requires user JWT from account login.
 * Supports debounced auto-sync after notes / screenshots change.
 */

import {
  loadCloudSettings,
  vaultUrlAlternates,
} from "../settings/cloudSettings";
import type { VideoHighlight } from "../zx/highlightsStore";
import type { VideoScreenshot } from "../zx/screenshotStore";
import { updateScreenshot } from "../zx/screenshotStore";
import { vaultHttp } from "../net/vaultHttp";
import { saveResumePoint } from "../zx/progressStore";
import type { AbsoluteLibraryAction } from "./offlineSync";

/** Privileged fetch + localhost ↔ 127.0.0.1 retry. */
async function vaultFetch(
  path: string,
  init?: RequestInit,
  projectUrl?: string
): Promise<{ res: Response; base: string }> {
  const settings = projectUrl
    ? { projectUrl }
    : await loadCloudSettings();
  const bases = vaultUrlAlternates(settings.projectUrl);
  let lastErr: unknown = null;
  for (const base of bases) {
    try {
      const res = await vaultHttp(`${base}${path}`, init);
      return { res, base };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Cannot reach vault API");
}

export interface VaultPayload {
  videoId: string;
  videoTitle?: string;
  videoUrl?: string;
  highlights: VideoHighlight[];
  screenshots: Array<{
    id: string;
    videoTime: number;
    note: string;
    width: number;
    height: number;
    createdAt: number;
    imageUrl?: string;
    dataUrl?: string;
  }>;
  updatedAt: number;
}

export interface SyncResult {
  ok: boolean;
  message: string;
  uploadedScreenshots?: number;
  sourceLinkCount?: number;
  /** True when data is safe on-device and queued for later cloud upload */
  offlineQueued?: boolean;
  pendingCount?: number;
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function syncVideoToCloud(opts: {
  videoId: string;
  videoTitle?: string;
  channelTitle?: string;
  channelUrl?: string;
  highlights: VideoHighlight[];
  screenshots: VideoScreenshot[];
  /** Description / bio source links (Drive, PPT, docs…) */
  sourceLinks?: Array<{
    id: string;
    url: string;
    label?: string;
    kind?: string;
    source?: string;
    createdAt?: number;
    startTime?: number;
  }>;
  /** Full YouTube description/bio (plain text) */
  bioText?: string;
  /** Full bio with hyperlinks as markdown [label](url) */
  bioMarkdown?: string;
  /** When true, do not re-enqueue on failure (used by offline queue flusher) */
  skipOfflineEnqueue?: boolean;
  /** True only when the user is actually on this video’s watch page */
  watched?: boolean;
}): Promise<SyncResult> {
  const { isPinnedToVault } = await import("../zx/libraryStore");
  if (!(await isPinnedToVault(opts.videoId))) {
    return {
      ok: true,
      message:
        "On this device · Save, Watch later, or a playlist to keep it in the vault",
    };
  }

  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey) {
    // Pinned videos wait for sign-in; unpinned stay local-only
    if (!opts.skipOfflineEnqueue) {
      const { enqueueVideoSync } = await import("./offlineSync");
      const pending = await enqueueVideoSync(opts.videoId, {
        title: opts.videoTitle,
      });
      return {
        ok: true,
        offlineQueued: true,
        pendingCount: pending,
        message: `Saved on this device · sign in to sync (${pending} pending)`,
      };
    }
    return {
      ok: false,
      message: "Not logged in. Create an account in Settings → Cloud vault.",
    };
  }

  try {
    const { res } = await vaultFetch(
      "/api/vault/sync",
      {
        method: "POST",
        headers: authHeaders(settings.apiKey),
        body: JSON.stringify({
          videoId: opts.videoId,
          videoTitle: opts.videoTitle,
          channelTitle: opts.channelTitle,
          channelUrl: opts.channelUrl,
          videoUrl: `https://www.youtube.com/watch?v=${opts.videoId}`,
          watched: Boolean(opts.watched),
          highlights: opts.highlights,
          sourceLinks: opts.sourceLinks || [],
          ...(typeof opts.bioText === "string"
            ? { bioText: opts.bioText }
            : {}),
          ...(typeof opts.bioMarkdown === "string"
            ? { bioMarkdown: opts.bioMarkdown }
            : {}),
          // Skip base64 for shots already uploaded (huge payload = hang)
          screenshots: opts.screenshots.map((s) => {
            const cloud = s.cloudUrl || "";
            const storedInObjectStore =
              cloud.length > 0 &&
              !cloud.startsWith("account:") &&
              !cloud.startsWith("blob:") &&
              !cloud.includes("/api/vault/shot/");
            // Re-upload JPEG until it lives in R2 / a real media URL.
            // /api/vault/shot is only a proxy — if Mongo lost dataUrl, resend.
            return {
              id: s.id,
              videoTime: s.videoTime,
              note: s.note || "",
              width: s.width,
              height: s.height,
              createdAt: s.createdAt,
              dataUrl: storedInObjectStore ? undefined : s.dataUrl,
              imageUrl: storedInObjectStore ? s.cloudUrl : undefined,
            };
          }),
        }),
      },
      settings.projectUrl
    );

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      uploadedToR2?: number;
      sourceLinkCount?: number;
    };

    if (!res.ok || data.ok === false) {
      if (res.status === 401) {
        if (!opts.skipOfflineEnqueue) {
          const { enqueueVideoSync } = await import("./offlineSync");
          await enqueueVideoSync(opts.videoId, { title: opts.videoTitle });
        }
        return {
          ok: false,
          message: "Session expired — log in again in Settings. Marks stay on this device.",
        };
      }
      // 5xx → treat as offline-ish and queue
      if (res.status >= 500 && !opts.skipOfflineEnqueue) {
        const { enqueueVideoSync } = await import("./offlineSync");
        const pending = await enqueueVideoSync(opts.videoId, {
          title: opts.videoTitle,
        });
        return {
          ok: true,
          offlineQueued: true,
          pendingCount: pending,
          message: `Server error · saved on device · ${pending} pending sync`,
        };
      }
      return {
        ok: false,
        message: data.message || `HTTP ${res.status}`,
      };
    }

    const now = Date.now();
    const base = String(settings.projectUrl || "").replace(/\/$/, "");
    for (const s of opts.screenshots) {
      await updateScreenshot(s.id, {
        cloudUrl: base
          ? `${base}/api/vault/shot/${encodeURIComponent(opts.videoId)}/${encodeURIComponent(s.id)}`
          : `account://${settings.userId}/${opts.videoId}/${s.id}`,
        syncedAt: now,
      });
    }

    // Success — drop from offline queue if present
    try {
      const { dequeueVideoSync } = await import("./offlineSync");
      await dequeueVideoSync(opts.videoId);
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      message: data.message || "Synced to your account",
      uploadedScreenshots: data.uploadedToR2,
      sourceLinkCount: data.sourceLinkCount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cloud sync failed";
    if (
      /Failed to fetch|NetworkError|Cannot reach vault|timeout|offline|Load failed/i.test(
        msg
      )
    ) {
      if (!opts.skipOfflineEnqueue) {
        const { enqueueVideoSync } = await import("./offlineSync");
        const pending = await enqueueVideoSync(opts.videoId, {
          title: opts.videoTitle,
        });
        return {
          ok: true,
          offlineQueued: true,
          pendingCount: pending,
          message: `Saved on this device · vault offline · ${pending} pending cloud sync`,
        };
      }
      return {
        ok: false,
        message:
          "Vault API offline. Run: cd server && npm run start:always  → http://127.0.0.1:8787",
      };
    }
    return { ok: false, message: msg };
  }
}

type VaultListPayload = VaultPayload & {
  saved?: boolean;
  savedAt?: number | null;
  watchLater?: boolean;
  watchLaterAt?: number | null;
  playlists?: string[];
  completed?: boolean;
  completedAt?: number | null;
  sourceLinks?: Array<{
    id: string;
    url: string;
    label?: string;
    kind?: string;
    source?: string;
    createdAt?: number;
    startTime?: number;
  }>;
  bioText?: string;
  bioMarkdown?: string;
  deletedHighlightIds?: string[];
  deletedScreenshotIds?: string[];
  durationSec?: number;
  progress?: {
    position: number;
    duration: number;
    kind: "break" | "auto";
    updatedAt: number;
  } | null;
};

/**
 * Pull this account's Mongo vault onto the device (merge by id, never delete).
 * Call after every login so user A and user B on the same Chrome stay isolated.
 */
export async function hydrateLocalFromVault(opts?: {
  onStatus?: (msg: string, isError?: boolean) => void;
}): Promise<{ ok: boolean; videos: number; message: string }> {
  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey) {
    return { ok: false, videos: 0, message: "Not signed in" };
  }

  const { listPendingLibraryVideoIds, listPendingDeletedIds } = await import(
    "./offlineSync"
  );
  // Snapshot before fetching: an op replayed mid-pull must not let the
  // (older) fetched copy overwrite it.
  // A local Save/Unsave not yet replayed is newer than the vault copy
  const pendingLib = await listPendingLibraryVideoIds();
  // Deleted here, delete not yet confirmed: don't pull them back down
  const pendingDeleted = await listPendingDeletedIds();

  opts?.onStatus?.("Loading your account from the vault…");
  const cloud = await fetchCloudVault();
  if (!cloud.ok) {
    const message = cloud.message || "Could not load vault";
    opts?.onStatus?.(message, true);
    return { ok: false, videos: 0, message };
  }

  const { applyLibraryFlags, rememberVaultVideoIds, getLibraryEntry } = await import(
    "../zx/libraryStore"
  );
  const { absorbLegacyHighlights, saveHighlights } = await import(
    "../zx/highlightsStore"
  );
  const { saveSourceLinks } = await import("../zx/sourceLinksStore");
  const { loadScreenshots, deleteScreenshot } = await import(
    "../zx/screenshotStore"
  );
  const { listKnownVaultVideoIds } = await import("../zx/libraryStore");
  const knownBefore = await listKnownVaultVideoIds();

  const ids: string[] = [];
  const pinIds: string[] = [];
  for (const row of cloud.rows) {
    const videoId = row.video_id;
    if (!videoId) continue;
    ids.push(videoId);
    const p = (row.payload || {}) as VaultListPayload;
    if (!pendingLib.has(videoId)) await applyLibraryFlags(videoId, {
      videoTitle: p.videoTitle,
      videoUrl: p.videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
      saved: Boolean(p.saved),
      savedAt: p.savedAt ?? null,
      watchLater: Boolean(p.watchLater),
      watchLaterAt: p.watchLaterAt ?? null,
      playlists: Array.isArray(p.playlists) ? p.playlists : [],
      completed: Boolean(p.completed),
      completedAt: p.completedAt ?? null,
    });
    const pinned = Boolean(
      p.saved ||
        p.watchLater ||
        (Array.isArray(p.playlists) && p.playlists.length)
    );
    const hasWork =
      (Array.isArray(p.highlights) && p.highlights.length > 0) ||
      (Array.isArray(p.screenshots) && p.screenshots.length > 0);
    if (pinned || hasWork) pinIds.push(videoId);

    // Resume point from another device (phone, other browser): newest wins
    if (p.progress && p.progress.position > 0) {
      await saveResumePoint({
        videoId,
        position: p.progress.position,
        duration: p.progress.duration || p.durationSec || 0,
        kind: p.progress.kind === "break" ? "break" : "auto",
        at: p.progress.updatedAt || 0,
      });
    }

    // Deleted elsewhere (Studio / another device): remove the local copy
    const deadMarks = new Set((p.deletedHighlightIds || []).map(String));
    const deadShots = new Set((p.deletedScreenshotIds || []).map(String));
    if (deadShots.size) {
      for (const s of await loadScreenshots(videoId)) {
        if (deadShots.has(String(s.id))) await deleteScreenshot(s.id);
      }
    }

    const remoteHs = (Array.isArray(p.highlights) ? p.highlights : []).filter(
      (h) => h?.id && !pendingDeleted.has(String(h.id))
    );
    const local = await absorbLegacyHighlights(videoId);
    const localAlive = local.filter((h) => !deadMarks.has(String(h.id)));
    if (remoteHs.length || localAlive.length !== local.length) {
      const map = new Map(localAlive.map((h) => [String(h.id), h]));
      for (const h of remoteHs) {
        if (!h?.id) continue;
        const prev = map.get(String(h.id));
        if (!prev) {
          map.set(String(h.id), {
            id: String(h.id),
            videoId,
            startTime: Number(h.startTime) || 0,
            endTime:
              typeof h.endTime === "number" && h.endTime > (h.startTime || 0)
                ? h.endTime
                : (Number(h.startTime) || 0) + 2.5,
            note: typeof h.note === "string" ? h.note : "",
            color: h.color || "#ef4444",
            screenshotId: h.screenshotId,
            createdAt: h.createdAt || Date.now(),
            updatedAt: h.updatedAt || Date.now(),
          });
        } else {
          const remoteNote = typeof h.note === "string" ? h.note : "";
          // Newer edit wins (a device typing right now has the newer stamp)
          const remoteNewer = (h.updatedAt || 0) > (prev.updatedAt || 0);
          map.set(String(h.id), {
            ...prev,
            startTime: Number(h.startTime) || prev.startTime,
            endTime:
              typeof h.endTime === "number" ? h.endTime : prev.endTime,
            note: remoteNewer ? remoteNote : prev.note,
            color: h.color || prev.color,
            screenshotId: h.screenshotId || prev.screenshotId,
            updatedAt: Math.max(prev.updatedAt || 0, h.updatedAt || 0),
          });
        }
      }
      await saveHighlights(videoId, [...map.values()]);
    }

    if (Array.isArray(p.sourceLinks) && p.sourceLinks.length) {
      try {
        await saveSourceLinks(
          videoId,
          p.sourceLinks.map((l) => ({
            id: l.id,
            url: l.url,
            label: l.label || "",
            kind: l.kind || "link",
            source:
              l.source === "comment" || l.source === "cc"
                ? l.source
                : "description",
            createdAt: l.createdAt || Date.now(),
            startTime: l.startTime,
          }))
        );
      } catch {
        /* optional */
      }
    }
  }

  // Was in the vault last time, gone now, no local change pending: the user
  // removed it in Studio. Un-pin here so the next sync doesn't recreate it.
  const cloudIds = new Set(ids);
  for (const videoId of knownBefore) {
    if (cloudIds.has(videoId) || pendingLib.has(videoId)) continue;
    const e = await getLibraryEntry(videoId);
    if (e && (e.saved || e.watchLater || e.playlists?.length)) {
      await applyLibraryFlags(videoId, {
        saved: false,
        savedAt: null,
        watchLater: false,
        watchLaterAt: null,
        playlists: [],
      });
    }
  }

  await rememberVaultVideoIds(pinIds, { replace: true });
  const message = ids.length
    ? `Account loaded · ${ids.length} video${ids.length === 1 ? "" : "s"} in vault`
    : "Signed in · vault is empty until you Save a video";
  opts?.onStatus?.(message);
  return { ok: true, videos: ids.length, message };
}

const lastWatchSent = new Map<string, number>();

/**
 * Stamp History for the signed-in account. Does not Save the video.
 * Creates a vault row with lastViewedAt if this is the first watch.
 */
export async function recordWatchToCloud(opts: {
  videoId: string;
  videoTitle?: string;
  channelTitle?: string;
  channelUrl?: string;
}): Promise<void> {
  if (!opts.videoId) return;
  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey) return;
  const now = Date.now();
  const prev = lastWatchSent.get(opts.videoId) || 0;
  if (now - prev < 2 * 60 * 1000) return;
  lastWatchSent.set(opts.videoId, now);
  try {
    const { res } = await vaultFetch(
      "/api/vault/view",
      {
        method: "POST",
        headers: authHeaders(settings.apiKey),
        body: JSON.stringify({
          videoId: opts.videoId,
          videoTitle: opts.videoTitle,
          videoUrl: `https://www.youtube.com/watch?v=${opts.videoId}`,
          channelTitle: opts.channelTitle,
          channelUrl: opts.channelUrl,
          watched: true,
        }),
      },
      settings.projectUrl
    );
    if (res.ok) return;
    // Bad request will never succeed; anything else (down, 5xx, expired) waits
    if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
      return;
    }
    await queueWatch(opts, now);
  } catch {
    await queueWatch(opts, now);
  }
}

async function queueWatch(
  opts: {
    videoId: string;
    videoTitle?: string;
    channelTitle?: string;
    channelUrl?: string;
  },
  viewedAt: number
): Promise<void> {
  try {
    const { enqueueOp } = await import("./offlineSync");
    await enqueueOp({ kind: "view", ...opts, viewedAt });
  } catch {
    lastWatchSent.delete(opts.videoId);
  }
}

export async function fetchCloudVault(): Promise<{
  ok: boolean;
  rows: Array<{ video_id: string; payload: VaultPayload; updated_at: string }>;
  message?: string;
}> {
  const settings = await loadCloudSettings();
  if (!settings.enabled) {
    return { ok: false, rows: [], message: "Not logged in" };
  }
  try {
    // Fast list — no base64 blobs (media URLs only)
    const { res } = await vaultFetch(
      "/api/vault",
      { headers: authHeaders(settings.apiKey) },
      settings.projectUrl
    );
    const data = (await res.json()) as {
      ok?: boolean;
      rows?: Array<{
        video_id: string;
        payload: VaultPayload;
        updated_at: string;
      }>;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        rows: [],
        message: data.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, rows: data.rows || [] };
  } catch (err) {
    return {
      ok: false,
      rows: [],
      message:
        err instanceof Error
          ? /Failed to fetch|NetworkError|Cannot reach/i.test(err.message)
            ? "Vault API offline — cd server && npm run start:always"
            : err.message
          : "Fetch failed",
    };
  }
}

/** Debounced auto-sync timers per video */
const autoSyncTimers = new Map<string, number>();
const autoSyncInFlight = new Map<string, Promise<SyncResult>>();

export type AutoSyncHandlers = {
  onStatus?: (msg: string, isError?: boolean) => void;
  getTitle?: () => string;
  getChannel?: () => { channelTitle?: string; channelUrl?: string };
};

/**
 * Schedule automatic cloud sync after vault changes.
 * Debounced so typing notes doesn't spam the API.
 * Immediately shows "pending" status (cloud icon).
 */
export function scheduleAutoSync(
  videoId: string,
  opts: AutoSyncHandlers & { delayMs?: number } = {}
): void {
  // Slightly longer debounce keeps YouTube UI snappy while typing notes
  const delay = opts.delayMs ?? 2200;
  const prev = autoSyncTimers.get(videoId);
  if (prev != null) window.clearTimeout(prev);

  opts.onStatus?.("Saving on this device…");

  const timer = window.setTimeout(() => {
    autoSyncTimers.delete(videoId);
    void runAutoSync(videoId, opts);
  }, delay);
  autoSyncTimers.set(videoId, timer);
}

async function runAutoSync(
  videoId: string,
  opts: AutoSyncHandlers
): Promise<SyncResult> {
  const existing = autoSyncInFlight.get(videoId);
  if (existing) return existing;

  const job = (async (): Promise<SyncResult> => {
    const settings = await loadCloudSettings();
    const title =
      opts.getTitle?.() ||
      document.querySelector("h1.ytd-watch-metadata yt-formatted-string")
        ?.textContent?.trim() ||
      document.title ||
      videoId;
    const channel = opts.getChannel?.() || {};

    // Always load local data first (source of truth on device)
    try {
      const { loadHighlights } = await import("../zx/highlightsStore");
      const { loadScreenshots } = await import("../zx/screenshotStore");
      const highlights = await loadHighlights(videoId);
      const screenshots = await loadScreenshots(videoId);

      const { isPinnedToVault } = await import("../zx/libraryStore");
      if (!(await isPinnedToVault(videoId))) {
        opts.onStatus?.(
          "On this device · Save, Watch later, or Playlist to keep in vault"
        );
        return {
          ok: true,
          message: "Local only until you save",
        };
      }

      if (!settings.enabled || !settings.apiKey) {
        const { enqueueVideoSync } = await import("./offlineSync");
        const pending = await enqueueVideoSync(videoId, { title });
        opts.onStatus?.(
          `Saved on device · sign in to cloud-sync (${pending} pending)`,
          true
        );
        return {
          ok: true,
          offlineQueued: true,
          pendingCount: pending,
          message: "Queued offline",
        };
      }

      // Include description links when on a YouTube watch page
      let sourceLinks:
        | Array<{
            id: string;
            url: string;
            label?: string;
            kind?: string;
            source?: string;
            createdAt?: number;
          }>
        | undefined;
      try {
        if (/youtube\.com\/watch/i.test(location.href)) {
          const { collectPageSources } = await import(
            "../youtube/collectSources"
          );
          const links = collectPageSources(videoId);
          if (links.length) sourceLinks = links;
        }
      } catch {
        /* optional */
      }

      opts.onStatus?.("Uploading…");
      const result = await syncVideoToCloud({
        videoId,
        videoTitle: title,
        channelTitle: channel.channelTitle,
        channelUrl: channel.channelUrl,
        highlights,
        screenshots,
        sourceLinks,
        watched: (() => {
          try {
            const href = String(location.href || "");
            const m = href.match(/[?&]v=([A-Za-z0-9_-]{6,20})/);
            return Boolean(m && m[1] === videoId);
          } catch {
            return false;
          }
        })(),
      });

      if (result.ok) {
        if (result.offlineQueued) {
          opts.onStatus?.(result.message, true);
        } else {
          const n = result.uploadedScreenshots || 0;
          opts.onStatus?.(
            n > 0
              ? `Synced · ${n} shot${n === 1 ? "" : "s"} uploaded`
              : "Synced to cloud"
          );
        }
      } else {
        opts.onStatus?.(result.message, true);
      }
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Auto-sync failed";
      try {
        const { enqueueVideoSync, isOfflineError } = await import(
          "./offlineSync"
        );
        if (isOfflineError(msg)) {
          const pending = await enqueueVideoSync(videoId, { title });
          const offlineMsg = `Saved on device · vault offline · ${pending} pending`;
          opts.onStatus?.(offlineMsg, true);
          return {
            ok: true,
            offlineQueued: true,
            pendingCount: pending,
            message: offlineMsg,
          };
        }
      } catch {
        /* ignore */
      }
      opts.onStatus?.(msg, true);
      return { ok: false, message: msg };
    } finally {
      autoSyncInFlight.delete(videoId);
    }
  })();

  autoSyncInFlight.set(videoId, job);
  return job;
}

/** Cancel pending debounced sync (e.g. video change) */
export function cancelAutoSync(videoId?: string): void {
  if (videoId) {
    const t = autoSyncTimers.get(videoId);
    if (t != null) window.clearTimeout(t);
    autoSyncTimers.delete(videoId);
    return;
  }
  for (const t of autoSyncTimers.values()) window.clearTimeout(t);
  autoSyncTimers.clear();
}

export type PushAllResult = {
  ok: boolean;
  message: string;
  videos: number;
  failed: number;
};

/**
 * Push every local marks/shots video to the vault (after login).
 * Merges video IDs from chrome.storage highlights + IndexedDB screenshots.
 */
export async function pushAllLocalToCloud(opts?: {
  onStatus?: (msg: string, isError?: boolean) => void;
  getTitleFor?: (videoId: string) => string;
}): Promise<PushAllResult> {
  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey) {
    return {
      ok: false,
      message: "Sign in first to upload marks to the vault",
      videos: 0,
      failed: 0,
    };
  }

  const { listLocalHighlightVideoIds, loadHighlights } = await import(
    "../zx/highlightsStore"
  );
  const { loadAllScreenshots, loadScreenshots } = await import(
    "../zx/screenshotStore"
  );

  const { isPinnedToVault } = await import("../zx/libraryStore");
  const idSet = new Set<string>(await listLocalHighlightVideoIds());
  try {
    const shots = await loadAllScreenshots();
    for (const s of shots) {
      if (s.videoId) idSet.add(s.videoId);
    }
  } catch {
    /* ignore */
  }

  const videoIds: string[] = [];
  for (const id of idSet) {
    if (await isPinnedToVault(id)) videoIds.push(id);
  }
  if (videoIds.length === 0) {
    opts?.onStatus?.(
      "Nothing to upload — only Saved, Watch later, and playlists go to the vault"
    );
    return {
      ok: true,
      message: "Nothing pinned for the vault",
      videos: 0,
      failed: 0,
    };
  }

  opts?.onStatus?.(`Uploading ${videoIds.length} video(s) to vault…`);
  let okCount = 0;
  let failed = 0;

  for (let i = 0; i < videoIds.length; i++) {
    const videoId = videoIds[i];
    opts?.onStatus?.(
      `Uploading ${i + 1}/${videoIds.length}…`
    );
    try {
      const highlights = await loadHighlights(videoId);
      const screenshots = await loadScreenshots(videoId);
      if (highlights.length === 0 && screenshots.length === 0) continue;
      const title =
        opts?.getTitleFor?.(videoId) ||
        (videoId === getCurrentWatchVideoId()
          ? pageTitleHint()
          : "") ||
        videoId;
      const result = await syncVideoToCloud({
        videoId,
        videoTitle: title,
        highlights,
        screenshots,
      });
      if (result.ok) okCount += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  const message =
    failed === 0
      ? `Vault updated · ${okCount} video${okCount === 1 ? "" : "s"} synced`
      : `Synced ${okCount}, ${failed} failed — check vault URL / login`;
  opts?.onStatus?.(message, failed > 0);
  return { ok: failed === 0, message, videos: okCount, failed };
}

function getCurrentWatchVideoId(): string | null {
  try {
    const u = new URL(location.href);
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

function pageTitleHint(): string {
  return (
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string")
      ?.textContent?.trim() ||
    document.title ||
    ""
  );
}

export type LibraryAction =
  | "save"
  | "unsave"
  | "toggle_save"
  | "watch_later"
  | "unwatch_later"
  | "toggle_watch_later"
  | "add_playlist"
  | "remove_playlist"
  | "toggle_playlist"
  | "complete"
  | "uncomplete"
  | "toggle_complete";

export interface LibraryState {
  saved: boolean;
  savedAt: number | null;
  watchLater: boolean;
  watchLaterAt: number | null;
  playlists: string[];
  completed?: boolean;
  completedAt?: number | null;
}

/**
 * Save / watch later / playlist — upserts cloud flags without wiping notes.
 */
export async function updateLibraryOnCloud(opts: {
  videoId: string;
  videoTitle?: string;
  videoUrl?: string;
  action: LibraryAction;
  playlist?: string;
}): Promise<{ ok: boolean; message: string; library?: LibraryState }> {
  const settings = await loadCloudSettings();
  const { applyLibraryFlags } = await import("../zx/libraryStore");

  // Apply optimistically on device first so UI works offline
  const localLib = await applyLocalLibraryAction(opts);
  await applyLibraryFlags(opts.videoId, {
    videoTitle: opts.videoTitle,
    videoUrl: opts.videoUrl,
    ...localLib,
  });

  // Send what the user now sees, never a toggle: if the device and the vault
  // disagree, a server-side toggle would flip the opposite way.
  const absolute = toAbsoluteAction(opts.action, localLib, opts.playlist);
  const queueForLater = async (): Promise<number> => {
    const { enqueueOp } = await import("./offlineSync");
    return enqueueOp({
      kind: "library",
      videoId: opts.videoId,
      action: absolute.action,
      playlist: absolute.playlist,
      videoTitle: opts.videoTitle,
      videoUrl: opts.videoUrl,
    });
  };

  if (!settings.enabled || !settings.apiKey) {
    const pending = await queueForLater();
    return {
      ok: true,
      message: `Saved on device · sign in to sync (${pending} pending)`,
      library: localLib,
    };
  }

  try {
    const { res } = await vaultFetch(
      "/api/vault/library",
      {
        method: "POST",
        headers: authHeaders(settings.apiKey),
        body: JSON.stringify({
          videoId: opts.videoId,
          videoTitle: opts.videoTitle,
          videoUrl:
            opts.videoUrl ||
            `https://www.youtube.com/watch?v=${opts.videoId}`,
          action: absolute.action,
          playlist: absolute.playlist,
        }),
      },
      settings.projectUrl
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      library?: LibraryState;
    };
    if (!res.ok || data.ok === false) {
      if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
        // Rejected payload — retrying cannot help
        return {
          ok: false,
          message: data.message || `HTTP ${res.status}`,
          library: localLib,
        };
      }
      // Keep local; replay once the vault (or a fresh login) is back
      const pending = await queueForLater();
      return {
        ok: true,
        message:
          res.status === 401
            ? `Session expired · saved on device · log in again to sync (${pending} pending)`
            : `Saved on device · will retry cloud (${pending} pending)`,
        library: localLib,
      };
    }

    if (data.library) {
      await applyLibraryFlags(opts.videoId, {
        videoTitle: opts.videoTitle,
        videoUrl: opts.videoUrl,
        ...data.library,
      });
    }

    return {
      ok: true,
      message: data.message || "Library updated",
      library: data.library || localLib,
    };
  } catch {
    const pending = await queueForLater();
    return {
      ok: true,
      message: `Saved on device · vault offline · ${pending} pending`,
      library: localLib,
    };
  }
}

function toAbsoluteAction(
  action: LibraryAction,
  lib: LibraryState,
  playlist?: string
): { action: AbsoluteLibraryAction; playlist?: string } {
  const pl = (playlist || "").trim();
  switch (action) {
    case "toggle_save":
      return { action: lib.saved ? "save" : "unsave" };
    case "toggle_watch_later":
      return { action: lib.watchLater ? "watch_later" : "unwatch_later" };
    case "toggle_playlist": {
      const has = lib.playlists.some(
        (p) => p.toLowerCase() === pl.toLowerCase()
      );
      return { action: has ? "add_playlist" : "remove_playlist", playlist: pl };
    }
    case "add_playlist":
    case "remove_playlist":
      return { action, playlist: pl };
    case "toggle_complete":
      return { action: lib.completed ? "complete" : "uncomplete" };
    default:
      return { action };
  }
}

/** Pure local library action (offline-safe). */
async function applyLocalLibraryAction(opts: {
  videoId: string;
  videoTitle?: string;
  videoUrl?: string;
  action: LibraryAction;
  playlist?: string;
}): Promise<LibraryState> {
  const { getLibraryEntry } = await import("../zx/libraryStore");
  const prev = (await getLibraryEntry(opts.videoId)) || {
    videoId: opts.videoId,
    saved: false,
    savedAt: null as number | null,
    watchLater: false,
    watchLaterAt: null as number | null,
    playlists: [] as string[],
    completed: false,
    completedAt: null as number | null,
  };
  let saved = prev.saved;
  let savedAt = prev.savedAt;
  let watchLater = prev.watchLater;
  let watchLaterAt = prev.watchLaterAt;
  let playlists = [...(prev.playlists || [])];
  let completed = Boolean(prev.completed);
  let completedAt = prev.completedAt ?? null;
  const pl = (opts.playlist || "").trim();
  const now = Date.now();

  switch (opts.action) {
    case "save":
      saved = true;
      savedAt = now;
      break;
    case "unsave":
      saved = false;
      savedAt = null;
      break;
    case "toggle_save":
      saved = !saved;
      savedAt = saved ? now : null;
      break;
    case "watch_later":
      watchLater = true;
      watchLaterAt = now;
      break;
    case "unwatch_later":
      watchLater = false;
      watchLaterAt = null;
      break;
    case "toggle_watch_later":
      watchLater = !watchLater;
      watchLaterAt = watchLater ? now : null;
      break;
    case "add_playlist":
      if (pl && !playlists.some((p) => p.toLowerCase() === pl.toLowerCase())) {
        playlists.push(pl);
      }
      break;
    case "remove_playlist":
      playlists = playlists.filter(
        (p) => p.toLowerCase() !== pl.toLowerCase()
      );
      break;
    case "toggle_playlist":
      if (pl) {
        const has = playlists.some((p) => p.toLowerCase() === pl.toLowerCase());
        playlists = has
          ? playlists.filter((p) => p.toLowerCase() !== pl.toLowerCase())
          : [...playlists, pl];
      }
      break;
    case "complete":
      completed = true;
      completedAt = completedAt || now;
      break;
    case "uncomplete":
      completed = false;
      completedAt = null;
      break;
    case "toggle_complete":
      completed = !completed;
      completedAt = completed ? now : null;
      break;
    default:
      break;
  }

  return {
    saved,
    savedAt,
    watchLater,
    watchLaterAt,
    playlists,
    completed,
    completedAt,
  };
}

/**
 * Import a full YouTube playlist into the vault under playlistName.
 */
export async function importPlaylistToCloud(opts: {
  playlistName: string;
  playlistId?: string;
  videos: Array<{
    videoId: string;
    videoTitle?: string;
    channelTitle?: string;
    channelUrl?: string;
    videoUrl?: string;
  }>;
}): Promise<{
  ok: boolean;
  message: string;
  total?: number;
  imported?: number;
  updated?: number;
  playlistName?: string;
}> {
  const settings = await loadCloudSettings();
  const { applyLibraryFlags } = await import("../zx/libraryStore");

  // Always save locally first so Studio can sync later if offline
  for (const v of opts.videos) {
    if (!v.videoId) continue;
    const prev = await (await import("../zx/libraryStore")).getLibraryEntry(
      v.videoId
    );
    const playlists = [...(prev?.playlists || [])];
    const name = opts.playlistName.trim();
    if (
      name &&
      !playlists.some((p) => p.toLowerCase() === name.toLowerCase())
    ) {
      playlists.push(name);
    }
    await applyLibraryFlags(v.videoId, {
      videoTitle: v.videoTitle,
      videoUrl:
        v.videoUrl || `https://www.youtube.com/watch?v=${v.videoId}`,
      playlists,
    });
  }

  const queueImport = async (): Promise<void> => {
    const { enqueueOp } = await import("./offlineSync");
    await enqueueOp({
      kind: "playlist_import",
      playlistName: opts.playlistName,
      playlistId: opts.playlistId,
      videos: opts.videos.slice(0, 250),
    });
  };

  if (!settings.enabled || !settings.apiKey) {
    await queueImport();
    return {
      ok: true,
      message: `Saved “${opts.playlistName}” on device (${opts.videos.length} videos) · sign in to sync cloud`,
      total: opts.videos.length,
      playlistName: opts.playlistName,
    };
  }

  try {
    const { res } = await vaultFetch(
      "/api/vault/playlist/import",
      {
        method: "POST",
        headers: authHeaders(settings.apiKey),
        body: JSON.stringify({
          playlistName: opts.playlistName,
          playlistId: opts.playlistId,
          videos: opts.videos.slice(0, 250),
        }),
      },
      settings.projectUrl
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      total?: number;
      imported?: number;
      updated?: number;
      playlistName?: string;
    };
    if (!res.ok || data.ok === false) {
      if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
        return {
          ok: false,
          message: data.message || `HTTP ${res.status}`,
          total: opts.videos.length,
          playlistName: opts.playlistName,
        };
      }
      await queueImport();
      return {
        ok: true,
        message: `Saved “${opts.playlistName}” on device · cloud will retry`,
        total: opts.videos.length,
        playlistName: opts.playlistName,
      };
    }
    return {
      ok: true,
      message: data.message || "Playlist saved",
      total: data.total,
      imported: data.imported,
      updated: data.updated,
      playlistName: data.playlistName || opts.playlistName,
    };
  } catch {
    await queueImport();
    return {
      ok: true,
      message: `Saved “${opts.playlistName}” on device · vault offline · will sync when it is back`,
      total: opts.videos.length,
      playlistName: opts.playlistName,
    };
  }
}

/** All playlist names the user already has (for picker UI) */
export async function fetchUserPlaylists(): Promise<{
  ok: boolean;
  playlists: Array<{ name: string; count: number; videoIds?: string[] }>;
  message?: string;
}> {
  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey) {
    try {
      const { listLocalPlaylistNames } = await import(
        "../zx/libraryStore"
      );
      const names = await listLocalPlaylistNames();
      return {
        ok: true,
        playlists: names.map((name) => ({ name, count: 0 })),
      };
    } catch {
      return { ok: false, playlists: [], message: "Not logged in" };
    }
  }
  try {
    const { res } = await vaultFetch(
      "/api/library/playlists",
      { headers: authHeaders(settings.apiKey) },
      settings.projectUrl
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      playlists?: Array<{ name: string; count: number; videoIds?: string[] }>;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        playlists: [],
        message: data.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, playlists: data.playlists || [] };
  } catch (err) {
    try {
      const { listLocalPlaylistNames } = await import(
        "../zx/libraryStore"
      );
      const names = await listLocalPlaylistNames();
      return {
        ok: true,
        playlists: names.map((name) => ({ name, count: 0 })),
      };
    } catch {
      return {
        ok: false,
        playlists: [],
        message: err instanceof Error ? err.message : "Fetch failed",
      };
    }
  }
}

// ── Pull vault → device on a schedule ──────────────────────────────────────
// Login used to be the only pull, so Studio edits (unsave, delete a mark) and
// other devices' notes never reached this browser until the next sign-in.

const PULL_KEY = "vsa_last_vault_pull_v1";
const PULL_EVERY_MS = 5 * 60_000;
let pullerTimer: number | null = null;
let pullerCleanup: (() => void) | null = null;

/**
 * Pull the vault if nobody on this browser did so within maxAgeMs.
 * The stamp lives in chrome.storage so several YouTube tabs share one pull.
 */
export async function pullVaultIfStale(
  maxAgeMs = PULL_EVERY_MS
): Promise<boolean> {
  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey) return false;
  const key = `${PULL_KEY}_${settings.userId}`;
  let last = 0;
  try {
    last = Number((await chrome.storage.local.get(key))[key]) || 0;
  } catch {
    /* ignore */
  }
  if (Date.now() - last < maxAgeMs) return false;
  // Claim first so other tabs skip while this one fetches
  await chrome.storage.local.set({ [key]: Date.now() });
  const result = await hydrateLocalFromVault().catch(() => ({ ok: false }));
  if (!result.ok) {
    // Vault down: let the next check retry instead of waiting a full period
    await chrome.storage.local.set({ [key]: last });
  }
  return result.ok;
}

/**
 * Check every minute and on tab focus. After a fresh pull, calls onChanged
 * only when snapshot() differs, so an unchanged video is never repainted.
 */
export function startVaultPuller(
  onChanged: () => void,
  snapshot: () => Promise<string> = async () => ""
): () => void {
  pullerCleanup?.();
  const check = () => {
    void (async () => {
      const before = await snapshot();
      if (!(await pullVaultIfStale())) return;
      if ((await snapshot()) !== before) onChanged();
    })();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };
  check();
  pullerTimer = window.setInterval(check, 60_000);
  document.addEventListener("visibilitychange", onVisible);
  pullerCleanup = () => {
    if (pullerTimer != null) window.clearInterval(pullerTimer);
    pullerTimer = null;
    document.removeEventListener("visibilitychange", onVisible);
    pullerCleanup = null;
  };
  return pullerCleanup;
}

/**
 * Freshest resume point for one video from the vault (break taken on the
 * phone or another browser). Null when signed out, offline, or none saved.
 */
export async function fetchCloudResumePoint(videoId: string): Promise<{
  position: number;
  duration: number;
  kind: "break" | "auto";
  at: number;
} | null> {
  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey || !videoId) return null;
  try {
    const { res } = await Promise.race([
      vaultFetch(
        `/api/vault/progress/${encodeURIComponent(videoId)}`,
        { headers: authHeaders(settings.apiKey) },
        settings.projectUrl
      ),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error("timeout")), 2500)
      ),
    ]);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      progress?: { position: number; duration: number; kind: string; updatedAt: number } | null;
    };
    const p = data.progress;
    if (!p || !(p.position > 0)) return null;
    return {
      position: p.position,
      duration: p.duration || 0,
      kind: p.kind === "break" ? "break" : "auto",
      at: p.updatedAt || 0,
    };
  } catch {
    return null;
  }
}
