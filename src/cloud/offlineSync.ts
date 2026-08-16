/**
 * Offline-first vault sync.
 *
 * - Marks / shots / library always persist on-device (chrome.storage + IndexedDB).
 * - When the vault API is down or unreachable, video IDs are queued.
 * - When the API returns (poll + online event), the queue is flushed to the cloud.
 */

import {
  loadCloudSettings,
  vaultUrlAlternates,
} from "../settings/cloudSettings";
import { vaultHttp } from "../net/vaultHttp";

const QUEUE_KEY = "vsa_offline_sync_queue_v1";
const STATUS_KEY = "vsa_vault_connectivity_v1";

export type VaultConnectivity = {
  online: boolean;
  checkedAt: number;
  lastError?: string;
};

type QueueState = {
  videoIds: string[];
  /** ISO titles for better sync payloads when offline */
  titles: Record<string, string>;
  updatedAt: number;
};

let watcherTimer: number | null = null;
let flushing = false;
let lastOnline: boolean | null = null;

async function readQueue(): Promise<QueueState> {
  try {
    const data = await chrome.storage.local.get(QUEUE_KEY);
    const raw = data[QUEUE_KEY] as Partial<QueueState> | undefined;
    if (raw && Array.isArray(raw.videoIds)) {
      return {
        videoIds: raw.videoIds.filter(Boolean),
        titles: raw.titles && typeof raw.titles === "object" ? raw.titles : {},
        updatedAt: raw.updatedAt || Date.now(),
      };
    }
  } catch {
    /* ignore */
  }
  return { videoIds: [], titles: {}, updatedAt: Date.now() };
}

async function writeQueue(state: QueueState): Promise<void> {
  await chrome.storage.local.set({
    [QUEUE_KEY]: {
      videoIds: [...new Set(state.videoIds.filter(Boolean))],
      titles: state.titles || {},
      updatedAt: Date.now(),
    },
  });
}

export async function getPendingSyncCount(): Promise<number> {
  const q = await readQueue();
  return q.videoIds.length;
}

export async function getPendingSyncIds(): Promise<string[]> {
  return (await readQueue()).videoIds;
}

/** Mark a video as needing cloud upload when the API is available. */
export async function enqueueVideoSync(
  videoId: string,
  opts?: { title?: string }
): Promise<number> {
  if (!videoId) return 0;
  const q = await readQueue();
  if (!q.videoIds.includes(videoId)) q.videoIds.push(videoId);
  if (opts?.title?.trim()) q.titles[videoId] = opts.title.trim();
  await writeQueue(q);
  await saveConnectivity({
    online: false,
    checkedAt: Date.now(),
    lastError: "queued_offline",
  });
  return q.videoIds.length;
}

export async function dequeueVideoSync(videoId: string): Promise<void> {
  const q = await readQueue();
  q.videoIds = q.videoIds.filter((id) => id !== videoId);
  delete q.titles[videoId];
  await writeQueue(q);
}

async function saveConnectivity(c: VaultConnectivity): Promise<void> {
  try {
    await chrome.storage.local.set({ [STATUS_KEY]: c });
  } catch {
    /* ignore */
  }
}

export async function getVaultConnectivity(): Promise<VaultConnectivity> {
  try {
    const data = await chrome.storage.local.get(STATUS_KEY);
    const raw = data[STATUS_KEY] as VaultConnectivity | undefined;
    if (raw && typeof raw.online === "boolean") return raw;
  } catch {
    /* ignore */
  }
  return { online: false, checkedAt: 0 };
}

/**
 * Lightweight health probe (no auth). Tries localhost alternates.
 */
export async function checkVaultOnline(
  projectUrl?: string
): Promise<VaultConnectivity> {
  const settings = await loadCloudSettings();
  const bases = vaultUrlAlternates(projectUrl || settings.projectUrl);
  let lastError = "";

  for (const base of bases) {
    try {
      const res = await Promise.race([
        vaultHttp(`${base}/health`, { method: "GET" }),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("timeout")), 4000)
        ),
      ]);
      if (res.ok) {
        const status: VaultConnectivity = {
          online: true,
          checkedAt: Date.now(),
        };
        await saveConnectivity(status);
        return status;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "unreachable";
    }
  }

  const status: VaultConnectivity = {
    online: false,
    checkedAt: Date.now(),
    lastError: lastError || "unreachable",
  };
  await saveConnectivity(status);
  return status;
}

export type FlushHandlers = {
  onStatus?: (msg: string, isError?: boolean) => void;
  getTitleFor?: (videoId: string) => string;
};

/**
 * Push queued (and optionally all local) videos to the vault.
 * Returns how many videos synced successfully.
 */
