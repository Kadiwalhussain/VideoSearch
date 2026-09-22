/**
 * Local highlights + notes per YouTube video.
 * Stored in chrome.storage.local (and falls back to localStorage).
 */

export interface VideoHighlight {
  id: string;
  videoId: string;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds (range highlight); defaults to start + small window */
  endTime: number;
  /** User note / memo */
  note: string;
  /** Marker color on the timeline */
  color: string;
  /** Optional linked screenshot id (IndexedDB vault) */
  screenshotId?: string;
  createdAt: number;
  updatedAt: number;
}

const KEY_PREFIX = "vsa_highlights_";
const DEFAULT_COLOR = "#ef4444"; // red

export function newHighlightId(): string {
  return `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

async function currentUserId(): Promise<string> {
  try {
    const { loadCloudSettings } = await import("../settings/cloudSettings");
    const s = await loadCloudSettings();
    return s.enabled && s.userId ? s.userId : "";
  } catch {
    return "";
  }
}

function scopedKey(userId: string, videoId: string): string {
  return userId
    ? `${KEY_PREFIX}${userId}__${videoId}`
    : `${KEY_PREFIX}${videoId}`;
}

function legacyKey(videoId: string): string {
  return `${KEY_PREFIX}${videoId}`;
}

async function storageGet(key: string): Promise<unknown> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get(key);
      return data[key];
    }
  } catch {
    // fall through
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

async function storageSet(key: string, value: unknown): Promise<void> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [key]: value });
      return;
    }
  } catch {
    // fall through
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota
  }
}

function normalizeList(videoId: string, raw: unknown): VideoHighlight[] {
  if (!Array.isArray(raw)) return [];
  return (raw as VideoHighlight[])
    .filter((h) => h && typeof h.startTime === "number" && h.videoId === videoId)
    .map((h) => ({
      ...h,
      endTime:
        typeof h.endTime === "number" && h.endTime > h.startTime
          ? h.endTime
          : h.startTime + 2,
      note: typeof h.note === "string" ? h.note : "",
      color: h.color || DEFAULT_COLOR,
    }))
    .sort((a, b) => a.startTime - b.startTime);
}

export async function loadHighlights(
  videoId: string
): Promise<VideoHighlight[]> {
  if (!videoId) return [];
  const userId = await currentUserId();
  const scoped = normalizeList(videoId, await storageGet(scopedKey(userId, videoId)));
  if (scoped.length || userId) return scoped;
  return normalizeList(videoId, await storageGet(legacyKey(videoId)));
}

function videoIdFromHighlightKey(k: string): string | null {
  if (!k.startsWith(KEY_PREFIX)) return null;
  const rest = k.slice(KEY_PREFIX.length);
  const sep = rest.indexOf("__");
  if (sep >= 0) return rest.slice(sep + 2) || null;
  return rest || null;
}

/** All video IDs that have local marks/notes in chrome.storage. */
export async function listLocalHighlightVideoIds(): Promise<string[]> {
  const userId = await currentUserId();
  const prefix = userId ? `${KEY_PREFIX}${userId}__` : KEY_PREFIX;
  const ids = new Set<string>();
  const take = (k: string) => {
    if (userId) {
      if (k.startsWith(prefix)) {
        const id = k.slice(prefix.length);
        if (id) ids.add(id);
      }
      return;
    }
    const id = videoIdFromHighlightKey(k);
    if (id && !k.slice(KEY_PREFIX.length).includes("__")) ids.add(id);
  };
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local?.get) {
      const all = await chrome.storage.local.get(null);
      for (const k of Object.keys(all)) take(k);
      return [...ids];
    }
  } catch {
    /* fall through */
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) take(k);
    }
    return [...ids];
  } catch {
    return [];
  }
}

export async function saveHighlights(
  videoId: string,
  highlights: VideoHighlight[]
): Promise<void> {
  const userId = await currentUserId();
  await storageSet(scopedKey(userId, videoId), highlights);
}

/** Fold pre-account local marks into this user's scoped store for one video. */
export async function absorbLegacyHighlights(
  videoId: string
): Promise<VideoHighlight[]> {
  const userId = await currentUserId();
  if (!userId || !videoId) return loadHighlights(videoId);
  const scoped = normalizeList(
    videoId,
    await storageGet(scopedKey(userId, videoId))
  );
  const legacy = normalizeList(videoId, await storageGet(legacyKey(videoId)));
  if (!legacy.length) return scoped;
  const map = new Map(scoped.map((h) => [String(h.id), h]));
  for (const h of legacy) {
    if (!map.has(String(h.id))) map.set(String(h.id), h);
  }
  const next = [...map.values()].sort((a, b) => a.startTime - b.startTime);
  await storageSet(scopedKey(userId, videoId), next);
  return next;
}

export async function addHighlight(
  videoId: string,
  partial: {
    startTime: number;
    endTime?: number;
    note?: string;
    color?: string;
    screenshotId?: string;
  }
): Promise<VideoHighlight[]> {
  const { list } = await addHighlightWithMeta(videoId, partial);
  return list;
}

/** Same as addHighlight, but also returns the created row (stable id for follow-up note save). */
export async function addHighlightWithMeta(
  videoId: string,
  partial: {
    startTime: number;
    endTime?: number;
    note?: string;
    color?: string;
    screenshotId?: string;
  }
): Promise<{ list: VideoHighlight[]; highlight: VideoHighlight }> {
  const list = await loadHighlights(videoId);
  const now = Date.now();
  const start = Math.max(0, partial.startTime);
  const hl: VideoHighlight = {
    id: newHighlightId(),
    videoId,
    startTime: start,
    endTime:
      partial.endTime != null && partial.endTime > start
        ? partial.endTime
        : start + 2.5,
    note: (partial.note ?? "").trim(),
    color: partial.color ?? DEFAULT_COLOR,
    screenshotId: partial.screenshotId,
    createdAt: now,
    updatedAt: now,
  };
  list.push(hl);
  list.sort((a, b) => a.startTime - b.startTime);
  await saveHighlights(videoId, list);
  return { list, highlight: hl };
}

export async function updateHighlight(
  videoId: string,
  id: string,
  patch: Partial<Pick<VideoHighlight, "note" | "startTime" | "endTime" | "color">>
): Promise<VideoHighlight[]> {
  const list = await loadHighlights(videoId);
  const i = list.findIndex((h) => h.id === id);
  if (i === -1) return list;
  const prev = list[i];
  list[i] = {
    ...prev,
    ...patch,
    note: patch.note != null ? patch.note : prev.note,
    updatedAt: Date.now(),
  };
  if (list[i].endTime <= list[i].startTime) {
    list[i].endTime = list[i].startTime + 2.5;
  }
  list.sort((a, b) => a.startTime - b.startTime);
  await saveHighlights(videoId, list);
  return list;
}

export async function deleteHighlight(
  videoId: string,
  id: string
): Promise<VideoHighlight[]> {
  const list = (await loadHighlights(videoId)).filter((h) => h.id !== id);
  await saveHighlights(videoId, list);
  return list;
}
