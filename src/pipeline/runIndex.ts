/**
 * Heavy pipeline entry — loaded via dynamic import() so the content-script
 * UI can mount even if the embedding model stack fails later.
 */

import { ensureVideoIndex, type ProgressHandler } from "../background/indexingOrchestrator";
import { search as semanticSearch } from "../search/semanticSearch";
import {
  answerQuestion,
  looksLikeQuestion,
  sourcesAsResults,
  type QaAnswer,
} from "../qa/answerQuestion";
import type { SearchResult, VideoIndex } from "../types/schema";

export async function runEnsureIndex(
  videoId: string,
  onProgress?: ProgressHandler,
  forceReindex = false
) {
  return ensureVideoIndex(videoId, onProgress, { forceReindex });
}

export async function runSearch(
  query: string,
  index: VideoIndex
): Promise<SearchResult[]> {
  return semanticSearch(query, index);
}

/**
 * Smart query: questions → retrieve + AI answer; keywords → timestamp search only.
 */
export async function runSmartQuery(
  query: string,
  index: VideoIndex,
  options?: { forceAsk?: boolean }
): Promise<
  | { mode: "search"; results: SearchResult[] }
  | { mode: "qa"; answer: QaAnswer; results: SearchResult[] }
> {
  const forceAsk = options?.forceAsk ?? false;
  if (forceAsk || looksLikeQuestion(query)) {
    const answer = await answerQuestion(query, index);
    return {
      mode: "qa",
      answer,
      results: sourcesAsResults(answer.sources),
    };
  }
  const results = await semanticSearch(query, index);
  return { mode: "search", results };
}

export type { ProgressHandler, SearchResult, VideoIndex, QaAnswer };
