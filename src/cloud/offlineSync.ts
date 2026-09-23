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

// ── Pending operations (library flags, history, playlist imports) ──────────
// The video-id queue above only re-uploads marks/shots. These ops carry the
// things that have no marks behind them. Actions are stored absolute (never
// toggles) so a replay is idempotent even if a request landed but its
// response was lost.

const OPS_KEY = "vsa_offline_ops_v1";
const MAX_OPS = 500;

export type AbsoluteLibraryAction =
  | "save"
  | "unsave"
  | "watch_later"
  | "unwatch_later"
  | "add_playlist"
  | "remove_playlist"
  | "complete"
  | "uncomplete";

type OpBase = {
  id: string;
  /** Account the op belongs to; "" = made as guest, claimed by next sign-in */
  userId: string;
  at: number;
};

export type PendingOp =
  | (OpBase & {
      kind: "library";
      videoId: string;
      action: AbsoluteLibraryAction;
      playlist?: string;
      videoTitle?: string;
      videoUrl?: string;
    })
  | (OpBase & {
      kind: "view";
      videoId: string;
      videoTitle?: string;
      channelTitle?: string;
      channelUrl?: string;
      viewedAt: number;
    })
  | (OpBase & {
      kind: "progress";
      videoId: string;
      position: number;
      duration: number;
      progressKind: "break" | "auto";
      /** When the position was recorded (older replays never win) */
      recordedAt: number;
      /** Full break log for the video (merged by id on the vault) */
      breaks?: Array<{
        id: string;
        position: number;
        startedAt: number;
        endedAt: number | null;
      }>;
      videoTitle?: string;
      channelTitle?: string;
      channelUrl?: string;
    })
  | (OpBase & { kind: "delete_mark"; videoId: string; itemId: string })
  | (OpBase & { kind: "delete_shot"; videoId: string; itemId: string })
  | (OpBase & {
      kind: "playlist_import";
      playlistName: string;
      playlistId?: string;
      videos: Array<{
        videoId: string;
        videoTitle?: string;
        channelTitle?: string;
        channelUrl?: string;
        videoUrl?: string;
      }>;
    });

type NewOp = PendingOp extends infer T
  ? T extends PendingOp
    ? Omit<T, "id" | "userId" | "at">
    : never
  : never;

/** Ops with the same slot replace each other (last intent wins). */
function opSlot(op: PendingOp | NewOp): string {
  switch (op.kind) {
    case "library": {
      const a = op.action;
      if (a === "save" || a === "unsave") return `lib:${op.videoId}:save`;
      if (a === "watch_later" || a === "unwatch_later") {
        return `lib:${op.videoId}:wl`;
      }
      if (a === "complete" || a === "uncomplete") {
        return `lib:${op.videoId}:done`;
      }
      return `lib:${op.videoId}:pl:${(op.playlist || "").toLowerCase()}`;
    }
    case "view":
      return `view:${op.videoId}`;
    case "progress":
      return `progress:${op.videoId}`;
    case "delete_mark":
    case "delete_shot":
      return `${op.kind}:${op.itemId}`;
    case "playlist_import":
      return `import:${(op.playlistId || op.playlistName).toLowerCase()}`;
  }
}

async function readOps(): Promise<PendingOp[]> {
  try {
    const data = await chrome.storage.local.get(OPS_KEY);
    const raw = data[OPS_KEY];
    if (Array.isArray(raw)) return raw.filter((o) => o && o.kind && o.id);
  } catch {
    /* ignore */
  }
  return [];
}

async function writeOps(ops: PendingOp[]): Promise<void> {
  await chrome.storage.local.set({ [OPS_KEY]: ops.slice(-MAX_OPS) });
}

async function currentUserId(): Promise<string> {
  const s = await loadCloudSettings();
  return s.enabled && s.userId ? s.userId : "";
}

/** Ops the signed-in user (or a not-yet-claimed guest) is waiting on. */
function opsForUser(ops: PendingOp[], userId: string): PendingOp[] {
  return ops.filter((o) => o.userId === userId || o.userId === "");
}

