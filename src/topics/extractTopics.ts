/**
 * Main-topic extraction for a video.
 *
 * Goal: a small set of *big* themes the lecture covers — not tiny filler
 * words ("because", "specific", "value") or one-off mentions.
 *
 * Method (all local):
 * 1. Cluster chunk embeddings into major themes (or fall back to timeline buckets)
 * 2. Inside each cluster, score multi-word technical phrases only
 * 3. Hard quality filters reject generic / short / stopword-y labels
 */

import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";

export interface VideoTopic {
  label: string;
  query: string;
  startTime: number;
  kind: "phrase" | "section";
  score: number;
}

/** Max chips shown in the UI */
const MAX_TOPICS = 8;

/** Prefer 2–4 word labels; unigrams only if long + rare technical terms */
const MIN_PHRASE_WORDS = 2;

const STOP = new Set(
  `
  a an the and or but if then else when while of in on at to for from by with
  as is are was were be been being have has had do does did will would can could
  should may might must shall about into through during before after above below
  between out off over under again further once here there all each few more most
  other some such no nor not only own same so than too very just also now
  this that these those it its it's i you he she we they them my your our their
  me him her us what which who whom whose how why where yeah yes ok okay um uh
  like really actually basically literally right well going go get got getting
  says said say tell tells know think want need look see make take come use used
  using something anything everything nothing guy guys people kind sort thing
  things stuff way ways lot lots bit little much many one two three first second
  next last let let's gonna wanna video videos lecture chapter section today
  we're i'm you're they're don't doesn't didn't isn't aren't wasn't weren't
  won't can't couldn't i've i'll you've you'll we've we'll they've they'll
  because becauseof however therefore thus hence since while although though
  maybe probably perhaps somehow anyway anyways somethingelse whatever whenever
  whoever wherever whatever specifically specific generally general particular
  particular particularly certain certain different different another another
  create created creates creating using based basedon basedon using using
  value values field fields string strings number numbers type types data
  name names just really very also even still back front good bad big small
  new old high low long short true false null none yes no yeah yep nope
  okay ok right left up down start end begin beginning startswith
  example examples question questions answer answers point points time times
  part parts case cases call calls called calling show shows showing
  mean means meaning means that means this means
  actually basically literally essentially basically basically
  gonna wanna gotta kinda sorta
  um uh hmm ah oh wow cool nice great super
  slide slides page pages line lines code codes file files
  `.split(/\s+/).filter(Boolean)
);

/**
 * Single words that are almost never "main topics" of a lecture on their own.
 * Allowed only as part of a multi-word phrase (e.g. "base model", "data validation").
 */
