export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function relTime(ts?: string | number | null): string {
  if (!ts) return "—";
  const d = new Date(ts).getTime();
  if (!Number.isFinite(d)) return "—";
  const diff = Date.now() - d;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
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
