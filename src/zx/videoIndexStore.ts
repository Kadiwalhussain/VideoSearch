/**
 * IndexedDB cache for fully indexed videos.
 * Store lives on the page origin (youtube.com) so reopening the same video
 * skips re-fetch + re-embed when captionTrackHash matches.
 *
 * Nothing here expires. To keep that cheap, embeddings are stored int8
 * scalar-quantized (one scale per vector, the ScaNN/FAISS "SQ8" idea): a
 * 384-dim vector is 384 bytes instead of ~3 KB as a JS number[], and cosine
 * ranking is effectively unchanged for these normalized vectors. Only under
 * real disk pressure are the least recently used indexes dropped — they are
 * rebuildable from YouTube captions, and letting the origin fill up would
 * risk the browser evicting everything (screenshots included).
 */

import type { EmbeddedChunk, VideoIndex } from "../types/schema";

const DB_NAME = "videosearch-ai";
const DB_VERSION = 2;
const STORE = "videoIndexes";
/** Tiny {videoId, lastUsedAt} rows so LRU decisions never load embeddings */
const META_STORE = "videoIndexMeta";

/** Start evicting old indexes when the origin uses this share of its quota */
const QUOTA_HIGH_WATER = 0.8;
/** Share of cached indexes dropped per eviction pass (oldest first) */
const EVICT_FRACTION = 0.25;

interface IndexMeta {
  videoId: string;
  lastUsedAt: number;
}

/** v2 on-disk chunk: int8 vector + scale. `embedding` is the legacy number[]. */
interface StoredEmbeddedChunk {
  chunkId: string;
  startTime: number;
  endTime: number;
  text: string;
  q?: Int8Array;
  scale?: number;
  embedding?: number[];
}

interface StoredVideoIndex {
  videoId: string;
  captionTrackHash: string;
  chunks: StoredEmbeddedChunk[];
  indexedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "videoId" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "videoId" });
      }
    };
  });
}

function quantize(v: Float32Array): { q: Int8Array; scale: number } {
  let maxAbs = 0;
  for (let i = 0; i < v.length; i++) {
    const a = Math.abs(v[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs > 0 ? maxAbs / 127 : 1;
  const q = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = Math.round(v[i] / scale);
  return { q, scale };
}

function dequantize(q: Int8Array, scale: number): Float32Array {
  const v = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) v[i] = q[i] * scale;
  return v;
}

function toStored(index: VideoIndex): StoredVideoIndex {
  return {
    videoId: index.videoId,
    captionTrackHash: index.captionTrackHash,
    indexedAt: index.indexedAt,
    chunks: index.chunks.map((c) => ({
      chunkId: c.chunkId,
      startTime: c.startTime,
      endTime: c.endTime,
      text: c.text,
      ...quantize(c.embedding),
    })),
  };
}

function fromStored(stored: StoredVideoIndex): VideoIndex {
  const chunks: EmbeddedChunk[] = stored.chunks.map((c) => ({
    chunkId: c.chunkId,
    startTime: c.startTime,
    endTime: c.endTime,
    text: c.text,
    embedding: c.q
      ? dequantize(c.q, c.scale ?? 1)
      : Float32Array.from(c.embedding ?? []),
  }));
  return {
    videoId: stored.videoId,
    captionTrackHash: stored.captionTrackHash,
    indexedAt: stored.indexedAt,
    chunks,
  };
}

function isLegacy(stored: StoredVideoIndex): boolean {
  return stored.chunks.some((c) => !c.q && Array.isArray(c.embedding));
}

async function writeIndex(stored: StoredVideoIndex): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, META_STORE], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("saveVideoIndex failed"));
      tx.objectStore(STORE).put(stored);
      const meta: IndexMeta = { videoId: stored.videoId, lastUsedAt: Date.now() };
      tx.objectStore(META_STORE).put(meta);
    });
  } finally {
    db.close();
  }
}

export async function saveVideoIndex(index: VideoIndex): Promise<void> {
  await writeIndex(toStored(index));
  console.info(
    "[VideoSearch AI] IndexedDB saved:",
    index.videoId,
    index.chunks.length,
    "chunks"
  );
  void evictIfLowOnDisk(index.videoId).catch(() => undefined);
}

async function getStored(videoId: string): Promise<StoredVideoIndex | undefined> {
  const db = await openDb();
  try {
    return await new Promise<StoredVideoIndex | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(videoId);
        req.onsuccess = () => resolve(req.result as StoredVideoIndex | undefined);
        req.onerror = () =>
          reject(req.error ?? new Error("getVideoIndex failed"));
      }
    );
  } finally {
    db.close();
  }
}

export async function getVideoIndex(
  videoId: string
): Promise<VideoIndex | null> {
  const stored = await getStored(videoId);
  return stored ? fromStored(stored) : null;
}

/** Bump recency so disk-pressure eviction keeps what the user actually opens. */
async function touchVideoIndex(videoId: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(META_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("touch failed"));
      const meta: IndexMeta = { videoId, lastUsedAt: Date.now() };
      tx.objectStore(META_STORE).put(meta);
    });
  } finally {
    db.close();
  }
}

/**
 * Drop the least recently used indexes only when the origin is near its
 * storage quota. Never touches `keepId` (the one just written/opened).
 */
async function evictIfLowOnDisk(keepId?: string): Promise<void> {
  const est = await navigator.storage?.estimate?.();
  if (!est?.quota || !est.usage) return;
  if (est.usage / est.quota < QUOTA_HIGH_WATER) return;

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE, META_STORE], "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("evict failed"));
      const store = tx.objectStore(STORE);
      const metaStore = tx.objectStore(META_STORE);
      const keysReq = store.getAllKeys();
      const metaReq = metaStore.getAll();
      let pending = 2;
      const done = () => {
        if (--pending > 0) return;
        const lastUsed = new Map(
          (metaReq.result as IndexMeta[]).map((m) => [m.videoId, m.lastUsedAt])
        );
        // Entries without meta (pre-v2) count as oldest
        const ids = keysReq.result
          .map(String)
          .filter((id) => id !== keepId)
          .sort((a, b) => (lastUsed.get(a) ?? 0) - (lastUsed.get(b) ?? 0));
        const n = Math.max(1, Math.ceil(ids.length * EVICT_FRACTION));
        for (const id of ids.slice(0, n)) {
          store.delete(id);
          metaStore.delete(id);
        }
        console.info("[VideoSearch AI] Low disk — evicted", Math.min(n, ids.length), "old indexes");
      };
      keysReq.onsuccess = done;
      metaReq.onsuccess = done;
    });
  } finally {
    db.close();
  }
}

/**
 * Housekeeping on page load: ask the browser not to evict this origin's
 * data under pressure, and shed old indexes only if disk is actually tight.
 */
export async function maintainVideoIndexes(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best-effort */
  }
  await evictIfLowOnDisk();
}

/**
 * Return cached index only if caption track hash still matches.
 * Stale hashes → null (caller should re-index).
 */
export async function getValidVideoIndex(
  videoId: string,
  captionTrackHash: string
): Promise<VideoIndex | null> {
  const stored = await getStored(videoId);
  if (!stored) return null;
  if (stored.captionTrackHash !== captionTrackHash) {
    console.info(
      "[VideoSearch AI] Cache stale (caption hash changed) — re-indexing",
      videoId
    );
    return null;
  }
  const index = fromStored(stored);
  if (isLegacy(stored)) {
    // Compact old number[] records the first time they're reopened
    void writeIndex(toStored(index)).catch(() => undefined);
  } else {
    void touchVideoIndex(videoId).catch(() => undefined);
  }
  return index;
}
