/**
 * On-device sentiment ML via transformers.js (no API key required).
 * Model: Xenova/distilbert-base-uncased-finetuned-sst-2-english
 *  → labels POSITIVE / NEGATIVE with confidence scores.
 *
 * Falls back to lexicon scoring if the model fails to load.
 */

import { env, pipeline, type TextClassificationPipeline } from "@xenova/transformers";

export type SentimentLabel = "positive" | "negative" | "neutral";

export interface ModelScore {
  score: number; // -1 .. +1
  label: SentimentLabel;
  confidence: number;
  source: "ml" | "lexicon";
}

const MODEL_ID = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";

// Same content-script-friendly env as embeddings
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.numThreads = 1;

let classifierPromise: Promise<TextClassificationPipeline> | null = null;
let modelFailed = false;

type ProgressCb = (message: string, ratio?: number) => void;

export async function loadSentimentModel(
  onProgress?: ProgressCb
): Promise<TextClassificationPipeline | null> {
  if (modelFailed) return null;
  if (!classifierPromise) {
    classifierPromise = (async () => {
      onProgress?.("Downloading sentiment model (first time)…", 0.05);
      const clf = await pipeline("text-classification", MODEL_ID, {
        quantized: true,
        progress_callback: (p: {
          status?: string;
          progress?: number;
          file?: string;
        }) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            onProgress?.(
              `Loading sentiment model${p.file ? `…` : ""}`,
              Math.min(0.95, p.progress / 100)
            );
          }
        },
      });
      onProgress?.("Sentiment model ready", 1);
      return clf as TextClassificationPipeline;
    })().catch((err) => {
      console.warn("[VideoSearch AI] Sentiment model failed:", err);
      classifierPromise = null;
      modelFailed = true;
      throw err;
    });
  }
  try {
    return await classifierPromise;
  } catch {
    return null;
  }
}

/**
 * Score many comments with the ML model (batched, yields to UI).
 * Returns null scores only if model unavailable — caller uses lexicon.
 */
export async function scoreCommentsWithMl(
  texts: string[],
  onProgress?: ProgressCb
): Promise<ModelScore[] | null> {
  const clf = await loadSentimentModel(onProgress);
  if (!clf) return null;

  const out: ModelScore[] = [];
  const n = texts.length;

  for (let i = 0; i < n; i++) {
    const raw = texts[i] ?? "";
    const text = raw.slice(0, 512).trim() || "ok";
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await clf(text, { topk: 2 })) as any;
      const scores = normalizeClassifierOutput(result);
      out.push(scores);
    } catch {
      out.push(lexiconScore(raw));
    }

    if (i % 4 === 0) {
      onProgress?.(
        `Scoring comments… ${i + 1}/${n}`,
        (i + 1) / Math.max(n, 1)
      );
      await yieldToUi();
    }
  }

  onProgress?.(`Scored ${n} comments`, 1);
  return out;
}

function normalizeClassifierOutput(result: unknown): ModelScore {
  // transformers may return [{label, score}, ...] or nested
  let items: Array<{ label?: string; score?: number }> = [];
  if (Array.isArray(result)) {
    if (result.length && Array.isArray(result[0])) {
      items = result[0] as Array<{ label?: string; score?: number }>;
    } else {
      items = result as Array<{ label?: string; score?: number }>;
    }
  }

  let pos = 0;
  let neg = 0;
  for (const it of items) {
    const lab = (it.label ?? "").toUpperCase();
    const s = typeof it.score === "number" ? it.score : 0;
    if (lab.includes("POS")) pos = s;
    else if (lab.includes("NEG")) neg = s;
  }

  // Single top label form
  if (items.length === 1) {
    const lab = (items[0].label ?? "").toUpperCase();
    const s = items[0].score ?? 0.5;
    if (lab.includes("POS")) {
      pos = s;
      neg = 1 - s;
    } else {
      neg = s;
      pos = 1 - s;
    }
  }

  const score = Math.max(-1, Math.min(1, pos - neg));
  const confidence = Math.max(pos, neg);
  // DistilBERT SST-2 is binary — treat low-confidence as neutral
  let label: SentimentLabel;
  if (confidence < 0.58) label = "neutral";
  else if (score > 0.08) label = "positive";
  else if (score < -0.08) label = "negative";
  else label = "neutral";

  return { score, label, confidence, source: "ml" };
}

// ---------------------------------------------------------------------------
// Lexicon fallback (also used when model confidence is mixed)
// ---------------------------------------------------------------------------

const POSITIVE = new Set(
  `love loved amazing awesome great good best excellent fantastic wonderful perfect beautiful brilliant superb outstanding impressive incredible epic fire helpful useful clear funny hilarious entertaining insightful informative recommend recommended underrated masterpiece legendary iconic wholesome thank thanks grateful appreciate nice cool wow happy glad proud fair quality solid gem favorite favourite relatable inspiring congrats winner goated based`.split(
    /\s+/
  )
);
const NEGATIVE = new Set(
  `hate hated bad worse worst terrible awful horrible disgusting trash garbage sucks suck boring useless waste stupid dumb idiot cringe fake scam misleading clickbait overrated mid disappointing disappointed fail poor weak nonsense wrong toxic rude unwatchable angry mad upset sad frustrating annoying fraud`.split(
    /\s+/
  )
);
const NEGATORS = new Set(
  `not no never dont don't doesnt doesn't isnt isn't wasnt wasn't wont won't cant can't without hardly barely`.split(
    /\s+/
  )
);

export function lexiconScore(raw: string): ModelScore {
  const text = raw
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return { score: 0, label: "neutral", confidence: 0, source: "lexicon" };

  const tokens = text.split(" ").filter(Boolean);
  let score = 0;
  let hits = 0;
  let negate = false;

  for (const t0 of tokens) {
    const t = t0.replace(/^'+|'+$/g, "");
    if (NEGATORS.has(t)) {
      negate = true;
      continue;
    }
    let w = 0;
    if (POSITIVE.has(t)) w = 1;
    else if (NEGATIVE.has(t)) w = -1;
    if (w !== 0) {
      if (negate) w = -w;
      score += w;
      hits += 1;
      negate = false;
    } else if (negate) {
      negate = false;
    }
  }

  const posEmoji = (raw.match(/[❤️😍🥰😊😂🤣👍🔥💯✨🙌👏✅🎉]/gu) ?? []).length;
  const negEmoji = (raw.match(/[😡🤬👎💔😢😭🤮🤢💀]/gu) ?? []).length;
  score += posEmoji * 0.7 - negEmoji * 0.8;
  hits += posEmoji + negEmoji;

  if (hits === 0) {
    return { score: 0, label: "neutral", confidence: 0.2, source: "lexicon" };
  }
  const norm = Math.max(-1, Math.min(1, score / (hits + 1.2)));
  const label: SentimentLabel =
    norm > 0.15 ? "positive" : norm < -0.15 ? "negative" : "neutral";
  return {
    score: norm,
    label,
    confidence: Math.min(0.9, 0.35 + hits * 0.1),
    source: "lexicon",
  };
}

function yieldToUi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
