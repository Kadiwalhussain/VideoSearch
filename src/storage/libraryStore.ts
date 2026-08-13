/**
 * Local library state: saved videos, watch later, playlists.
 * Uses chrome.storage.local (small metadata — no IDB version clashes).
 */

const KEY = "vsa_library_v1";

export interface LibraryEntry {
  videoId: string;
  videoTitle: string;
  videoUrl: string;
  saved: boolean;
  savedAt: number | null;
  watchLater: boolean;
  watchLaterAt: number | null;
  playlists: string[];
  updatedAt: number;
}

type LibraryMap = Record<string, LibraryEntry>;

async function readMap(): Promise<LibraryMap> {
  try {
    const data = await chrome.storage.local.get(KEY);
    const raw = data[KEY];
    if (raw && typeof raw === "object") return raw as LibraryMap;
  } catch {
    /* ignore */
  }
  return {};
}

async function writeMap(map: LibraryMap): Promise<void> {
  await chrome.storage.local.set({ [KEY]: map });
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
  }
): Promise<LibraryEntry> {
  return upsertLibraryEntry({ videoId, ...flags });
}

export async function listLocalPlaylistNames(): Promise<string[]> {
  const all = await listLibraryEntries();
  const set = new Set<string>();
  for (const e of all) {
    for (const p of e.playlists || []) if (p.trim()) set.add(p.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
