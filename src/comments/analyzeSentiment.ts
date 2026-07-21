/**
 * Comment sentiment report builder.
 * Prefer on-device DistilBERT (SST-2); fall back to lexicon.
 * Themes extracted per-video from actual comment text.
 */

import type { YtComment } from "./fetchYouTubeComments";
import {
  lexiconScore,
  scoreCommentsWithMl,
  type SentimentLabel,
} from "./sentimentModel";
import { loadLlmSettings } from "../settings/llmSettings";

export type { SentimentLabel };

export interface ScoredComment {
  id: string;
  author: string;
  text: string;
  likes: number;
  publishedText: string;
  score: number;
  label: SentimentLabel;
  source?: "ml" | "lexicon";
}

export interface CommentTheme {
  phrase: string;
  count: number;
  avgSentiment: number;
  lean: SentimentLabel;
}

export interface SentimentReport {
  /** Always set — prevents cross-video UI reuse */
  videoId: string;
  totalAnalyzed: number;
  totalReported: number | null;
  truncated: boolean;
  positive: number;
  negative: number;
  neutral: number;
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  overallScore: number;
  overallLabel: SentimentLabel;
  summary: string;
  themes: CommentTheme[];
  topPositive: ScoredComment[];
  topNegative: ScoredComment[];
  samples: ScoredComment[];
  /** fingerprint of comment ids so cache can't mix videos */
  fingerprint: string;
  engine: "ml" | "lexicon" | "mixed";
  analyzedAt: number;
}

const STOP = new Set(
  `
  a an the and or or but if in on at to for of is are was were be been being
  this that these those it its i me my we our you your they them their he she
  his her as with from by about into over after before up down out so just than
  then also only can will would should could may might must do does did doing
  done have has had having get got getting go going gone video videos youtube
  channel watch watching watched comment comments people one two some any all
  more most much many few lot lots like really very when what who why how where
  which there here too still already even im ive id ill dont doesnt didnt cant
  wont isnt arent wasnt please plz pls thanks thank thx lol lmao omg bro man
  guy guys dude sir mam fr rn ngl tbh imo rn yeah yea yep nope ok okay oh ah um
  `.trim().split(/\s+/)
);

export type AnalyzeProgress = (message: string, ratio?: number) => void;

/**
 * Score + summarize comments for a specific videoId.
 */
export async function analyzeComments(
  videoId: string,
  comments: YtComment[],
  meta?: {
    totalReported?: number | null;
    truncated?: boolean;
    onProgress?: AnalyzeProgress;
  }
): Promise<SentimentReport> {
  const onProgress = meta?.onProgress;
  const unique = dedupeComments(comments);
  const fingerprint = buildFingerprint(videoId, unique);

  onProgress?.("Running sentiment model…", 0.1);

  let engine: SentimentReport["engine"] = "lexicon";
  let scored: ScoredComment[] = [];

  // Cap ML at 80 for speed; rest lexicon (still per-video)
  const mlBudget = Math.min(unique.length, 80);
  const mlSlice = unique.slice(0, mlBudget);
  const rest = unique.slice(mlBudget);

  try {
    const mlScores = await scoreCommentsWithMl(
      mlSlice.map((c) => c.text),
      onProgress
    );

    if (mlScores && mlScores.length === mlSlice.length) {
      engine = rest.length ? "mixed" : "ml";
      scored = mlSlice.map((c, i) => ({
        id: c.id,
        author: c.author,
        text: c.text,
        likes: c.likes,
        publishedText: c.publishedText,
        score: mlScores[i].score,
        label: mlScores[i].label,
        source: mlScores[i].source,
      }));
      for (const c of rest) {
        const s = lexiconScore(c.text);
        scored.push({
          id: c.id,
          author: c.author,
          text: c.text,
          likes: c.likes,
          publishedText: c.publishedText,
          score: s.score,
          label: s.label,
          source: "lexicon",
        });
      }
    }
  } catch (err) {
    console.warn("[VideoSearch AI] ML sentiment failed, lexicon only:", err);
  }

  if (scored.length === 0) {
    engine = "lexicon";
    scored = unique.map((c) => {
      const s = lexiconScore(c.text);
      return {
        id: c.id,
        author: c.author,
        text: c.text,
        likes: c.likes,
        publishedText: c.publishedText,
        score: s.score,
        label: s.label,
        source: "lexicon" as const,
      };
    });
  }

  let positive = 0;
  let negative = 0;
  let neutral = 0;
  let sum = 0;
  for (const c of scored) {
    sum += c.score;
    if (c.label === "positive") positive += 1;
    else if (c.label === "negative") negative += 1;
    else neutral += 1;
  }

  const n = scored.length || 1;
  const overallScore = sum / n;
  const overallLabel = labelFromScore(overallScore, 0.06);
  const positivePct = Math.round((positive / n) * 100);
  const negativePct = Math.round((negative / n) * 100);
  const neutralPct = Math.max(0, 100 - positivePct - negativePct);

  const themes = extractThemes(scored, 8);
  const topPositive = [...scored]
    .filter((c) => c.label === "positive")
    .sort((a, b) => b.score - a.score || b.likes - a.likes)
    .slice(0, 5);
  const topNegative = [...scored]
    .filter((c) => c.label === "negative")
    .sort((a, b) => a.score - b.score || b.likes - a.likes)
    .slice(0, 5);
  const samples = pickSamples(scored, 6);

  let summary = buildSummary({
    overallLabel,
    positivePct,
    negativePct,
    neutralPct,
    themes,
    total: scored.length,
    engine,
  });

  // Optional LLM polish for the summary (same Settings key as Ask/topics)
  try {
    const polished = await maybePolishSummaryWithLlm(
      videoId,
      summary,
      themes,
      scored
    );
    if (polished) summary = polished;
  } catch {
    // ignore — local summary is enough
  }

  return {
    videoId,
    totalAnalyzed: scored.length,
    totalReported: meta?.totalReported ?? null,
    truncated: Boolean(meta?.truncated),
    positive,
    negative,
    neutral,
    positivePct,
    negativePct,
    neutralPct,
    overallScore,
    overallLabel,
    summary,
    themes,
    topPositive,
    topNegative,
    samples,
    fingerprint,
    engine,
    analyzedAt: Date.now(),
  };
}

