/**
 * IndexedDB cache for fully indexed videos.
 * Store lives on the page origin (youtube.com) so reopening the same video
 * skips re-fetch + re-embed when captionTrackHash matches.
 */

import type { EmbeddedChunk, VideoIndex } from "../types/schema";

const DB_NAME = "videosearch-ai";
const DB_VERSION = 1;
const STORE = "videoIndexes";

/** Serializable form — Float32Array → number[] for structured clone */
interface StoredEmbeddedChunk {
  chunkId: string;
  startTime: number;
  endTime: number;
  text: string;
  embedding: number[];
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
    };
  });
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
      embedding: Array.from(c.embedding),
    })),
  };
}

function fromStored(stored: StoredVideoIndex): VideoIndex {
  const chunks: EmbeddedChunk[] = stored.chunks.map((c) => ({
    chunkId: c.chunkId,
    startTime: c.startTime,
    endTime: c.endTime,
    text: c.text,
    embedding: Float32Array.from(c.embedding),
  }));
  return {
    videoId: stored.videoId,
    captionTrackHash: stored.captionTrackHash,
    indexedAt: stored.indexedAt,
    chunks,
  };
}

export async function saveVideoIndex(index: VideoIndex): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("saveVideoIndex failed"));
      tx.objectStore(STORE).put(toStored(index));
    });
    console.info(
      "[VideoSearch AI] IndexedDB saved:",
      index.videoId,
      index.chunks.length,
      "chunks"
    );
  } finally {
    db.close();
  }
}

export async function getVideoIndex(
  videoId: string
): Promise<VideoIndex | null> {
  const db = await openDb();
  try {
    const stored = await new Promise<StoredVideoIndex | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(videoId);
        req.onsuccess = () => resolve(req.result as StoredVideoIndex | undefined);
        req.onerror = () =>
          reject(req.error ?? new Error("getVideoIndex failed"));
      }
    );
    if (!stored) return null;
    return fromStored(stored);
  } finally {
    db.close();
  }
}

/**
 * Return cached index only if caption track hash still matches.
 * Stale hashes → null (caller should re-index).
 */
export async function getValidVideoIndex(
  videoId: string,
  captionTrackHash: string
): Promise<VideoIndex | null> {
  const cached = await getVideoIndex(videoId);
  if (!cached) return null;
  if (cached.captionTrackHash !== captionTrackHash) {
    console.info(
      "[VideoSearch AI] Cache stale (caption hash changed) — re-indexing",
      videoId
    );
    return null;
  }
  return cached;
}
