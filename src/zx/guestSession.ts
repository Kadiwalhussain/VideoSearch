/**
 * Unsigned (guest) notes live only in this browser.
 * Track how long that has been true, count local work, and wipe it on request.
 */

import { loadCloudSettings } from "../settings/cloudSettings";
import { listLocalHighlightVideoIds, loadHighlights } from "./highlightsStore";
import {
  clearAllScreenshots,
  screenshotCountsByVideo,
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
    for (const [id, n] of await screenshotCountsByVideo()) {
      shots += n;
      videoIds.add(id);
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
        k === "vsa_offline_sync_queue_v1" ||
        k === "vsa_offline_ops_v1"
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

  opts?.onStatus?.("Loading this account from the vault…");
  try {
    const { hydrateLocalFromVault, pushAllLocalToCloud } = await import(
      "../cloud/cloudSync"
    );
    const { enqueueOp, flushOfflineQueue } = await import(
      "../cloud/offlineSync"
    );

    // Guest Save / Watch later / playlists become this account's, then replay
    // queued changes before pulling so the vault copy already includes them.
    const { adoptGuestLibrary } = await import("./libraryStore");
    for (const e of await adoptGuestLibrary()) {
      const meta = { videoId: e.videoId, videoTitle: e.videoTitle, videoUrl: e.videoUrl };
      if (e.saved) await enqueueOp({ kind: "library", action: "save", ...meta });
      if (e.watchLater) {
        await enqueueOp({ kind: "library", action: "watch_later", ...meta });
      }
      for (const pl of e.playlists || []) {
        await enqueueOp({ kind: "library", action: "add_playlist", playlist: pl, ...meta });
      }
      if (e.completed) await enqueueOp({ kind: "library", action: "complete", ...meta });
    }
    await flushOfflineQueue({ onStatus: opts?.onStatus });

    const pulled = await hydrateLocalFromVault({ onStatus: opts?.onStatus });

    const counts = await countLocalUserData();
    if (!hasLocalUserData(counts)) {
      await endGuestSession();
      opts?.onStatus?.(pulled.message || "Signed in. Vault is ready.");
      return pulled.videos ? "saved" : "empty";
    }

    opts?.onStatus?.(
      "Uploading your marks, notes, screenshots, and lists…"
    );
    const result = await pushAllLocalToCloud({ onStatus: opts?.onStatus });
    if (!result.ok || result.failed) {
      const { listLibraryEntries } = await import("./libraryStore");
      const { enqueueVideoSync } = await import("../cloud/offlineSync");
      for (const e of await listLibraryEntries()) {
        if (e.saved || e.watchLater || (e.playlists && e.playlists.length)) {
          await enqueueVideoSync(e.videoId);
        }
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
      result.videos
        ? `Account ready · ${pulled.videos} in vault · ${result.videos} uploaded from this device`
        : pulled.videos
          ? pulled.message
          : "Signed in. Vault is ready."
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
