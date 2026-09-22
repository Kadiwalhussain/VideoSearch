/**
 * Human-readable main topics for a video, derived on-device.
 *
 * Sections come from MiniLM embedding shifts (falling back to equal time
 * windows), and every label is a contiguous phrase lifted from the captions —
 * see phraseLabel.ts. Nothing here reassembles loose words into a title, which
 * is what used to produce labels like "Normalization Smoother Learning".
 */

import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";
import { estimateDurationSec, topicBudget } from "./topicBudget";
import { hasDenseEmbedding, segmentByEmbedding } from "./segmentByEmbedding";
import { labelSections, type LabelledSection } from "./phraseLabel";
import {
  BRAND_NOISE,
  STOP,
  isBoilerplate,
  isWeakEnding,
} from "./lexicon";
import { isContentWord, isNumericJunk, tokenize, titleCase } from "./phraseLabel";

export interface VideoTopic {
  label: string;
  query: string;
  startTime: number;
  kind: "phrase" | "section";
  score: number;
}

export function extractTopics(
  chunks: Array<TranscriptChunk | EmbeddedChunk>
): VideoTopic[] {
  if (!chunks.length) return [];

  const durationSec = estimateDurationSec(chunks);
  const budget = topicBudget(chunks.length, durationSec);

  // 1) Embedding shifts — the most faithful cuts when the index has vectors.
  const dense = chunks.filter(hasDenseEmbedding);
  const sectionTopics =
    dense.length >= 6
      ? topicsFromPhrases(segmentByEmbedding(dense, budget), 12)
      : [];

  // 2) Equal-time windows when embeddings are absent or produced too few cuts.
  if (sectionTopics.length < Math.min(6, budget)) {
    const nSections = Math.min(
      Math.max(budget, 10),
      Math.max(8, Math.ceil(chunks.length / 2))
    );
    const used = new Set(sectionTopics.map((t) => normalizeKey(t.label)));
    for (const t of topicsFromPhrases(splitTimeline(chunks, nSections), 6)) {
      const key = normalizeKey(t.label);
      if (!key || used.has(key) || isNearDuplicate(key, used)) continue;
      used.add(key);
      sectionTopics.push(t);
      if (sectionTopics.length >= budget) break;
    }
  }

  // 3) Still thin — top up with the video's most distinctive repeated phrases.
  const used = new Set(sectionTopics.map((t) => normalizeKey(t.label)));
  const topics = [...sectionTopics];

  if (topics.length < budget) {
    for (const t of distinctiveGlobalPhrases(chunks, budget * 2)) {
      const key = normalizeKey(t.label);
      if (!key || used.has(key) || isNearDuplicate(key, used)) continue;
      if (!isGoodUserLabel(t.label)) continue;
      used.add(key);
      topics.push(t);
      if (topics.length >= budget) break;
    }
  }

  return dedupeByTime(
    topics
      .filter((t) => isGoodUserLabel(t.label))
      .sort((a, b) => a.startTime - b.startTime)
  ).slice(0, budget);
}

// ---------------------------------------------------------------------------
// Sections → labels
// ---------------------------------------------------------------------------

/**
 * Label a set of sections with real caption phrases. Sponsor reads and
 * sign-offs yield no candidates, so those sections drop out on their own.
 */
function topicsFromPhrases(
  sections: LabelledSection[],
  baseScore: number
): VideoTopic[] {
  const usable = sections.filter((s) => s.members.length > 0);
  const labels = labelSections(usable);
  const out: VideoTopic[] = [];

  labels.forEach((label, i) => {
    if (!label || !isGoodUserLabel(label.label)) return;
    out.push({
      label: label.label,
      query: label.query,
      startTime: label.startTime,
      kind: "section",
      score: baseScore + usable[i].members.length,
    });
  });

  return out;
}

