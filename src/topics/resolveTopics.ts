/**
 * Resolve display topics: LLM (if configured) → local extraction fallback.
 * Always snap times onto real caption chunks so seeks land correctly.
 */

import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";
import { extractTopics, type VideoTopic } from "./extractTopics";
import { extractTopicsWithLlm } from "./llmTopics";
import { snapTopicTimes } from "./snapTopicTimes";

export async function resolveTopics(
  videoId: string,
  chunks: Array<TranscriptChunk | EmbeddedChunk>,
  captionTrackHash: string,
  onStatus?: (message: string) => void
): Promise<{ topics: VideoTopic[]; source: "llm" | "local" }> {
  onStatus?.("Finding main topics…");

  const llm = await extractTopicsWithLlm(
    videoId,
    chunks,
    captionTrackHash
  );
  if (llm && llm.length > 0) {
    return {
      topics: snapTopicTimes(llm, chunks),
      source: "llm",
    };
  }

  onStatus?.("Building topics locally…");
  const local = extractTopics(chunks);
  return {
    topics: snapTopicTimes(local, chunks),
    source: "local",
  };
}

export type { VideoTopic };
