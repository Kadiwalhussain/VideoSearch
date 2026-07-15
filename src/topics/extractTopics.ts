/**
 * Human-readable main topics for a video.
 *
 * Avoids ASR brand spam ("Youtube Youtube Gmail") by:
 * 1. Splitting the video into timeline sections
 * 2. Finding words distinctive to each section (not repeated global noise)
 * 3. Building short, readable titles users would actually click
 */

import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";
import { estimateDurationSec, topicBudget } from "./topicBudget";

export interface VideoTopic {
  label: string;
  query: string;
  startTime: number;
  kind: "phrase" | "section";
  score: number;
}

const STOP = new Set(
  `
  a an the and or but if then else when while of in on at to for from by with
  as is are was were be been being have has had do does did will would can could
  should may might must shall about into through during before after above below
  between out off over under again further once here there all each few more most
  other some such no nor not only own same so than too very just also now
  this that these those it its i you he she we they them my your our their
  me him her us what which who whom whose how why where yeah yes ok okay um uh
  like really actually basically literally right well going go get got getting
  says said say tell tells know think want need look see make take come use used
  using something anything everything nothing guy guys people kind sort thing
  things stuff way ways lot lots bit little much many one two three first second
  next last let gonna wanna video videos lecture chapter section today
  don't doesn't didn't isn't aren't wasn't weren't won't can't
  because however therefore thus hence since while although though
  maybe probably perhaps somehow anyway specific generally particular certain
  different another create created creating based value values field fields
  string strings type types name names good bad big small new old high low
  example examples question questions answer answers point points time times
  part parts case cases call calls called show shows mean means okay cool
  slide slides page pages line lines code codes file files skip scy
  um uh hmm ah oh wow nice great super
  `.split(/\s+/).filter(Boolean)
);

/** Brands that dominate captions but are rarely useful alone as "topics" */
const BRAND_NOISE = new Set(
  `
  youtube netflix google gmail alexa amazon facebook instagram twitter x
  microsoft apple openai chatgpt github linkedin whatsapp telegram discord
  zoom slack reddit tiktok spotify uber airbnb paypal stripe aws azure
  python java javascript html css react node typescript kotlin swift
  `.split(/\s+/).filter(Boolean)
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function extractTopics(
  chunks: Array<TranscriptChunk | EmbeddedChunk>
): VideoTopic[] {
  if (!chunks.length) return [];

  const durationSec = estimateDurationSec(chunks);
  const budget = topicBudget(chunks.length, durationSec);

  // 1) Section-based distinctive topics (primary)
  const sectionTopics = topicsFromSections(chunks, budget);

  // 2) Top up with distinctive global phrases if still short
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

  return topics
    .filter((t) => isGoodUserLabel(t.label))
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, budget);
}

// ---------------------------------------------------------------------------
// Section pipeline — one readable topic per time window
// ---------------------------------------------------------------------------

function topicsFromSections(
  chunks: Array<TranscriptChunk | EmbeddedChunk>,
  budget: number
): VideoTopic[] {
  const global = wordDocFreq(chunks);
  const nSections = Math.min(budget, Math.max(8, Math.ceil(chunks.length / 2.5)));
  const sections = splitTimeline(chunks, nSections);
  const out: VideoTopic[] = [];
  const used = new Set<string>();

  for (const section of sections) {
    if (section.members.length === 0) continue;

    const label =
      labelFromDistinctiveWords(section.members, global, chunks.length) ??
      labelFromBestSentence(section.members);

    if (!label || !isGoodUserLabel(label)) continue;

    const key = normalizeKey(label);
    if (used.has(key) || isNearDuplicate(key, used)) continue;
    used.add(key);

    out.push({
      label,
      query: label.toLowerCase(),
      startTime: section.startTime,
      kind: "section",
      score: section.members.length + 1,
    });
  }

  return out;
}

interface Section {
  members: Array<TranscriptChunk | EmbeddedChunk>;
  startTime: number;
}

