/**
 * Local library state: saved videos, watch later, playlists.
 * Uses chrome.storage.local (small metadata — no IDB version clashes).
 * Keys are per signed-in user so two accounts on one Chrome do not overwrite.
 */

const KEY = "vsa_library_v1";
const IDS_PREFIX = "vsa_vault_ids_";

async function currentUserId(): Promise<string> {
  try {
    const { loadCloudSettings } = await import("../settings/cloudSettings");
    const s = await loadCloudSettings();
    return s.enabled && s.userId ? s.userId : "";
  } catch {
    return "";
  }
}

function libraryKey(userId: string): string {
  return userId ? `${KEY}_${userId}` : KEY;
}

function vaultIdsKey(userId: string): string {
  return `${IDS_PREFIX}${userId || "guest"}`;
}

export interface LibraryEntry {
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  saved: boolean;
  savedAt: number | null;
  watchLater: boolean;
  watchLaterAt: number | null;
  playlists: string[];
  /** User ticked the video as watched (tick on playlist rows) */
  completed?: boolean;
  completedAt?: number | null;
  updatedAt: number;
}

type LibraryMap = Record<string, LibraryEntry>;

async function readMap(): Promise<LibraryMap> {
  const userId = await currentUserId();
  const key = libraryKey(userId);
  try {
    const data = await chrome.storage.local.get([key, KEY]);
    const scoped = data[key];
    if (scoped && typeof scoped === "object") return scoped as LibraryMap;
    // Guest / first-run: unscoped map. Signed-in users hydrate from the vault.
    if (!userId) {
      const legacy = data[KEY];
      if (legacy && typeof legacy === "object") return legacy as LibraryMap;
    }
  } catch {
    /* ignore */
  }
  return {};
}

async function writeMap(map: LibraryMap): Promise<void> {
  const userId = await currentUserId();
  await chrome.storage.local.set({ [libraryKey(userId)]: map });
}

export async function rememberVaultVideoIds(
  videoIds: string[],
  opts?: { replace?: boolean }
): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const key = vaultIdsKey(userId);
  const incoming = [...new Set(videoIds.filter(Boolean))];
  if (opts?.replace) {
    await chrome.storage.local.set({ [key]: incoming });
    return;
  }
  try {
    const data = await chrome.storage.local.get(key);
    const prev = Array.isArray(data[key]) ? (data[key] as string[]) : [];
    await chrome.storage.local.set({
      [key]: [...new Set([...prev, ...incoming])],
    });
  } catch {
    await chrome.storage.local.set({ [key]: incoming });
  }
}

