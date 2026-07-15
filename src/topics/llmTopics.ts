/**
 * LLM-powered main topic extraction (optional, user API key).
 * Sends only short timestamped excerpts — not for chat/RAG product surface.
 */

import { loadLlmSettings } from "../settings/llmSettings";
import type { TranscriptChunk } from "../types/schema";
import type { VideoTopic } from "./extractTopics";

/** v2: topics snapped to real caption chunk times */
const TOPIC_CACHE_PREFIX = "vsa_topics_v2_";

export async function loadCachedTopics(
  videoId: string,
  captionTrackHash: string
): Promise<VideoTopic[] | null> {
  try {
    const key = TOPIC_CACHE_PREFIX + videoId;
    const data = await chrome.storage.local.get(key);
    const raw = data[key] as
      | { hash: string; topics: VideoTopic[] }
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
 * Ask the LLM for 5–8 big lecture themes with timestamps.
 * Returns null if no key / request failed (caller falls back to local).
 */
export async function extractTopicsWithLlm(
  videoId: string,
  chunks: TranscriptChunk[],
  captionTrackHash: string
): Promise<VideoTopic[] | null> {
  const settings = await loadLlmSettings();
  if (!settings.enabled || !settings.apiKey) return null;

  const cached = await loadCachedTopics(videoId, captionTrackHash);
  if (cached) {
    console.info("[VideoSearch AI] Smart topics cache hit", videoId);
    return cached;
  }

  const excerpts = sampleExcerpts(chunks, 28);
  if (excerpts.length === 0) return null;

  const system = `You analyze educational video transcripts.
Return ONLY valid JSON (no markdown) as an array of 5 to 8 MAIN topics covered in the video.
Each topic must be a real subject/theme a student would search for — NOT filler words, NOT random ASR fragments, NOT single generic words like "value" or "because".

Schema:
[
  {
    "title": "Short clear topic name (2-5 words)",
    "query": "natural search query for this topic",
    "startTime": 123.4
  }
]

Rules:
- Cover the whole video timeline (early, middle, late), not only the start
- startTime MUST be a number in SECONDS (not mm:ss, not milliseconds). Example: 5 minutes 30 seconds → 330
- Use a startTime that appears near one of the excerpt timestamps below
- Prefer substantive themes (e.g. "Structured Output", "Pydantic Validation", "Base Model")
- Reject garbage like "Include Any Human", "Zero Cannot Less", email fragments, "Specify Anybody"`;

  const user = `Video id: ${videoId}

Timestamped excerpts (time_seconds | mm:ss | text):
${excerpts.map((e) => `${e.t.toFixed(1)} | ${formatTs(e.t)} | ${e.text}`).join("\n")}

Return the JSON array of main topics now. startTime values must be seconds (numbers).`;

  const url = `${settings.baseUrl}/chat/completions`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
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
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const topics = parseTopicsJson(content);
    if (!topics.length) {
      console.warn("[VideoSearch AI] Smart topics: empty/unparseable response");
      return null;
    }

    await saveCachedTopics(videoId, captionTrackHash, topics);
    console.info(
      "[VideoSearch AI] Smart topics:",
      topics.map((t) => t.label)
    );
    return topics;
  } catch (err) {
    console.error("[VideoSearch AI] Smart topics failed:", err);
    return null;
  }
}

function sampleExcerpts(
  chunks: TranscriptChunk[],
  max: number
): Array<{ t: number; text: string }> {
  if (chunks.length === 0) return [];
  if (chunks.length <= max) {
    return chunks.map((c) => ({
      t: c.startTime,
      text: clip(c.text, 180),
    }));
  }
  const out: Array<{ t: number; text: string }> = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.floor((i * (chunks.length - 1)) / (max - 1));
    const c = chunks[idx];
    out.push({ t: c.startTime, text: clip(c.text, 180) });
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
  // Strip markdown fences if model ignores instructions
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
      topics.push({
        label: title,
        query: query || title,
        startTime,
        kind: "phrase",
        score: 10,
      });
    }
    return topics.slice(0, 8);
  } catch {
    return [];
  }
}

function looksLikeRealTopic(title: string): boolean {
  const lower = title.toLowerCase();
  // Reject obvious ASR garbage patterns
  if (/@|www\.|\.com|\.org|http/i.test(title)) return false;
  if (/\b(anybody|someone|something|because|cannot less)\b/i.test(lower))
    return false;
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length < 1) return false;
  // Prefer multi-word or long technical single token
  if (words.length === 1 && words[0].length < 6) return false;
  return true;
}

/** Accept seconds, ms, or "m:ss" / "h:mm:ss" from the model. */
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
