/**
 * Topic labels built from phrases the speaker actually said.
 *
 * The earlier approach scored single words and glued the winners together,
 * which produced labels like "Normalization Smoother Learning" for a section
 * about batch normalization. Here a label is always a contiguous run of words
 * lifted straight from the captions, ranked by how much it belongs to this
 * section rather than the whole video (c-TF-IDF), and boosted when the speaker
 * announced it ("now let's talk about ...").
 */

import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";
import {
  BRAND_NOISE,
  STOP,
  afterCue,
  isBoilerplate,
  isWeakEnding,
} from "./lexicon";

export type AnyChunk = TranscriptChunk | EmbeddedChunk;

export interface LabelledSection {
  members: AnyChunk[];
  startTime: number;
}

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/;
const MIN_N = 2;
const MAX_N = 4;

/** Unicode-aware: Devanagari, Arabic and CJK survive, unlike an [a-z] filter. */
export function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/(?:rs\.?|inr|usd|\$|₹|€|£)\s*\d+(?:[.,]\d+)?/gi, " ")
    // \p{M} matters: Devanagari matras and Arabic diacritics are combining
    // marks, not letters — dropping them mangles the word.
    .replace(/[^\p{L}\p{N}\p{M}'’\-\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['’\-]+|['’\-]+$/g, ""))
    .filter(Boolean);
}

export function isNumericJunk(w: string): boolean {
  const t = w.toLowerCase().replace(/[$,₹€£]/g, "");
  if (!t) return true;
  if (/^\d+([.,]\d+)?%?$/.test(t)) return true;
  if (/^\d+[kmb]$/i.test(t)) return true;
  if (/\d/.test(t) && t.length <= 5) return true;
  return false;
}

export function isContentWord(w: string): boolean {
  if (!w) return false;
  const min = CJK.test(w) ? 1 : 3;
  if (w.length < min) return false;
  if (STOP.has(w)) return false;
  if (isNumericJunk(w)) return false;
  return true;
}

interface Candidate {
  phrase: string;
  tf: number;
  cued: boolean;
  /** 0..1 position of first mention inside its section */
  firstPos: number;
  /** caption time of first mention */
  firstTime: number;
}

/** Contiguous runs of content words, length MIN_N..MAX_N. */
function candidatesFor(section: LabelledSection): Map<string, Candidate> {
  const out = new Map<string, Candidate>();
  const total = Math.max(1, section.members.length);

  section.members.forEach((chunk, idx) => {
    if (isBoilerplate(chunk.text)) return;
    const cueRest = afterCue(chunk.text);
    const cueRun = cueRest ? leadingContentRun(cueRest) : null;
    // Only the phrase the speaker actually named counts as announced — not
    // every phrase in the sentence that happens to share a word with it.
    const cued = new Set<string>();
    if (cueRun) {
      for (let n = MIN_N; n <= cueRun.length; n++) {
        cued.add(cueRun.slice(0, n).join(" "));
      }
    }
    const tokens = tokenize(chunk.text);

    for (let n = MIN_N; n <= MAX_N; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const slice = tokens.slice(i, i + n);
        if (!slice.every(isContentWord)) continue;
        if (new Set(slice).size < slice.length) continue; // "youtube youtube"
        if (slice.every((w) => BRAND_NOISE.has(w))) continue;
        if (isWeakEnding(slice[slice.length - 1])) continue;

        const phrase = slice.join(" ");
        const isCued = cued.has(phrase);
        const prev = out.get(phrase);
        if (prev) {
          prev.tf += 1;
          prev.cued = prev.cued || isCued;
        } else {
          out.set(phrase, {
            phrase,
            tf: 1,
            cued: isCued,
            firstPos: idx / total,
            firstTime: chunk.startTime,
          });
        }
      }
    }
  });

  return out;
}

/**
 * The first run of content words in a string, stopping at the first function
 * word once we already have enough. "the learning rate which is..." → learning
 * rate.
 */
function leadingContentRun(text: string): string[] | null {
  const run: string[] = [];
  for (const t of tokenize(text)) {
    if (isContentWord(t)) {
      run.push(t);
      if (run.length >= MAX_N) break;
    } else if (run.length >= MIN_N) {
      break;
    } else {
      run.length = 0;
    }
  }
  return run.length >= MIN_N ? run : null;
}

/**
 * How many sections mention each phrase. A phrase repeated all video long
 * ("neural network" in a neural-network lecture) says nothing about *this*
 * section, so it gets discounted.
 */