/** Sync wrapper kept for any legacy callers — prefer analyzeComments. */
export function analyzeCommentsSync(
  comments: YtComment[],
  meta?: { totalReported?: number | null; truncated?: boolean; videoId?: string }
): SentimentReport {
  const videoId = meta?.videoId ?? "unknown";
  const unique = dedupeComments(comments);
  const scored = unique.map((c) => {
    const s = lexiconScore(c.text);
    return {
      id: c.id,
      author: c.author,
      text: c.text,
      likes: c.likes,
      publishedText: c.publishedText,
      score: s.score,
      label: s.label,
      source: "lexicon" as const,
    };
  });
  return finalizeSync(videoId, scored, meta);
}

function finalizeSync(
  videoId: string,
  scored: ScoredComment[],
  meta?: { totalReported?: number | null; truncated?: boolean }
): SentimentReport {
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  let sum = 0;
  for (const c of scored) {
    sum += c.score;
    if (c.label === "positive") positive += 1;
    else if (c.label === "negative") negative += 1;
    else neutral += 1;
  }
  const n = scored.length || 1;
  const overallScore = sum / n;
  const overallLabel = labelFromScore(overallScore, 0.06);
  const positivePct = Math.round((positive / n) * 100);
  const negativePct = Math.round((negative / n) * 100);
  const neutralPct = Math.max(0, 100 - positivePct - negativePct);
  const themes = extractThemes(scored, 8);
  return {
    videoId,
    totalAnalyzed: scored.length,
    totalReported: meta?.totalReported ?? null,
    truncated: Boolean(meta?.truncated),
    positive,
    negative,
    neutral,
    positivePct,
    negativePct,
    neutralPct,
    overallScore,
    overallLabel,
    summary: buildSummary({
      overallLabel,
      positivePct,
      negativePct,
      neutralPct,
      themes,
      total: scored.length,
      engine: "lexicon",
    }),
    themes,
    topPositive: [...scored]
      .filter((c) => c.label === "positive")
      .sort((a, b) => b.score - a.score)
      .slice(0, 5),
    topNegative: [...scored]
      .filter((c) => c.label === "negative")
      .sort((a, b) => a.score - b.score)
      .slice(0, 5),
    samples: pickSamples(scored, 6),
    fingerprint: buildFingerprint(videoId, scored),
    engine: "lexicon",
    analyzedAt: Date.now(),
  };
}