export async function listKnownVaultVideoIds(): Promise<string[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  try {
    const data = await chrome.storage.local.get(vaultIdsKey(userId));
    const ids = data[vaultIdsKey(userId)];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export async function isKnownVaultVideo(videoId: string): Promise<boolean> {
  if (!videoId) return false;
  const userId = await currentUserId();
  if (!userId) return false;
  try {
    const data = await chrome.storage.local.get(vaultIdsKey(userId));
    const ids = data[vaultIdsKey(userId)];
    return Array.isArray(ids) && ids.includes(videoId);
  } catch {
    return false;
  }
}

export async function getLibraryEntry(
  videoId: string
): Promise<LibraryEntry | null> {
  const map = await readMap();
  return map[videoId] || null;
}

export async function listLibraryEntries(): Promise<LibraryEntry[]> {
  const map = await readMap();
  return Object.values(map).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
  );
}

export async function upsertLibraryEntry(
  partial: Partial<LibraryEntry> & { videoId: string }
): Promise<LibraryEntry> {
  const map = await readMap();
  const prev = map[partial.videoId] || {
    videoId: partial.videoId,
    videoTitle: "",
    videoUrl: `https://www.youtube.com/watch?v=${partial.videoId}`,
    saved: false,
    savedAt: null,
    watchLater: false,
    watchLaterAt: null,
    playlists: [] as string[],
    updatedAt: Date.now(),
  };
  const next: LibraryEntry = {
    ...prev,
    ...partial,
    playlists: partial.playlists ?? prev.playlists,
    updatedAt: Date.now(),
  };
  map[partial.videoId] = next;
  await writeMap(map);
  if (
    next.saved ||
    next.watchLater ||
    (next.playlists && next.playlists.length > 0)
  ) {
    await rememberVaultVideoIds([next.videoId]);
  }
  return next;
}

export async function applyLibraryFlags(
  videoId: string,
  flags: {
    videoTitle?: string;
    videoUrl?: string;
    saved?: boolean;
    savedAt?: number | null;
    watchLater?: boolean;
    watchLaterAt?: number | null;
    playlists?: string[];
    completed?: boolean;
    completedAt?: number | null;
  }
): Promise<LibraryEntry> {
  return upsertLibraryEntry({ videoId, ...flags });
}

/**
 * Vault writes for:
 * - videos this user Saved / Watch later / playlist
 * - videos with marks, notes, or screenshots on this device
 * - videos already stored in this user's Mongo vault (keep syncing, never drop)
 * Plain watches with nothing captured stay on the device.
 */
export async function isPinnedToVault(videoId: string): Promise<boolean> {
  const e = await getLibraryEntry(videoId);
  if (
    e &&
    (e.saved || e.watchLater || (e.playlists && e.playlists.length > 0))
  ) {
    return true;
  }
  if (await isKnownVaultVideo(videoId)) return true;
  return hasLocalWork(videoId);
}

async function hasLocalWork(videoId: string): Promise<boolean> {
  try {
    const { loadHighlights } = await import("./highlightsStore");
    if ((await loadHighlights(videoId)).length) return true;
  } catch {
    /* ignore */
  }
  try {
    const { countScreenshots } = await import("./screenshotStore");
    if ((await countScreenshots(videoId)) > 0) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Move guest Save / Watch later / playlists into the signed-in account's map.
 * Runs once per sign-in; the guest map is removed so a second account on
 * this Chrome does not absorb the same entries. Returns the adopted pins.
 */
export async function adoptGuestLibrary(): Promise<LibraryEntry[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const scopedKey = libraryKey(userId);
  let guest: LibraryMap = {};
  let mine: LibraryMap = {};
  try {
    const data = await chrome.storage.local.get([KEY, scopedKey]);
    if (data[KEY] && typeof data[KEY] === "object") guest = data[KEY];
    if (data[scopedKey] && typeof data[scopedKey] === "object") {
      mine = data[scopedKey];
    }
  } catch {
    return [];
  }
  const adopted: LibraryEntry[] = [];
  for (const g of Object.values(guest)) {
    if (!g?.videoId) continue;
    const prev = mine[g.videoId];
    const playlists = [...(prev?.playlists || [])];
    for (const p of g.playlists || []) {
      if (!playlists.some((x) => x.toLowerCase() === p.toLowerCase())) {
        playlists.push(p);
      }
    }
    const next: LibraryEntry = {
      ...(prev || g),
      videoTitle: prev?.videoTitle || g.videoTitle,
      saved: Boolean(prev?.saved || g.saved),
      savedAt: prev?.savedAt ?? g.savedAt,
      watchLater: Boolean(prev?.watchLater || g.watchLater),
      watchLaterAt: prev?.watchLaterAt ?? g.watchLaterAt,
      completed: Boolean(prev?.completed || g.completed),
      completedAt: prev?.completedAt ?? g.completedAt ?? null,
      playlists,
      updatedAt: Date.now(),
    };
    mine[g.videoId] = next;
    if (g.saved || g.watchLater || (g.playlists && g.playlists.length)) {
      adopted.push(g);
    }
  }
  if (!Object.keys(guest).length) return [];
  await chrome.storage.local.set({ [scopedKey]: mine });
  await chrome.storage.local.remove(KEY);
  if (adopted.length) {
    await rememberVaultVideoIds(adopted.map((e) => e.videoId));
  }
  return adopted;
}

/** Video ids ticked as watched on this device. */
export async function listCompletedVideoIds(): Promise<Set<string>> {
  const map = await readMap();
  const out = new Set<string>();
  for (const e of Object.values(map)) if (e?.completed) out.add(e.videoId);
  return out;
}

export async function listLocalPlaylistNames(): Promise<string[]> {
  const all = await listLibraryEntries();
  const set = new Set<string>();
  for (const e of all) {
    for (const p of e.playlists || []) if (p.trim()) set.add(p.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
