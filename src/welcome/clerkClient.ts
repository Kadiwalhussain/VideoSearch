/**
 * Clerk on the welcome (extension) page — sign in, sign up, user button.
 * Publishable key only. Secret key never ships in the extension.
 */

import { Clerk } from "@clerk/clerk-js";
import { applyVaultToken, DEFAULT_CLOUD_SETTINGS } from "../settings/cloudSettings";

const pk = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

let clerk: Clerk | null = null;

export function clerkConfigured(): boolean {
  return Boolean(pk && pk.startsWith("pk_"));
}

export async function loadClerk(): Promise<Clerk | null> {
  if (!clerkConfigured() || !pk) return null;
  if (clerk) return clerk;
  const instance = new Clerk(pk);
  const ext =
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("src/welcome/index.html")
      : window.location.href;
  await instance.load({
    afterSignOutUrl: ext,
    signInFallbackRedirectUrl: ext,
    signUpFallbackRedirectUrl: ext,
  });
  clerk = instance;
  return clerk;
}

export async function syncClerkSessionToVault(): Promise<void> {
  if (!clerk?.isSignedIn || !clerk.session) return;
  const token = await clerk.session.getToken();
  if (!token) return;
  const email =
    clerk.user?.primaryEmailAddress?.emailAddress ||
    clerk.user?.emailAddresses?.[0]?.emailAddress ||
    "";
  const displayName =
    clerk.user?.fullName || clerk.user?.firstName || email.split("@")[0];
  try {
    const res = await fetch("http://127.0.0.1:8787/api/auth/clerk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      token?: string;
      user?: { email?: string; displayName?: string };
    };
    if (res.ok && data.token) {
      await applyVaultToken({
        projectUrl: DEFAULT_CLOUD_SETTINGS.projectUrl,
        token: data.token,
        email: data.user?.email || email,
        displayName: data.user?.displayName || displayName,
      });
      return;
    }
  } catch {
    /* vault may be offline — Clerk session still counts as signed in */
  }
  await applyVaultToken({
    projectUrl: DEFAULT_CLOUD_SETTINGS.projectUrl,
    token,
    email,
    displayName,
  });
}

export async function clerkSignOut(): Promise<void> {
  await clerk?.signOut();
}
