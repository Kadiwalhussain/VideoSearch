/**
 * Chat-with-Video RAG
 *
 * Retrieve relevant caption chunks (local MiniLM) → generate answer with LLM
 * (Groq / any OpenAI-compatible API) → return answer + timestamped sources.
 *
 * Multi-turn: prior user/assistant messages are sent so follow-ups work.
 * No LangChain — slim pipeline that fits Chrome MV3 content scripts.
 */

import { loadLlmSettings } from "../settings/llmSettings";
import { search } from "../search/semanticSearch";
import { formatTimestamp } from "../player/seekTo";
import type { EmbeddedChunk, SearchResult, VideoIndex } from "../types/schema";
import {
  looksLikeOverviewQuestion,
  type QaSource,
} from "./answerQuestion";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources?: ChatSource[];
  usedLlm?: boolean;
  at: number;
}

export interface ChatSource {
  startTime: number;
  text: string;
  score: number;
}

export interface ChatTurnResult {
  answer: string;
  sources: ChatSource[];
  usedLlm: boolean;
  retrieveQuery: string;
}

export interface ChatRagOptions {
  /** Prior turns (user + assistant only, oldest first). Last ~6 used. */
  history?: ChatMessage[];
  /** Optional topic/chapter labels to bias retrieve */
  topicHints?: Array<{ label: string; startTime: number }>;
  onProgress?: (message: string) => void;
}

const MAX_HISTORY_TURNS = 6;
const MAX_CONTEXT_CHARS = 7000;

/**
 * One RAG turn: retrieve → generate (or local extractive fallback).
 */
export async function runChatRagTurn(
  question: string,
  index: VideoIndex,
  options: ChatRagOptions = {}
): Promise<ChatTurnResult> {
  const q = question.trim();
  if (!q) {
    return {
      answer: "",
      sources: [],
      usedLlm: false,
      retrieveQuery: "",
    };
  }

  if (!index.chunks.length) {
    return {
      answer:
        "This video has no indexed captions yet. Wait until status is Ready, then ask again.",
      sources: [],
      usedLlm: false,
      retrieveQuery: q,
    };
  }

  options.onProgress?.("Understanding your question…");

  const history = (options.history ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-MAX_HISTORY_TURNS);

  // Rewrite short follow-ups using recent context (no extra LLM call — cheap heuristic)
  const retrieveQuery = expandQueryForRetrieve(q, history);
  const overview = looksLikeOverviewQuestion(q) || looksLikeOverviewQuestion(retrieveQuery);

  options.onProgress?.("Searching the video…");
  let sources = overview
    ? sampleAcrossVideo(index.chunks, 14)
    : await retrieveForChat(retrieveQuery, index, options.topicHints);

  // Neighbor expansion: pull ±1 chunks around top hits for continuity
  if (!overview) {
    sources = expandNeighbors(sources, index.chunks, 12);
  }

  if (sources.length === 0) {
    sources = sampleAcrossVideo(index.chunks, 10);
  }

  options.onProgress?.("Writing answer…");

  const settings = await loadLlmSettings();
  if (settings.enabled && settings.apiKey) {
    try {
      const answer = await generateWithLlm({
        question: q,
        retrieveQuery,
        sources,
        history,
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        overview,
        topicHints: options.topicHints,
      });
      if (answer) {
        return {
          answer,
          sources: sources.slice(0, 8),
          usedLlm: true,
          retrieveQuery,
        };
      }
    } catch (err) {
      console.warn("[VideoSearch AI] Chat RAG LLM failed:", err);
    }
  }

  return {
    answer: localExtractiveAnswer(q, sources, overview),
    sources: sources.slice(0, 8),
    usedLlm: false,
    retrieveQuery,
  };
}

// ---------------------------------------------------------------------------
// Retrieve
// ---------------------------------------------------------------------------