/** Queue a vault write to replay once the API is reachable. */
export async function enqueueOp(op: NewOp): Promise<number> {
  const userId = await currentUserId();
  const slot = opSlot(op);
  const ops = (await readOps()).filter(
    (o) => !(o.userId === userId && opSlot(o) === slot)
  );
  ops.push({
    ...op,
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    userId,
    at: Date.now(),
  } as PendingOp);
  await writeOps(ops);
  return getPendingSyncCount();
}

async function removeOp(id: string): Promise<void> {
  await writeOps((await readOps()).filter((o) => o.id !== id));
}

/** Mark / shot ids deleted on this device but not yet confirmed by the vault. */
export async function listPendingDeletedIds(): Promise<Set<string>> {
  const userId = await currentUserId();
  const out = new Set<string>();
  for (const o of opsForUser(await readOps(), userId)) {
    if (o.kind === "delete_mark" || o.kind === "delete_shot") out.add(o.itemId);
  }
  return out;
}

/** Videos whose library flags still have an un-replayed local change. */
export async function listPendingLibraryVideoIds(): Promise<Set<string>> {
  const userId = await currentUserId();
  const out = new Set<string>();
  for (const o of opsForUser(await readOps(), userId)) {
    if (o.kind === "library") out.add(o.videoId);
  }
  return out;
}

type ReplayOutcome = "done" | "drop" | "stop_offline" | "stop_auth";

