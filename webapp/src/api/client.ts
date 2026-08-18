import { normalizeApiBase } from "../lib/format";
import type { Session } from "../types";

const LS = "vsa_vault_session_v3";

export function loadSession(): Session | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LS) || "null");
    if (!raw?.token || !raw?.url) return null;
    return {
      url: normalizeApiBase(raw.url),
      token: raw.token,
      user: raw.user || {},
    };
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(
    LS,
    JSON.stringify({
      url: normalizeApiBase(s.url),
      token: s.token,
      user: s.user,
    })
  );
}

export function clearSession(): void {
  localStorage.removeItem(LS);
}

export function defaultApiUrl(): string {
  if (typeof window !== "undefined") {
    const { origin, port } = window.location;
    // Vite dev (5173) proxies /api → vault, so same-origin works for public share
    // and avoids hard-coding 127.0.0.1 for other devices.
    if (port === "5173" || origin.includes(":5173")) {
      return origin; // e.g. http://127.0.0.1:5173 — proxy handles /api
    }
    // Production / vault host (8787 or custom domain): same origin serves API + /app
    if (
      port === "8787" ||
      origin.includes(":8787") ||
      !origin.includes("localhost")
    ) {
      return origin;
    }
  }
  return "http://127.0.0.1:8787";
}

export async function apiFetch(
  base: string,
  path: string,
  opts: RequestInit & { token?: string } = {}
): Promise<Response> {
  const url = `${normalizeApiBase(base)}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(opts.headers || {});
  if (!headers.has("Content-Type") && opts.body) {
    headers.set("Content-Type", "application/json");
  }
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);
  try {
    return await fetch(url, { ...opts, headers });
  } catch {
    throw new Error(
      "Cannot reach vault API. Start: cd server && npm run start:always → http://127.0.0.1:8787"
    );
  }
}

export function shotSrc(
  videoId: string,
  shot: { id?: string; imageUrl?: string; dataUrl?: string },
  token?: string
): string {
  if (shot.dataUrl && shot.dataUrl.startsWith("data:")) return shot.dataUrl;
  const raw = shot.imageUrl || "";
  const pointer =
    !raw ||
    raw.startsWith("account:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("chrome-extension:");
  if (pointer && videoId && shot.id) {
    return mediaSrc(
      `/api/vault/shot/${encodeURIComponent(videoId)}/${encodeURIComponent(shot.id)}`,
      token
    );
  }
  return mediaSrc(raw, token);
}

export function mediaSrc(
  url: string | undefined,
  token?: string
): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.startsWith("account:") || url.startsWith("blob:")) return "";
  // <img> cannot send Authorization headers — attach JWT as query for media routes
  const needsToken =
    token &&
    !url.includes("token=") &&
    (url.includes("/api/media/") || url.includes("/api/vault/shot/"));
  if (needsToken) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }
  return url;
}
