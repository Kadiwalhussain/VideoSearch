/**
 * Unsupervised topic cuts from MiniLM chunk embeddings already in the index.
 * No network. Valleys in consecutive cosine ≈ a topic change (TextTiling-style).
 */

import type { EmbeddedChunk, TranscriptChunk } from "../types/schema";

export function hasDenseEmbedding(
  c: TranscriptChunk | EmbeddedChunk
): c is EmbeddedChunk {
  const e = (c as EmbeddedChunk).embedding;
  return !!e && typeof e.length === "number" && e.length >= 32;
}

export interface EmbedSection {
  members: EmbeddedChunk[];
  startTime: number;
  endTime: number;
}

export function segmentByEmbedding(
  chunks: EmbeddedChunk[],
  targetSections: number
): EmbedSection[] {
  if (chunks.length === 0) return [];
  const want = Math.max(3, Math.min(targetSections, chunks.length));
  if (chunks.length < 4 || want <= 1) {
    return [
      {
        members: chunks,
        startTime: chunks[0].startTime,
        endTime: lastEnd(chunks),
      },
    ];
  }

  const raw: number[] = [];
  for (let i = 0; i < chunks.length - 1; i++) {
    raw.push(cosine(chunks[i].embedding, chunks[i + 1].embedding));
  }
  const sim = smooth(raw, 2);

  const cuts = pickValleys(sim, want - 1, chunks.length);
  cuts.sort((a, b) => a - b);

  const bounds = [0, ...cuts.map((i) => i + 1), chunks.length];
  const unique = [...new Set(bounds)].sort((a, b) => a - b);

  const out: EmbedSection[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const members = chunks.slice(unique[i], unique[i + 1]);
    if (!members.length) continue;
    out.push({
      members,
      startTime: members[0].startTime,
      endTime: lastEnd(members),
    });
  }
  return out;
}

function pickValleys(sim: number[], need: number, nChunks: number): number[] {
  const minGap = Math.max(2, Math.floor(nChunks / Math.max(need + 1, 2) * 0.55));
  const scored = sim
    .map((v, i) => ({ i, v }))
    .sort((a, b) => a.v - b.v);

  const chosen: number[] = [];
  for (const { i } of scored) {
    if (chosen.length >= need) break;
    if (chosen.some((c) => Math.abs(c - i) < minGap)) continue;
    // skip the very first/last link — those are usually intro/outro noise
    if (i < 1 || i > sim.length - 2) continue;
    chosen.push(i);
  }
  return chosen;
}

function smooth(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      if (j < 0 || j >= values.length) continue;
      s += values[j];
      n += 1;
    }
    return n ? s / n : values[i];
  });
}

function lastEnd(chunks: Array<{ endTime: number; startTime: number }>): number {
  return Math.max(...chunks.map((c) => Math.max(c.endTime, c.startTime)));
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  if (d === 0) return 0;
  const c = dot / d;
  return c < -1 ? -1 : c > 1 ? 1 : c;
}
