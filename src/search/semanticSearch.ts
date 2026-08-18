/**
 * Brute-force cosine similarity over a single video's embedded chunks.
 * Hundreds of chunks — no HNSW/FAISS needed at this scale.
 */

import { embedQuery } from "../embedding/embedChunks";
import type { SearchResult, VideoIndex } from "../types/schema";

/**
 * Soft floor — below this we still may return top hits if nothing is strong,
 * but UI can mark them as weaker.
 */
export const MIN_RELEVANCE_THRESHOLD = 0.22;

/** Hard floor — never return noise below this */
export const HARD_MIN_SCORE = 0.12;

/** Default number of results to return. */
export const DEFAULT_TOP_K = 6;

export interface SearchOptions {
  topK?: number;
  minScore?: number;
}

/**
 * Hybrid search: semantic cosine + light keyword boost.
 * Always tries to return useful top-K when the query is non-empty.
 */
export async function search(
  query: string,
  index: VideoIndex,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const minScore = options.minScore ?? MIN_RELEVANCE_THRESHOLD;
  const q = query.trim();
  if (!q || index.chunks.length === 0) return [];

  const queryVec = await embedQuery(q);
  const queryTerms = tokenizeQuery(q);
  const phrase = q.toLowerCase();
  const pairs = queryBigrams(queryTerms);

  const scored: SearchResult[] = index.chunks.map((chunk) => {
    const semantic = cosineSimilarity(queryVec, chunk.embedding);
    const hay = chunk.text.toLowerCase();
    const keyword = keywordScore(queryTerms, hay);
    const exactPhrase = phrase.length >= 4 && hay.includes(phrase) ? 1 : 0;
    let pairHits = 0;
    for (const p of pairs) if (hay.includes(p)) pairHits += 1;
    const pairScore = pairs.length ? pairHits / pairs.length : 0;
    // Semantic first; phrase/keyword pull exact terms MiniLM undersells
    const score = clamp01(
      0.62 * semantic + 0.18 * keyword + 0.12 * pairScore + 0.08 * exactPhrase
    );
    return {
      chunkId: chunk.chunkId,
      startTime: chunk.startTime,
      text: chunk.text,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // minScore <= 0 means "always return topK" (used by Q&A retrieval)
  if (minScore <= 0) {
    return scored.slice(0, topK);
  }

  const strong = scored.filter((r) => r.score >= minScore).slice(0, topK);
  if (strong.length > 0) return strong;

  // Soft fallback: still show best chunks so search never feels "broken"
  const soft = scored.filter((r) => r.score >= HARD_MIN_SCORE).slice(0, topK);
  if (soft.length > 0) return soft;

  // Last resort: topK by score even if weak (better than empty for UX)
  return scored.slice(0, topK);
}

function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function keywordScore(terms: string[], hay: string): number {
  if (terms.length === 0) return 0;
  let hits = 0;
  for (const t of terms) {
    if (hay.includes(t)) hits += 1;
  }
  return hits / terms.length;
}

function queryBigrams(terms: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < terms.length - 1; i++) {
    out.push(`${terms[i]} ${terms[i + 1]}`);
  }
  return out;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  // Clamp floating error into [0,1] for display (cosine can be slightly outside)
  const cos = dot / denom;
  return Math.max(-1, Math.min(1, cos));
}

/** Format seconds → M:SS or H:MM:SS */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
