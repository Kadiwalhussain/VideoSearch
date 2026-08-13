/**
 * Cloud vault + account settings (MongoDB vault API with JWT auth).
 */

import { vaultHttp } from "../net/vaultHttp";

export interface CloudSettings {
  /** API base URL */
  projectUrl: string;
  /** JWT from login (preferred) or legacy service key */
  apiKey: string;
  /** userId from account */
  userId: string;
  email: string;
  displayName: string;
  /** true when JWT present + URL set */
  enabled: boolean;
  videoCount?: number;
  highlightCount?: number;
  screenshotCount?: number;
}

const STORAGE_KEY = "vsa_cloud_settings";
const SETTINGS_VERSION = 4; // proper account auth UI

export const DEFAULT_CLOUD_SETTINGS: CloudSettings = {
  // Prefer 127.0.0.1 — Chrome often resolves "localhost" to ::1, while the
  // Node vault may only accept IPv4 unless dual-stack is enabled.
  projectUrl: "http://127.0.0.1:8787",
  apiKey: "",
  userId: "",
  email: "",
  displayName: "",
  enabled: false,
  videoCount: 0,
  highlightCount: 0,
  screenshotCount: 0,
};

/** Normalize vault base URL (strip trailing slash; map localhost → 127.0.0.1). */
export function normalizeVaultUrl(url: string): string {
  let base = (url || DEFAULT_CLOUD_SETTINGS.projectUrl).trim().replace(/\/$/, "");
  if (!base) base = DEFAULT_CLOUD_SETTINGS.projectUrl;
  try {
    const u = new URL(base);
    if (u.hostname === "localhost") {
      u.hostname = "127.0.0.1";
      base = u.origin;
    }
  } catch {
    /* keep as-is */
  }
  return base.replace(/\/$/, "");
}

/** Alternate host for retry when localhost/127.0.0.1 fails. */
export function vaultUrlAlternates(url: string): string[] {
  const primary = normalizeVaultUrl(url);
  const out = [primary];
  try {
    const u = new URL(primary);
    if (u.hostname === "127.0.0.1") {
      u.hostname = "localhost";
      out.push(u.origin);
    } else if (u.hostname === "localhost") {
      u.hostname = "127.0.0.1";
      out.push(u.origin);
    }
  } catch {
    /* ignore */
  }
  return [...new Set(out)];
}

function isLoggedIn(s: Pick<CloudSettings, "apiKey" | "projectUrl">): boolean {
  return Boolean(
    s.apiKey.length > 20 &&
      (s.projectUrl.startsWith("http://") || s.projectUrl.startsWith("https://"))
  );
}

export async function loadCloudSettings(): Promise<CloudSettings> {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY, "vsa_cloud_ver"]);
    const ver = data.vsa_cloud_ver as number | undefined;
    const raw = data[STORAGE_KEY] as Partial<CloudSettings> | undefined;

    // Migrate older local sessions when possible
    if (!raw || (ver !== SETTINGS_VERSION && ver !== 3)) {
      const seeded = { ...DEFAULT_CLOUD_SETTINGS };
      await chrome.storage.local.set({
        [STORAGE_KEY]: seeded,
        vsa_cloud_ver: SETTINGS_VERSION,
      });
      return seeded;
    }

    const merged: CloudSettings = {
      projectUrl: normalizeVaultUrl(
        raw.projectUrl ?? DEFAULT_CLOUD_SETTINGS.projectUrl
      ),
      apiKey: raw.apiKey ?? "",
      userId: raw.userId ?? "",
      email: raw.email ?? "",
      displayName: raw.displayName ?? "",
      enabled: false,
      videoCount: raw.videoCount ?? 0,
      highlightCount: raw.highlightCount ?? 0,
      screenshotCount: raw.screenshotCount ?? 0,
    };
    merged.enabled = isLoggedIn(merged);
    // Persist migrated localhost → 127.0.0.1 (and version bumps)
    const urlChanged = merged.projectUrl !== (raw.projectUrl || "").replace(/\/$/, "");
    if (ver !== SETTINGS_VERSION || urlChanged) {
      await chrome.storage.local.set({
        [STORAGE_KEY]: merged,
        vsa_cloud_ver: SETTINGS_VERSION,
      });
    }
    return merged;
  } catch {
    return { ...DEFAULT_CLOUD_SETTINGS };
  }
}