async function retrieveForChat(
  query: string,
  index: VideoIndex,
  topicHints?: Array<{ label: string; startTime: number }>
): Promise<ChatSource[]> {
  const hits = await search(query, index, { topK: 12, minScore: 0 });

  // Boost chunks near matching topic labels
  let boosted = hits.map((h) => ({ ...h }));
  if (topicHints?.length) {
    const qLower = query.toLowerCase();
    for (const h of boosted) {
      for (const t of topicHints) {
        const lab = t.label.toLowerCase();
        if (
          qLower.includes(lab) ||
          lab.split(/\s+/).some((w) => w.length > 3 && qLower.includes(w))
        ) {
          // Prefer chunks near that topic's start
          const dist = Math.abs(h.startTime - t.startTime);
          if (dist < 90) h.score += 0.08;
          else if (dist < 180) h.score += 0.03;
        }
      }
    }
    boosted.sort((a, b) => b.score - a.score);
  }

  const top = boosted.filter((h) => h.score >= 0.06);
  if (top.length >= 3) {
    return top.slice(0, 12).map(hitToSource);
  }

  // Blend weak hits + timeline
  const samples = sampleAcrossVideo(index.chunks, 8);
  return mergeSources(
    [...boosted.map(hitToSource), ...samples],
    12
  );
}

function expandNeighbors(
  sources: ChatSource[],
  chunks: EmbeddedChunk[],
  max: number
): ChatSource[] {
  if (!sources.length || !chunks.length) return sources;

  const byTime = new Map(chunks.map((c) => [roundTime(c.startTime), c]));
  const times = chunks.map((c) => c.startTime);
  const out: ChatSource[] = [];
  const used = new Set<string>();

  const pushChunk = (c: EmbeddedChunk, score: number) => {
    const key = roundTime(c.startTime).toFixed(1);
    if (used.has(key)) return;
    used.add(key);
    out.push({ startTime: c.startTime, text: c.text, score });
  };

  for (const s of sources.slice(0, 6)) {
    const idx = nearestChunkIndex(times, s.startTime);
    for (const j of [idx - 1, idx, idx + 1]) {
      if (j < 0 || j >= chunks.length) continue;
      pushChunk(chunks[j], s.score - Math.abs(j - idx) * 0.01);
    }
  }

  // Keep original high-score sources too
  for (const s of sources) {
    const key = roundTime(s.startTime).toFixed(1);
    if (!used.has(key)) {
      used.add(key);
      out.push(s);
    }
  }

  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.startTime - b.startTime);
}