function phraseDocFreq(perSection: Array<Map<string, Candidate>>): Map<string, number> {
  const df = new Map<string, number>();
  for (const m of perSection) {
    for (const phrase of m.keys()) df.set(phrase, (df.get(phrase) ?? 0) + 1);
  }
  return df;
}

function scoreOf(c: Candidate, df: number, nSections: number): number {
  const idf = Math.log(1 + nSections / Math.max(1, df));
  let score = c.tf * idf;

  const words = c.phrase.split(" ");
  // Three-word phrases read best as titles; two is fine; four is often a clause.
  score *= words.length === 3 ? 1.18 : words.length === 2 ? 1.0 : 0.92;
  // Said more than once in the same section — a real subject, not a passing word.
  if (c.tf >= 2) score *= 1.45;
  // The speaker announced it.
  if (c.cued) score *= 2.4;
  // Introduced early in the section.
  if (c.firstPos <= 0.4) score *= 1.2;
  // Brands may ride along inside a phrase, but never lead it.
  if (words.some((w) => BRAND_NOISE.has(w))) score *= 0.3;
  // Longer words tend to be the technical content.
  if (words.some((w) => w.length >= 8)) score *= 1.12;

  return score;
}

export interface PhraseLabel {
  label: string;
  query: string;
  startTime: number;
  score: number;
}

/**
 * Label every section in one pass so c-TF-IDF sees the whole video, and no two
 * sections end up with the same title.
 */
export function labelSections(sections: LabelledSection[]): Array<PhraseLabel | null> {
  const perSection = sections.map(candidatesFor);
  const df = phraseDocFreq(perSection);
  const nSections = Math.max(1, sections.length);
  const taken = new Set<string>();

  // Best-scoring sections claim their label first, so a strong topic isn't
  // stolen by a neighbour that merely mentions it.
  const ranked = sections
    .map((section, i) => {
      const ranking = [...perSection[i].values()]
        .map((c) => ({ c, score: scoreOf(c, df.get(c.phrase) ?? 1, nSections) }))
        .sort((a, b) => b.score - a.score);
      return { i, ranking, best: ranking[0]?.score ?? 0 };
    })
    .sort((a, b) => b.best - a.best);

  const out: Array<PhraseLabel | null> = sections.map(() => null);

  for (const { i, ranking } of ranked) {
    const section = sections[i];
    let chosen: { c: Candidate; score: number } | null = null;

    for (const entry of ranking.slice(0, 24)) {
      const key = entry.c.phrase;
      if (taken.has(key)) continue;
      if (overlapsTaken(key, taken)) continue;
      chosen = entry;
      break;
    }
    if (!chosen) continue;

    // Prefer the longer phrase when it contains the winner and scores close —
    // "vanishing gradient problem" over "vanishing gradient".
    const better = ranking.find(
      (e) =>
        e.c.phrase !== chosen!.c.phrase &&
        e.c.phrase.includes(chosen!.c.phrase) &&
        e.c.phrase.split(" ").length <= MAX_N &&
        e.score >= chosen!.score * 0.72 &&
        !taken.has(e.c.phrase)
    );
    if (better) chosen = better;

    taken.add(chosen.c.phrase);
    out[i] = {
      label: titleCase(chosen.c.phrase),
      query: chosen.c.phrase,
      // Start where the subject is first raised, not at the section edge.
      startTime: Math.min(
        Math.max(chosen.c.firstTime, section.startTime),
        section.startTime + 120
      ),
      score: chosen.score,
    };
  }

  return out;
}

function overlapsTaken(phrase: string, taken: Set<string>): boolean {
  const a = new Set(phrase.split(" "));
  for (const t of taken) {
    if (t === phrase || t.includes(phrase) || phrase.includes(t)) return true;
    const b = new Set(t.split(" "));
    let inter = 0;
    for (const w of a) if (b.has(w)) inter += 1;
    const union = a.size + b.size - inter;
    if (union > 0 && inter / union >= 0.6) return true;
  }
  return false;
}

const UPPER = new Set([
  "ai", "api", "css", "db", "gpu", "cpu", "html", "http", "json", "ml",
  "nlp", "ocr", "pdf", "ram", "sql", "ssd", "ui", "url", "ux", "xml",
  "atp", "dna", "rna", "usb", "hdmi", "oled", "lcd", "svm", "cnn", "rnn",
]);

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => {
      if (UPPER.has(w)) return w.toUpperCase();
      // Scripts without case (Devanagari, Arabic, CJK) pass through unchanged.
      if (!/[a-z]/i.test(w)) return w;
      if (w.length <= 2) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}
