/**
 * YouTube player integration for highlights + frame screenshots:
 *  1) Red marks + SVG icons on the progress bar
 *  2) Exactly TWO floating controls on the video: Camera + Mark
 * Survives player rebuilds via MutationObserver.
 */

import type { VideoHighlight } from "../storage/highlightsStore";
import type { VideoScreenshot } from "../storage/screenshotStore";
import { iconHtml } from "../ui/icons";

const LAYER_ID = "vsa-timeline-highlights";
const CTRL_ID = "vsa-player-hl-btn";
const CAM_ID = "vsa-player-ss-btn";
const BADGE_ID = "vsa-player-hl-badge";
const FLOAT_ID = "vsa-player-float-controls";
const STYLE_ID = "vsa-player-controls-style";
const LOG = "[VideoSearch AI]";

let observer: MutationObserver | null = null;
let current: VideoHighlight[] = [];
let currentShots: VideoScreenshot[] = [];
let onMarkerClick: ((hl: VideoHighlight) => void) | null = null;
let onShotClick: ((shot: VideoScreenshot) => void) | null = null;
let onAddClick: (() => void) | null = null;
let onCaptureClick: (() => void) | null = null;
let paintTimer: number | null = null;
let rebindTimer: number | null = null;

export interface TimelineHighlightHandlers {
  onClick?: (hl: VideoHighlight) => void;
  /** Click camera pin on progress bar */
  onShotClick?: (shot: VideoScreenshot) => void;
  onAdd?: () => void;
  onCapture?: () => void;
  /** Screenshots to show as camera markers on the scrubber */
  shots?: VideoScreenshot[];
}

function getMoviePlayer(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player") ??
    document.querySelector<HTMLElement>(".html5-video-player")
  );
}

function getProgressBar(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player .ytp-progress-bar") ??
    document.querySelector<HTMLElement>(".ytp-progress-bar") ??
    document.querySelector<HTMLElement>(".ytp-progress-bar-container")
  );
}

function getDuration(): number {
  const v =
    document.querySelector<HTMLVideoElement>(
      "#movie_player video.html5-main-video"
    ) ??
    document.querySelector<HTMLVideoElement>("video.html5-main-video") ??
    document.querySelector<HTMLVideoElement>("#movie_player video");
  const d = v?.duration;
  return d && Number.isFinite(d) && d > 0 ? d : 0;
}

function getLeftControls(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player .ytp-left-controls") ??
    document.querySelector<HTMLElement>(".ytp-left-controls")
  );
}

function getRightControls(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player .ytp-right-controls") ??
    document.querySelector<HTMLElement>(".ytp-right-controls")
  );
}

function getChromeControls(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player .ytp-chrome-controls") ??
    document.querySelector<HTMLElement>(".ytp-chrome-controls")
  );
}

function getTimeDisplay(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player .ytp-time-display") ??
    document.querySelector<HTMLElement>(".ytp-time-display")
  );
}

