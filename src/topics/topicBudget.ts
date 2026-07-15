/**
 * How many main topics to surface for a video.
 * Short clips stay modest; long lectures/episodes get many more (15–30+).
 */

/** Absolute floor / ceiling for the UI */
export const TOPIC_MIN = 8;
export const TOPIC_MAX = 36;

/**
 * @param chunkCount number of indexed transcript chunks
 * @param durationSec optional total video length in seconds
 */
export function topicBudget(
  chunkCount: number,
  durationSec?: number
): number {
  let n: number;

  if (durationSec != null && Number.isFinite(durationSec) && durationSec > 0) {
    // ~1 topic per 2.5 minutes, with a floor
    n = Math.round(durationSec / 150);
  } else {
    // Fallback: ~1 topic per ~2 chunks (chunks are ~25s), more aggressive
    n = Math.round(chunkCount / 2.2);
  }

  // Long videos: ensure at least 15 once past ~25 minutes or many chunks
  const long =
    (durationSec != null && durationSec >= 25 * 60) || chunkCount >= 40;
  if (long) n = Math.max(n, 16);

  // Very long (2h+): aim higher
  if (durationSec != null && durationSec >= 90 * 60) {
    n = Math.max(n, 22);
  }
  if (durationSec != null && durationSec >= 150 * 60) {
    n = Math.max(n, 28);
  }

  return Math.max(TOPIC_MIN, Math.min(TOPIC_MAX, n));
}

export function estimateDurationSec(
  chunks: Array<{ startTime: number; endTime: number }>
): number {
  if (!chunks.length) return 0;
  let maxEnd = 0;
  for (const c of chunks) {
    maxEnd = Math.max(maxEnd, c.endTime, c.startTime);
  }
  return maxEnd;
}