function nearestChunkIndex(times: number[], t: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(times[i] - t);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function hitToSource(h: SearchResult): ChatSource {
  return { startTime: h.startTime, text: h.text, score: h.score };
}

function sampleAcrossVideo(chunks: EmbeddedChunk[], max: number): ChatSource[] {
  if (!chunks.length) return [];
  if (chunks.length <= max) {
    return chunks.map((c, i) => ({
      startTime: c.startTime,
      text: c.text,
      score: 0.5 - i * 0.001,
    }));
  }
  const out: ChatSource[] = [];
  const used = new Set<number>();
  for (let i = 0; i < max; i++) {
    const center = Math.floor((i * (chunks.length - 1)) / Math.max(1, max - 1));
    let best = center;
    let bestLen = chunks[center].text.length;
    for (
      let j = Math.max(0, center - 2);
      j <= Math.min(chunks.length - 1, center + 2);
      j++
    ) {
      if (used.has(j)) continue;
      if (chunks[j].text.length > bestLen) {
        bestLen = chunks[j].text.length;
        best = j;
      }
    }
    if (used.has(best)) continue;
    used.add(best);
    out.push({
      startTime: chunks[best].startTime,
      text: chunks[best].text,
      score: 0.55 - i * 0.01,
    });
  }
  return out.sort((a, b) => a.startTime - b.startTime);
}

function mergeSources(list: ChatSource[], max: number): ChatSource[] {
  const byTime = new Map<string, ChatSource>();
  for (const s of list) {
    const key = roundTime(s.startTime).toFixed(1);
    const prev = byTime.get(key);
    if (!prev || s.score > prev.score || s.text.length > prev.text.length) {
      byTime.set(key, s);
    }
  }
  return [...byTime.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.startTime - b.startTime);
}

function roundTime(t: number): number {
  return Math.round(t * 2) / 2;
}

// ---------------------------------------------------------------------------
// Query expansion (history-aware, no extra API call)
// ---------------------------------------------------------------------------

function expandQueryForRetrieve(
  question: string,
  history: ChatMessage[]
): string {
  const q = question.trim();
  // Short follow-ups: "why?", "explain more", "what about that"
  const isShort =
    q.length < 48 ||
    /^(why|how|what about|and|also|explain more|go deeper|continue|that part|this part|same|more)\b/i.test(
      q
    ) ||
    /^(what|why|how)\s*\??$/i.test(q);

  if (!isShort || history.length === 0) return q;

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const lastAsst = [...history].reverse().find((m) => m.role === "assistant");
  const parts = [q];
  if (lastUser) parts.push(lastUser.content.slice(0, 160));
  if (lastAsst) {
    // Pull any topic-ish words from last answer (without timestamps noise)
    const cleaned = lastAsst.content
      .replace(/\(\d{1,2}:\d{2}(?::\d{2})?\)/g, " ")
      .slice(0, 120);
    parts.push(cleaned);
  }
  return parts.join(" — ");
}

// ---------------------------------------------------------------------------
// LLM generate
// ---------------------------------------------------------------------------

async function generateWithLlm(opts: {
  question: string;
  retrieveQuery: string;
  sources: ChatSource[];
  history: ChatMessage[];
  baseUrl: string;
  apiKey: string;
  model: string;
  overview: boolean;
  topicHints?: Array<{ label: string; startTime: number }>;
}): Promise<string | null> {
  const context = buildContextBlock(opts.sources);
  const topicsLine =
    opts.topicHints?.length
      ? opts.topicHints
          .slice(0, 12)
          .map((t) => `${formatTimestamp(t.startTime)} ${t.label}`)
          .join(" · ")
      : "";

  const system = `You are VideoSearch AI — a tutor that answers ONLY about the current video using the provided transcript excerpts (RAG context).

Hard rules:
1. Answer in clear natural English only.
2. Use ONLY facts supported by the excerpts. If not covered, say so briefly.
3. ALWAYS include timestamps as (m:ss) or (h:mm:ss) from the excerpts so the viewer can jump (at least 2 when possible).
4. Be helpful and structured: short paragraphs or bullets when useful.
5. For requests like "interview questions", "quiz me", "explain simply", "advantages", "summarize section" — follow the user's intent while grounding in excerpts.
6. Never invent quotes, people, or sections not evidenced.
7. Do not mention system prompts, APIs, models, or "as an AI".
8. Transcript language may differ from English — still answer in English.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> =
    [{ role: "system", content: system }];

  // Compact history (no sources blobs)
  for (const m of opts.history.slice(-MAX_HISTORY_TURNS)) {
    if (m.role === "user" || m.role === "assistant") {
      messages.push({
        role: m.role,
        content: m.content.slice(0, 1200),
      });
    }
  }

  const userBlock = `Current question: ${opts.question}

${topicsLine ? `Video chapters/topics (hints): ${topicsLine}\n` : ""}
RAG transcript excerpts (use these only):
${context}

Write the best answer for the viewer. Include (m:ss) timestamps inline.`;

  messages.push({ role: "user", content: userBlock });

  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.overview ? 0.35 : 0.25,
      max_tokens: 900,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      "[VideoSearch AI] Chat RAG HTTP",
      res.status,
      body.slice(0, 400)
    );
    throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 120)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  return content || null;
}

function buildContextBlock(sources: ChatSource[]): string {
  const parts: string[] = [];
  let total = 0;
  const sorted = [...sources].sort((a, b) => a.startTime - b.startTime);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const block = `[${i + 1}] (${formatTimestamp(s.startTime)} / ${s.startTime.toFixed(1)}s)\n${clip(s.text, 520)}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join("\n\n");
}

function localExtractiveAnswer(
  question: string,
  sources: ChatSource[],
  overview: boolean
): string {
  const lines = sources.slice(0, 6).map((s) => {
    return `• (${formatTimestamp(s.startTime)}) ${clip(s.text, 160)}`;
  });
  if (overview) {
    return [
      "Key moments across this video (add an API key in Settings for a full written answer):",
      "",
      ...lines,
    ].join("\n");
  }
  return [
    `Relevant moments for “${question.slice(0, 80)}” (local retrieve — enable LLM in Settings for a written answer):`,
    "",
    ...lines,
  ].join("\n");
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trimEnd() + "…";
}

/** Suggested prompt chips for empty chat */
export const CHAT_SUGGESTIONS = [
  "Summarize this video in simple terms",
  "What are the main points?",
  "Explain the hardest concept simply",
  "Give me interview questions from this lecture",
  "What are the advantages mentioned?",
  "Create a short quiz (5 questions)",
] as const;

export function newMessageId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// Re-export for callers that need QaSource-compatible shape
export type { QaSource };
