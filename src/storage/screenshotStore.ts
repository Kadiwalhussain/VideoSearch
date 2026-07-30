/**
 * IndexedDB store for video frame screenshots (too large for chrome.storage).
 */

export interface VideoScreenshot {
  id: string;
  videoId: string;
  /** Playback time when captured */
  videoTime: number;
  /** JPEG data URL */
  dataUrl: string;
  width: number;
  height: number;
  note: string;
  /** Optional link to a highlight id */
  highlightId?: string;
  createdAt: number;
  /** Set after successful cloud upload */
  cloudUrl?: string;
  syncedAt?: number;
}

const DB_NAME = "videosearch-ai-vault";
const DB_VERSION = 1;
const STORE = "screenshots";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("videoId", "videoId", { unique: false });
        os.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

export function newScreenshotId(): string {
  return `ss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveScreenshot(
  shot: VideoScreenshot
): Promise<VideoScreenshot> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(shot);
  });
  db.close();
  return shot;
}

export async function loadScreenshots(
  videoId: string
): Promise<VideoScreenshot[]> {
  const db = await openDb();
  const list = await new Promise<VideoScreenshot[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("videoId");
    const req = idx.getAll(videoId);
    req.onsuccess = () => {
      const rows = (req.result as VideoScreenshot[]) || [];
      resolve(rows.sort((a, b) => a.videoTime - b.videoTime));
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return list;
}

export async function loadAllScreenshots(): Promise<VideoScreenshot[]> {
  const db = await openDb();
  const list = await new Promise<VideoScreenshot[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as VideoScreenshot[]) || [];
      resolve(rows.sort((a, b) => b.createdAt - a.createdAt));
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return list;
}

export async function deleteScreenshot(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).delete(id);
  });
  db.close();
}

export async function updateScreenshot(
  id: string,
  patch: Partial<Pick<VideoScreenshot, "note" | "cloudUrl" | "syncedAt">>
): Promise<VideoScreenshot | null> {
  const db = await openDb();
  const existing = await new Promise<VideoScreenshot | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as VideoScreenshot | undefined);
      req.onerror = () => reject(req.error);
    }
  );
  if (!existing) {
    db.close();
    return null;
  }
  const next = { ...existing, ...patch };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE).put(next);
  });
  db.close();
  return next;
}