function stop(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  if ("stopImmediatePropagation" in e) {
    (e as Event).stopImmediatePropagation();
  }
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* Chrome bar buttons */
    #${CTRL_ID}.ytp-button,
    #${CAM_ID}.ytp-button {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 48px !important;
      min-width: 40px !important;
      height: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      background: transparent !important;
      cursor: pointer !important;
      opacity: 1 !important;
      float: none !important;
      position: relative !important;
      vertical-align: top !important;
      visibility: visible !important;
      pointer-events: auto !important;
      z-index: 60 !important;
    }
    #${CTRL_ID} .vsa-player-btn-inner,
    #${CAM_ID} .vsa-player-btn-inner {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 32px !important;
      height: 32px !important;
      border-radius: 9px !important;
      pointer-events: none !important;
    }
    #${CTRL_ID} .vsa-player-btn-inner {
      color: #fecaca !important;
      background: rgba(239, 68, 68, 0.22) !important;
      box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.55) inset !important;
    }
    #${CAM_ID} .vsa-player-btn-inner {
      color: #e0f2fe !important;
      background: rgba(14, 165, 233, 0.35) !important;
      box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.7) inset, 0 0 12px rgba(56, 189, 248, 0.35) !important;
    }
    #${CTRL_ID}:hover .vsa-player-btn-inner {
      background: rgba(239, 68, 68, 0.4) !important;
    }
    #${CAM_ID}:hover .vsa-player-btn-inner {
      background: rgba(14, 165, 233, 0.55) !important;
      transform: scale(1.06);
    }
    #${BADGE_ID} {
      display: none;
      position: absolute;
      top: 4px;
      right: 6px;
      min-width: 14px;
      height: 14px;
      padding: 0 3px;
      border-radius: 999px;
      background: #ef4444;
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      font-family: system-ui, sans-serif;
      line-height: 14px;
      text-align: center;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.4);
      pointer-events: none;
    }

    /* Floating controls — mid-right stack (clear of VideoSearch pill + YT chrome) */
    #${FLOAT_ID} {
      position: absolute !important;
      right: 16px !important;
      top: 50% !important;
      bottom: auto !important;
      transform: translateY(-50%) !important;
      z-index: 60 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
      pointer-events: none !important;
      opacity: 0.96 !important;
      transition: opacity 0.2s ease !important;
      padding: 6px !important;
      border-radius: 16px !important;
      background: rgba(6, 8, 14, 0.28) !important;
      border: 1px solid rgba(255,255,255,0.06) !important;
      backdrop-filter: blur(8px) !important;
      -webkit-backdrop-filter: blur(8px) !important;
    }
    #movie_player.ytp-autohide #${FLOAT_ID} {
      opacity: 0.9 !important;
    }
    #${FLOAT_ID} button {
      pointer-events: auto !important;
      position: relative !important;
      width: 44px !important;
      height: 44px !important;
      border: 1px solid rgba(255,255,255,0.12) !important;
      border-radius: 13px !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-shadow: 0 8px 28px rgba(0,0,0,0.5) !important;
      backdrop-filter: blur(12px) saturate(1.2) !important;
      -webkit-backdrop-filter: blur(12px) saturate(1.2) !important;
      transition: transform 0.15s ease, border-color 0.15s ease !important;
      flex-shrink: 0 !important;
    }
    #${FLOAT_ID} button:hover {
      transform: scale(1.06) !important;
    }
    #${FLOAT_ID} .vsa-float-ss {
      background: rgba(10, 16, 28, 0.92) !important;
      color: #7dd3fc !important;
      border-color: rgba(125,211,252,0.4) !important;
      box-shadow: 0 8px 28px rgba(0,0,0,0.5), 0 0 20px rgba(56,189,248,0.15) !important;
    }
    #${FLOAT_ID} .vsa-float-hl {
      background: rgba(22, 12, 14, 0.92) !important;
      color: #fca5a5 !important;
      border-color: rgba(252,165,165,0.4) !important;
      box-shadow: 0 8px 28px rgba(0,0,0,0.5), 0 0 20px rgba(239,68,68,0.12) !important;
    }
    #${FLOAT_ID} .vsa-float-label {
      position: absolute;
      right: calc(100% + 10px);
      top: 50%;
      transform: translateY(-50%);
      white-space: nowrap;
      font: 650 11px/1 "Plus Jakarta Sans", system-ui, sans-serif;
      letter-spacing: -0.01em;
      color: #f4f5f7;
      background: rgba(10,11,15,0.94);
      border: 1px solid rgba(255,255,255,0.1);
      padding: 7px 10px;
      border-radius: 8px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
      box-shadow: 0 8px 20px rgba(0,0,0,0.4);
    }
    #${FLOAT_ID} button:hover .vsa-float-label {
      opacity: 1;
    }
    /* Small screens: keep stack clear of edges */
    @media (max-width: 640px) {
      #${FLOAT_ID} {
        right: 10px !important;
        gap: 8px !important;
        padding: 4px !important;
      }
      #${FLOAT_ID} button {
        width: 40px !important;
        height: 40px !important;
      }
    }
  `;
  document.documentElement.appendChild(style);
}

function ensureLayer(bar: HTMLElement): HTMLElement {
  let layer = bar.querySelector<HTMLElement>(`#${LAYER_ID}`);
  if (layer) return layer;

  layer = document.createElement("div");
  layer.id = LAYER_ID;
  layer.setAttribute("data-vsa", "timeline-highlights");
  layer.style.cssText = `
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 45;
    overflow: visible;
  `;

  const cs = getComputedStyle(bar);
  if (cs.position === "static") {
    bar.style.position = "relative";
  }
  bar.appendChild(layer);
  return layer;
}

function formatTimeShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function formatTip(hl: VideoHighlight): string {
  const ts = formatTimeShort(hl.startTime);
  const note = hl.note?.trim();
  if (hl.screenshotId) {
    return note ? `Screenshot ${ts} — ${note}` : `Screenshot ${ts}`;
  }
  if (note) return `Mark ${ts} — ${note}`;
  return `Mark ${ts}`;
}

function formatShotTip(shot: VideoScreenshot): string {
  const ts = formatTimeShort(shot.videoTime);
  const note = shot.note?.trim();
  return note ? `Screenshot ${ts} — ${note}` : `Screenshot ${ts}`;
}

function renderLayer(layer: HTMLElement, duration: number): void {
  layer.innerHTML = "";
  if (!duration) return;

  // Marks that are pure highlights (no linked shot) — red pin
  // Marks that are screenshot-linked — still painted as marks if no shot list;
  // prefer camera icon when screenshotId is set.
  for (const hl of current) {
    const isShot = Boolean(hl.screenshotId);
    // Skip highlight paint if this is only a shot-linked mark and we paint shots separately
    // (avoid double icons). Still paint if shot not in currentShots.
    if (isShot) {
      const hasShot = currentShots.some((s) => s.id === hl.screenshotId);
      if (hasShot) continue;
    }

    const startPct = Math.max(0, Math.min(100, (hl.startTime / duration) * 100));
    const endPct = Math.max(
      startPct,
      Math.min(100, (hl.endTime / duration) * 100)
    );
    const widthPct = Math.max(0.4, endPct - startPct);
    const hasNote = Boolean(hl.note?.trim());
    const color = isShot ? "#38bdf8" : hl.color || "#ef4444";

    appendMarkMarker(layer, {
      startPct,
      widthPct,
      color,
      title: formatTip(hl),
      isShot,
      hasNote,
      onClick: () => onMarkerClick?.(hl),
    });
  }

  // Pure screenshot pins — cyan camera icons on the scrubber
  for (const shot of currentShots) {
    const startPct = Math.max(
      0,
      Math.min(100, (shot.videoTime / duration) * 100)
    );
    appendShotMarker(layer, {
      startPct,
      title: formatShotTip(shot),
      onClick: () => onShotClick?.(shot),
    });
  }
}

