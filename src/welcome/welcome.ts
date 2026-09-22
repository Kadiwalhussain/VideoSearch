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
  vaultForgotPassword,
  vaultResetPassword,
  applyVaultToken,
  googleStartUrl,
  type CloudSettings,
} from "../settings/cloudSettings";
import { vaultHttp } from "../net/vaultHttp";
import {
  completeOnboarding,
  loadOnboarding,
  markOnboardingSeen,
} from "./onboardingStore";
import {
  countLocalUserData,
  ensureGuestSession,
  formatElapsed,
  offerSaveLocalToCloud,
} from "../zx/guestSession";
import {
  clerkConfigured,
  clerkSignOut,
  loadClerk,
  syncClerkSessionToVault,
} from "./clerkClient";

type Mode = "login" | "register" | "forgot" | "reset";

let googleAvailable = false;

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
    btn.classList.toggle(
      "is-on",
      (btn as HTMLElement).dataset.mode === mode ||
        (mode === "forgot" && (btn as HTMLElement).dataset.mode === "login") ||
        (mode === "reset" && (btn as HTMLElement).dataset.mode === "login")
    );
  });
  const title = $("[data-auth-title]");
  const sub = $("[data-auth-sub]");
  const submit = $("[data-submit]") as HTMLButtonElement | null;
  const confirmWrap = $("[data-confirm-wrap]");
  const passWrap = $("[data-pass-wrap]");
  const codeWrap = $("[data-code-wrap]");
  const pass = $("[data-pass]") as HTMLInputElement | null;
  const forgot = $("[data-forgot]");
  const google = $("[data-google]");
  const or = document.querySelector(".or") as HTMLElement | null;

  if (title) {
    title.textContent =
      mode === "register"
        ? "Create account"
        : mode === "forgot" || mode === "reset"
          ? "Reset password"
          : "Welcome back";
  }
  if (sub) {
    sub.textContent =
      mode === "register"
        ? "Email and password. Search still works if you skip this."
        : mode === "forgot"
          ? "We’ll issue a reset code. On this computer it prints in the vault terminal."
          : mode === "reset"
            ? "Enter the code and a new password."
            : "Email and password. Search still works if you skip this.";
  }
  if (submit) {
    submit.textContent =
      mode === "register"
        ? "Create account"
        : mode === "forgot"
          ? "Send reset code"
          : mode === "reset"
            ? "Set new password"
            : "Log in";
  }
  if (confirmWrap) confirmWrap.hidden = mode !== "register" && mode !== "reset";
  if (passWrap) passWrap.hidden = mode === "forgot";
  if (codeWrap) codeWrap.hidden = mode !== "reset";
  if (pass) {
    pass.autocomplete =
      mode === "register" || mode === "reset" ? "new-password" : "current-password";
    pass.placeholder =
      mode === "register" || mode === "reset" ? "At least 10 characters" : "Password";
    pass.required = mode !== "forgot";
  }
  if (forgot) {
    forgot.textContent =
      mode === "forgot" || mode === "reset" ? "Back to log in" : "Forgot password?";
    forgot.hidden = mode === "register";
  }
  if (google) {
    google.hidden =
      !googleAvailable || mode === "forgot" || mode === "reset";
  }
  if (or) {
    or.hidden = !googleAvailable || mode === "forgot" || mode === "reset";
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

  // Keep email + password visible. Clerk widgets hide those fields in
  // Chrome extensions (Native API / CSP), so we never replace the form.
  const googleBtn = $("[data-google]");
  const orEl = document.querySelector(".or") as HTMLElement | null;
  if (googleBtn) googleBtn.hidden = true;
  if (orEl) orEl.hidden = true;

  if (clerkConfigured()) {
    try {
      const clerk = await loadClerk();
      const userSlot = $("[data-clerk-user]");
      const userBtn = document.getElementById(
        "clerk-user-button"
      ) as HTMLDivElement | null;
      if (clerk?.isSignedIn) {
        if (userSlot) userSlot.hidden = false;
        if (userBtn) {
          userBtn.innerHTML = "";
          clerk.mountUserButton(userBtn);
        }
        await syncClerkSessionToVault();
        const s = await loadCloudSettings();
        applySession(s);
        await offerSaveLocalToCloud({
          onStatus: (m, isError) => setMsg(m, Boolean(isError)),
        });
        await completeOnboarding(false);
      }
    } catch (err) {
      console.warn("[VideoSearch AI] Clerk session skipped", err);
    }
  }

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
  if (online) {
    try {
      const bases = [
        session.projectUrl || DEFAULT_CLOUD_SETTINGS.projectUrl,
        "http://127.0.0.1:8787",
        "http://localhost:8787",
      ];
      for (const base of bases) {
        const hr = await vaultHttp(`${base.replace(/\/$/, "")}/health`);
        if (!hr.ok) continue;
        const hj = (await hr.json().catch(() => ({}))) as {
          googleAuth?: boolean;
        };
        if (hj.googleAuth) {
          googleAvailable = true;
          if (googleBtn) googleBtn.hidden = false;
          if (orEl) orEl.hidden = false;
        }
        break;
      }
    } catch {
      /* keep Google hidden */
    }
  }

  if (session.enabled) {
    session = await refreshSession();
  }
  applySession(session);

  const params = new URLSearchParams(location.search);
  const oauthToken = params.get("token");
  if (oauthToken) {
    session = await applyVaultToken({
      projectUrl: session.projectUrl || DEFAULT_CLOUD_SETTINGS.projectUrl,
      token: oauthToken,
      email: params.get("email") || undefined,
      displayName: params.get("name") || undefined,
    });
    applySession(session);
    history.replaceState({}, "", location.pathname);
    const { offerSaveLocalToCloud } = await import("../zx/guestSession");
    await offerSaveLocalToCloud();
    await completeOnboarding(false);
  }

  let mode: Mode = "login";
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

  const guestWarn = $("[data-guest-warn]");
  const guestClock = $("[data-guest-clock]");
  const guestCopy = $("[data-guest-copy]");
  let guestTick: number | null = null;

  const runGuestClock = async () => {
    if (session.enabled) {
      if (guestWarn) guestWarn.hidden = true;
      if (guestTick != null) window.clearInterval(guestTick);
      return;
    }
    const g = await ensureGuestSession();
    const counts = await countLocalUserData();
    const paint = () => {
      const clock = formatElapsed(Date.now() - g.startedAt);
      if (guestClock) guestClock.textContent = clock;
      if (guestCopy) {
        const bits: string[] = [];
        if (counts.marks) bits.push(`${counts.marks} marks`);
        if (counts.shots) bits.push(`${counts.shots} shots`);
        const stash = bits.length ? bits.join(" · ") : "no marks yet";
        guestCopy.textContent = `Not signed in · ${stash} · local for ${clock}. Sign in to keep notes in your account. They vanish only if you clear Chrome data, use Incognito, or uninstall.`;
      }
    };
    if (guestWarn) guestWarn.hidden = false;
    paint();
    if (guestTick != null) window.clearInterval(guestTick);
    guestTick = window.setInterval(paint, 1000);
  };
  void runGuestClock();

  $("[data-skip]")?.addEventListener("click", async () => {
    await ensureGuestSession();
    await completeOnboarding(true);
    window.open("https://www.youtube.com", "_self");
  });

  $("[data-open-yt]")?.addEventListener("click", (e) => {
    e.preventDefault();
    void goToYouTube();
  });

  $("[data-logout]")?.addEventListener("click", async () => {
    await clerkSignOut();
    const cleared = await clearCloudSession();
    applySession(cleared);
    setMode("login");
    setMsg("Signed out");
    window.location.reload();
  });

  $("[data-forgot]")?.addEventListener("click", () => {
    mode = mode === "forgot" || mode === "reset" ? "login" : "forgot";
    setMode(mode);
    setMsg("");
  });

  $("[data-google]")?.addEventListener("click", () => {
    const url =
      ($("[data-url]") as HTMLInputElement | null)?.value.trim() ||
      session.projectUrl ||
      DEFAULT_CLOUD_SETTINGS.projectUrl;
    const redirect = location.href.split("?")[0];
    window.location.href = googleStartUrl(url, redirect);
  });

  $("[data-form]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = ($("[data-email]") as HTMLInputElement)?.value.trim() || "";
    const password = ($("[data-pass]") as HTMLInputElement)?.value || "";
    const pass2 = ($("[data-pass2]") as HTMLInputElement | null)?.value;
    const code = ($("[data-code]") as HTMLInputElement | null)?.value || "";
    const url =
      ($("[data-url]") as HTMLInputElement | null)?.value.trim() ||
      DEFAULT_CLOUD_SETTINGS.projectUrl;
    const submit = $("[data-submit]") as HTMLButtonElement | null;

    if (!email.includes("@")) {
      setMsg("Enter a valid email address", true);
      return;
    }
    if ((mode === "register" || mode === "reset") && pass2 !== undefined && password !== pass2) {
      setMsg("Passwords do not match", true);
      return;
    }

    if (submit) submit.disabled = true;
    try {
      if (mode === "forgot") {
        setMsg("Sending reset code…");
        const msg = await vaultForgotPassword(url, email);
        setMsg(msg);
        mode = "reset";
        setMode(mode);
        return;
      }
      if (mode === "reset") {
        setMsg("Updating password…");
        const saved = await vaultResetPassword({
          projectUrl: url,
          email,
          code,
          password,
        });
        applySession(saved);
        session = saved;
        setMsg(`Signed in as ${saved.email}`);
        const { offerSaveLocalToCloud } = await import(
          "../zx/guestSession"
        );
        await offerSaveLocalToCloud({
          onStatus: (m, isError) => setMsg(m, Boolean(isError)),
        });
        await completeOnboarding(false);
        return;
      }
      setMsg(mode === "register" ? "Creating your account…" : "Signing in…");
      const saved = await vaultAuth(mode === "register" ? "register" : "login", {
        projectUrl: url,
        email,
        password,
        displayName: email.split("@")[0],
      });
      const passEl = $("[data-pass]") as HTMLInputElement | null;
      const pass2El = $("[data-pass2]") as HTMLInputElement | null;
      if (passEl) passEl.value = "";
      if (pass2El) pass2El.value = "";
      applySession(saved);
      session = saved;
      setMsg(`Signed in as ${saved.email}`);
      const { offerSaveLocalToCloud } = await import(
        "../zx/guestSession"
      );
      await offerSaveLocalToCloud({
        onStatus: (msg, isError) => setMsg(msg, Boolean(isError)),
      });
      await completeOnboarding(false);
      if (guestWarn) guestWarn.hidden = true;
      if (guestTick != null) window.clearInterval(guestTick);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Could not sign in";
      const unreachable = /cannot reach vault|failed to fetch|network/i.test(raw);
      await ensureGuestSession();
      void runGuestClock();
      setMsg(
        unreachable
          ? "Account server is offline. You can still open YouTube — a timer will show how long notes stay in this browser’s cache. Sign in later to keep them, or they disappear if that cache is cleared."
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
