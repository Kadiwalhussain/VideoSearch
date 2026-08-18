import { apiFetch, defaultApiUrl, saveSession } from "./client";
import { normalizeApiBase } from "../lib/format";
import type { Session, VaultUser } from "../types";

export type AuthMode = "login" | "register" | "reset";

function assertClientPassword(password: string, forNew = false) {
  if (!password) throw new Error("Password is required");
  if (forNew && password.length < 10) {
    throw new Error("Password must be at least 10 characters");
  }
  if (forNew && (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password))) {
    throw new Error("Password needs letters and a number");
  }
  if (password.length < 6) throw new Error("Password is required");
}

export async function requestPasswordReset(
  email: string,
  projectUrl?: string
): Promise<string> {
  const clean = email.trim().toLowerCase();
  if (!clean.includes("@")) throw new Error("Enter a valid email address");
  const base = normalizeApiBase(projectUrl || defaultApiUrl());
  const res = await apiFetch(base, "/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: clean }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Could not start reset");
  return String(
    data.message ||
      "If that email exists, a reset code was issued. Check the vault server terminal."
  );
}

export async function vaultAuth(
  mode: AuthMode,
  opts: {
    projectUrl?: string;
    email: string;
    password: string;
    displayName?: string;
    code?: string;
  }
): Promise<Session> {
  const email = opts.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Enter a valid email address");
  assertClientPassword(opts.password, mode !== "login");
  if (mode === "reset" && !String(opts.code || "").trim()) {
    throw new Error("Enter the reset code from the vault server terminal");
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
      code: opts.code?.trim(),
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
