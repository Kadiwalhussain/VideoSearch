/**
 * LLM-powered main topic extraction (optional, user API key).
 * Long videos request 15–30+ topics spanning the full timeline.
 */

import { llmChatCompletions } from "../qa/llmClient";
import type { TranscriptChunk } from "../types/schema";
import { isGoodUserLabel, type VideoTopic } from "./extractTopics";
import { estimateDurationSec, topicBudget } from "./topicBudget";

/** v8: strict quality filters — invalidates number/SKU spam caches (v7) */
const TOPIC_CACHE_PREFIX = "vsa_topics_v8_";

export async function loadCachedTopics(
  videoId: string,
  captionTrackHash: string
): Promise<VideoTopic[] | null> {
  try {
    const key = TOPIC_CACHE_PREFIX + videoId;
    const data = await chrome.storage.local.get(key);
    const raw = data[key] as
      | { hash: string; topics: VideoTopic[]; budget?: number }
      | undefined;
    if (!raw || raw.hash !== captionTrackHash) return null;
    if (!Array.isArray(raw.topics) || raw.topics.length === 0) return null;
    return raw.topics;
  } catch {
    return null;
  }
}

export async function saveCachedTopics(
  videoId: string,
  captionTrackHash: string,
  topics: VideoTopic[]
): Promise<void> {
  try {
    await chrome.storage.local.set({
      [TOPIC_CACHE_PREFIX + videoId]: {
        hash: captionTrackHash,
        topics,
      },
    });
  } catch {
    // ignore
  }
}

/**
 * Ask the model for many main topics (budget scales with length).
 * Returns null if no key / request failed (caller falls back to local).
 */
export async function extractTopicsWithLlm(
  videoId: string,
  chunks: TranscriptChunk[],
  captionTrackHash: string
): Promise<VideoTopic[] | null> {
  const durationSec = estimateDurationSec(chunks);
  const budget = topicBudget(chunks.length, durationSec);

  const cached = await loadCachedTopics(videoId, captionTrackHash);
  // Accept cache only if enough quality topics (skip brand/price spam)
  if (cached && cached.length >= Math.min(budget, 8)) {
    const cleaned = cached.filter((t) => isGoodUserLabel(t.label));
    if (cleaned.length >= Math.min(8, Math.ceil(budget * 0.5))) {
      console.info(
        "[VideoSearch AI] Smart topics cache hit",
        videoId,
        cleaned.length
      );
      return cleaned.slice(0, budget);
    }
  }

  // Windowed excerpts: denser context for product/review videos (prices, SKUs)
  const windowCount = Math.min(
    28,
    Math.max(12, Math.round(durationSec / 90))
  );
  const excerpts = sampleWindowExcerpts(chunks, windowCount);
  if (excerpts.length === 0) return null;

  const minTopics = Math.max(8, Math.min(budget, Math.max(8, budget - 4)));
  const maxTopics = budget;

  const system = `You write a clean YouTube CHAPTER TABLE OF CONTENTS for navigation.

Return ONLY valid JSON (no markdown fences) — an array of ${minTopics} to ${maxTopics} objects.

Good titles (human chapter style):
- "Intro and why this phone matters"
- "Display and brightness tests"
- "Camera low-light samples"
- "Battery life and charging"
- "Final verdict and who should buy"

NEVER output titles that look like:
- Prices or numbers: "9.99 10.25", "14.5 13.5 E20"
- SKU soup: "E20 Xp95 Youtube", "5.6 1.4"
- Brand spam: "Youtube Youtube", "Gmail Google Netflix"
- Raw ASR fragments without meaning

Schema:
[
  {
    "title": "Clear 3-7 word chapter title in English",
    "query": "2-5 word search phrase",
    "startTime": 123.4
  }
]

Rules:
- English only for title + query (translate ideas from any language captions).
- Each title must describe a TOPIC or SEGMENT of the talk — not quote prices.
- Ignore model numbers, prices, resolution figures unless part of a real phrase like "4K video quality".
- Spread startTime across the FULL video (early / mid / late).
- Unique titles; no near-duplicates.
- If the video is a product review, use sections like design, display, performance, camera, battery, software, verdict.`;

  const user = `Video id: ${videoId}
Duration ≈ ${Math.round(durationSec / 60)} minutes (${Math.round(durationSec)}s)
Need ${minTopics}–${maxTopics} chapter titles.

Caption windows (startSec | mm:ss | text). Text may include prices — DO NOT copy them into titles:
${excerpts.map((e) => `${e.t.toFixed(0)} | ${formatTs(e.t)} | ${e.text}`).join("\n")}

JSON array only:`;

  try {
    let topics = await requestTopics(system, user);
    topics = topics.filter((t) => isGoodUserLabel(t.label));

    if (topics.length < Math.min(minTopics, 8) && topics.length > 0) {
      const more = await requestTopics(
        system,
        `${user}

You returned only ${topics.length} good titles. Add more chapters (total ≥ ${minTopics}).
Already used (do not repeat): ${topics.map((t) => t.label).join("; ")}
Focus on middle and late sections. No prices or model codes as titles.`
      );
      topics = dedupeTopics([
        ...topics,
        ...more.filter((t) => isGoodUserLabel(t.label)),
      ]).slice(0, maxTopics);
    }

    if (topics.length < 4) {
      console.warn(
        "[VideoSearch AI] Smart topics: too few quality titles",
        topics.length
      );
      return topics.length ? topics : null;
    }

    topics.sort((a, b) => a.startTime - b.startTime);
    topics = topics.slice(0, maxTopics);

    await saveCachedTopics(videoId, captionTrackHash, topics);
    console.info(
      "[VideoSearch AI] Smart topics:",
      topics.length,
      topics.map((t) => t.label)
    );
    return topics;
  } catch (err) {
    console.error("[VideoSearch AI] Smart topics failed:", err);
    return null;
  }
}

