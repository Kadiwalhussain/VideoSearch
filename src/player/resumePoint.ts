/**
 * Take a break + resume.
 *  - A small "Break" button sits right after YouTube's time display.
 *    Pressing it (or B) pauses and saves exactly where you are.
 *  - Coming back to the video (any device) jumps back to that spot.
 *  - While watching, the position is saved every few seconds so History can
 *    show a progress bar and "Continue watching".
 * Video length is saved with every point.
 */

import "../dom/trustedHtml";
import { iconHtml } from "../ui/icons";
import {
  formatClock,
  getResumePoint,
  isFinished,
  saveResumePoint,
  type ResumePoint,
} from "../zx/progressStore";

const BTN_ID = "vsa-break-btn";
const TOAST_ID = "vsa-resume-toast";
const STYLE_ID = "vsa-break-style";
const LOCAL_EVERY_MS = 10_000;
const CLOUD_EVERY_MS = 60_000;
/** Below this there is nothing worth resuming */
const MIN_RESUME_SEC = 10;

export type ResumeMeta = {
  getTitle: () => string;
  getChannel: () => { channelTitle?: string; channelUrl?: string };
};

let videoId: string | null = null;
let meta: ResumeMeta | null = null;
/** Resume decision made for this video — until then never save "auto" */
let armedFor: string | null = null;
let boundVideo: HTMLVideoElement | null = null;
let lastLocalAt = 0;
let lastCloudAt = 0;
let breakPoint: ResumePoint | null = null;
let observer: MutationObserver | null = null;
let toastTimer: number | null = null;
let globalsBound = false;
/** pause() fires "pause" synchronously; that must not save over the break */
let breakingUntil = 0;

function getVideo(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>("#movie_player video.html5-main-video") ??
    document.querySelector<HTMLVideoElement>("video.html5-main-video")
  );
}

function getPlayer(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player") ??
    document.querySelector<HTMLElement>(".html5-video-player")
  );
}