async function replayOp(op: PendingOp, token: string): Promise<ReplayOutcome> {
  const settings = await loadCloudSettings();
  let path: string;
  let body: unknown;
  let method = "POST";
  if (op.kind === "delete_mark" || op.kind === "delete_shot") {
    method = "DELETE";
    body = undefined;
    const kind = op.kind === "delete_mark" ? "highlights" : "screenshots";
    path = `/api/vault/${encodeURIComponent(op.videoId)}/${kind}/${encodeURIComponent(op.itemId)}`;
  } else if (op.kind === "progress") {
    path = "/api/vault/progress";
    body = {
      videoId: op.videoId,
      position: op.position,
      duration: op.duration,
      kind: op.progressKind,
      at: op.recordedAt,
      breaks: op.breaks,
      videoTitle: op.videoTitle,
      channelTitle: op.channelTitle,
      channelUrl: op.channelUrl,
    };
  } else if (op.kind === "library") {
    path = "/api/vault/library";
    body = {
      videoId: op.videoId,
      videoTitle: op.videoTitle,
      videoUrl:
        op.videoUrl || `https://www.youtube.com/watch?v=${op.videoId}`,
      action: op.action,
      playlist: op.playlist,
    };
  } else if (op.kind === "view") {
    path = "/api/vault/view";
    body = {
      videoId: op.videoId,
      videoTitle: op.videoTitle,
      videoUrl: `https://www.youtube.com/watch?v=${op.videoId}`,
      channelTitle: op.channelTitle,
      channelUrl: op.channelUrl,
      watched: true,
      lastViewedAt: op.viewedAt,
    };
  } else {
    path = "/api/vault/playlist/import";
    body = {
      playlistName: op.playlistName,
      playlistId: op.playlistId,
      videos: op.videos.slice(0, 250),
    };
  }

  for (const base of vaultUrlAlternates(settings.projectUrl)) {
    let res: Response;
    try {
      res = await vaultHttp(`${base}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      continue; // try the next alternate base
    }
    if (res.ok) return "done";
    // Already gone from the vault — the delete has nothing left to do
    if (method === "DELETE" && res.status === 404) return "done";
    if (res.status === 401 || res.status === 403) return "stop_auth";
    if (res.status >= 500 || res.status === 429) return "stop_offline";
    // Other 4xx: the payload itself is bad — retrying will never succeed
    return "drop";
  }
  return "stop_offline";
}

/**
 * Send one op now if signed in and reachable; otherwise queue it.
 * Returns true when the vault confirmed it.
 */
export async function runOrQueueOp(op: NewOp): Promise<boolean> {
  const settings = await loadCloudSettings();
  if (settings.enabled && settings.apiKey) {
    const userId = await currentUserId();
    const outcome = await replayOp(
      { ...op, id: "now", userId, at: Date.now() } as PendingOp,
      settings.apiKey
    );
    if (outcome === "done" || outcome === "drop") return outcome === "done";
  }
  await enqueueOp(op);
  return false;
}

/**
 * Replay queued library / history / playlist ops in order.
 * Stops at the first network or auth failure so order is preserved.
 */
async function replayPendingOps(
  token: string,
  onStatus?: (msg: string, isError?: boolean) => void
): Promise<{ replayed: number; stopped: ReplayOutcome | null }> {
  const userId = await currentUserId();
  const mine = opsForUser(await readOps(), userId);
  if (!mine.length) return { replayed: 0, stopped: null };

  onStatus?.(
    `Vault back online · replaying ${mine.length} offline change${mine.length === 1 ? "" : "s"}…`
  );
  let replayed = 0;
  for (const op of mine) {
    const outcome = await replayOp(op, token);
    if (outcome === "done" || outcome === "drop") {
      await removeOp(op.id);
      if (outcome === "done") replayed += 1;
      continue;
    }
    return { replayed, stopped: outcome };
  }
  return { replayed, stopped: null };
}

export async function getPendingSyncCount(): Promise<number> {
  const q = await readQueue();
  const userId = await currentUserId();
  const ops = opsForUser(await readOps(), userId);
  return q.videoIds.length + ops.length;
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
    // Library flags / history / playlist imports first, so the rows exist
    // with the right flags before marks are merged into them.
    const ops = await replayPendingOps(settings.apiKey, handlers.onStatus);
    if (ops.stopped) {
      const pending = await getPendingSyncCount();
      const message =
        ops.stopped === "stop_auth"
          ? `Session expired · ${pending} change${pending === 1 ? "" : "s"} kept on this device — log in again`
          : `Vault offline · ${pending} change${pending === 1 ? "" : "s"} saved on this device`;
      handlers.onStatus?.(message, true);
      return {
        ok: false,
        synced: ops.replayed,
        failed: 0,
        pending,
        message,
        wasOffline: ops.stopped === "stop_offline",
      };
    }

    const { syncVideoToCloud } = await import("./cloudSync");
    const { listLocalHighlightVideoIds, loadHighlights } = await import(
      "../zx/highlightsStore"
    );
    const { screenshotCountsByVideo, loadScreenshots } = await import(
      "../zx/screenshotStore"
    );

    const q = await readQueue();
    const idSet = new Set(q.videoIds);

    if (opts?.includeAllLocal) {
      const { isPinnedToVault } = await import("../zx/libraryStore");
      for (const id of await listLocalHighlightVideoIds()) {
        if (await isPinnedToVault(id)) idSet.add(id);
      }
      try {
        // One pin check per video, from index keys — never per image
        for (const id of (await screenshotCountsByVideo()).keys()) {
          if (!idSet.has(id) && (await isPinnedToVault(id))) idSet.add(id);
        }
      } catch {
        /* ignore */
      }
    }

    const videoIds = [...idSet];
    if (videoIds.length === 0) {
      const message = ops.replayed
        ? `Cloud sync complete · ${ops.replayed} offline change${ops.replayed === 1 ? "" : "s"} uploaded`
        : "Everything is synced";
      handlers.onStatus?.(message);
      return {
        ok: true,
        synced: ops.replayed,
        failed: 0,
        pending: 0,
        message,
        wasOffline: false,
      };
    }

    handlers.onStatus?.(
      `Vault back online · syncing ${videoIds.length} video${videoIds.length === 1 ? "" : "s"}…`
    );

    let synced = ops.replayed;
    let failed = 0;

    for (let i = 0; i < videoIds.length; i++) {
      const videoId = videoIds[i];
      handlers.onStatus?.(
        `Syncing ${i + 1}/${videoIds.length} to cloud…`
      );
      try {
        const { isPinnedToVault } = await import("../zx/libraryStore");
        if (!(await isPinnedToVault(videoId))) {
          await dequeueVideoSync(videoId);
          continue;
        }
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
          result.retryLater ||
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
