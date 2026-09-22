/**
 * Resume points on this device: where each video was left and how long it is.
 * kind "break" = the user pressed Take a break (always resumed);
 * kind "auto"  = last position saved while watching (offered, not forced).
 * Scoped per signed-in user like the library map.
 */

const KEY = "vsa_progress_v1";
const MAX_ENTRIES = 600;

export interface ResumePoint {
  videoId: string;
  position: number;
  duration: number;
  kind: "break" | "auto";
  /** ms epoch of when this position was recorded */
  at: number;
}

type ProgressMap = Record<string, ResumePoint>;

async function storageKey(): Promise<string> {
  try {
    const { loadCloudSettings } = await import("../settings/cloudSettings");
    const s = await loadCloudSettings();
    return s.enabled && s.userId ? `${KEY}_${s.userId}` : KEY;
  } catch {
    return KEY;
  }
}

async function readMap(): Promise<{ key: string; map: ProgressMap }> {
  const key = await storageKey();
  try {
    const raw = (await chrome.storage.local.get(key))[key];
    if (raw && typeof raw === "object") return { key, map: raw as ProgressMap };
  } catch {
    /* ignore */
  }
  return { key, map: {} };
}

export async function getResumePoint(videoId: string): Promise<ResumePoint | null> {
  const { map } = await readMap();
  return map[videoId] || null;
}

// Read-modify-write on one storage key: run saves one at a time so a slow
// "auto" save cannot write over a newer break with a stale copy of the map.
let saveChain: Promise<unknown> = Promise.resolve();

/** Store a point unless a newer one is already saved. Returns the kept point. */
export function saveResumePoint(p: ResumePoint): Promise<ResumePoint> {
  const run = saveChain.then(() => writePoint(p));
  saveChain = run.catch(() => undefined);
  return run;
}

async function writePoint(p: ResumePoint): Promise<ResumePoint> {
  const { key, map } = await readMap();
  const prev = map[p.videoId];
  if (prev && prev.at > p.at) return prev;
  map[p.videoId] = p;
  const ids = Object.keys(map);
  if (ids.length > MAX_ENTRIES) {
    ids
      .sort((a, b) => map[a].at - map[b].at)
      .slice(0, ids.length - MAX_ENTRIES)
      .forEach((id) => delete map[id]);
  }
  await chrome.storage.local.set({ [key]: map });
  return map[p.videoId];
}

/** True when the video is basically finished — nothing to resume. */
export function isFinished(p: Pick<ResumePoint, "position" | "duration">): boolean {
  return p.duration > 0 && (p.position >= p.duration - 20 || p.position / p.duration >= 0.95);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
