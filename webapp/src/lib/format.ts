export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Parse date-ish values from API (ISO string, ms, sec, Date). */
export function toMs(ts?: string | number | Date | null): number | null {
  if (ts == null || ts === "") return null;
  if (ts instanceof Date) {
    const n = ts.getTime();
    return Number.isFinite(n) ? n : null;
  }
  if (typeof ts === "number") {
    if (!Number.isFinite(ts)) return null;
    // seconds vs milliseconds
    return ts < 1e12 ? ts * 1000 : ts;
  }
  const s = String(ts).trim();
  if (!s) return null;
  // pure numeric string
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  const d = new Date(s).getTime();
  return Number.isFinite(d) ? d : null;
}

/** Human relative time: "just now", "3m ago", "2h ago", "5d ago", or locale date. */
export function relTime(ts?: string | number | Date | null): string {
  const d = toMs(ts);
  if (d == null) return "—";
  let diff = Date.now() - d;
  // Future timestamps (clock skew) — treat as now
  if (diff < 0) diff = 0;

  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w}w ago`;
  }
  if (days < 365) {
    const mo = Math.floor(days / 30);
    return `${mo}mo ago`;
  }
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Best activity timestamp for a vault row:
 * max of updated_at, mark times, shot times, library flags.
 */
export function rowActivityMs(row: {
  updated_at?: string | number | Date | null;
  payload?: {
    updatedAt?: number | null;
    savedAt?: number | null;
    watchLaterAt?: number | null;
    highlights?: Array<{ createdAt?: number; updatedAt?: number }>;
    screenshots?: Array<{ createdAt?: number }>;
  };
}): number | null {
  const candidates: number[] = [];
  const push = (v: unknown) => {
    const n = toMs(v as string | number | Date | null);
    if (n != null) candidates.push(n);
  };
  push(row.updated_at);
  const p = row.payload;
  if (p) {
    push(p.updatedAt);
    push(p.savedAt);
    push(p.watchLaterAt);
    for (const h of p.highlights || []) {
      push(h.updatedAt);
      push(h.createdAt);
    }
    for (const s of p.screenshots || []) {
      push(s.createdAt);
    }
  }
  if (!candidates.length) return null;
  return Math.max(...candidates);
}

export function initials(name?: string, email?: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function ytThumb(id: string): string {
  return id
    ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`
    : "";
}

export function ytWatchUrl(
  videoId: string,
  videoUrl?: string,
  startTime?: number
): string {
  const base =
    videoUrl?.includes("youtube.com") || videoUrl?.includes("youtu.be")
      ? videoUrl
      : `https://www.youtube.com/watch?v=${videoId}`;
  if (startTime != null && startTime > 0) {
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}t=${Math.floor(startTime)}s`;
  }
  return base;
}

export function normalizeApiBase(url: string): string {
  let base = (url || "http://127.0.0.1:8787").trim().replace(/\/$/, "");
  try {
    const u = new URL(base);
    if (u.hostname === "localhost") {
      u.hostname = "127.0.0.1";
      base = u.origin;
    }
  } catch {
    /* keep */
  }
  return base.replace(/\/$/, "");
}
