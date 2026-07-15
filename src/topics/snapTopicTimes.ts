/**
 * Snap topic timestamps onto real caption-chunk start times.
 * LLM / local estimates are approximate — the index has ground-truth times.
 */

import type { TranscriptChunk } from "../types/schema";
import type { VideoTopic } from "./extractTopics";
import { normalizeTimeSeconds } from "../player/seekTo";

/**
 * For each topic, pick the best matching chunk and use its startTime.
 */
export function snapTopicTimes(
  topics: VideoTopic[],
  chunks: TranscriptChunk[]
): VideoTopic[] {
  if (!topics.length || !chunks.length) return topics;

  const duration = Math.max(
    ...chunks.map((c) => Math.max(c.endTime, c.startTime)),
    1
  );

  return topics.map((topic) => {
    const hint = normalizeTimeSeconds(topic.startTime, duration);
    const snapped = findBestChunkStart(topic.query || topic.label, hint, chunks);
    return {
      ...topic,
      startTime: snapped,
    };
  });
}

function findBestChunkStart(
  query: string,
  timeHintSec: number,
  chunks: TranscriptChunk[]
): number {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

  let bestIdx = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const hay = c.text.toLowerCase();

    let keywordHits = 0;
    for (const t of terms) {
      if (hay.includes(t)) keywordHits += 1;
    }
    const keywordScore =
      terms.length > 0 ? keywordHits / terms.length : 0;

    // Prefer chunks near the estimated time (within ~3 minutes strongly)
    const dt = Math.abs(c.startTime - timeHintSec);
    const timeScore = Math.exp(-dt / 90); // ~90s half-distance

    // Slight preference for longer, denser chunks (more content)
    const density = Math.min(1, c.text.length / 280);

    const score = keywordScore * 3 + timeScore * 1.4 + density * 0.2;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // If almost no keyword signal, just take nearest chunk by time
  if (bestScore < 0.35 && terms.length > 0) {
    let nearest = chunks[0];
    let bestDt = Infinity;
    for (const c of chunks) {
      const dt = Math.abs(c.startTime - timeHintSec);
      if (dt < bestDt) {
        bestDt = dt;
        nearest = c;
      }
    }
    return nearest.startTime;
  }

  return chunks[bestIdx].startTime;
}
