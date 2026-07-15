/**
 * Semantic chunking — merge RawCaptionSegment[] → TranscriptChunk[].
 *
 * Build Sequence Step 3.
 *
 * Strategy:
 * - Accumulate segments until the chunk spans ~CHUNK_TARGET_SECONDS of timeline.
 * - Prefer closing a chunk after a sentence boundary (. ! ? …) once we're past
 *   CHUNK_MIN_SECONDS, so we don't cut mid-thought when possible.
 * - Hard-close at CHUNK_MAX_SECONDS even mid-sentence (keeps embeddings focused).
 * - Seek target = startTime of the first segment in the chunk.
 */

import type { RawCaptionSegment, TranscriptChunk } from "../types/schema";

/** Target merged speech window per chunk (seconds). Tunable for empirical iteration. */
export const CHUNK_TARGET_SECONDS = 25;

/** Don't end early on a sentence boundary before this many seconds. */
export const CHUNK_MIN_SECONDS = 15;

/** Hard maximum — force a break even mid-sentence. */
export const CHUNK_MAX_SECONDS = 40;

/** Ignore empty / whitespace-only caption fragments. */
const WHITESPACE_RE = /^\s*$/;

/** Sentence-ending punctuation (also handles captions that end with ." or ?') */
const SENTENCE_END_RE = /[.!?…]["')\]]*\s*$/;

export interface ChunkTranscriptOptions {
  targetSeconds?: number;
  minSeconds?: number;
  maxSeconds?: number;
}

/**
 * Merge raw caption segments into semantically coherent chunks.
 */
export function chunkTranscript(
  segments: RawCaptionSegment[],
  options: ChunkTranscriptOptions = {}
): TranscriptChunk[] {
  const targetSeconds = options.targetSeconds ?? CHUNK_TARGET_SECONDS;
  const minSeconds = options.minSeconds ?? CHUNK_MIN_SECONDS;
  const maxSeconds = options.maxSeconds ?? CHUNK_MAX_SECONDS;

  const cleaned = segments
    .map(normalizeSegment)
    .filter((s): s is RawCaptionSegment => s !== null);

  if (cleaned.length === 0) return [];

  const chunks: TranscriptChunk[] = [];
  let bucket: RawCaptionSegment[] = [];
  let chunkIndex = 0;

  const flush = (): void => {
    if (bucket.length === 0) return;
    chunks.push(buildChunk(bucket, chunkIndex));
    chunkIndex += 1;
    bucket = [];
  };

  for (const segment of cleaned) {
    if (bucket.length === 0) {
      bucket.push(segment);
      continue;
    }

    const provisional = [...bucket, segment];
    const span = spanSeconds(provisional);

    // Hard cap — close before adding if current bucket is already long enough
    // and adding this would push past max (unless bucket is a single segment).
    if (span > maxSeconds && bucket.length > 0) {
      flush();
      bucket.push(segment);
      continue;
    }

    bucket.push(segment);
    const newSpan = spanSeconds(bucket);
    const endsSentence = SENTENCE_END_RE.test(segment.text);

    // Ideal close: past target, ends on a sentence boundary
    if (newSpan >= targetSeconds && endsSentence) {
      flush();
      continue;
    }

    // Soft close: past min, ends on sentence, and we're close to target
    if (
      newSpan >= minSeconds &&
      endsSentence &&
      newSpan >= targetSeconds * 0.7
    ) {
      flush();
      continue;
    }

    // Hard close at max even mid-sentence
    if (newSpan >= maxSeconds) {
      flush();
    }
  }

  flush();
  return chunks;
}

function normalizeSegment(
  segment: RawCaptionSegment
): RawCaptionSegment | null {
  const text = segment.text.replace(/\s+/g, " ").trim();
  if (!text || WHITESPACE_RE.test(text)) return null;
  if (!Number.isFinite(segment.startTime)) return null;

  const endTime =
    Number.isFinite(segment.endTime) && segment.endTime > segment.startTime
      ? segment.endTime
      : segment.startTime;

  return {
    startTime: segment.startTime,
    endTime,
    text,
  };
}

function spanSeconds(segments: RawCaptionSegment[]): number {
  const first = segments[0];
  const last = segments[segments.length - 1];
  // Prefer timeline span (end of last − start of first). Fallback to start delta.
  const end = Math.max(last.endTime, last.startTime);
  return Math.max(0, end - first.startTime);
}

function buildChunk(
  segments: RawCaptionSegment[],
  index: number
): TranscriptChunk {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const text = segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    chunkId: `chunk-${index.toString().padStart(4, "0")}`,
    startTime: first.startTime,
    endTime: Math.max(last.endTime, last.startTime),
    text,
  };
}

/** Convenience stats for console verification. */
export function summarizeChunks(chunks: TranscriptChunk[]): {
  count: number;
  avgDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  totalTextChars: number;
} {
  if (chunks.length === 0) {
    return {
      count: 0,
      avgDurationSec: 0,
      minDurationSec: 0,
      maxDurationSec: 0,
      totalTextChars: 0,
    };
  }

  const durations = chunks.map((c) => Math.max(0, c.endTime - c.startTime));
  const sum = durations.reduce((a, b) => a + b, 0);

  return {
    count: chunks.length,
    avgDurationSec: sum / durations.length,
    minDurationSec: Math.min(...durations),
    maxDurationSec: Math.max(...durations),
    totalTextChars: chunks.reduce((n, c) => n + c.text.length, 0),
  };
}
