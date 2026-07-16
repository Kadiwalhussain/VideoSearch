/**
 * Topic resolution priority:
 *  1. Official YouTube chapters (best — creator-defined)
 *  2. Optional LLM chapter titles (English) to fill gaps on long videos
 *  3. Local section-based extraction
 *
 * Always snap times onto real caption chunks when possible.
 */

import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";
import {
  extractTopics,
  isGoodUserLabel,
  type VideoTopic,
} from "./extractTopics";
import { fetchYouTubeChapters } from "./fetchYouTubeChapters";
import { extractTopicsWithLlm } from "./llmTopics";
import { snapTopicTimes } from "./snapTopicTimes";
import { estimateDurationSec, topicBudget } from "./topicBudget";

export async function resolveTopics(
  videoId: string,
  chunks: Array<TranscriptChunk | EmbeddedChunk>,
  captionTrackHash: string,
  onStatus?: (message: string) => void
): Promise<{ topics: VideoTopic[]; source: "chapters" | "llm" | "local" | "mixed" }> {
  const durationSec = estimateDurationSec(chunks);
  const budget = topicBudget(chunks.length, durationSec);

  // ── 1) Official YouTube chapters ──────────────────────────────────────
  onStatus?.("Checking video chapters…");
  let chapterTopics: VideoTopic[] = [];
  try {
    const chapters = await fetchYouTubeChapters(videoId);
    chapterTopics = chapters
      .filter((c) => c.title.trim().length >= 2)
      .map((c) => ({
        label: c.title.trim(),
        query: c.title.trim(),
        startTime: c.startTime,
        kind: "section" as const,
        score: 100,
      }));
  } catch (err) {
    console.warn("[VideoSearch AI] chapters error:", err);
  }

  if (chapterTopics.length > 0) {
    console.info(
      "[VideoSearch AI] Using",
      chapterTopics.length,
      "official YouTube chapters"
    );

    // Chapters are human-written — keep them even if isGoodUserLabel is strict
    let topics = chapterTopics;

    // Long video with few chapters → fill with more section topics
    if (topics.length < Math.min(budget, 15) && chunks.length > 0) {
      onStatus?.("Adding more topics from the video…");
      const extras = await fillMoreTopics(
        videoId,
        chunks,
        captionTrackHash,
        topics,
        budget,
        onStatus
      );
      topics = mergeTopics(topics, extras);
    }

    // Snap only extras if needed; chapter times are authoritative
    // Still snap lightly so seeks land on caption boundaries when very close
    topics = preferChapterTimes(
      topics,
      chapterTopics,
      snapTopicTimes(topics, chunks)
    );

    return {
      topics: topics.slice(0, Math.max(budget, chapterTopics.length)),
      source: topics.length > chapterTopics.length ? "mixed" : "chapters",
    };
  }

  // ── 2) No official chapters → LLM then local ──────────────────────────
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
    if (cleaned.length >= Math.min(12, budget * 0.5)) {
      // Still merge local to hit budget with more coverage
      if (cleaned.length < budget) {
        const local = extractTopics(chunks);
        const merged = mergeTopics(cleaned, local);
        return {
          topics: snapTopicTimes(merged, chunks)
            .filter((t) => isGoodUserLabel(t.label))
            .slice(0, budget),
          source: "mixed",
        };
      }
      return { topics: cleaned.slice(0, budget), source: "llm" };
    }
    onStatus?.("Improving topic labels…");
    const local = extractTopics(chunks);
    const merged = mergeTopics(cleaned, local);
    return {
      topics: snapTopicTimes(merged, chunks)
        .filter((t) => isGoodUserLabel(t.label))
        .slice(0, budget),
      source: "mixed",
    };
  }

  onStatus?.("Building topics from transcript…");
  const local = extractTopics(chunks);
  return {
    topics: snapTopicTimes(local, chunks)
      .filter((t) => isGoodUserLabel(t.label))
      .slice(0, budget),
    source: "local",
  };
}

async function fillMoreTopics(
  videoId: string,
  chunks: Array<TranscriptChunk | EmbeddedChunk>,
  captionTrackHash: string,
  existing: VideoTopic[],
  budget: number,
  onStatus?: (message: string) => void
): Promise<VideoTopic[]> {
  const need = budget - existing.length;
  if (need <= 0) return [];

  // Prefer LLM fill (English titles from any language transcript)
  try {
    const llm = await extractTopicsWithLlm(
      videoId,
      chunks,
      captionTrackHash + ":fill"
    );
    if (llm && llm.length) {
      return llm.filter(
        (t) =>
          isGoodUserLabel(t.label) ||
          // allow longer human phrases from model
          (t.label.split(/\s+/).length >= 2 && t.label.length >= 8)
      );
    }
  } catch {
    // fall through
  }

  onStatus?.("Building extra topics locally…");
  return extractTopics(chunks);
}

/** Keep official chapter startTimes; use snapped times for non-chapter topics. */
function preferChapterTimes(
  merged: VideoTopic[],
  chapters: VideoTopic[],
  snapped: VideoTopic[]
): VideoTopic[] {
  const chapterKeys = new Set(
    chapters.map((c) => c.label.toLowerCase().trim())
  );
  const snapByLabel = new Map(
    snapped.map((t) => [t.label.toLowerCase().trim(), t])
  );

  return merged.map((t) => {
    const key = t.label.toLowerCase().trim();
    if (chapterKeys.has(key)) {
      const ch = chapters.find((c) => c.label.toLowerCase().trim() === key);
      return ch ? { ...t, startTime: ch.startTime, score: 100 } : t;
    }
    return snapByLabel.get(key) ?? t;
  });
}

function mergeTopics(a: VideoTopic[], b: VideoTopic[]): VideoTopic[] {
  const out: VideoTopic[] = [];
  const keys = new Set<string>();
  for (const t of [...a, ...b]) {
    const k = t.label.toLowerCase().replace(/[^a-z0-9\s\u0900-\u097F]/g, "").trim();
    if (!k || keys.has(k)) continue;
    // near-duplicate title
    let near = false;
    for (const existing of keys) {
      if (existing.includes(k) || k.includes(existing)) {
        if (Math.min(existing.length, k.length) >= 6) {
          near = true;
          break;
        }
      }
    }
    if (near) continue;
    keys.add(k);
    out.push(t);
  }
  return out.sort((x, y) => x.startTime - y.startTime);
}

export type { VideoTopic };