function appendMarkMarker(
  layer: HTMLElement,
  opts: {
    startPct: number;
    widthPct: number;
    color: string;
    title: string;
    isShot: boolean;
    hasNote: boolean;
    onClick: () => void;
  }
): void {
  const { startPct, widthPct, color, title, isShot, hasNote, onClick } = opts;

  const band = document.createElement("div");
  band.className = isShot ? "vsa-hl-band is-shot" : "vsa-hl-band";
  band.title = title;
  band.style.cssText = `
    position: absolute;
    left: ${startPct}%;
    width: ${widthPct}%;
    top: 0;
    bottom: 0;
    background: ${color};
    opacity: ${hasNote || isShot ? 0.7 : 0.45};
    pointer-events: auto;
    cursor: pointer;
    border-radius: 1px;
    box-shadow: 0 0 6px ${color}88;
  `;
  band.addEventListener("click", (e) => {
    stop(e);
    onClick();
  });
  layer.appendChild(band);

  const tick = document.createElement("div");
  tick.className = "vsa-hl-tick";
  tick.title = title;
  tick.style.cssText = `
    position: absolute;
    left: ${startPct}%;
    top: -4px;
    bottom: -4px;
    width: 3px;
    margin-left: -1.5px;
    background: ${color};
    border-radius: 2px;
    pointer-events: auto;
    cursor: pointer;
    box-shadow: 0 0 8px ${color};
    z-index: 2;
  `;
  tick.addEventListener("click", (e) => {
    stop(e);
    onClick();
  });
  layer.appendChild(tick);

  const icon = document.createElement("button");
  icon.type = "button";
  icon.className = isShot
    ? "vsa-hl-marker-ico is-shot"
    : hasNote
      ? "vsa-hl-marker-ico has-note"
      : "vsa-hl-marker-ico";
  icon.title = title;
  icon.setAttribute("aria-label", title);
  const sz = isShot || hasNote ? 18 : 16;
  icon.innerHTML = iconHtml(
    isShot ? "camera" : hasNote ? "notes" : "highlight",
    sz - 6
  );
  icon.style.cssText = `
    position: absolute;
    left: ${startPct}%;
    bottom: 100%;
    transform: translate(-50%, -3px);
    margin: 0;
    padding: 0;
    width: ${sz}px;
    height: ${sz}px;
    border: none;
    border-radius: ${isShot ? "50%" : "6px"};
    background: ${
      isShot
        ? "linear-gradient(145deg, #7dd3fc, #0ea5e9)"
        : hasNote
          ? "linear-gradient(145deg, #f87171, #dc2626)"
          : "linear-gradient(145deg, #1f2937, #0f172a)"
    };
    color: ${isShot || hasNote ? "#fff" : "#fca5a5"};
    box-shadow: 0 0 0 1.5px ${color}, 0 3px 10px rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    cursor: pointer;
    z-index: 5;
  `;
  icon.addEventListener("click", (e) => {
    stop(e);
    onClick();
  });
  icon.addEventListener("mousedown", stop);
  layer.appendChild(icon);
}

function appendShotMarker(
  layer: HTMLElement,
  opts: { startPct: number; title: string; onClick: () => void }
): void {
  const { startPct, title, onClick } = opts;
  const color = "#38bdf8";

  const tick = document.createElement("div");
  tick.className = "vsa-ss-tick";
  tick.title = title;
  tick.style.cssText = `
    position: absolute;
    left: ${startPct}%;
    top: -3px;
    bottom: -3px;
    width: 3px;
    margin-left: -1.5px;
    background: ${color};
    border-radius: 2px;
    pointer-events: auto;
    cursor: pointer;
    box-shadow: 0 0 10px ${color};
    z-index: 3;
  `;
  tick.addEventListener("click", (e) => {
    stop(e);
    onClick();
  });
  layer.appendChild(tick);

  const icon = document.createElement("button");
  icon.type = "button";
  icon.className = "vsa-ss-marker-ico";
  icon.title = title;
  icon.setAttribute("aria-label", title);
  icon.innerHTML = iconHtml("camera", 11);
  icon.style.cssText = `
    position: absolute;
    left: ${startPct}%;
    bottom: 100%;
    transform: translate(-50%, -4px);
    margin: 0;
    padding: 0;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: linear-gradient(145deg, #7dd3fc, #0284c7 55%, #0369a1);
    color: #fff;
    box-shadow:
      0 0 0 2px rgba(14, 165, 233, 0.9),
      0 0 12px rgba(56, 189, 248, 0.75),
      0 4px 12px rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
    cursor: pointer;
    z-index: 6;
  `;
  icon.addEventListener("click", (e) => {
    stop(e);
    onClick();
  });
  icon.addEventListener("mousedown", stop);
  layer.appendChild(icon);
}

function wireButton(
  btn: HTMLElement,
  handler: (() => void) | null
): void {
  if ((btn as HTMLElement & { __vsaWired?: boolean }).__vsaWired) return;
  (btn as HTMLElement & { __vsaWired?: boolean }).__vsaWired = true;
  btn.addEventListener("click", (e) => {
    stop(e);
    handler?.();
  });
  btn.addEventListener("mousedown", stop);
  btn.addEventListener("pointerdown", stop);
}