function splitTimeline(
  chunks: Array<TranscriptChunk | EmbeddedChunk>,
  n: number
): LabelledSection[] {
  if (chunks.length === 0) return [];
  const start = chunks[0].startTime;
  const end = Math.max(
    ...chunks.map((c) => Math.max(c.endTime, c.startTime)),
    start + 1
  );
  const span = end - start || 1;
  const out: LabelledSection[] = [];

  for (let i = 0; i < n; i++) {
    const t0 = start + (span * i) / n;
    const t1 = start + (span * (i + 1)) / n;
    const members = chunks.filter(
      (c) => c.startTime >= t0 - 0.01 && c.startTime < t1 + 0.01
    );
    if (!members.length) continue;
    out.push({ members, startTime: members[0].startTime });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Global distinctive phrases (top-up when sections come up short)
// ---------------------------------------------------------------------------

function distinctiveGlobalPhrases(
  chunks: Array<TranscriptChunk | EmbeddedChunk>,
  limit: number
): VideoTopic[] {
  const phrases = new Map<string, { count: number; start: number }>();

  for (const c of chunks) {
    if (isBoilerplate(c.text)) continue;
    const tokens = tokenize(c.text);
    const seen = new Set<string>();

    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const slice = tokens.slice(i, i + n);
        if (!slice.every(isContentWord)) continue;
        if (new Set(slice).size < slice.length) continue;
        if (slice.filter((w) => BRAND_NOISE.has(w)).length >= n - 1) continue;
        if (isWeakEnding(slice[n - 1])) continue;
        const phrase = slice.join(" ");
        if (seen.has(phrase)) continue;
        seen.add(phrase);
        const cur = phrases.get(phrase);
        if (cur) cur.count += 1;
        else phrases.set(phrase, { count: 1, start: c.startTime });
      }
    }
  }

  const minCount = chunks.length >= 40 ? 2 : 1;
  const candidates: VideoTopic[] = [];

  for (const [phrase, { count, start }] of phrases) {
    if (count < minCount) continue;
    const label = titleCase(phrase);
    if (!isGoodUserLabel(label)) continue;
    candidates.push({
      label,
      query: phrase,
      startTime: start,
      kind: "phrase",
      score: count * (phrase.split(" ").length >= 3 ? 1.4 : 1),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Quality gates
// ---------------------------------------------------------------------------

/**
 * Script-aware: a Devanagari or CJK label has no [a-z] characters and must
 * still pass. Only the checks that genuinely signal junk are applied.
 */
export function isGoodUserLabel(label: string): boolean {
  const raw = String(label || "").trim();
  if (raw.length < 4 || raw.length > 72) return false;
  if (/@|\.com|\.org|http|www\./i.test(raw)) return false;

  const words = tokenize(raw);
  if (words.length < 2 || words.length > 6) return false;
  if (new Set(words).size < words.length) return false;

  // Numbers may appear inside a phrase, never dominate it.
  const digitish = words.filter(isNumericJunk).length;
  if (digitish >= 2 || digitish / words.length >= 0.4) return false;

  // At least one real content word carrying meaning.
  const content = words.filter((w) => isContentWord(w) && !BRAND_NOISE.has(w));
  if (content.length < 1) return false;

  // Entirely brands, or brand + filler, is useless for navigation.
  if (words.every((w) => BRAND_NOISE.has(w) || isNumericJunk(w))) return false;

  // Mostly function words.
  if (words.filter((w) => STOP.has(w)).length > words.length - 2) return false;

  if (isWeakEnding(words[words.length - 1])) return false;

  return true;
}

/** Kept for compatibility with existing imports. */
export function isNumericJunkToken(w: string): boolean {
  return isNumericJunk(w);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Two topics seconds apart are one topic — keep the stronger label. */
function dedupeByTime(topics: VideoTopic[], minGapSec = 20): VideoTopic[] {
  const out: VideoTopic[] = [];
  for (const t of topics) {
    const prev = out[out.length - 1];
    if (prev && t.startTime - prev.startTime < minGapSec) {
      if (t.score > prev.score) out[out.length - 1] = t;
      continue;
    }
    out.push(t);
  }
  return out;
}

function normalizeKey(s: string): string {
  return tokenize(s).join(" ");
}

function isNearDuplicate(key: string, used: Set<string>): boolean {
  for (const u of used) {
    if (u === key) return true;
    if (u.includes(key) || key.includes(u)) return true;
    const a = new Set(key.split(" "));
    const b = new Set(u.split(" "));
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const union = a.size + b.size - inter;
    if (union > 0 && inter / union >= 0.6) return true;
  }
  return false;
}
