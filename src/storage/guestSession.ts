/**
 * Unsigned (guest) notes live only in this browser.
 * Track how long that has been true, count local work, and wipe it on request.
 */

import { loadCloudSettings } from "../settings/cloudSettings";
import { listLocalHighlightVideoIds, loadHighlights } from "./highlightsStore";
import {
  clearAllScreenshots,
  loadAllScreenshots,
} from "./screenshotStore";

const KEY = "vsa_guest_session";

export interface GuestSession {
  startedAt: number;
}

export interface LocalUserCounts {
  marks: number;
  shots: number;
  videos: number;
}

const KEEP_KEYS = new Set([
  "vsa_cloud_settings",
  "vsa_cloud_ver",
  "vsa_llm_settings",
  "vsa_llm_ver",
  "vsa_onboarding",
  "vsa_guest_session",
  "vsa_ask_provider",
]);

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export async function loadGuestSession(): Promise<GuestSession | null> {
  try {
    const data = await chrome.storage.local.get(KEY);
    const raw = data[KEY] as Partial<GuestSession> | undefined;
    if (raw && typeof raw.startedAt === "number" && raw.startedAt > 0) {
      return { startedAt: raw.startedAt };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function ensureGuestSession(): Promise<GuestSession> {
  const cloud = await loadCloudSettings();
  if (cloud.enabled) {
    return { startedAt: Date.now() };
  }
  const existing = await loadGuestSession();
  if (existing) return existing;
  const next: GuestSession = { startedAt: Date.now() };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function endGuestSession(): Promise<void> {
  try {
    await chrome.storage.local.remove(KEY);
  } catch {
    /* ignore */
  }
}

export async function guestElapsedMs(): Promise<number> {
  const s = (await loadGuestSession()) || (await ensureGuestSession());
  return Math.max(0, Date.now() - s.startedAt);
}

export async function countLocalUserData(): Promise<LocalUserCounts> {
  const videoIds = new Set<string>();
  let marks = 0;
  let shots = 0;
  try {
    const ids = await listLocalHighlightVideoIds();
    for (const id of ids) {
      videoIds.add(id);
      const list = await loadHighlights(id);
      marks += list.length;
    }
  } catch {
    /* ignore */
  }
  try {
    const allShots = await loadAllScreenshots();
    shots = allShots.length;
    for (const s of allShots) {
      if (s.videoId) videoIds.add(s.videoId);
    }
  } catch {
    /* ignore */
  }
  return { marks, shots, videos: videoIds.size };
}

export function hasLocalUserData(c: LocalUserCounts): boolean {
  return c.marks > 0 || c.shots > 0 || c.videos > 0;
}

/** Delete marks, shots, sources, library, and offline queues on this device. */
export async function clearLocalUserData(): Promise<void> {
  try {
    const all = await chrome.storage.local.get(null);
    const remove: string[] = [];
    for (const k of Object.keys(all)) {
      if (KEEP_KEYS.has(k)) continue;
      if (
        k.startsWith("vsa_highlights_") ||
        k.startsWith("vsa_sources_") ||
        k.startsWith("vsa_sync_meta_") ||
        k.startsWith("vsa_topics_") ||
        k === "vsa_library_v1" ||
        k === "vsa_offline_sync_queue_v1"
      ) {
        remove.push(k);
      }
    }
    if (remove.length) await chrome.storage.local.remove(remove);
  } catch {
    /* ignore */
  }
  try {
    await clearAllScreenshots();
  } catch {
    /* ignore */
  }
}

export async function offerSaveLocalToCloud(opts?: {
  onStatus?: (msg: string, isError?: boolean) => void;
}): Promise<"saved" | "kept" | "discarded" | "empty" | "signed-out"> {
  const cloud = await loadCloudSettings();
  if (!cloud.enabled) return "signed-out";

  const counts = await countLocalUserData();
  if (!hasLocalUserData(counts)) {
    await endGuestSession();
    return "empty";
  }

  opts?.onStatus?.(
    `Saving ${counts.marks} mark(s) and ${counts.shots} shot(s) to your account…`
  );
  try {
    const { pushAllLocalToCloud } = await import("../cloud/cloudSync");
    const result = await pushAllLocalToCloud({ onStatus: opts?.onStatus });
    if (!result.ok || result.failed) {
      const { listLocalHighlightVideoIds } = await import("./highlightsStore");
      const { enqueueVideoSync } = await import("../cloud/offlineSync");
      for (const id of await listLocalHighlightVideoIds()) {
        await enqueueVideoSync(id);
      }
      opts?.onStatus?.(
        `${result.message} Nothing was deleted — notes stay on this device and will retry.`,
        true
      );
      await endGuestSession();
      return "kept";
    }
    await endGuestSession();
    opts?.onStatus?.(
      "Saved to your account. Notes also stay on this device."
    );
    return "saved";
  } catch (err) {
    opts?.onStatus?.(
      err instanceof Error
        ? `${err.message} Notes stay on this device.`
        : "Could not reach the vault. Notes stay on this device.",
      true
    );
    await endGuestSession();
    return "kept";
  }
}