function createChromeBtn(
  id: string,
  kind: "highlight" | "camera",
  label: string,
  title: string
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.id = id;
  btn.type = "button";
  btn.className = "ytp-button";
  btn.setAttribute("data-vsa", id);
  btn.setAttribute("aria-label", label);
  btn.title = title;
  const colorClass = kind === "camera" ? "vsa-cam" : "vsa-hl";
  btn.innerHTML = `
    <span class="vsa-player-btn-inner ${colorClass}">
      ${iconHtml(kind === "camera" ? "camera" : "highlight", 18)}
      ${kind === "highlight" ? `<span id="${BADGE_ID}"></span>` : ""}
    </span>
  `;
  return btn;
}


function insertAfter(parent: HTMLElement, node: HTMLElement, after: Element | null): void {
  if (after && after.parentElement === parent) {
    if (after.nextSibling) parent.insertBefore(node, after.nextSibling);
    else parent.appendChild(node);
  } else {
    parent.appendChild(node);
  }
}

/**
 * Highlight + Screenshot in YouTube chrome (left controls preferred).
 */
function ensureChromeButtons(): void {
  ensureStyles();

  const left = getLeftControls();
  const right = getRightControls();
  const chrome = getChromeControls();
  const host = left || right || chrome;
  if (!host) return;

  let hl = document.getElementById(CTRL_ID) as HTMLButtonElement | null;
  let cam = document.getElementById(CAM_ID) as HTMLButtonElement | null;

  if (!hl) {
    hl = createChromeBtn(
      CTRL_ID,
      "highlight",
      "Highlight this moment",
      "Mark this moment · red pin + note"
    );
    const time = getTimeDisplay();
    if (left && time && time.closest(".ytp-left-controls") === left) {
      insertAfter(left, hl, time);
    } else if (left) {
      left.appendChild(hl);
    } else if (right) {
      // First child of right controls (before settings/fullscreen)
      right.insertBefore(hl, right.firstChild);
    } else {
      host.appendChild(hl);
    }
  }

  if (!cam) {
    cam = createChromeBtn(
      CAM_ID,
      "camera",
      "Screenshot this frame",
      "Screenshot this frame · save board / slides"
    );
    if (hl.parentElement) {
      insertAfter(hl.parentElement, cam, hl);
    } else if (left) {
      left.appendChild(cam);
    } else if (right) {
      right.insertBefore(cam, right.firstChild);
    } else {
      host.appendChild(cam);
    }
  }

  // Handlers live in module vars — wire once; clicks always call latest
  wireButton(hl, () => onAddClick?.());
  wireButton(cam, () => onCaptureClick?.());

  // Badge
  const badge = document.getElementById(BADGE_ID);
  if (badge) {
    const n = current.length;
    if (n > 0) {
      badge.style.display = "inline-block";
      badge.textContent = String(n);
    } else {
      badge.style.display = "none";
    }
  }

  hl.title =
    current.length > 0
      ? `Highlight now · ${current.length} saved`
      : "Highlight this moment · red mark + note";
  cam.title = "Screenshot this video frame · save board / slides";
}

/**
 * Exactly two controls on the video: Screenshot + Mark.
 */
function ensureFloatingControls(): void {
  ensureStyles();
  const player = getMoviePlayer();
  if (!player) return;

  const cs = getComputedStyle(player);
  if (cs.position === "static") {
    player.style.position = "relative";
  }

  let float = document.getElementById(FLOAT_ID) as HTMLElement | null;
  if (!float) {
    float = document.createElement("div");
    float.id = FLOAT_ID;
    float.setAttribute("data-vsa", "player-float-controls");
    float.innerHTML = `
      <button type="button" class="vsa-float-ss" title="Screenshot" aria-label="Screenshot this frame">
        <span class="vsa-float-label">Screenshot</span>
        ${iconHtml("camera", 20)}
      </button>
      <button type="button" class="vsa-float-hl" title="Mark note" aria-label="Mark this moment">
        <span class="vsa-float-label">Mark</span>
        ${iconHtml("highlight", 18)}
      </button>
    `;
    player.appendChild(float);
  } else if (float.parentElement !== player) {
    player.appendChild(float);
  }

  // Ensure only 2 children (camera + mark) if something re-injected extras
  const buttons = float.querySelectorAll("button");
  if (buttons.length > 2) {
    Array.from(buttons)
      .slice(2)
      .forEach((b) => b.remove());
  }

  const ss = float.querySelector(".vsa-float-ss") as HTMLElement | null;
  const hlBtn = float.querySelector(".vsa-float-hl") as HTMLElement | null;
  if (ss) wireButton(ss, () => onCaptureClick?.());
  if (hlBtn) wireButton(hlBtn, () => onAddClick?.());
}