export async function flushOfflineQueue(
  handlers: FlushHandlers = {},
  opts?: { includeAllLocal?: boolean }
): Promise<{
  ok: boolean;
  synced: number;
  failed: number;
  pending: number;
  message: string;
  wasOffline: boolean;
}> {
  if (flushing) {
    return {
      ok: false,
      synced: 0,
      failed: 0,
      pending: await getPendingSyncCount(),
      message: "Sync already in progress…",
      wasOffline: false,
    };
  }

  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey) {
    return {
      ok: false,
      synced: 0,
      failed: 0,
      pending: await getPendingSyncCount(),
      message: "Sign in to sync offline marks to the cloud",
      wasOffline: true,
    };
  }

  const connectivity = await checkVaultOnline(settings.projectUrl);
  if (!connectivity.online) {
    const pending = await getPendingSyncCount();
    return {
      ok: false,
      synced: 0,
      failed: 0,
      pending,
      message:
        pending > 0
          ? `Vault offline · ${pending} video${pending === 1 ? "" : "s"} saved on this device`
          : "Vault offline · changes stay on this device",
      wasOffline: true,
    };
  }

  flushing = true;
  try {
    const { syncVideoToCloud } = await import("./cloudSync");
    const { listLocalHighlightVideoIds, loadHighlights } = await import(
      "../storage/highlightsStore"
    );
    const { loadAllScreenshots, loadScreenshots } = await import(
      "../storage/screenshotStore"
    );

    const q = await readQueue();
    const idSet = new Set(q.videoIds);

    if (opts?.includeAllLocal) {
      for (const id of await listLocalHighlightVideoIds()) idSet.add(id);
      try {
        for (const s of await loadAllScreenshots()) {
          if (s.videoId) idSet.add(s.videoId);
        }
      } catch {
        /* ignore */
      }
    }

    const videoIds = [...idSet];
    if (videoIds.length === 0) {
      handlers.onStatus?.("Everything is synced");
      return {
        ok: true,
        synced: 0,
        failed: 0,
        pending: 0,
        message: "Everything is synced",
        wasOffline: false,
      };
    }

    handlers.onStatus?.(
      `Vault back online · syncing ${videoIds.length} video${videoIds.length === 1 ? "" : "s"}…`
    );

    let synced = 0;
    let failed = 0;

    for (let i = 0; i < videoIds.length; i++) {
      const videoId = videoIds[i];
      handlers.onStatus?.(
        `Syncing ${i + 1}/${videoIds.length} to cloud…`
      );
      try {
        const highlights = await loadHighlights(videoId);
        const screenshots = await loadScreenshots(videoId);
        if (highlights.length === 0 && screenshots.length === 0) {
          await dequeueVideoSync(videoId);
          continue;
        }
        const title =
          handlers.getTitleFor?.(videoId) ||
          q.titles[videoId] ||
          videoId;
        const result = await syncVideoToCloud({
          videoId,
          videoTitle: title,
          highlights,
          screenshots,
          skipOfflineEnqueue: true,
        });
        if (result.ok) {
          synced += 1;
          await dequeueVideoSync(videoId);
        } else if (
          /offline|Failed to fetch|NetworkError|Cannot reach|device/i.test(
            result.message
          )
        ) {
          failed += 1;
          await enqueueVideoSync(videoId, { title });
          // API died mid-flush
          break;
        } else {
          // Auth/validation — keep in queue for retry after re-login
          failed += 1;
          await enqueueVideoSync(videoId, { title });
        }
      } catch {
        failed += 1;
        await enqueueVideoSync(videoId);
      }
    }

    const pending = await getPendingSyncCount();
    const message =
      pending === 0
        ? `Cloud sync complete · ${synced} video${synced === 1 ? "" : "s"} uploaded`
        : `Synced ${synced} · ${pending} still pending (will retry)`;
    handlers.onStatus?.(message, pending > 0 && failed > 0);
    return {
      ok: pending === 0,
      synced,
      failed,
      pending,
      message,
      wasOffline: false,
    };
  } finally {
    flushing = false;
  }
}

/**
 * Background watcher: probes /health and flushes the offline queue.
 * Safe to call multiple times (single interval).
 */
export function startOfflineSyncWatcher(
  handlers: FlushHandlers = {},
  intervalMs = 12_000
): () => void {
  stopOfflineSyncWatcher();

  const tick = () => {
    void (async () => {
      const settings = await loadCloudSettings();
      if (!settings.enabled || !settings.apiKey) return;

      const pending = await getPendingSyncCount();
      const status = await checkVaultOnline(settings.projectUrl);

      if (status.online && lastOnline === false && pending > 0) {
        handlers.onStatus?.(
          `Vault is back · uploading ${pending} offline video${pending === 1 ? "" : "s"}…`
        );
      }
      lastOnline = status.online;

      if (status.online && pending > 0) {
        await flushOfflineQueue(handlers, { includeAllLocal: false });
      }
    })();
  };

  // Immediate check
  tick();
  // Default 30s — avoid constant health/check spam on YouTube
  watcherTimer = window.setInterval(tick, Math.max(intervalMs, 30_000));

  const onOnline = () => {
    void flushOfflineQueue(handlers, { includeAllLocal: true });
  };
  window.addEventListener("online", onOnline);

  // Also react to tab focus (user may have started the server)
  const onFocus = () => {
    void (async () => {
      const pending = await getPendingSyncCount();
      if (pending > 0) await flushOfflineQueue(handlers);
    })();
  };
  window.addEventListener("focus", onFocus);

  return () => {
    stopOfflineSyncWatcher();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
  };
}

export function stopOfflineSyncWatcher(): void {
  if (watcherTimer != null) {
    window.clearInterval(watcherTimer);
    watcherTimer = null;
  }
}

/** True when error looks like network / server down. */
export function isOfflineError(message: string): boolean {
  return /Failed to fetch|NetworkError|Cannot reach|offline|Load failed|aborted|ECONNREFUSED|network/i.test(
    message
  );
}
