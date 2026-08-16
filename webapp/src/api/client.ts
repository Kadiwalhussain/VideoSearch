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
    const { origin } = window.location;
    if (origin.includes("8787") || origin.includes("5173")) {
      // Vite dev proxies /api; production serves under same origin
      if (origin.includes("5173")) return "http://127.0.0.1:8787";
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

export function mediaSrc(
  url: string | undefined,
  token?: string
): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
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
