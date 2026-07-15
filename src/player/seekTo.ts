/**
 * Reliable YouTube seek.
 *
 * Content scripts cannot call movie_player.seekTo() (page JS methods are not
 * visible in the isolated world). We ask the MAIN-world bridge to seek, and
 * also set <video>.currentTime as a fallback — then re-apply if YT resets.
 */

const BRIDGE = "videosearch-ai-bridge";

/**
 * Normalize a time value into seconds.
 * Handles: seconds, milliseconds, "m:ss", "h:mm:ss".
 */
export function normalizeTimeSeconds(
  value: unknown,
  videoDurationSec?: number
): number {
  if (value == null) return 0;

  if (typeof value === "string") {
    const s = value.trim();
    // mm:ss or h:mm:ss
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
      const parts = s.split(":").map((p) => parseInt(p, 10));
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const n = Number(s);
    if (Number.isFinite(n)) return normalizeTimeSeconds(n, videoDurationSec);
    return 0;
  }

  let t = Number(value);
  if (!Number.isFinite(t) || t < 0) return 0;

  // Likely milliseconds (e.g. 125000)
  if (t > 100_000) {
    t = t / 1000;
  }

  // If still far beyond video length and looks like ms leftover
  if (
    videoDurationSec &&
    videoDurationSec > 0 &&
    t > videoDurationSec * 1.5 &&
    t / 1000 <= videoDurationSec * 1.2
  ) {
    t = t / 1000;
  }

  if (videoDurationSec && videoDurationSec > 0) {
    t = Math.min(t, Math.max(0, videoDurationSec - 0.25));
  }

  return Math.max(0, t);
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(normalizeTimeSeconds(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function getMainVideo(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>(
      "#movie_player video.html5-main-video"
    ) ??
    document.querySelector<HTMLVideoElement>("video.html5-main-video") ??
    document.querySelector<HTMLVideoElement>("#movie_player video") ??
    document.querySelector<HTMLVideoElement>("ytd-player video") ??
    document.querySelector<HTMLVideoElement>("video")
  );
}

/**
 * Seek the YouTube player to `seconds` (wall-clock of the video).
 */
export function seekTo(seconds: number): void {
  const video = getMainVideo();
  const duration = video?.duration && Number.isFinite(video.duration)
    ? video.duration
    : undefined;
  const t = normalizeTimeSeconds(seconds, duration);

  // 1) MAIN-world player.seekTo (most reliable on YouTube)
  try {
    window.postMessage(
      {
        source: BRIDGE,
        type: "SEEK_TO",
        seconds: t,
      },
      "*"
    );
  } catch {
    // ignore
  }

  // 2) Direct media element (works when bridge is late / missing)
  if (video) {
    try {
      // Pause first so YT is less likely to fight the seek mid-buffer
      const wasPaused = video.paused;
      video.currentTime = t;

      // Re-apply if YouTube overwrites within a few frames
      const reapply = (attempt: number) => {
        const v = getMainVideo();
        if (!v) return;
        if (Math.abs(v.currentTime - t) > 1.25) {
          v.currentTime = t;
        }
        if (attempt < 3) {
          window.setTimeout(() => reapply(attempt + 1), 120 * (attempt + 1));
        } else if (!wasPaused) {
          void v.play().catch(() => undefined);
        }
      };
      window.setTimeout(() => reapply(0), 50);

      if (!wasPaused) {
        void video.play().catch(() => undefined);
      } else {
        // Still try play so the user sees the moment
        void video.play().catch(() => undefined);
      }
    } catch (err) {
      console.warn("[VideoSearch AI] video.currentTime seek failed", err);
    }
  }

  console.info(
    "[VideoSearch AI] Seek →",
    formatTimestamp(t),
    `(${t.toFixed(2)}s)`
  );
}
