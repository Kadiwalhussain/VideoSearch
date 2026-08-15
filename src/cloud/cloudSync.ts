/**
 * Sync vault to auth-based MongoDB + R2 API.
 * Requires user JWT from account login.
 * Supports debounced auto-sync after notes / screenshots change.
 */

import {
  loadCloudSettings,
  vaultUrlAlternates,
} from "../settings/cloudSettings";
import type { VideoHighlight } from "../storage/highlightsStore";
import type { VideoScreenshot } from "../storage/screenshotStore";
import { updateScreenshot } from "../storage/screenshotStore";
import { vaultHttp } from "../net/vaultHttp";

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
  highlights: VideoHighlight[];
  screenshots: VideoScreenshot[];
  /** When true, do not re-enqueue on failure (used by offline queue flusher) */
  skipOfflineEnqueue?: boolean;
}): Promise<SyncResult> {
  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey) {
    // Still keep local data; queue for when user signs in + server is up
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
          videoUrl: `https://www.youtube.com/watch?v=${opts.videoId}`,
          highlights: opts.highlights,
          screenshots: opts.screenshots.map((s) => ({
            id: s.id,
            videoTime: s.videoTime,
            note: s.note || "",
            width: s.width,
            height: s.height,
            createdAt: s.createdAt,
            dataUrl: s.dataUrl,
          })),
        }),
      },
      settings.projectUrl
    );

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      uploadedToR2?: number;
    };

    if (!res.ok || data.ok === false) {
      if (res.status === 401) {
        return {
          ok: false,
          message: "Session expired — log in again in Settings.",
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
    for (const s of opts.screenshots) {
      await updateScreenshot(s.id, {
        cloudUrl: `account://${settings.userId}/${opts.videoId}/${s.id}`,
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
    const { res } = await vaultFetch(
      "/api/vault?images=1",
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
  const delay = opts.delayMs ?? 1200;
  const prev = autoSyncTimers.get(videoId);
  if (prev != null) window.clearTimeout(prev);

  // Instant feedback: cloud pill switches to pending
  opts.onStatus?.("Syncing soon…");

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

    // Always load local data first (source of truth on device)
    try {
      const { loadHighlights } = await import("../storage/highlightsStore");
      const { loadScreenshots } = await import("../storage/screenshotStore");
      const highlights = await loadHighlights(videoId);
      const screenshots = await loadScreenshots(videoId);

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

      opts.onStatus?.("Uploading…");
      const result = await syncVideoToCloud({
        videoId,
        videoTitle: title,
        highlights,
        screenshots,
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
    "../storage/highlightsStore"
  );
  const { loadAllScreenshots, loadScreenshots } = await import(
    "../storage/screenshotStore"
  );

  const idSet = new Set<string>(await listLocalHighlightVideoIds());
  try {
    const shots = await loadAllScreenshots();
    for (const s of shots) {
      if (s.videoId) idSet.add(s.videoId);
    }
  } catch {
    /* ignore */
  }

  const videoIds = [...idSet];
  if (videoIds.length === 0) {
    opts?.onStatus?.("No local marks to upload yet");
    return {
      ok: true,
      message: "No local marks to upload",
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
  | "toggle_playlist";

export interface LibraryState {
  saved: boolean;
  savedAt: number | null;
  watchLater: boolean;
  watchLaterAt: number | null;
  playlists: string[];
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
  const { applyLibraryFlags } = await import("../storage/libraryStore");

  // Apply optimistically on device first so UI works offline
  const localLib = await applyLocalLibraryAction(opts);
  await applyLibraryFlags(opts.videoId, {
    videoTitle: opts.videoTitle,
    videoUrl: opts.videoUrl,
    ...localLib,
  });

  if (!settings.enabled || !settings.apiKey) {
    const { enqueueVideoSync } = await import("./offlineSync");
    const pending = await enqueueVideoSync(opts.videoId, {
      title: opts.videoTitle,
    });
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
          action: opts.action,
          playlist: opts.playlist,
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
      if (res.status === 401) {
        return {
          ok: false,
          message: "Session expired — log in again",
          library: localLib,
        };
      }
      // Keep local; queue for retry
      const { enqueueVideoSync } = await import("./offlineSync");
      await enqueueVideoSync(opts.videoId, { title: opts.videoTitle });
      return {
        ok: true,
        message: data.message || "Saved on device · will retry cloud",
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Library update failed";
    const { enqueueVideoSync } = await import("./offlineSync");
    const pending = await enqueueVideoSync(opts.videoId, {
      title: opts.videoTitle,
    });
    return {
      ok: true,
      message: `Saved on device · vault offline · ${pending} pending`,
      library: localLib,
    };
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
  const { getLibraryEntry } = await import("../storage/libraryStore");
  const prev = (await getLibraryEntry(opts.videoId)) || {
    videoId: opts.videoId,
    saved: false,
    savedAt: null as number | null,
    watchLater: false,
    watchLaterAt: null as number | null,
    playlists: [] as string[],
  };
  let saved = prev.saved;
  let savedAt = prev.savedAt;
  let watchLater = prev.watchLater;
  let watchLaterAt = prev.watchLaterAt;
  let playlists = [...(prev.playlists || [])];
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
    default:
      break;
  }

  return { saved, savedAt, watchLater, watchLaterAt, playlists };
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
        "../storage/libraryStore"
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
        "../storage/libraryStore"
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
