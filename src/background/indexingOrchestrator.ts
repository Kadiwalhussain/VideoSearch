/**
 * Indexing orchestrator — sequences pipeline stages only (no business logic).
 *
 * Flow:
 *   cache check → (hit) ready
 *   else fetch transcript → chunk → embed → save → ready
 */

import { chunkTranscript } from "../chunking/chunkTranscript";
import { embedChunks } from "../embedding/embedChunks";
import {
  getValidVideoIndex,
  saveVideoIndex,
} from "../storage/videoIndexStore";
import {
  fetchTranscript,
  NoCaptionsError,
} from "../transcript/fetchTranscript";
import type { RawCaptionSegment, VideoIndex } from "../types/schema";

export type IndexStage =
  | "checking-cache"
  | "fetching-captions"
  | "chunking"
  | "loading-model"
  | "embedding"
  | "saving"
  | "ready"
  | "no-captions"
  | "error";

export interface IndexProgress {
  stage: IndexStage;
  message: string;
  ratio?: number; // 0–1 when known
}

export type ProgressHandler = (progress: IndexProgress) => void;

export interface IndexResult {
  index: VideoIndex;
  fromCache: boolean;
  /** Full caption lines for live synced transcript UI */
  segments: RawCaptionSegment[];
}

/**
 * Ensure a VideoIndex exists for this video (cache or fresh build).
 */
export async function ensureVideoIndex(
  videoId: string,
  onProgress?: ProgressHandler,
  options: { forceReindex?: boolean } = {}
): Promise<IndexResult> {
  const report = (stage: IndexStage, message: string, ratio?: number) => {
    onProgress?.({ stage, message, ratio });
  };

  // We need the caption hash to validate cache. Fetch is cheap vs embed;
  // on cache hit we still fetch captions metadata... Actually getValid needs hash.
  // Optimization: fetch transcript always for hash, or store hash-only probe.
  // Spec: check cache first — if we have index and hash matches skip re-embed.
  // To know hash we need caption track identity. Fetch transcript is required
  // unless we skip hash check. Spec says hash invalidation — so fetch track meta.
  // Practical approach: try getVideoIndex first; if present, fetch transcript
  // only for hash compare (we already fetch full captions for hash in fetchTranscript).
  // Full caption download is small vs embedding. OK.

  if (!options.forceReindex) {
    report("checking-cache", "Checking local cache…");
  }

  try {
    report("fetching-captions", "Fetching captions…");
    const transcript = await fetchTranscript(videoId);

    if (!options.forceReindex) {
      const cached = await getValidVideoIndex(
        videoId,
        transcript.captionTrackHash
      );
      if (cached && cached.chunks.length > 0) {
        report("ready", `Loaded ${cached.chunks.length} chunks from cache`, 1);
        console.info(
          "[VideoSearch AI] CACHE HIT — skipping re-embed for",
          videoId
        );
        return {
          index: cached,
          fromCache: true,
          segments: transcript.segments,
        };
      }
      console.info(
        "[VideoSearch AI] CACHE MISS — indexing",
        videoId
      );
    }

    report("chunking", "Chunking transcript…");
    const chunks = chunkTranscript(transcript.segments);
    if (chunks.length === 0) {
      throw new Error("Chunking produced 0 chunks from caption data.");
    }

    report("loading-model", "Loading embedding model…", 0);
    const embedded = await embedChunks(chunks, (message, ratio) => {
      const stage: IndexStage =
        message.toLowerCase().includes("embedding chunk")
          ? "embedding"
          : "loading-model";
      report(stage, message, ratio);
    });

    report("saving", "Saving index locally…");
    const index: VideoIndex = {
      videoId,
      captionTrackHash: transcript.captionTrackHash,
      chunks: embedded,
      indexedAt: Date.now(),
    };
    await saveVideoIndex(index);

    report("ready", `Ready — ${index.chunks.length} searchable chunks`, 1);
    return {
      index,
      fromCache: false,
      segments: transcript.segments,
    };
  } catch (err) {
    if (err instanceof NoCaptionsError) {
      report("no-captions", err.message);
      throw err;
    }
    report(
      "error",
      err instanceof Error ? err.message : "Indexing failed"
    );
    throw err;
  }
}
