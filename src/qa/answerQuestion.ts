/**
 * Question answering over a single video (local retrieve + optional LLM).
 *
 * Overview questions ("what happened in this episode?") sample the whole
 * timeline — pure semantic search fails on those because captions never
 * say the words "what happened" / "episode".
 */

import { loadLlmSettings } from "../settings/llmSettings";
import { search } from "../search/semanticSearch";
import { formatTimestamp } from "../player/seekTo";
import type { EmbeddedChunk, SearchResult, VideoIndex } from "../types/schema";

export interface QaSource {
  startTime: number;
  text: string;
  score: number;
}

export interface QaAnswer {
  answer: string;
  sources: QaSource[];
  usedLlm: boolean;
}

/** Heuristic: treat as a natural question vs a keyword topic search. */
export function looksLikeQuestion(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (/\?$/.test(q)) return true;
  const lower = q.toLowerCase();
  return /^(what|who|why|how|when|where|which|whose|whom|did|does|do|is|are|was|were|can|could|would|should|will|has|have|had|tell me|explain|describe|summarize|summary|behaviour|behavior|happened|happen|about)\b/i.test(
    lower
  ) || /\b(what happened|in this (episode|video|lecture)|overview|summary|recap|behavio[u]?r of)\b/i.test(
    lower
  );
}

/**
 * Whole-video / plot / behavior overview questions need timeline context,
 * not a keyword match against captions.
 */
