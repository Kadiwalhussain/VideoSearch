/**
 * Last successful cloud sync + last local save, per video.
 */

const PREFIX = "vsa_sync_meta_";

export type SyncMeta = {
  lastCloudSyncAt: number | null;
  lastLocalSaveAt: number | null;
};

function key(videoId: string): string {
  return `${PREFIX}${videoId}`;
}

async function getRaw(k: string): Promise<unknown> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get(k);
      return data[k];
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

async function setRaw(k: string, value: unknown): Promise<void> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [k]: value });
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(k, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export async function loadSyncMeta(videoId: string): Promise<SyncMeta> {
  const raw = (await getRaw(key(videoId))) as Partial<SyncMeta> | undefined;
  return {
    lastCloudSyncAt:
      typeof raw?.lastCloudSyncAt === "number" ? raw.lastCloudSyncAt : null,
    lastLocalSaveAt:
      typeof raw?.lastLocalSaveAt === "number" ? raw.lastLocalSaveAt : null,
  };
}

export async function touchCloudSync(videoId: string): Promise<number> {
  const now = Date.now();
  const prev = await loadSyncMeta(videoId);
  await setRaw(key(videoId), {
    lastCloudSyncAt: now,
    lastLocalSaveAt: prev.lastLocalSaveAt || now,
  });
  return now;
}

export async function touchLocalSave(videoId: string): Promise<number> {
  const now = Date.now();
  const prev = await loadSyncMeta(videoId);
  await setRaw(key(videoId), {
    lastCloudSyncAt: prev.lastCloudSyncAt,
    lastLocalSaveAt: now,
  });
  return now;
}

export function formatSyncAgo(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "";
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 45) return "just now";
  if (sec < 90) return "1 min ago";
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 5400) return "1 hr ago";
  if (sec < 86400) return `${Math.round(sec / 3600)} hr ago`;
  if (sec < 172800) return "1 day ago";
  return `${Math.round(sec / 86400)} days ago`;
}

export function isBrowserOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}