function removeChromeButtons(): void {
  document.getElementById(CTRL_ID)?.remove();
  document.getElementById(CAM_ID)?.remove();
}

function paint(): void {
  const bar = getProgressBar();
  if (bar) {
    const layer = ensureLayer(bar);
    renderLayer(layer, getDuration());
  }
  // Only 2 icons on the video (floating) — never chrome bar duplicates
  removeChromeButtons();
  ensureFloatingControls();
}

function schedulePaint(): void {
  if (paintTimer != null) window.clearTimeout(paintTimer);
  paintTimer = window.setTimeout(() => {
    paintTimer = null;
    paint();
  }, 60);
}

/**
 * Update marks + screenshot pins + player controls.
 */
export function setTimelineHighlights(
  highlights: VideoHighlight[],
  handlers?: TimelineHighlightHandlers
): void {
  current = highlights.slice();
  if (handlers && "shots" in handlers) {
    currentShots = (handlers.shots || []).slice();
  }
  if (handlers?.onClick) onMarkerClick = handlers.onClick;
  if (handlers?.onShotClick) onShotClick = handlers.onShotClick;
  if (handlers?.onAdd) onAddClick = handlers.onAdd;
  if (handlers?.onCapture) onCaptureClick = handlers.onCapture;
  paint();
  ensureObserver();
  // YouTube rebuilds chrome after layout — re-paint a few times
  scheduleRepaintBurst();
}

function scheduleRepaintBurst(): void {
  if (rebindTimer != null) window.clearTimeout(rebindTimer);
  const delays = [200, 600, 1500, 3000];
  let i = 0;
  const tick = () => {
    paint();
    i += 1;
    if (i < delays.length) {
      rebindTimer = window.setTimeout(tick, delays[i] - (delays[i - 1] || 0));
    }
  };
  rebindTimer = window.setTimeout(tick, delays[0]);
}

export function clearTimelineHighlights(): void {
  current = [];
  currentShots = [];
  document.getElementById(LAYER_ID)?.remove();
  document.getElementById(CTRL_ID)?.remove();
  document.getElementById(CAM_ID)?.remove();
  document.getElementById(FLOAT_ID)?.remove();
}

function ensureObserver(): void {
  if (observer) return;
  try {
    observer = new MutationObserver(() => {
      const bar = getProgressBar();
      const needLayer =
        Boolean(bar) &&
        (current.length > 0 || currentShots.length > 0) &&
        !bar!.querySelector(`#${LAYER_ID}`);
      const needFloat =
        Boolean(getMoviePlayer()) && !document.getElementById(FLOAT_ID);
      // Strip legacy chrome buttons if YouTube rebuild re-added them via old builds
      const strayChrome =
        Boolean(document.getElementById(CTRL_ID)) ||
        Boolean(document.getElementById(CAM_ID));
      if (needLayer || needFloat || strayChrome) schedulePaint();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (err) {
    console.warn(LOG, "timeline observer failed", err);
  }
}

export function destroyTimelineHighlights(): void {
  observer?.disconnect();
  observer = null;
  if (paintTimer != null) {
    window.clearTimeout(paintTimer);
    paintTimer = null;
  }
  if (rebindTimer != null) {
    window.clearTimeout(rebindTimer);
    rebindTimer = null;
  }
  clearTimelineHighlights();
  onMarkerClick = null;
  onAddClick = null;
  onCaptureClick = null;
}

/** Force re-inject controls (call when SPA navigates to a new video). */
export function refreshPlayerControls(): void {
  paint();
  ensureObserver();
}
