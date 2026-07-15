/**
 * Canonical data schema — contract between pipeline stages.
 * Defined now so later steps import a single source of truth.
 * (Not used in Build Sequence Step 1.)
 */

/** A single caption segment as returned by YouTube's caption track */
export interface RawCaptionSegment {
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
}

/** A semantically merged chunk, ready for embedding */
export interface TranscriptChunk {
  chunkId: string;
  startTime: number; // seconds, inherited from first merged segment
  endTime: number;
  text: string; // merged text of multiple raw segments
}

/** A chunk plus its embedding vector, as stored in IndexedDB */
export interface EmbeddedChunk extends TranscriptChunk {
  embedding: Float32Array;
}

/** Cached record for a fully indexed video */
export interface VideoIndex {
  videoId: string;
  captionTrackHash: string; // used for cache invalidation
  chunks: EmbeddedChunk[];
  indexedAt: number; // timestamp
}

/** A single search result returned to the UI */
export interface SearchResult {
  chunkId: string;
  startTime: number;
  text: string;
  score: number; // cosine similarity, 0-1
}
