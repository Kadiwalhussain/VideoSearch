/**
 * Watched ticks on YouTube playlist rows.
 *  - Every row in a playlist (side panel on /watch, list on /playlist) gets a
 *    small round tick on its thumbnail. Click it to mark the video watched
 *    (or not). Watched rows show a green tick and a dimmed thumbnail.
 *  - Finishing a video while watching a playlist ticks it automatically.
 * The flag lives in the library map and syncs to the vault like Save.
 */

import {
  PLAYLIST_ROW_SELECTOR,
  getPlaylistIdFromUrl,
  playlistRowVideoId,
} from "./playlistCapture";
import { isFinished } from "../zx/progressStore";

const STYLE_ID = "vsa-done-style";
const TICK_CLASS = "vsa-done-tick";
const DONE_ROW_CLASS = "vsa-done-row";
const SVG_NS = "http://www.w3.org/2000/svg";

let started = false;
let completed = new Set<string>();
let paintTimer: number | null = null;
/** Videos auto-ticked in this tab — never re-tick one the user just unticked */
const autoTicked = new Set<string>();
let boundVideo: HTMLVideoElement | null = null;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${TICK_CLASS} {
      position: absolute; top: 4px; left: 4px; z-index: 5;
      width: 22px; height: 22px; padding: 0; margin: 0;
      display: grid; place-items: center;
      border-radius: 50%; cursor: pointer;
      border: 1.5px solid rgba(255,255,255,.85);
      background: rgba(0,0,0,.55); color: #fff;
      opacity: 0; transition: opacity .12s, transform .12s, background .12s;
    }
    .${TICK_CLASS} svg { width: 13px; height: 13px; opacity: .8; }
    ${PLAYLIST_ROW_SELECTOR.split(",")
      .map((s) => `${s.trim()}:hover .${TICK_CLASS}`)
      .join(", ")},
    .${TICK_CLASS}:focus-visible { opacity: 1; }
    .${TICK_CLASS}:hover { transform: scale(1.1); }
    .${TICK_CLASS}.is-done {
      opacity: 1; background: #16a34a; border-color: #16a34a;
    }
    .${TICK_CLASS}.is-done svg { opacity: 1; }
    .${DONE_ROW_CLASS} ytd-thumbnail img,
    .${DONE_ROW_CLASS} yt-image img { opacity: .55; }
  `;
  (document.head || document.documentElement).appendChild(style);
}

function checkIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "3.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M20 6 9 17l-5-5");
  svg.appendChild(path);
  return svg;
}

function rowTitle(row: Element, videoId: string): string {
  return (
    row.querySelector("#video-title")?.textContent?.replace(/\s+/g, " ").trim() ||
    videoId
  );
}

function stop(e: Event): void {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function makeTick(row: Element): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = TICK_CLASS;
  btn.appendChild(checkIcon());
  // The tick sits inside YouTube's link: keep presses from starting playback
  for (const ev of ["mousedown", "mouseup", "pointerdown", "pointerup", "tap"]) {
    btn.addEventListener(ev, (e) => e.stopPropagation(), true);
  }
  btn.addEventListener(
    "click",
    (e) => {
      stop(e);
      const videoId = btn.dataset.videoId || "";
      if (!videoId) return;
      const on = !completed.has(videoId);
      void setCompleted(videoId, on, rowTitle(row, videoId));
    },
    true
  );
  return btn;
}

function paintRow(row: Element): void {
  const videoId = playlistRowVideoId(row);
  if (!videoId) return;
  const host =
    row.querySelector<HTMLElement>("ytd-thumbnail") ||
    row.querySelector<HTMLElement>("#thumbnail-container") ||
    (row as HTMLElement);
  let btn = host.querySelector<HTMLButtonElement>(`:scope > .${TICK_CLASS}`);
  if (!btn) {
    btn = makeTick(row);
    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }
    host.appendChild(btn);
  }
  // YouTube recycles row elements for other videos: always re-read the id
  btn.dataset.videoId = videoId;
  const done = completed.has(videoId);
  btn.classList.toggle("is-done", done);
  const label = done ? "Watched · click to mark as not watched" : "Mark as watched";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.setAttribute("aria-pressed", String(done));
  row.classList.toggle(DONE_ROW_CLASS, done);
}

function paintAll(): void {
  document.querySelectorAll(PLAYLIST_ROW_SELECTOR).forEach(paintRow);
}

function schedulePaint(): void {
  if (paintTimer != null) return;
  paintTimer = window.setTimeout(() => {
    paintTimer = null;
    paintAll();
  }, 250);
}

async function reloadCompleted(): Promise<void> {
  try {
    const { listCompletedVideoIds } = await import("../zx/libraryStore");
    completed = await listCompletedVideoIds();
  } catch {
    /* keep the last known set */
  }
  paintAll();
}

async function setCompleted(
  videoId: string,
  on: boolean,
  videoTitle?: string
): Promise<void> {
  // Paint now; the storage listener repaints with the stored truth
  if (on) completed.add(videoId);
  else completed.delete(videoId);
  paintAll();
  try {
    const { updateLibraryOnCloud } = await import("../cloud/cloudSync");
    const listId = getPlaylistIdFromUrl();
    await updateLibraryOnCloud({
      videoId,
      videoTitle,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}${
        listId ? `&list=${encodeURIComponent(listId)}` : ""
      }`,
      action: on ? "complete" : "uncomplete",
    });
  } catch (err) {
    console.warn("[VideoSearch] watched tick failed", err);
  }
  await reloadCompleted();
}

function currentVideoId(): string {
  try {
    const u = new URL(location.href);
    return u.pathname === "/watch" ? u.searchParams.get("v") || "" : "";
  } catch {
    return "";
  }
}

/** Tick the current playlist video once it has been watched to the end. */
function onPlayback(this: HTMLVideoElement): void {
  const videoId = currentVideoId();
  if (!videoId || !getPlaylistIdFromUrl()) return;
  if (completed.has(videoId) || autoTicked.has(videoId)) return;
  const player = document.querySelector("#movie_player");
  if (player?.classList.contains("ad-showing")) return;
  const duration = Number.isFinite(this.duration) ? this.duration : 0;
  if (duration < 30) return;
  const position = this.ended ? duration : this.currentTime;
  if (!isFinished({ position, duration })) return;
  autoTicked.add(videoId);
  const title =
    document
      .querySelector("h1.ytd-watch-metadata yt-formatted-string")
      ?.textContent?.trim() || undefined;
  void setCompleted(videoId, true, title);
}

function bindVideo(): void {
  const v =
    document.querySelector<HTMLVideoElement>("#movie_player video.html5-main-video") ??
    document.querySelector<HTMLVideoElement>("video.html5-main-video");
  if (!v || v === boundVideo) return;
  boundVideo?.removeEventListener("timeupdate", onPlayback);
  boundVideo?.removeEventListener("ended", onPlayback);
  boundVideo = v;
  v.addEventListener("timeupdate", onPlayback);
  v.addEventListener("ended", onPlayback);
}

export function startPlaylistTicks(): void {
  if (started) return;
  started = true;
  injectStyle();
  void reloadCompleted();

  try {
    new MutationObserver(() => {
      schedulePaint();
      bindVideo();
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch {
    /* rows still paint on navigation */
  }
  window.addEventListener("yt-navigate-finish", () => {
    schedulePaint();
    bindVideo();
  });

  // Vault pulls, Studio edits and other tabs land in the library map
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (Object.keys(changes).some((k) => k.startsWith("vsa_library_v1"))) {
        void reloadCompleted();
      }
    });
  } catch {
    /* extension context gone */
  }
}
