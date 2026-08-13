import { apiFetch, defaultApiUrl, saveSession } from "./client";
import { normalizeApiBase } from "../lib/format";
import type { Session, VaultUser } from "../types";

export type AuthMode = "login" | "register" | "reset";

export async function vaultAuth(
  mode: AuthMode,
  opts: {
    projectUrl?: string;
    email: string;
    password: string;
    displayName?: string;
  }
): Promise<Session> {
  const email = opts.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter a valid email address");
  if (!opts.password || opts.password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const base = normalizeApiBase(opts.projectUrl || defaultApiUrl());
  const path =
    mode === "register"
      ? "/api/auth/register"
      : mode === "reset"
        ? "/api/auth/reset-password"
        : "/api/auth/login";

  const res = await apiFetch(base, path, {
    method: "POST",
    body: JSON.stringify({
      email,
      password: opts.password,
      displayName: opts.displayName?.trim(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token || !data.user) {
    throw new Error(data.message || `Auth failed (${res.status})`);
  }

  const session: Session = {
    url: base,
    token: data.token,
    user: data.user as VaultUser,
  };
  saveSession(session);
  return session;
}

export async function fetchMe(session: Session): Promise<VaultUser> {
  const res = await apiFetch(session.url, "/api/auth/me", {
    token: session.token,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Session expired");
  return data.user as VaultUser;
}
