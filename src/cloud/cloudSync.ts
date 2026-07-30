/**
 * Sync vault to auth-based MongoDB + R2 API.
 * Requires user JWT from Settings login/register.
 */

import { loadCloudSettings } from "../settings/cloudSettings";
import type { VideoHighlight } from "../storage/highlightsStore";
import type { VideoScreenshot } from "../storage/screenshotStore";
import { updateScreenshot } from "../storage/screenshotStore";

export interface VaultPayload {
  videoId: string;
  videoTitle?: string;
  videoUrl?: string;
  highlights: VideoHighlight[];
  screenshots: Array<{
    id: string;
    videoTime: number;
    note: string;
    width: number;
    height: number;
    createdAt: number;
    imageUrl?: string;
    dataUrl?: string;
  }>;
  updatedAt: number;
}

export interface SyncResult {
  ok: boolean;
  message: string;
  uploadedScreenshots?: number;
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function syncVideoToCloud(opts: {
  videoId: string;
  videoTitle?: string;
  highlights: VideoHighlight[];
  screenshots: VideoScreenshot[];
}): Promise<SyncResult> {
  const settings = await loadCloudSettings();
  if (!settings.enabled || !settings.apiKey) {
    return {
      ok: false,
      message: "Not logged in. Create an account in Settings → Cloud vault.",
    };
  }

  try {
    const base = settings.projectUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/api/vault/sync`, {
      method: "POST",
      headers: authHeaders(settings.apiKey),
      body: JSON.stringify({
        videoId: opts.videoId,
        videoTitle: opts.videoTitle,
        videoUrl: `https://www.youtube.com/watch?v=${opts.videoId}`,
        highlights: opts.highlights,
        screenshots: opts.screenshots.map((s) => ({
          id: s.id,
          videoTime: s.videoTime,
          note: s.note || "",
          width: s.width,
          height: s.height,
          createdAt: s.createdAt,
          dataUrl: s.dataUrl,
        })),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      uploadedToR2?: number;
    };

    if (!res.ok || data.ok === false) {
      if (res.status === 401) {
        return {
          ok: false,
          message: "Session expired — log in again in Settings.",
        };
      }
      return {
        ok: false,
        message: data.message || `HTTP ${res.status}`,
      };
    }

    const now = Date.now();
    for (const s of opts.screenshots) {
      await updateScreenshot(s.id, {
        cloudUrl: `account://${settings.userId}/${opts.videoId}/${s.id}`,
        syncedAt: now,
      });
    }

    return {
      ok: true,
      message: data.message || "Synced to your account",
      uploadedScreenshots: data.uploadedToR2,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cloud sync failed";
    if (/Failed to fetch|NetworkError/i.test(msg)) {
      return {
        ok: false,
        message: "Vault API offline. Run: cd server && npm run dev",
      };
    }
    return { ok: false, message: msg };
  }
}

export async function fetchCloudVault(): Promise<{
  ok: boolean;
  rows: Array<{ video_id: string; payload: VaultPayload; updated_at: string }>;
  message?: string;
}> {
  const settings = await loadCloudSettings();
  if (!settings.enabled) {
    return { ok: false, rows: [], message: "Not logged in" };
  }
  try {
    const base = settings.projectUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/api/vault?images=1`, {
      headers: authHeaders(settings.apiKey),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      rows?: Array<{
        video_id: string;
        payload: VaultPayload;
        updated_at: string;
      }>;
      message?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        rows: [],
        message: data.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, rows: data.rows || [] };
  } catch (err) {
    return {
      ok: false,
      rows: [],
      message: err instanceof Error ? err.message : "Fetch failed",
    };
  }
}