/** The <video> is showing *this* video, not an ad or the previous one. */
function isOnVideo(): boolean {
  if (!videoId) return false;
  if (getPlayer()?.classList.contains("ad-showing")) return false;
  try {
    return new URL(location.href).searchParams.get("v") === videoId;
  } catch {
    return false;
  }
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${BTN_ID} {
      display: inline-flex; align-items: center; gap: 5px;
      height: 26px; margin: auto 6px; padding: 0 10px 0 8px;
      align-self: center; flex-shrink: 0;
      border: 1px solid rgba(255,255,255,.28); border-radius: 13px;
      background: rgba(255,255,255,.1); color: #fff;
      font: 500 12px/1 "YouTube Sans", Roboto, Arial, sans-serif;
      cursor: pointer; white-space: nowrap; vertical-align: middle;
      transition: background .15s, border-color .15s;
    }
    #${BTN_ID}:hover { background: rgba(255,255,255,.2); }
    #${BTN_ID}.is-saved {
      background: rgba(245,158,11,.22); border-color: rgba(245,158,11,.75);
    }
    #${BTN_ID} .vsa-break-time { opacity: .85; font-variant-numeric: tabular-nums; }
    #${TOAST_ID} {
      position: absolute; left: 12px; bottom: 64px; z-index: 70;
      display: flex; align-items: center; gap: 10px; max-width: calc(100% - 24px);
      padding: 9px 12px; border-radius: 10px;
      background: rgba(15,15,15,.88); color: #fff;
      box-shadow: 0 6px 24px rgba(0,0,0,.4);
      font: 500 13px/1.35 Roboto, Arial, sans-serif;
      animation: vsaResumeIn .18s ease-out;
    }
    #${TOAST_ID} button {
      border: 0; border-radius: 6px; padding: 5px 9px; cursor: pointer;
      background: rgba(255,255,255,.14); color: #fff; font: inherit;
    }
    #${TOAST_ID} button.primary { background: #f59e0b; color: #111; }
    #${TOAST_ID} button:hover { filter: brightness(1.12); }
    @keyframes vsaResumeIn { from { opacity: 0; transform: translateY(6px); } }
  `;
  document.head.appendChild(style);
}

function stopEvent(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
}

function ensureButton(): void {
  const left =
    document.querySelector<HTMLElement>("#movie_player .ytp-left-controls") ??
    document.querySelector<HTMLElement>(".ytp-left-controls");
  if (!left) return;
  ensureStyles();
  let btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.setAttribute("data-vsa", BTN_ID);
    btn.addEventListener("click", (e) => {
      stopEvent(e);
      void takeBreak();
    });
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
  }
  // Right after "0:42 / 12:07"
  const time = left.querySelector(".ytp-time-display");
  const anchor = time && time.parentElement === left ? time : null;
  if (btn.parentElement !== left || (anchor && btn.previousElementSibling !== anchor)) {
    if (anchor) anchor.after(btn);
    else left.appendChild(btn);
  }
  renderButton(btn);
}

function renderButton(btn: HTMLElement): void {
  const saved = breakPoint && breakPoint.videoId === videoId ? breakPoint : null;
  btn.classList.toggle("is-saved", Boolean(saved));
  btn.innerHTML = saved
    ? `${iconHtml("coffee", 14)}<span>Break</span><span class="vsa-break-time">${formatClock(saved.position)}</span>`
    : `${iconHtml("coffee", 14)}<span>Break</span>`;
  const label = saved
    ? `Break saved at ${formatClock(saved.position)} · press again to move it (B)`
    : "Take a break · save this spot and resume here later (B)";
  btn.title = label;
  btn.setAttribute("aria-label", label);
}

function showToast(
  text: string,
  actions: Array<{ label: string; primary?: boolean; run: () => void }> = [],
  ms = 8000
): void {
  const player = getPlayer();
  if (!player) return;
  ensureStyles();
  document.getElementById(TOAST_ID)?.remove();
  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.setAttribute("role", "status");
  const msg = document.createElement("span");
  msg.textContent = text;
  toast.append(iconEl(), msg);
  for (const a of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = a.label;
    if (a.primary) b.className = "primary";
    b.addEventListener("click", (e) => {
      stopEvent(e);
      a.run();
      toast.remove();
    });
    b.addEventListener("mousedown", (e) => e.stopPropagation());
    toast.appendChild(b);
  }
  player.appendChild(toast);
  if (toastTimer != null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), ms);
}

function iconEl(): HTMLElement {
  const span = document.createElement("span");
  span.innerHTML = iconHtml("coffee", 16);
  span.style.display = "inline-flex";
  span.style.color = "#f59e0b";
  return span;
}

async function pushToVault(p: ResumePoint): Promise<void> {
  try {
    const { loadCloudSettings } = await import("../settings/cloudSettings");
    const s = await loadCloudSettings();
    // Guests keep resume points on this device only
    if (!s.enabled || !s.apiKey) return;
    lastCloudAt = Date.now();
    const ch = meta?.getChannel() || {};
    const { runOrQueueOp } = await import("../cloud/offlineSync");
    await runOrQueueOp({
      kind: "progress",
      videoId: p.videoId,
      position: p.position,
      duration: p.duration,
      progressKind: p.kind,
      recordedAt: p.at,
      videoTitle: meta?.getTitle(),
      channelTitle: ch.channelTitle,
      channelUrl: ch.channelUrl,
    });
  } catch {
    /* best effort — local copy is already saved */
  }
}

async function persist(
  kind: "break" | "auto",
  opts: { toCloud?: boolean } = {}
): Promise<ResumePoint | null> {
  const v = getVideo();
  if (!v || !videoId || !isOnVideo()) return null;
  const duration = Number.isFinite(v.duration) ? Math.round(v.duration) : 0;
  const position = v.ended ? duration : Math.round(v.currentTime * 10) / 10;
  if (kind === "auto" && position < 5) return null;
  // Closing the tab / pausing right at a break must not turn it into a plain
  // "auto" point — only watching past it uses the break up.
  if (
    kind === "auto" &&
    breakPoint?.videoId === videoId &&
    Math.abs(position - breakPoint.position) < 3
  ) {
    return breakPoint;
  }
  const point: ResumePoint = { videoId, position, duration, kind, at: Date.now() };
  const kept = await saveResumePoint(point);
  lastLocalAt = point.at;
  if (
    kind === "auto" &&
    breakPoint?.videoId === videoId &&
    point.at > breakPoint.at &&
    position >= breakPoint.position + 3
  ) {
    // Watched on past the break: it is used up
    breakPoint = null;
    const btn = document.getElementById(BTN_ID);
    if (btn) renderButton(btn);
  }
  if (opts.toCloud || kind === "break" || point.at - lastCloudAt >= CLOUD_EVERY_MS) {
    void pushToVault(kept);
  }
  return kept;
}

/** Pause and remember this exact spot. */
export async function takeBreak(): Promise<void> {
  const v = getVideo();
  if (!v || !isOnVideo()) {
    showToast("Break is available once the video (not an ad) is playing", [], 4000);
    return;
  }
  breakingUntil = Date.now() + 1500;
  v.pause();
  const p = await persist("break");
  if (!p) return;
  armedFor = videoId;
  breakPoint = p;
  const btn = document.getElementById(BTN_ID);
  if (btn) renderButton(btn);
  showToast(`Break saved at ${formatClock(p.position)} · we'll start here when you're back`);
}

function onTimeUpdate(): void {
  if (armedFor !== videoId || !isOnVideo()) return;
  const v = getVideo();
  if (!v || v.paused) return;
  if (Date.now() - lastLocalAt < LOCAL_EVERY_MS) return;
  void persist("auto");
}

function onPause(): void {
  if (armedFor !== videoId) return;
  // This pause came from Take a break, which saves its own point
  if (Date.now() < breakingUntil) return;
  void persist("auto", { toCloud: Date.now() - lastCloudAt > 15_000 });
}

function onEnded(): void {
  if (armedFor !== videoId) return;
  void persist("auto", { toCloud: true });
}

function bindVideo(): void {
  const v = getVideo();
  if (!v || v === boundVideo) return;
  if (boundVideo) {
    boundVideo.removeEventListener("timeupdate", onTimeUpdate);
    boundVideo.removeEventListener("pause", onPause);
    boundVideo.removeEventListener("ended", onEnded);
  }
  v.addEventListener("timeupdate", onTimeUpdate);
  v.addEventListener("pause", onPause);
  v.addEventListener("ended", onEnded);
  boundVideo = v;
}

function bindGlobals(): void {
  if (globalsBound) return;
  globalsBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && armedFor === videoId) {
      void persist("auto", { toCloud: true });
    }
  });
  // In-app navigation: the URL still names the old video at this point
  window.addEventListener("yt-navigate-start", () => {
    if (armedFor === videoId) void persist("auto", { toCloud: true });
  });
  window.addEventListener("pagehide", () => {
    if (armedFor === videoId) void persist("auto", { toCloud: true });
  });
  // B = take a break (YouTube does not use it; Ctrl/⌘+B is the browser's)
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "b" && e.key !== "B") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (!videoId || !isOnVideo()) return;
      stopEvent(e);
      void takeBreak();
    },
    true
  );
}

function ensureObserver(): void {
  if (observer) return;
  let pending = false;
  observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    window.setTimeout(() => {
      pending = false;
      if (!videoId) return;
      bindVideo();
      if (!document.getElementById(BTN_ID)) ensureButton();
    }, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

/** Wait until the player shows this video (ads finished, metadata loaded). */
async function waitForPlayable(id: string, ms = 20_000): Promise<HTMLVideoElement | null> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (videoId !== id) return null;
    const v = getVideo();
    if (v && isOnVideo() && v.readyState >= 1 && v.duration > 0) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

function hasTimeParam(): boolean {
  try {
    const u = new URL(location.href);
    return u.searchParams.has("t") || u.searchParams.has("start");
  } catch {
    return false;
  }
}

async function applyResume(id: string): Promise<void> {
  const startedAt = Date.now();
  /** The user pressed Break (or started over) while we were still looking up */
  const userActed = () => Boolean(breakPoint && breakPoint.at >= startedAt);
  try {
    // An explicit ?t= link (timestamp from a note, a share) always wins
    if (hasTimeParam()) return;
    let point = await getResumePoint(id);
    const { fetchCloudResumePoint } = await import("../cloud/cloudSync");
    const remote = await fetchCloudResumePoint(id);
    if (remote && (!point || remote.at > point.at)) {
      point = await saveResumePoint({ videoId: id, ...remote });
    }
    if (videoId !== id || userActed()) return;
    breakPoint = point?.kind === "break" ? point : null;
    const btn = document.getElementById(BTN_ID);
    if (btn) renderButton(btn);
    if (!point || point.position < MIN_RESUME_SEC || isFinished(point)) return;

    const v = await waitForPlayable(id);
    if (!v || videoId !== id || userActed()) return;
    const at = formatClock(point.position);

    if (point.kind === "break") {
      v.currentTime = Math.max(0, point.position - 2);
      showToast(`Welcome back · resumed from your break at ${at}`, [
        { label: "Start over", run: () => startOver(id) },
      ]);
    } else if (v.currentTime < point.position - 15) {
      const target = point.position;
      showToast(`You stopped at ${at}`, [
        {
          label: `Resume at ${at}`,
          primary: true,
          run: () => {
            const vv = getVideo();
            if (vv && videoId === id) vv.currentTime = Math.max(0, target - 2);
          },
        },
      ], 10_000);
    }
  } finally {
    if (videoId === id) armedFor = id;
  }
}

function startOver(id: string): void {
  const v = getVideo();
  if (!v || videoId !== id) return;
  v.currentTime = 0;
  breakPoint = null;
  const btn = document.getElementById(BTN_ID);
  if (btn) renderButton(btn);
  const cleared: ResumePoint = {
    videoId: id,
    position: 0,
    duration: Number.isFinite(v.duration) ? Math.round(v.duration) : 0,
    kind: "auto",
    at: Date.now(),
  };
  void saveResumePoint(cleared).then(() => pushToVault(cleared));
}

/** Call when a watch page for videoId is shown. Safe to call repeatedly. */
export function startResumeTracking(id: string, m: ResumeMeta): void {
  meta = m;
  bindGlobals();
  ensureObserver();
  bindVideo();
  ensureButton();
  if (videoId === id) return;
  videoId = id;
  armedFor = null;
  breakPoint = null;
  lastLocalAt = 0;
  lastCloudAt = 0;
  document.getElementById(TOAST_ID)?.remove();
  void applyResume(id);
}

/** Leaving the watch page: save where we were, drop the UI. */
export function stopResumeTracking(): void {
  if (videoId && armedFor === videoId) void persist("auto", { toCloud: true });
  videoId = null;
  armedFor = null;
  breakPoint = null;
  document.getElementById(BTN_ID)?.remove();
  document.getElementById(TOAST_ID)?.remove();
}