function splitTimeline(
  chunks: Array<TranscriptChunk | EmbeddedChunk>,
  n: number
): Section[] {
  if (chunks.length === 0) return [];
  const start = chunks[0].startTime;
  const end = Math.max(
    ...chunks.map((c) => Math.max(c.endTime, c.startTime)),
    start + 1
  );
  const span = end - start || 1;
  const out: Section[] = [];

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

function wordDocFreq(
  chunks: Array<TranscriptChunk | EmbeddedChunk>
): Map<string, number> {
  const df = new Map<string, number>();
  for (const c of chunks) {
    const seen = new Set<string>();
    for (const w of tokenize(c.text)) {
      if (seen.has(w)) continue;
      seen.add(w);
      df.set(w, (df.get(w) ?? 0) + 1);
    }
  }
  return df;
}

/**
 * Score words that appear more in this section than in the rest of the video.
 * Then build a 2–4 word title from the best ones in first-seen order.
 */
function labelFromDistinctiveWords(
  members: Array<TranscriptChunk | EmbeddedChunk>,
  globalDf: Map<string, number>,
  totalChunks: number
): string | null {
  const localTf = new Map<string, number>();
  const firstPos = new Map<string, number>();
  let pos = 0;

  for (const m of members) {
    for (const w of tokenize(m.text)) {
      localTf.set(w, (localTf.get(w) ?? 0) + 1);
      if (!firstPos.has(w)) firstPos.set(w, pos);
      pos += 1;
    }
  }

  const scored: Array<{ w: string; score: number; pos: number }> = [];
  for (const [w, tf] of localTf) {
    if (!isContentWord(w)) continue;
    // Brands only allowed if not the only signal
    const df = globalDf.get(w) ?? 1;
    const idf = Math.log(1 + totalChunks / df);
    // Prefer words concentrated in this section
    const concentration = tf / Math.max(1, members.length);
    let score = tf * idf * (1 + concentration);

    if (BRAND_NOISE.has(w)) score *= 0.25; // downrank pure brand spam
    if (w.length >= 8) score *= 1.15;

    scored.push({ w, score, pos: firstPos.get(w) ?? 0 });
  }

  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;

  // Take top candidates, then order by first appearance for natural reading
  const top = scored.slice(0, 8);
  top.sort((a, b) => a.pos - b.pos);

  // Build phrase: prefer 2–3 non-brand words; allow one brand if mixed
  const picked: string[] = [];
  let brandCount = 0;
  for (const { w } of top) {
    if (picked.includes(w)) continue;
    if (BRAND_NOISE.has(w)) {
      if (brandCount >= 1) continue;
      brandCount += 1;
    }
    picked.push(w);
    if (picked.length >= 3) break;
  }

  if (picked.length < 2) {
    // Try force two content words
    for (const { w } of scored) {
      if (picked.includes(w)) continue;
      if (BRAND_NOISE.has(w) && picked.some((p) => BRAND_NOISE.has(p))) continue;
      picked.push(w);
      if (picked.length >= 2) break;
    }
  }

  if (picked.length < 2) return null;

  // Reject all-brand or all-same
  if (picked.every((w) => BRAND_NOISE.has(w))) return null;
  if (new Set(picked).size < 2) return null;

  return titleCase(picked.slice(0, 3).join(" "));
}

/** Fallback: clean first meaningful span from the densest chunk in the section. */
function labelFromBestSentence(
  members: Array<TranscriptChunk | EmbeddedChunk>
): string | null {
  const densest = [...members].sort((a, b) => b.text.length - a.text.length)[0];
  if (!densest) return null;

  const words = tokenize(densest.text).filter(
    (w) => isContentWord(w) && !BRAND_NOISE.has(w)
  );
  if (words.length >= 2) {
    return titleCase(words.slice(0, 3).join(" "));
  }

  // Last resort: any two content words including brands
  const any = tokenize(densest.text).filter(isContentWord);
  if (any.length >= 2 && new Set(any.slice(0, 3)).size >= 2) {
    const slice = any.slice(0, 3);
    if (slice.every((w) => BRAND_NOISE.has(w))) return null;
    if (isRepeatedTokenPhrase(slice.join(" "))) return null;
    return titleCase(slice.join(" "));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Global distinctive phrases (top-up)
// ---------------------------------------------------------------------------

function distinctiveGlobalPhrases(
  chunks: Array<TranscriptChunk | EmbeddedChunk>,
  limit: number
): VideoTopic[] {
  const bigrams = new Map<string, { count: number; start: number }>();

  for (const c of chunks) {
    const tokens = tokenize(c.text);
    const seen = new Set<string>();
    for (let i = 0; i < tokens.length - 1; i++) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (!isContentWord(a) || !isContentWord(b)) continue;
      if (a === b) continue; // youtube youtube
      if (BRAND_NOISE.has(a) && BRAND_NOISE.has(b)) continue;
      const phrase = `${a} ${b}`;
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      const cur = bigrams.get(phrase);
      if (cur) cur.count += 1;
      else bigrams.set(phrase, { count: 1, start: c.startTime });
    }

    // Trigrams
    for (let i = 0; i < tokens.length - 2; i++) {
      const a = tokens[i];
      const b = tokens[i + 1];
      const c3 = tokens[i + 2];
      if (![a, b, c3].every(isContentWord)) continue;
      if (a === b || b === c3) continue;
      if ([a, b, c3].filter((w) => BRAND_NOISE.has(w)).length >= 2) continue;
      const phrase = `${a} ${b} ${c3}`;
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      const cur = bigrams.get(phrase);
      if (cur) cur.count += 1;
      else bigrams.set(phrase, { count: 1, start: c.startTime });
    }
  }

  const minCount = chunks.length >= 40 ? 1 : 2;
  const candidates: VideoTopic[] = [];

  for (const [phrase, { count, start }] of bigrams) {
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
// Quality gates — kills "Youtube Youtube Youtube"
// ---------------------------------------------------------------------------

export function isGoodUserLabel(label: string): boolean {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length < 2) return false;
  if (words.length > 6) return false;
  if (isRepeatedTokenPhrase(words.join(" "))) return false;

  // All brands → useless for navigation
  if (words.every((w) => BRAND_NOISE.has(w))) return false;

  // Majority brands (e.g. Netflix Gmail Google)
  const brandN = words.filter((w) => BRAND_NOISE.has(w)).length;
  if (brandN >= 2 && brandN >= words.length - 0) return false;
  if (brandN === words.length) return false;

  // Stopword-heavy
  if (words.filter((w) => STOP.has(w)).length >= words.length - 1) return false;

  // Email / URL garbage
  if (/@|\.com|\.org|http|www\./i.test(label)) return false;

  return true;
}

function isRepeatedTokenPhrase(phrase: string): boolean {
  const words = phrase.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 2) return true;
  // youtube youtube youtube
  if (new Set(words).size === 1) return true;
  // a a b or a b b with same stem spam
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  for (const n of counts.values()) {
    if (n >= 2 && words.length <= 3) return true;
  }
  return false;
}

function isContentWord(w: string): boolean {
  if (!w || w.length < 3) return false;
  if (STOP.has(w)) return false;
  if (/^\d+$/.test(w)) return false;
  return true;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9'+\-.\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((t) => t.length > 2);
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => {
      if (w.length <= 2) return w.toLowerCase();
      // Keep short tech tokens readable
      if (["html", "css", "api", "sql", "ai", "ui", "ux", "db"].includes(w)) {
        return w.toUpperCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
