/**
 * Live transcript — scrolls and highlights in sync with the YouTube player.
 */

import type { RawCaptionSegment } from "../types/schema";
import { formatTimestamp } from "../player/seekTo";

export class LiveTranscript {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private metaEl: HTMLElement;
  private segments: RawCaptionSegment[] = [];
  private activeIndex = -1;
  private follow = true;
  private onSeek: (t: number) => void;
  private raf = 0;
  private bound = false;
  private videoEl: HTMLVideoElement | null = null;

  constructor(onSeek: (t: number) => void) {
    this.onSeek = onSeek;
    this.root = document.createElement("div");
    this.root.className = "vsa-transcript";
    this.root.innerHTML = `
      <div class="vsa-transcript-head">
        <span class="vsa-transcript-title">Live transcript</span>
        <label class="vsa-transcript-follow">
          <input type="checkbox" class="vsa-follow-check" checked />
          Follow video
        </label>
      </div>
      <div class="vsa-transcript-meta">Waiting for captions…</div>
      <div class="vsa-transcript-list" role="list"></div>
    `;
    this.listEl = this.root.querySelector(".vsa-transcript-list") as HTMLElement;
    this.metaEl = this.root.querySelector(
      ".vsa-transcript-meta"
    ) as HTMLElement;

    const check = this.root.querySelector(
      ".vsa-follow-check"
    ) as HTMLInputElement;
    check.addEventListener("change", () => {
      this.follow = check.checked;
      if (this.follow && this.activeIndex >= 0) {
        this.setActive(this.activeIndex, true);
      }
    });

    // If user scrolls the list manually, pause follow briefly
    this.listEl.addEventListener(
      "wheel",
      () => {
        if (!this.follow) return;
        // keep follow on — only uncheck if they want; optional UX:
        // leave follow on, wheel just temporarily offsets until next line
      },
      { passive: true }
    );
  }

  setSegments(segments: RawCaptionSegment[]): void {
    this.segments = segments;
    this.activeIndex = -1;
    this.listEl.innerHTML = "";

    if (!segments.length) {
      this.metaEl.textContent = "No caption lines available.";
      return;
    }

    this.metaEl.textContent = `${segments.length} lines · click any line to jump`;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const row = document.createElement("button");
      row.type = "button";
      row.className = "vsa-transcript-line";
      row.setAttribute("role", "listitem");
      row.dataset.index = String(i);
      row.innerHTML = `
        <span class="vsa-transcript-time">${formatTimestamp(seg.startTime)}</span>
        <span class="vsa-transcript-text"></span>
      `;
      (row.querySelector(".vsa-transcript-text") as HTMLElement).textContent =
        seg.text;
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.follow = true;
        const check = this.root.querySelector(
          ".vsa-follow-check"
        ) as HTMLInputElement;
        if (check) check.checked = true;
        this.onSeek(seg.startTime);
        this.setActive(i, true);
      });
      frag.appendChild(row);
    }
    this.listEl.appendChild(frag);
    this.attachVideoSync();
  }

  clear(): void {
    this.segments = [];
    this.listEl.innerHTML = "";
    this.metaEl.textContent = "Waiting for captions…";
    this.detachVideoSync();
  }

  destroy(): void {
    this.detachVideoSync();
  }

  private attachVideoSync(): void {
    this.detachVideoSync();
    this.bound = true;

    const tick = () => {
      if (!this.bound) return;
      this.syncToVideo();
      this.raf = window.requestAnimationFrame(tick);
    };
    // rAF is smooth; also listen to timeupdate as backup
    this.raf = window.requestAnimationFrame(tick);

    const bindVideo = () => {
      const v =
        document.querySelector<HTMLVideoElement>(
          "#movie_player video.html5-main-video"
        ) ??
        document.querySelector<HTMLVideoElement>("video.html5-main-video") ??
        document.querySelector<HTMLVideoElement>("#movie_player video") ??
        document.querySelector<HTMLVideoElement>("video");
      if (v && v !== this.videoEl) {
        this.videoEl?.removeEventListener("timeupdate", this.onTimeUpdate);
        this.videoEl = v;
        v.addEventListener("timeupdate", this.onTimeUpdate);
      }
    };
    bindVideo();
    // YouTube may replace the <video> node (store id so we can clear it)
    const intervalId = window.setInterval(bindVideo, 2000);
    (this as unknown as { _videoPoll?: number })._videoPoll = intervalId;
  }

  private onTimeUpdate = (): void => {
    this.syncToVideo();
  };

  private detachVideoSync(): void {
    this.bound = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    const poll = (this as unknown as { _videoPoll?: number })._videoPoll;
    if (poll) {
      window.clearInterval(poll);
      (this as unknown as { _videoPoll?: number })._videoPoll = undefined;
    }
    this.videoEl?.removeEventListener("timeupdate", this.onTimeUpdate);
    this.videoEl = null;
  }

  private syncToVideo(): void {
    if (!this.segments.length) return;
    const v =
      this.videoEl ??
      document.querySelector<HTMLVideoElement>(
        "#movie_player video.html5-main-video"
      ) ??
      document.querySelector<HTMLVideoElement>("video");
    if (!v || !Number.isFinite(v.currentTime)) return;

    const t = v.currentTime;
    const idx = findActiveIndex(this.segments, t);
    if (idx !== this.activeIndex) {
      this.setActive(idx, this.follow);
    }

    // Update meta clock
    if (idx >= 0) {
      this.metaEl.textContent = `Now · ${formatTimestamp(t)} · line ${idx + 1}/${this.segments.length}`;
    }
  }

  private setActive(index: number, scroll: boolean): void {
    if (index < 0 || index >= this.segments.length) return;

    const prev = this.listEl.querySelector(
      ".vsa-transcript-line.is-active"
    );
    prev?.classList.remove("is-active");

    const row = this.listEl.querySelector(
      `.vsa-transcript-line[data-index="${index}"]`
    ) as HTMLElement | null;
    if (row) {
      row.classList.add("is-active");
      if (scroll && this.follow) {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
    this.activeIndex = index;
  }
}

/** Binary search: last segment with startTime <= t */
function findActiveIndex(
  segments: RawCaptionSegment[],
  t: number
): number {
  let lo = 0;
  let hi = segments.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].startTime <= t + 0.05) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Prefer segment that still covers t when endTime is known
  const cur = segments[ans];
  if (
    cur &&
    cur.endTime > cur.startTime &&
    t > cur.endTime + 0.35 &&
    ans + 1 < segments.length
  ) {
    // gap between captions — keep last spoken line until next starts
    return ans;
  }
  return ans;
}
