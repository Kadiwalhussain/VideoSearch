/**
 * Coffee markers on the YouTube progress bar, one per break taken in this
 * video. Hover shows how long the break lasted and which part of the video
 * that sitting covered; click jumps back to the spot.
 */

import "../dom/trustedHtml";
import { iconHtml } from "../ui/icons";
import { formatClock } from "../zx/progressStore";
import type { BreakEntry } from "../zx/breakLog";

const LAYER_ID = "vsa-break-markers";
const STYLE_ID = "vsa-break-markers-style";
const AMBER = "#f59e0b";

let current: BreakEntry[] = [];

function getProgressBar(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player .ytp-progress-bar") ??
    document.querySelector<HTMLElement>(".ytp-progress-bar")
  );
}

function getVideo(): HTMLVideoElement | null {
  return (
    document.querySelector<HTMLVideoElement>("#movie_player video.html5-main-video") ??
    document.querySelector<HTMLVideoElement>("video.html5-main-video")
  );
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${LAYER_ID} {
      position: absolute; inset: 0; pointer-events: none;
      z-index: 44; overflow: visible;
    }
    #${LAYER_ID} .vsa-brk-tick {
      position: absolute; top: -3px; bottom: -3px; width: 3px;
      margin-left: -1.5px; border-radius: 2px;
      background: ${AMBER}; box-shadow: 0 0 8px ${AMBER};
    }
    #${LAYER_ID} .vsa-brk {
      position: absolute; bottom: 100%;
      transform: translate(-50%, -4px);
      width: 20px; height: 20px; padding: 0; margin: 0;
      display: flex; align-items: center; justify-content: center;
      border: 0; border-radius: 50%; cursor: pointer; pointer-events: auto;
      color: #111; background: ${AMBER};
      box-shadow: 0 0 0 2px rgba(0,0,0,.55), 0 3px 10px rgba(0,0,0,.5);
    }
    #${LAYER_ID} .vsa-brk.is-open { animation: vsaBrkPulse 1.6s ease-in-out infinite; }
    #${LAYER_ID} .vsa-brk-tip {
      position: absolute; bottom: calc(100% + 8px); left: 50%;
      transform: translateX(-50%);
      display: none; flex-direction: column; gap: 2px;
      width: max-content; max-width: 240px; padding: 7px 10px;
      border-radius: 8px; background: rgba(15,15,15,.94); color: #fff;
      box-shadow: 0 6px 20px rgba(0,0,0,.45);
      font: 500 12px/1.35 Roboto, Arial, sans-serif; text-align: left;
      white-space: normal; pointer-events: none;
    }
    #${LAYER_ID} .vsa-brk-tip strong { color: ${AMBER}; font-weight: 700; }
    #${LAYER_ID} .vsa-brk-tip span { opacity: .8; }
    #${LAYER_ID} .vsa-brk:hover .vsa-brk-tip,
    #${LAYER_ID} .vsa-brk:focus-visible .vsa-brk-tip { display: flex; }
    @keyframes vsaBrkPulse {
      50% { box-shadow: 0 0 0 2px rgba(0,0,0,.55), 0 0 14px ${AMBER}; }
    }
  `;
  document.head.appendChild(style);
}

/** "25 min", "1 h 10 min", "3 days" */
export function formatAway(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}

function formatWhen(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Tooltip lines for one break. `prev` is the break before it, if any. */
function tipLines(b: BreakEntry, prev: BreakEntry | undefined): string[] {
  const lines = [
    b.endedAt
      ? `Break at ${formatClock(b.position)} · ${formatAway(b.endedAt - b.startedAt)} away`
      : `Break at ${formatClock(b.position)} · on break since ${formatWhen(b.startedAt)}`,
  ];
  // The stretch of video watched in the sitting that ended with this break
  const from = prev && prev.position < b.position ? prev.position : 0;
  if (b.position > from) {
    lines.push(
      `Sitting: ${formatClock(from)} → ${formatClock(b.position)} (${formatClock(b.position - from)} of video)`
    );
  }
  if (b.endedAt) lines.push(formatWhen(b.startedAt));
  return lines;
}

function render(layer: HTMLElement, duration: number): void {
  layer.replaceChildren();
  if (!duration) return;
  current.forEach((b, i) => {
    if (b.position > duration) return;
    const pct = (b.position / duration) * 100;
    const lines = tipLines(b, current[i - 1]);

    const tick = document.createElement("div");
    tick.className = "vsa-brk-tick";
    tick.style.left = `${pct}%`;
    layer.appendChild(tick);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `vsa-brk${b.endedAt ? "" : " is-open"}`;
    btn.style.left = `${pct}%`;
    btn.setAttribute("aria-label", `${lines.join(". ")}. Jump here`);
    btn.innerHTML = iconHtml("coffee", 12);
    const tip = document.createElement("div");
    tip.className = "vsa-brk-tip";
    lines.forEach((text, n) => {
      const el = document.createElement(n === 0 ? "strong" : "span");
      el.textContent = text;
      tip.appendChild(el);
    });
    btn.appendChild(tip);
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = getVideo();
      if (v) v.currentTime = Math.max(0, b.position - 2);
    });
    layer.appendChild(btn);
  });
}

/** Draw (or redraw) the markers. Safe to call often. */
export function paintBreakMarkers(): void {
  const bar = getProgressBar();
  if (!bar) return;
  let layer = bar.querySelector<HTMLElement>(`#${LAYER_ID}`);
  if (!current.length) {
    layer?.remove();
    return;
  }
  ensureStyles();
  if (!layer) {
    layer = document.createElement("div");
    layer.id = LAYER_ID;
    if (getComputedStyle(bar).position === "static") bar.style.position = "relative";
    bar.appendChild(layer);
  }
  const d = getVideo()?.duration;
  render(layer, d && Number.isFinite(d) ? d : 0);
}

/** True when there are breaks to show but YouTube dropped our layer. */
export function breakMarkersMissing(): boolean {
  return current.length > 0 && !document.getElementById(LAYER_ID);
}

export function setBreakMarkers(list: BreakEntry[]): void {
  current = list.slice();
  paintBreakMarkers();
}

export function clearBreakMarkers(): void {
  current = [];
  document.getElementById(LAYER_ID)?.remove();
}