export async function saveCloudSettings(
  partial: Partial<CloudSettings>
): Promise<CloudSettings> {
  const current = await loadCloudSettings();
  const next: CloudSettings = {
    ...current,
    ...partial,
    projectUrl: normalizeVaultUrl(
      partial.projectUrl ?? current.projectUrl
    ),
  };
  next.enabled = isLoggedIn(next);
  await chrome.storage.local.set({
    [STORAGE_KEY]: next,
    vsa_cloud_ver: SETTINGS_VERSION,
  });
  return next;
}

export async function clearCloudSession(): Promise<CloudSettings> {
  return saveCloudSettings({
    apiKey: "",
    userId: "",
    email: "",
    displayName: "",
    videoCount: 0,
    highlightCount: 0,
    screenshotCount: 0,
  });
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 12) return "••••";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function accountInitials(c: CloudSettings): string {
  const src = (c.displayName || c.email || "?").trim();
  if (!src) return "?";
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

function authErrorMessage(status: number, message?: string): string {
  if (message) return message;
  if (status === 0) return "Cannot reach vault API. Is the server running?";
  if (status === 401) return "Invalid email or password";
  if (status === 409) return "Email already registered — try Log in";
  if (status >= 500) return "Server error — try again in a moment";
  return `Auth failed (HTTP ${status})`;
}

/** Register or login against vault API */
export async function vaultAuth(
  mode: "login" | "register",
  opts: {
    projectUrl: string;
    email: string;
    password: string;
    displayName?: string;
  }
): Promise<CloudSettings> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Enter a valid email address");
  }
  if (!opts.password || opts.password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const path =
    mode === "register" ? "/api/auth/register" : "/api/auth/login";
  const bases = vaultUrlAlternates(
    opts.projectUrl || DEFAULT_CLOUD_SETTINGS.projectUrl
  );
  const body = JSON.stringify({
    email,
    password: opts.password,
    displayName: opts.displayName?.trim(),
  });

  let res: Response | null = null;
  let usedBase = bases[0];
  let lastNetErr: unknown = null;

  for (const base of bases) {
    try {
      res = await vaultHttp(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      usedBase = base;
      break;
    } catch (err) {
      lastNetErr = err;
      res = null;
    }
  }

  if (!res) {
    console.warn("[VideoSearch AI] vault auth network error", lastNetErr);
    throw new Error(
      "Cannot reach vault API. Start it with: cd server && npm run start:always  → open http://127.0.0.1:8787/health"
    );
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    token?: string;
    user?: {
      userId: string;
      email: string;
      displayName?: string;
      videoCount?: number;
      highlightCount?: number;
      screenshotCount?: number;
    };
  };
  if (!res.ok || !data.token || !data.user) {
    throw new Error(authErrorMessage(res.status, data.message));
  }
  return saveCloudSettings({
    projectUrl: usedBase,
    apiKey: data.token,
    userId: data.user.userId,
    email: data.user.email,
    displayName: data.user.displayName || "",
    videoCount: data.user.videoCount ?? 0,
    highlightCount: data.user.highlightCount ?? 0,
    screenshotCount: data.user.screenshotCount ?? 0,
  });
}

/** Validate stored JWT and refresh profile stats */
export async function refreshSession(): Promise<CloudSettings> {
  const current = await loadCloudSettings();
  if (!current.enabled) return current;

  const bases = vaultUrlAlternates(current.projectUrl);
  try {
    let res: Response | null = null;
    let usedBase = bases[0];
    for (const base of bases) {
      try {
        res = await vaultHttp(`${base}/api/auth/me`, {
          headers: { Authorization: `Bearer ${current.apiKey}` },
        });
        usedBase = base;
        break;
      } catch {
        res = null;
      }
    }
    if (!res) {
      throw new Error("Cannot reach vault API");
    }
    // Persist working URL if we fell back
    if (usedBase !== current.projectUrl) {
      await saveCloudSettings({ projectUrl: usedBase });
    }
    if (res.status === 401) {
      return clearCloudSession();
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      user?: {
        userId: string;
        email: string;
        displayName?: string;
        videoCount?: number;
        highlightCount?: number;
        screenshotCount?: number;
      };
    };
    if (!res.ok || !data.user) return current;
    return saveCloudSettings({
      projectUrl: usedBase,
      userId: data.user.userId,
      email: data.user.email,
      displayName: data.user.displayName || current.displayName,
      videoCount: data.user.videoCount ?? 0,
      highlightCount: data.user.highlightCount ?? 0,
      screenshotCount: data.user.screenshotCount ?? 0,
    });
  } catch {
    return current;
  }
}
