/**
 * LLM-powered main topic extraction (optional, user API key).
 * Long videos request 15–30+ topics spanning the full timeline.
 */

import { loadLlmSettings } from "../settings/llmSettings";
import type { TranscriptChunk } from "../types/schema";
import { isGoodUserLabel, type VideoTopic } from "./extractTopics";
import { estimateDurationSec, topicBudget } from "./topicBudget";

/** v4: human chapter-style topics; reject brand spam */
const TOPIC_CACHE_PREFIX = "vsa_topics_v4_";

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
  const settings = await loadLlmSettings();
  if (!settings.enabled || !settings.apiKey) return null;

  const durationSec = estimateDurationSec(chunks);
  const budget = topicBudget(chunks.length, durationSec);

  const cached = await loadCachedTopics(videoId, captionTrackHash);
  // Accept cache only if enough quality topics (skip old brand-spam caches)
  if (cached && cached.length >= Math.min(budget, 12)) {
    const cleaned = cached.filter((t) => isGoodUserLabel(t.label));
    if (cleaned.length >= Math.min(12, budget * 0.6)) {
      console.info(
        "[VideoSearch AI] Smart topics cache hit",
        videoId,
        cleaned.length
      );
      return cleaned.slice(0, budget);
    }
  }

  // More excerpts for longer videos so the model can cover the full arc
  const excerptCount = Math.min(
    64,
    Math.max(32, Math.round(chunks.length * 0.45))
  );
  const excerpts = sampleExcerpts(chunks, excerptCount);
  if (excerpts.length === 0) return null;

  const minTopics = Math.max(15, Math.min(budget, budget - 2));
  const maxTopics = budget;

  const system = `You create a CHAPTER GUIDE for a long video so a human can navigate it easily.

Return ONLY valid JSON (no markdown) — an array of ${minTopics} to ${maxTopics} topics.

Each topic title must be something a student would understand at a glance, like:
- "Introduction and agenda"
- "Setting up the project"
- "How authentication works"
- "Common errors and fixes"
NOT brand spam or repeated words.

FORBIDDEN titles (never output these styles):
- "Youtube Youtube Youtube"
- "Netflix Gmail Google"
- "Gmail Gmail Gmail"
- "Python Python"
- Random ASR junk, emails, "Skip Skip Scy"

Schema:
[
  {
    "title": "Clear 3-6 word chapter title",
    "query": "search phrase for this chapter",
    "startTime": 123.4
  }
]

Rules:
- Write like YouTube chapters / table of contents — human, specific, useful.
- Spread across the FULL timeline (start, middle, end).
- startTime = seconds (number), e.g. 5:30 → 330. Use times near the excerpts.
- Titles must be unique and non-overlapping in meaning.
- Prefer teaching concepts / story beats over product names alone.
- If brands appear, pair them with an action/concept (e.g. "Integrating Gmail API"), never brands only.`;

  const user = `Video id: ${videoId}
Approx duration: ${Math.round(durationSec / 60)} minutes
Required: ${minTopics}–${maxTopics} clear chapter titles

Excerpts (seconds | mm:ss | text):
${excerpts.map((e) => `${e.t.toFixed(1)} | ${formatTs(e.t)} | ${e.text}`).join("\n")}

Return JSON array of human-readable chapter topics now.`;

  const url = `${settings.baseUrl}/chat/completions`;

  try {
    // Long videos may need a second pass if the model returns too few
    let topics = await requestTopics(
      url,
      settings.apiKey,
      settings.model,
      system,
      user
    );

    if (topics.length < minTopics && topics.length > 0) {
      // Second pass: fill gaps across timeline
      const more = await requestTopics(
        url,
        settings.apiKey,
        settings.model,
        system,
        `${user}

IMPORTANT: You previously returned only ${topics.length} topics. Expand to at least ${minTopics}.
Already covered (do not repeat): ${topics.map((t) => t.label).join("; ")}
Add NEW topics from middle and late sections of the video as well.`
      );
      topics = dedupeTopics([...topics, ...more]).slice(0, maxTopics);
    }

    if (!topics.length) {
      console.warn("[VideoSearch AI] Smart topics: empty/unparseable response");
      return null;
    }

    // Prefer chronological display
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
  url: string,
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<VideoTopic[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      "[VideoSearch AI] Smart topics HTTP",
      res.status,
      body.slice(0, 200)
    );
    return [];
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseTopicsJson(content);
}

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
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length < 1) return false;
  if (words.length === 1 && words[0].length < 6) return false;
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