const WEAK_UNIGRAMS = new Set(
  `
  value values field fields string strings number numbers type types object objects
  create created creates creating function functions method methods class classes
  specific specifically general generally particular particularly certain
  because however therefore something anything everything nothing
  base model models data output outputs input inputs schema schemas
  parameter parameters argument arguments variable variables
  result results return returns true false null undefined
  list lists array arrays map maps set sets
  `.split(/\s+/).filter(Boolean)
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function extractTopics(
  chunks: Array<TranscriptChunk | EmbeddedChunk>
): VideoTopic[] {
  if (!chunks.length) return [];

  const hasEmbeddings = chunks.every(isEmbedded);
  const clusters = hasEmbeddings
    ? clusterByEmbedding(chunks as EmbeddedChunk[])
    : clusterByTimeline(chunks);

  const topics: VideoTopic[] = [];
  const usedKeys = new Set<string>();

  // Larger clusters first = bigger themes
  const ordered = [...clusters].sort(
    (a, b) => b.members.length - a.members.length || a.startTime - b.startTime
  );

  for (const cluster of ordered) {
    const phrase = bestMainPhrase(cluster.members);
    if (!phrase) continue;

    const key = normalizeKey(phrase.label);
    if (!key || usedKeys.has(key)) continue;
    if (isNearDuplicate(key, usedKeys)) continue;

    usedKeys.add(key);
    topics.push({
      label: phrase.label,
      query: phrase.query,
      startTime: cluster.startTime,
      kind: hasEmbeddings ? "section" : "phrase",
      score: cluster.members.length + phrase.score,
    });

    if (topics.length >= MAX_TOPICS) break;
  }

  // If clustering produced too few, top up with global multi-word phrases only
  if (topics.length < 4) {
    for (const t of globalMultiWordTopics(chunks)) {
      const key = normalizeKey(t.label);
      if (usedKeys.has(key) || isNearDuplicate(key, usedKeys)) continue;
      usedKeys.add(key);
      topics.push(t);
      if (topics.length >= MAX_TOPICS) break;
    }
  }

  return topics.slice(0, MAX_TOPICS);
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

interface Cluster {
  members: Array<TranscriptChunk | EmbeddedChunk>;
  startTime: number;
}

function isEmbedded(
  c: TranscriptChunk | EmbeddedChunk
): c is EmbeddedChunk {
  return (
    "embedding" in c &&
    c.embedding instanceof Float32Array &&
    c.embedding.length > 0
  );
}

/**
 * Farthest-point sampling + assignment → K thematic clusters.
 * Each cluster ≈ one major theme of the lecture.
 */
function clusterByEmbedding(chunks: EmbeddedChunk[]): Cluster[] {
  const usable = chunks.filter((c) => c.text.trim().length > 40);
  if (usable.length === 0) return clusterByTimeline(chunks);

  const k = Math.min(
    MAX_TOPICS,
    Math.max(4, Math.min(7, Math.round(usable.length / 6)))
  );

  // Seeds: spread across the video first, then refine by embedding distance
  const seeds: EmbeddedChunk[] = [];
  const step = Math.max(1, Math.floor(usable.length / k));
  for (let i = 0; i < k; i++) {
    seeds.push(usable[Math.min(usable.length - 1, i * step)]);
  }

  // Farthest-point refinement
  for (let iter = 0; iter < 2; iter++) {
    for (let s = 0; s < seeds.length; s++) {
      let best: EmbeddedChunk | null = null;
      let bestMin = -1;
      for (const c of usable) {
        let minD = Infinity;
        for (let t = 0; t < seeds.length; t++) {
          if (t === s) continue;
          const d = cosineDistance(c.embedding, seeds[t].embedding);
          if (d < minD) minD = d;
        }
        // Also prefer chunks that are long (more content)
        const score = minD * (1 + Math.min(c.text.length, 400) / 800);
        if (score > bestMin) {
          bestMin = score;
          best = c;
        }
      }
      if (best) seeds[s] = best;
    }
  }

  const groups: EmbeddedChunk[][] = seeds.map(() => []);
  for (const c of usable) {
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < seeds.length; i++) {
      const d = cosineDistance(c.embedding, seeds[i].embedding);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    groups[bestI].push(c);
  }

  return groups
    .filter((g) => g.length > 0)
    .map((g) => {
      g.sort((a, b) => a.startTime - b.startTime);
      return { members: g, startTime: g[0].startTime };
    })
    // Drop tiny outlier clusters (noise)
    .filter((cl) => cl.members.length >= Math.max(1, Math.floor(usable.length / (k * 4))));
}

function clusterByTimeline(
  chunks: Array<TranscriptChunk | EmbeddedChunk>
): Cluster[] {
  const n = Math.min(MAX_TOPICS, Math.max(4, Math.ceil(chunks.length / 8)));
  const start = chunks[0].startTime;
  const end = Math.max(
    chunks[chunks.length - 1].endTime,
    chunks[chunks.length - 1].startTime,
    start + 1
  );
  const span = end - start || 1;
  const out: Cluster[] = [];

  for (let s = 0; s < n; s++) {
    const t0 = start + (span * s) / n;
    const t1 = start + (span * (s + 1)) / n;
    const members = chunks.filter(
      (c) => c.startTime >= t0 - 0.01 && c.startTime < t1 + 0.01
    );
    if (members.length === 0) continue;
    out.push({ members, startTime: members[0].startTime });
  }
  return out;
}

function cosineDistance(a: Float32Array, b: Float32Array): number {
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
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

// ---------------------------------------------------------------------------
// Phrase scoring inside a cluster / globally
// ---------------------------------------------------------------------------

function bestMainPhrase(
  members: Array<TranscriptChunk | EmbeddedChunk>
): { label: string; query: string; score: number } | null {
  const counts = new Map<string, number>();

  for (const chunk of members) {
    const tokens = tokenize(chunk.text);
    const seen = new Set<string>();

    for (let i = 0; i < tokens.length; i++) {
      // Prefer trigrams
      if (i + 2 < tokens.length) {
        const tri = [tokens[i], tokens[i + 1], tokens[i + 2]];
        if (tri.every(isContentToken)) {
          const p = tri.join(" ");
          if (isStrongPhrase(p) && !seen.has(p)) {
            seen.add(p);
            counts.set(p, (counts.get(p) ?? 0) + 3);
          }
        }
      }
      // Bigrams
      if (i + 1 < tokens.length) {
        const bi = [tokens[i], tokens[i + 1]];
        if (bi.every(isContentToken)) {
          const p = bi.join(" ");
          if (isStrongPhrase(p) && !seen.has(p)) {
            seen.add(p);
            counts.set(p, (counts.get(p) ?? 0) + 2);
          }
        }
      }
    }
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const [p, sc] of counts) {
    // Boost phrases that look technical (longer words, compound)
    const boost = technicalBoost(p);
    const score = sc * boost;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (!best || bestScore < 2) return null;
  return {
    label: titleCase(best),
    query: best,
    score: bestScore,
  };
}

function globalMultiWordTopics(
  chunks: Array<TranscriptChunk | EmbeddedChunk>
): VideoTopic[] {
  const df = new Map<string, number>();
  const first = new Map<string, number>();

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const seen = new Set<string>();
    for (let i = 0; i < tokens.length; i++) {
      for (const n of [3, 2] as const) {
        if (i + n - 1 >= tokens.length) continue;
        const parts = tokens.slice(i, i + n);
        if (!parts.every(isContentToken)) continue;
        const p = parts.join(" ");
        if (!isStrongPhrase(p) || seen.has(p)) continue;
        seen.add(p);
        df.set(p, (df.get(p) ?? 0) + 1);
        if (!first.has(p)) first.set(p, chunk.startTime);
      }
    }
  }

  const minDf = Math.max(2, Math.floor(chunks.length * 0.03));
  const candidates: VideoTopic[] = [];

  for (const [p, count] of df) {
    if (count < minDf) continue;
    const coverage = count / chunks.length;
    if (coverage > 0.5) continue; // too generic
    candidates.push({
      label: titleCase(p),
      query: p,
      startTime: first.get(p) ?? 0,
      kind: "phrase",
      score: count * technicalBoost(p),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, MAX_TOPICS);
}

// ---------------------------------------------------------------------------
// Quality gates — this is what kills "Because", "Specific", "Value"
// ---------------------------------------------------------------------------

function isStrongPhrase(phrase: string): boolean {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length < MIN_PHRASE_WORDS) return false;
  if (words.length > 4) return false;

  // Every word must pass content check
  if (!words.every(isContentToken)) return false;

  // Reject if ALL words are weak unigrams
  if (words.every((w) => WEAK_UNIGRAMS.has(w))) return false;

  // At least one "anchor" word: longer / not weak
  const hasAnchor = words.some(
    (w) => w.length >= 5 && !WEAK_UNIGRAMS.has(w) && !STOP.has(w)
  );
  if (!hasAnchor) {
    // Allow two medium words that form a known-looking compound
    // e.g. "base model", "data validation" — one weak + one ok is fine
    const okCount = words.filter((w) => !WEAK_UNIGRAMS.has(w) && w.length >= 4)
      .length;
    if (okCount < 1) return false;
  }

  // Reject phrases that are mostly function-ish
  if (words.some((w) => STOP.has(w))) return false;

  // Reject pure numeric
  if (words.every((w) => /^\d/.test(w))) return false;

  return true;
}

function isContentToken(t: string): boolean {
  if (!t || t.length < 3) return false;
  if (STOP.has(t)) return false;
  if (/^\d+(\.\d+)?$/.test(t)) return false;
  return true;
}

function technicalBoost(phrase: string): number {
  const words = phrase.split(/\s+/);
  let b = 1;
  // Longer average word length → more technical
  const avg = words.reduce((s, w) => s + w.length, 0) / words.length;
  if (avg >= 6) b += 0.4;
  if (avg >= 8) b += 0.3;
  // Trigrams slightly preferred
  if (words.length >= 3) b += 0.35;
  // Camel / compound-ish (contains digits rare in speech)
  if (words.some((w) => w.length >= 8)) b += 0.25;
  return b;
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
    // one contains the other (e.g. "base model" vs "base models")
    if (u.includes(key) || key.includes(u)) return true;
    // high token overlap
    const a = new Set(key.split(" "));
    const b = new Set(u.split(" "));
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const union = a.size + b.size - inter;
    if (union > 0 && inter / union >= 0.67) return true;
  }
  return false;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => {
      if (w.length <= 2) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
