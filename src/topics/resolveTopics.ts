/**
 * Resolve display topics: LLM (if configured) → local extraction fallback.
 * Always snap times onto real caption chunks so seeks land correctly.
 */

import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";
import {
  extractTopics,
  isGoodUserLabel,
  type VideoTopic,
} from "./extractTopics";
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
    const cleaned = snapTopicTimes(llm, chunks).filter((t) =>
      isGoodUserLabel(t.label)
    );
    if (cleaned.length >= 8) {
      return { topics: cleaned, source: "llm" };
    }
    // LLM returned brand spam / too few — merge with local
    onStatus?.("Improving topic labels…");
    const local = extractTopics(chunks);
    const merged = mergeTopics(cleaned, local);
    return {
      topics: snapTopicTimes(merged, chunks).filter((t) =>
        isGoodUserLabel(t.label)
      ),
      source: cleaned.length >= local.length ? "llm" : "local",
    };
  }

  onStatus?.("Building topics locally…");
  const local = extractTopics(chunks);
  return {
    topics: snapTopicTimes(local, chunks).filter((t) =>
      isGoodUserLabel(t.label)
    ),
    source: "local",
  };
}

function mergeTopics(a: VideoTopic[], b: VideoTopic[]): VideoTopic[] {
  const out: VideoTopic[] = [];
  const keys = new Set<string>();
  for (const t of [...a, ...b]) {
    const k = t.label.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (!k || keys.has(k)) continue;
    keys.add(k);
    out.push(t);
  }
  return out.sort((x, y) => x.startTime - y.startTime);
}

export type { VideoTopic };
