/**
 * First-install welcome + account. Search never needs a key.
 */

import {
  accountInitials,
  clearCloudSession,
  DEFAULT_CLOUD_SETTINGS,
  loadCloudSettings,
  probeVault,
  refreshSession,
  vaultAuth,
  type CloudSettings,
} from "../settings/cloudSettings";
import {
  completeOnboarding,
  loadOnboarding,
  markOnboardingSeen,
} from "./onboardingStore";

type Mode = "login" | "register";

const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector(sel) as T | null;

function asset(path: string): string {
  try {
    return chrome.runtime.getURL(path);
  } catch {
    return "/" + path.replace(/^\//, "");
  }
}

function bindImg(el: HTMLImageElement | null, paths: string[]): void {
  if (!el || paths.length === 0) return;
  let i = 0;
  const next = () => {
    if (i >= paths.length) return;
    el.src = asset(paths[i++]);
  };
  el.addEventListener("error", next);
  next();
}

function setMsg(text: string, isError = false): void {
  const el = $("[data-msg]");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("is-error", isError);
  el.classList.toggle("is-ok", Boolean(text) && !isError);
}

function applySession(c: CloudSettings): void {
  const signedIn = Boolean(c.enabled && c.email);
  const card = $("[data-auth-card]");
  const profile = $("[data-profile]");
  if (card) card.hidden = signedIn;
  if (profile) profile.hidden = !signedIn;
  if (!signedIn) return;

  const av = $("[data-av]");
  const name = $("[data-profile-name]");
  const email = $("[data-profile-email]");
  if (av) av.textContent = accountInitials(c);
  if (name) name.textContent = c.displayName || c.email.split("@")[0];
  if (email) email.textContent = c.email;
  const sv = $("[data-stat-videos]");
  const sm = $("[data-stat-marks]");
  const ss = $("[data-stat-shots]");
  if (sv) sv.textContent = String(c.videoCount ?? 0);
  if (sm) sm.textContent = String(c.highlightCount ?? 0);
  if (ss) ss.textContent = String(c.screenshotCount ?? 0);
}

function setMode(mode: Mode): void {
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.classList.toggle("is-on", (btn as HTMLElement).dataset.mode === mode);
  });
  const title = $("[data-auth-title]");
  const sub = $("[data-auth-sub]");
  const submit = $("[data-submit]") as HTMLButtonElement | null;
  const nameWrap = $("[data-name-wrap]");
  const confirmWrap = $("[data-confirm-wrap]");
  const pass = $("[data-pass]") as HTMLInputElement | null;
  const hint = $("[data-pass-hint]");

  if (title) {
    title.textContent =
      mode === "register" ? "Create your account" : "Welcome back";
  }
  if (sub) {
    sub.textContent =
      mode === "register"
        ? "One account for Chrome, Studio, Android, and iPhone. Search still works if you skip this."
        : "Sign in to sync marks, shots, bio, and sources. Search itself stays on this device.";
  }
  if (submit) submit.textContent = mode === "register" ? "Create account" : "Log in";
  if (nameWrap) nameWrap.hidden = mode !== "register";
  if (confirmWrap) confirmWrap.hidden = mode !== "register";
  if (pass) {
    pass.autocomplete =
      mode === "register" ? "new-password" : "current-password";
    pass.placeholder =
      mode === "register" ? "At least 10 characters" : "Your password";
  }
  if (hint) {
    hint.textContent =
      mode === "register"
        ? "Use letters and a number. 10+ characters to sign up."
        : "The same password you used when you created the account.";
  }
  $("[data-form]")?.setAttribute("data-mode", mode);
}

async function goToYouTube(): Promise<void> {
  await completeOnboarding(false);
  window.open("https://www.youtube.com", "_self");
}