async function requestTopics(
  system: string,
  user: string
): Promise<VideoTopic[]> {
  const result = await llmChatCompletions({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.15,
    max_tokens: 2400,
  });
  if (!result?.content) {
    console.warn("[VideoSearch AI] Smart topics: no LLM content");
    return [];
  }
  return parseTopicsJson(result.content);
}

/** Evenly spaced single chunks (legacy). */
function sampleExcerpts(
  chunks: TranscriptChunk[],
  max: number
): Array<{ t: number; text: string }> {
  if (chunks.length === 0) return [];
  if (chunks.length <= max) {
    return chunks.map((c) => ({
      t: c.startTime,
      text: clip(c.text, 160),
    }));
  }
  const out: Array<{ t: number; text: string }> = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.floor((i * (chunks.length - 1)) / (max - 1));
    const c = chunks[idx];
    out.push({ t: c.startTime, text: clip(c.text, 160) });
  }
  return out;
}

/**
 * Merge neighboring captions into windows so the model sees phrases, not
 * isolated ASR tokens (fixes "9.99 10.25" style junk topics).
 */
function sampleWindowExcerpts(
  chunks: TranscriptChunk[],
  windows: number
): Array<{ t: number; text: string }> {
  if (chunks.length === 0) return [];
  const n = Math.min(windows, chunks.length);
  const out: Array<{ t: number; text: string }> = [];
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i * chunks.length) / n);
    const end = Math.max(start + 1, Math.floor(((i + 1) * chunks.length) / n));
    const slice = chunks.slice(start, end);
    if (!slice.length) continue;
    const text = slice
      .map((c) => c.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    out.push({
      t: slice[0].startTime,
      text: clip(sanitizeExcerpt(text), 280),
    });
  }
  return out.length ? out : sampleExcerpts(chunks, windows);
}

/** Lightly strip pure prices so the model focuses on meaning. */
function sanitizeExcerpt(text: string): string {
  return text
    .replace(/(?:rs\.?|inr|usd|\$|₹|€|£)\s*\d+(?:[.,]\d+)?/gi, " ")
    .replace(/\b\d+[.,]\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function formatTs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function parseTopicsJson(content: string): VideoTopic[] {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];

  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];

    const topics: VideoTopic[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const title = String(rec.title ?? rec.label ?? "").trim();
      const query = String(rec.query ?? title).trim();
      const startTime = parseStartTime(rec.startTime ?? rec.start ?? rec.time);
      if (!title || title.length < 3) continue;
      if (!looksLikeRealTopic(title)) continue;
      if (!isGoodUserLabel(title)) continue;
      topics.push({
        label: title,
        query: query || title,
        startTime,
        kind: "phrase",
        score: 10,
      });
    }
    return dedupeTopics(topics);
  } catch {
    return [];
  }
}

function dedupeTopics(topics: VideoTopic[]): VideoTopic[] {
  const out: VideoTopic[] = [];
  const keys = new Set<string>();
  for (const t of topics) {
    const key = t.label.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    if (!key || keys.has(key)) continue;
    // near-dup: shared first two words
    let near = false;
    for (const k of keys) {
      if (k.includes(key) || key.includes(k)) {
        near = true;
        break;
      }
    }
    if (near) continue;
    keys.add(key);
    out.push(t);
  }
  return out;
}

function looksLikeRealTopic(title: string): boolean {
  const lower = title.toLowerCase();
  if (/@|www\.|\.com|\.org|http/i.test(title)) return false;
  if (/\b(anybody|someone|something|because|cannot less)\b/i.test(lower))
    return false;
  // Price / SKU chapter titles
  if (/\b\d+[.,]\d+\b/.test(title) && (title.match(/\d/g) || []).length >= 3)
    return false;
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  if (words.length === 1 && words[0].length < 6) return false;
  const digitWords = words.filter((w) => /\d/.test(w)).length;
  if (digitWords >= 2) return false;
  return true;
}

function parseStartTime(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
      const parts = s.split(":").map((p) => parseInt(p, 10));
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3)
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n > 100_000 ? n / 1000 : n;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 100_000 ? n / 1000 : n;
}