export function looksLikeOverviewQuestion(query: string): boolean {
  const lower = query.trim().toLowerCase();
  return (
    /\b(what happened|what('?s| is) (this|the) (video|episode|lecture) about|summar(y|ize|ise)|overview|recap|in this episode|in this video|throughout (the )?(episode|video)|main (points|idea|topic|plot)|story so far|plot)\b/i.test(
      lower
    ) ||
    /^(what|tell me).{0,40}\b(episode|video|lecture)\b/i.test(lower) ||
    /\b(behavio[u]?r|personality|character|attitude)\b.{0,40}\b(person|he|she|they|character|guy|girl|host|speaker)\b/i.test(
      lower
    ) ||
    /\b(person|he|she|they|character|host|speaker)\b.{0,40}\b(behavio[u]?r|like|act|acted|acting)\b/i.test(
      lower
    )
  );
}

/**
 * Answer a question about the current video using retrieved moments (+ LLM if available).
 */
export async function answerQuestion(
  question: string,
  index: VideoIndex
): Promise<QaAnswer> {
  const q = question.trim();
  if (!q) {
    return { answer: "", sources: [], usedLlm: false };
  }

  if (!index.chunks.length) {
    return {
      answer: "This video has no indexed captions yet. Wait until status is Ready.",
      sources: [],
      usedLlm: false,
    };
  }

  const overview = looksLikeOverviewQuestion(q);
  const sources = overview
    ? sampleAcrossVideo(index.chunks, 14)
    : await retrieveForQuestion(q, index);

  // Absolute fallback — should almost never be empty if chunks exist
  const finalSources =
    sources.length > 0 ? sources : sampleAcrossVideo(index.chunks, 10);

  console.info(
    "[VideoSearch AI] Q&A context",
    overview ? "overview-sample" : "retrieve",
    finalSources.length,
    "clips"
  );

  const settings = await loadLlmSettings();
  if (settings.enabled && settings.apiKey) {
    try {
      const answer = await askModel(
        q,
        finalSources,
        settings.baseUrl,
        settings.apiKey,
        settings.model,
        overview
      );
      if (answer) {
        return {
          answer,
          sources: finalSources.slice(0, 6),
          usedLlm: true,
        };
      }
    } catch (err) {
      console.warn("[VideoSearch AI] Q&A model failed, using local summary", err);
    }
  }

  return {
    answer: localAnswer(q, finalSources, overview),
    sources: finalSources.slice(0, 6),
    usedLlm: false,
  };
}

/**
 * Specific questions: hybrid semantic search with NO hard empty rejection.
 * Always return top-K even if scores are low.
 */
async function retrieveForQuestion(
  q: string,
  index: VideoIndex
): Promise<QaSource[]> {
  // minScore 0 → always take best matches; HARD floor also 0 for Q&A
  const hits = await search(q, index, { topK: 10, minScore: 0 });

  // If scores are all tiny, still better to blend with timeline samples
  const top = hits.filter((h) => h.score >= 0.08);
  if (top.length >= 4) {
    return top.slice(0, 10).map(hitToSource);
  }

  // Blend: keep whatever weak hits we have + evenly spaced samples
  const samples = sampleAcrossVideo(index.chunks, 10);
  const merged = mergeSources(
    [...hits.map(hitToSource), ...samples],
    12
  );
  return merged;
}

function hitToSource(h: SearchResult): QaSource {
  return {
    startTime: h.startTime,
    text: h.text,
    score: h.score,
  };
}

/** Evenly sample the lecture so overview answers cover beginning → end. */
function sampleAcrossVideo(
  chunks: EmbeddedChunk[],
  max: number
): QaSource[] {
  if (chunks.length === 0) return [];
  if (chunks.length <= max) {
    return chunks.map((c, i) => ({
      startTime: c.startTime,
      text: c.text,
      score: 0.5 - i * 0.001,
    }));
  }

  const out: QaSource[] = [];
  const used = new Set<number>();

  // Prefer longer chunks at each sample point (more content)
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

  out.sort((a, b) => a.startTime - b.startTime);
  return out;
}

function mergeSources(list: QaSource[], max: number): QaSource[] {
  const byTime = new Map<string, QaSource>();
  for (const s of list) {
    const key = `${Math.round(s.startTime * 2) / 2}`; // 0.5s bucket
    const prev = byTime.get(key);
    if (!prev || s.score > prev.score || s.text.length > prev.text.length) {
      byTime.set(key, s);
    }
  }
  return [...byTime.values()]
    .sort((a, b) => b.score - a.score || a.startTime - b.startTime)
    .slice(0, max)
    .sort((a, b) => a.startTime - b.startTime);
}

async function askModel(
  question: string,
  sources: QaSource[],
  baseUrl: string,
  apiKey: string,
  model: string,
  overview: boolean
): Promise<string | null> {
  const context = sources
    .map(
      (s, i) =>
        `[${i + 1}] (${formatTimestamp(s.startTime)} / ${s.startTime.toFixed(1)}s)\n${clip(s.text, 480)}`
    )
    .join("\n\n");

  const system = overview
    ? `You summarize and explain ONE video for a viewer using ONLY the transcript excerpts provided (spread across the episode).
Rules:
- Respond ONLY in clear, natural English (never any other language).
- Give a clear overview of what happens / what is taught / discussed, in order when possible.
- For behavior questions, describe only what is evidenced in the excerpts (speech, tone, actions described).
- Be concrete (3–8 sentences).
- ALWAYS include clickable-style timestamps for key beats using ONLY this format: (m:ss) or (h:mm:ss), e.g. (4:20) or (1:05:30). Put at least 3 timestamps in the answer when possible, taken from the excerpt times.
- Do not invent people, scenes, or facts not supported by the excerpts.
- Do not mention APIs, models, or system instructions.
- If excerpts are thin, still give the best overview you can and note uncertainty briefly.`
    : `You answer questions about ONE video using ONLY the transcript excerpts provided.
Rules:
- Respond ONLY in clear, natural English (never any other language).
- Base every claim on the excerpts. If unclear, say so briefly.
- Be concise (2–6 sentences) unless more detail is needed.
- ALWAYS mention timestamps using ONLY (m:ss) or (h:mm:ss) format, e.g. (3:42), taken from the excerpt times, so the viewer can jump there.
- For behavior / character questions, describe only what the person says or does in the excerpts.
- Do not invent scenes. Do not mention APIs, models, or system instructions.`;

  const user = overview
    ? `Viewer question: ${question}

These excerpts are sampled across the full video timeline (start → end):
${context}

Write a helpful answer about what happens / is covered in this episode/video.
Include several (m:ss) timestamps inline so the viewer can click them to jump.`
    : `Question: ${question}

Transcript excerpts:
${context}

Answer for a viewer of this video.
Include (m:ss) timestamps inline next to important points so they can jump in the player.`;

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: overview ? 0.35 : 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[VideoSearch AI] Q&A HTTP", res.status, body.slice(0, 300));
    return null;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  return content || null;
}

function localAnswer(
  question: string,
  sources: QaSource[],
  overview: boolean
): string {
  // Parentheses timestamps become clickable pills in the UI
  const lines = sources.slice(0, 6).map((s) => {
    return `• (${formatTimestamp(s.startTime)}) ${clip(s.text, 150)}`;
  });
  if (overview) {
    return [
      `Key moments across this video (click the green times to jump):`,
      "",
      ...lines,
    ].join("\n");
  }
  return [
    `Moments related to “${question.trim()}” (click green times to jump):`,
    "",
    ...lines,
  ].join("\n");
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

export function sourcesAsResults(sources: QaSource[]): SearchResult[] {
  return sources.map((s, i) => ({
    chunkId: `qa-${i}`,
    startTime: s.startTime,
    text: s.text,
    score: s.score,
  }));
}