async function main(): Promise<void> {
  const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  const markKbd = $("[data-key-mark]");
  const capKbd = $("[data-key-cap]");
  if (markKbd) markKbd.textContent = mac ? "⌘M" : "Ctrl+M";
  if (capKbd) capKbd.textContent = mac ? "⌘C" : "Ctrl+C";

  bindImg($("[data-logo]") as HTMLImageElement | null, [
    "icons/logo.png",
    "public/icons/logo.png",
    "assets/logo.png",
  ]);
  bindImg($("[data-hero]") as HTMLImageElement | null, [
    "welcome/product-hero.jpg",
    "public/welcome/product-hero.jpg",
  ]);
  const fav = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (fav) fav.href = asset("icons/logo.png");

  await markOnboardingSeen();

  const urlInput = $("[data-url]") as HTMLInputElement | null;
  let session = await loadCloudSettings();
  if (urlInput) urlInput.value = session.projectUrl || DEFAULT_CLOUD_SETTINGS.projectUrl;
  if (session.email) {
    const email = $("[data-email]") as HTMLInputElement | null;
    if (email) email.value = session.email;
  }

  const chip = $("[data-cloud-chip]");
  const online = await probeVault(session.projectUrl);
  if (chip) {
    chip.textContent = online
      ? "Cloud ready · no API key"
      : "Works on this device · no API key";
    chip.classList.toggle("is-offline", !online);
  }

  if (session.enabled) {
    session = await refreshSession();
  }
  applySession(session);

  let mode: Mode = session.enabled ? "login" : "register";
  setMode(mode);

  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = ((btn as HTMLElement).dataset.mode as Mode) || "register";
      setMode(mode);
      setMsg("");
    });
  });

  $("[data-pass-toggle]")?.addEventListener("click", (e) => {
    const pass = $("[data-pass]") as HTMLInputElement | null;
    const pass2 = $("[data-pass2]") as HTMLInputElement | null;
    const btn = e.currentTarget as HTMLButtonElement;
    if (!pass) return;
    const show = pass.type === "password";
    pass.type = show ? "text" : "password";
    if (pass2) pass2.type = pass.type;
    btn.textContent = show ? "Hide" : "Show";
  });

  $("[data-skip]")?.addEventListener("click", async () => {
    await completeOnboarding(true);
    window.open("https://www.youtube.com", "_self");
  });

  $("[data-open-yt]")?.addEventListener("click", (e) => {
    e.preventDefault();
    void goToYouTube();
  });

  $("[data-logout]")?.addEventListener("click", async () => {
    const cleared = await clearCloudSession();
    applySession(cleared);
    setMode("login");
    setMsg("Signed out");
  });

  $("[data-form]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = ($("[data-name]") as HTMLInputElement | null)?.value.trim() || "";
    const email = ($("[data-email]") as HTMLInputElement)?.value.trim() || "";
    const password = ($("[data-pass]") as HTMLInputElement)?.value || "";
    const pass2 = ($("[data-pass2]") as HTMLInputElement | null)?.value;
    const url =
      ($("[data-url]") as HTMLInputElement | null)?.value.trim() ||
      DEFAULT_CLOUD_SETTINGS.projectUrl;
    const submit = $("[data-submit]") as HTMLButtonElement | null;

    if (mode === "register") {
      if (name.length < 2) {
        setMsg("Enter your full name", true);
        $("[data-name]")?.focus();
        return;
      }
      if (pass2 !== undefined && password !== pass2) {
        setMsg("Passwords do not match", true);
        return;
      }
    }
    if (!email.includes("@")) {
      setMsg("Enter a valid email address", true);
      return;
    }

    if (submit) submit.disabled = true;
    setMsg(mode === "register" ? "Creating your account…" : "Signing in…");
    try {
      const saved = await vaultAuth(mode, {
        projectUrl: url,
        email,
        password,
        displayName: name,
      });
      const passEl = $("[data-pass]") as HTMLInputElement | null;
      const pass2El = $("[data-pass2]") as HTMLInputElement | null;
      if (passEl) passEl.value = "";
      if (pass2El) pass2El.value = "";
      applySession(saved);
      await completeOnboarding(false);
      setMsg(`Signed in as ${saved.email}`);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Could not sign in";
      const unreachable = /cannot reach vault|failed to fetch|network/i.test(raw);
      setMsg(
        unreachable
          ? "Cloud is offline right now. You can still start without an account — search and marks work on this device."
          : raw,
        true
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  const existing = await loadOnboarding();
  if (existing.completedAt && session.enabled) {
    applySession(session);
  }
}

void main().catch((err) => {
  console.error("[VideoSearch AI] welcome failed", err);
});
