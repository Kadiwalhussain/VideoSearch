/**
 * Every break taken in a video: where it was, when it started, when the user
 * came back. Drawn as coffee markers on the progress bar so the user can see
 * how they split the video into sittings and plan the next one.
 * Scoped per signed-in user like the resume points; synced to the vault.
 */

const KEY = "vsa_breaks_v1";
/** Per video — older breaks drop off */
const MAX_PER_VIDEO = 30;
const MAX_VIDEOS = 400;

export interface BreakEntry {
  id: string;
  /** Spot in the video (seconds) */
  position: number;
  /** ms epoch the user pressed Break */
  startedAt: number;
  /** ms epoch playback resumed; null while still on the break */
  endedAt: number | null;
}

type BreakMap = Record<string, BreakEntry[]>;

async function storageKey(): Promise<string> {
  try {
    const { loadCloudSettings } = await import("../settings/cloudSettings");
    const s = await loadCloudSettings();
    return s.enabled && s.userId ? `${KEY}_${s.userId}` : KEY;
  } catch {
    return KEY;
  }
}

async function readMap(): Promise<{ key: string; map: BreakMap }> {
  const key = await storageKey();
  try {
    const raw = (await chrome.storage.local.get(key))[key];
    if (raw && typeof raw === "object") return { key, map: raw as BreakMap };
  } catch {
    /* ignore */
  }
  return { key, map: {} };
}

/** Valid entries only, oldest first, capped. */
export function normalizeBreaks(list: unknown): BreakEntry[] {
  if (!Array.isArray(list)) return [];
  const out: BreakEntry[] = [];
  for (const b of list) {
    const id = String(b?.id || "");
    const position = Number(b?.position);
    const startedAt = Number(b?.startedAt);
    if (!id || !Number.isFinite(position) || position < 0) continue;
    if (!Number.isFinite(startedAt) || startedAt <= 0) continue;
    const ended = Number(b?.endedAt);
    out.push({
      id,
      position,
      startedAt,
      endedAt: Number.isFinite(ended) && ended >= startedAt ? ended : null,
    });
  }
  return out.sort((a, b) => a.startedAt - b.startedAt).slice(-MAX_PER_VIDEO);
}

/** Union by id; a closed copy of a break wins over an open one. */
export function mergeBreaks(a: BreakEntry[], b: BreakEntry[]): BreakEntry[] {
  const byId = new Map<string, BreakEntry>();
  for (const e of [...a, ...b]) {
    const prev = byId.get(e.id);
    if (!prev) {
      byId.set(e.id, e);
      continue;
    }
    byId.set(e.id, {
      ...prev,
      // A moved break (Break pressed again) carries the newer start
      ...(e.startedAt > prev.startedAt ? e : {}),
      endedAt:
        prev.endedAt && e.endedAt
          ? Math.max(prev.endedAt, e.endedAt)
          : prev.endedAt ?? e.endedAt,
    });
  }
  return normalizeBreaks([...byId.values()]);
}

// Read-modify-write on one storage key: one change at a time
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn);
  chain = run.catch(() => undefined);
  return run;
}

async function writeVideo(
  videoId: string,
  change: (list: BreakEntry[]) => BreakEntry[]
): Promise<BreakEntry[]> {
  const { key, map } = await readMap();
  const next = normalizeBreaks(change(map[videoId] || []));
  if (next.length) map[videoId] = next;
  else delete map[videoId];
  const ids = Object.keys(map);
  if (ids.length > MAX_VIDEOS) {
    const last = (id: string) => map[id][map[id].length - 1]?.startedAt || 0;
    ids
      .sort((x, y) => last(x) - last(y))
      .slice(0, ids.length - MAX_VIDEOS)
      .forEach((id) => delete map[id]);
  }
  await chrome.storage.local.set({ [key]: map });
  return next;
}

export async function getBreaks(videoId: string): Promise<BreakEntry[]> {
  const { map } = await readMap();
  return normalizeBreaks(map[videoId]);
}

/**
 * Record a break at this spot. Pressing Break again before resuming moves
 * the open break instead of adding a second one.
 */
export function startBreak(videoId: string, position: number): Promise<BreakEntry[]> {
  return serial(() =>
    writeVideo(videoId, (list) => {
      const now = Date.now();
      const open = list[list.length - 1];
      if (open && open.endedAt == null) {
        return [...list.slice(0, -1), { ...open, position, startedAt: now }];
      }
      const id = `brk_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      return [...list, { id, position, startedAt: now, endedAt: null }];
    })
  );
}

/** Playback resumed: close the open break. Returns null if none was open. */
export function endBreak(videoId: string): Promise<BreakEntry[] | null> {
  return serial(async () => {
    const list = await getBreaks(videoId);
    const open = list[list.length - 1];
    if (!open || open.endedAt != null) return null;
    return writeVideo(videoId, (l) =>
      l.map((e) => (e.id === open.id ? { ...e, endedAt: Date.now() } : e))
    );
  });
}

/** Fold in breaks from the vault (another device). */
export function absorbBreaks(videoId: string, remote: unknown): Promise<BreakEntry[]> {
  const incoming = normalizeBreaks(remote);
  if (!incoming.length) return getBreaks(videoId);
  return serial(() => writeVideo(videoId, (list) => mergeBreaks(list, incoming)));
}