function dedupeComments(comments: YtComment[]): YtComment[] {
  const seen = new Set<string>();
  const out: YtComment[] = [];
  for (const c of comments) {
    const key = c.id || `${c.author}:${c.text.slice(0, 40)}`;
    if (seen.has(key)) continue;
    if (!c.text?.trim()) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function buildFingerprint(
  videoId: string,
  comments: Array<{ id: string; text?: string }>
): string {
  const ids = comments
    .slice(0, 12)
    .map((c) => c.id || (c.text ?? "").slice(0, 24))
    .join("|");
  return `${videoId}::${comments.length}::${ids}`;
}

function labelFromScore(score: number, band = 0.12): SentimentLabel {
  if (score > band) return "positive";
  if (score < -band) return "negative";
  return "neutral";
}

function extractThemes(scored: ScoredComment[], limit: number): CommentTheme[] {
  const map = new Map<string, { count: number; sentSum: number }>();

  for (const c of scored) {
    const phrases = phrasesFromText(c.text);
    const seen = new Set<string>();
    for (const p of phrases) {
      if (seen.has(p)) continue;
      seen.add(p);
      const cur = map.get(p) ?? { count: 0, sentSum: 0 };
      cur.count += 1;
      cur.sentSum += c.score;
      map.set(p, cur);
    }
  }

  return [...map.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort(
      (a, b) =>
        b[1].count - a[1].count ||
        Math.abs(b[1].sentSum) - Math.abs(a[1].sentSum)
    )
    .slice(0, limit)
    .map(([phrase, v]) => {
      const avg = v.sentSum / v.count;
      return {
        phrase,
        count: v.count,
        avgSentiment: avg,
        lean: labelFromScore(avg, 0.1),
      };
    });
}

function phrasesFromText(raw: string): string[] {
  const text = raw
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = text
    .split(" ")
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t));

  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (a.length < 3 || b.length < 3) continue;
    // skip pure opinion bigrams
    if (a === "really" || a === "very" || a === "so") continue;
    out.push(`${a} ${b}`);
  }
  for (const t of tokens) {
    if (t.length >= 5) out.push(t);
  }
  return out;
}

function pickSamples(scored: ScoredComment[], n: number): ScoredComment[] {
  const byEngagement = [...scored].sort(
    (a, b) => b.likes - a.likes || Math.abs(b.score) - Math.abs(a.score)
  );
  const out: ScoredComment[] = [];
  const used = new Set<string>();
  for (const label of ["positive", "negative", "neutral"] as SentimentLabel[]) {
    const pick = byEngagement.find((c) => c.label === label && !used.has(c.id));
    if (pick) {
      out.push(pick);
      used.add(pick.id);
    }
  }
  for (const c of byEngagement) {
    if (out.length >= n) break;
    if (used.has(c.id)) continue;
    out.push(c);
    used.add(c.id);
  }
  return out;
}

function buildSummary(opts: {
  overallLabel: SentimentLabel;
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  themes: CommentTheme[];
  total: number;
  engine: string;
}): string {
  if (opts.total === 0) {
    return "No comments available to analyze on this video.";
  }
  const mood =
    opts.overallLabel === "positive"
      ? "mostly positive"
      : opts.overallLabel === "negative"
        ? "mostly critical"
        : "mixed / neutral";
  const themeBits = opts.themes
    .slice(0, 4)
    .map((t) => t.phrase)
    .filter(Boolean);
  let s = `Viewers are ${mood} (${opts.positivePct}% positive · ${opts.negativePct}% negative · ${opts.neutralPct}% neutral across ${opts.total} comments).`;
  if (themeBits.length) {
    s += ` People often mention: ${themeBits.join(", ")}.`;
  }
  if (opts.engine === "ml" || opts.engine === "mixed") {
    s += " Scored with on-device ML.";
  }
  return s;
}

async function maybePolishSummaryWithLlm(
  videoId: string,
  baseSummary: string,
  themes: CommentTheme[],
  scored: ScoredComment[]
): Promise<string | null> {
  const settings = await loadLlmSettings();
  if (!settings.enabled || !settings.apiKey) return null;

  const pos = scored
    .filter((c) => c.label === "positive")
    .slice(0, 3)
    .map((c) => c.text.slice(0, 120));
  const neg = scored
    .filter((c) => c.label === "negative")
    .slice(0, 3)
    .map((c) => c.text.slice(0, 120));

  const body = {
    model: settings.model,
    temperature: 0.3,
    max_tokens: 160,
    messages: [
      {
        role: "system",
        content:
          "You summarize YouTube comment sentiment in 2 short English sentences. Be specific to THIS video's comments. No bullet lists. No hashtags.",
      },
      {
        role: "user",
        content: `Video id: ${videoId}
Base stats: ${baseSummary}
Themes: ${themes.map((t) => t.phrase).join(", ") || "(none)"}
Positive samples: ${pos.join(" | ") || "(none)"}
Negative samples: ${neg.join(" | ") || "(none)"}
Write a crisp viewer-mood summary:`,
      },
    ],
  };

  const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text || text.length < 20 || text.length > 500) return null;
  return text;
}
