/**
 * Live transcript — cinematic, karaoke-style captions synced to the player.
 */

import type { RawCaptionSegment } from "../types/schema";
import { formatTimestamp } from "../player/seekTo";
import { iconHtml } from "./icons";

export class LiveTranscript {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private metaEl: HTMLElement;
  private progressEl: HTMLElement;
  private searchEl: HTMLInputElement;
  private segments: RawCaptionSegment[] = [];
  private activeIndex = -1;
  private follow = true;
  private filter = "";
  private onSeek: (t: number) => void;
  private onAskExternal: ((segments: RawCaptionSegment[]) => void) | null = null;
  private onAskProviderChange: ((id: string) => void) | null = null;
  private raf = 0;
  private bound = false;
  private videoEl: HTMLVideoElement | null = null;
  private userScrolling = false;
  private scrollTimer = 0;

  constructor(onSeek: (t: number) => void) {
    this.onSeek = onSeek;
    this.root = document.createElement("div");
    this.root.className = "vsa-transcript";
    this.root.innerHTML = `
      <div class="vsa-tx-card">
        <div class="vsa-tx-head">
          <div class="vsa-tx-title">
            <span class="vsa-tx-ico">${iconHtml("live", 15)}</span>
            <div>
              <strong>Live transcript</strong>
              <span class="vsa-tx-sub">Tap a line to jump · auto-scroll with video</span>
            </div>
          </div>
          <label class="vsa-tx-follow">
            <input type="checkbox" class="vsa-follow-check" checked />
            <span>Follow</span>
          </label>
        </div>
        <div class="vsa-tx-bar">
          <button type="button" class="vsa-tx-copy" data-tx-copy disabled title="Copy the full transcript">
            ${iconHtml("copy", 14)}
            <span data-tx-copy-label>Copy transcript</span>
          </button>
          <div class="vsa-tx-askrow">
            <button type="button" class="vsa-tx-ask" data-tx-ask disabled title="Copy transcript and open ChatGPT">
              ${iconHtml("sparkles", 14)}
              <span data-tx-ask-label>Ask ChatGPT</span>
            </button>
            <select class="vsa-tx-model" data-tx-model title="Choose AI model" aria-label="Ask in">
              <option value="chatgpt">ChatGPT</option>
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
              <option value="grok">Grok</option>
              <option value="perplexity">Perplexity</option>
            </select>
          </div>
        </div>
        <p class="vsa-tx-askhint" data-tx-hint>Copies every caption, opens the model, and pastes it so you can ask anything.</p>
        <div class="vsa-tx-progress" aria-hidden="true">
          <i class="vsa-tx-progress-fill"></i>
        </div>
        <div class="vsa-tx-toolbar">
          <div class="vsa-tx-meta">Waiting for captions…</div>
          <label class="vsa-tx-search">
            <span class="vsa-tx-search-ico">${iconHtml("search", 13)}</span>
            <input type="search" class="vsa-tx-filter" placeholder="Filter lines…" autocomplete="off" />
          </label>
        </div>
        <div class="vsa-transcript-list" role="list"></div>
      </div>
    `;
    this.listEl = this.root.querySelector(".vsa-transcript-list") as HTMLElement;
    this.metaEl = this.root.querySelector(".vsa-tx-meta") as HTMLElement;
    this.progressEl = this.root.querySelector(
      ".vsa-tx-progress-fill"
    ) as HTMLElement;
    this.searchEl = this.root.querySelector(
      ".vsa-tx-filter"
    ) as HTMLInputElement;

    const check = this.root.querySelector(
      ".vsa-follow-check"
    ) as HTMLInputElement;
    check.addEventListener("change", () => {
      this.follow = check.checked;
      if (this.follow && this.activeIndex >= 0) {
        this.setActive(this.activeIndex, true);
      }
    });

    this.searchEl.addEventListener("input", () => {
      this.filter = this.searchEl.value.trim().toLowerCase();
      this.applyFilter();
    });

    const copyBtn = this.root.querySelector("[data-tx-copy]") as HTMLButtonElement;
    copyBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.copyAll();
    });

    const askBtn = this.root.querySelector("[data-tx-ask]") as HTMLButtonElement;
    askBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.segments.length) return;
      this.setHint("Opening… transcript copied");
      this.onAskExternal?.(this.segments);
    });

    const modelSel = this.root.querySelector(
      "[data-tx-model]"
    ) as HTMLSelectElement | null;
    modelSel?.addEventListener("change", () => {
      const id = modelSel.value;
      const name = modelSel.selectedOptions[0]?.textContent || "ChatGPT";
      this.setAskLabel(name);
      this.onAskProviderChange?.(id);
    });

    // Manual scroll → pause auto-follow until they re-enable or click a line
    this.listEl.addEventListener(
      "wheel",
      () => {
        this.userScrolling = true;
        if (this.scrollTimer) window.clearTimeout(this.scrollTimer);
        this.scrollTimer = window.setTimeout(() => {
          this.userScrolling = false;
        }, 1800);
      },
      { passive: true }
    );
    this.listEl.addEventListener(
      "touchmove",
      () => {
        this.userScrolling = true;
      },
      { passive: true }
    );
  }

  setSegments(segments: RawCaptionSegment[]): void {
    this.segments = segments;
    this.activeIndex = -1;
    this.listEl.innerHTML = "";
    this.filter = "";
    if (this.searchEl) this.searchEl.value = "";

    if (!segments.length) {
      this.metaEl.textContent = "No caption lines available";
      this.progressEl.style.width = "0%";
      this.setCopyEnabled(false);
      return;
    }

    this.setCopyEnabled(true);

    this.metaEl.innerHTML = `<b>${segments.length}</b> lines · click to jump`;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const row = document.createElement("button");
      row.type = "button";
      row.className = "vsa-transcript-line";
      row.setAttribute("role", "listitem");
      row.dataset.index = String(i);
      row.dataset.text = seg.text.toLowerCase();
      row.innerHTML = `
        <span class="vsa-transcript-time">${formatTimestamp(seg.startTime)}</span>
        <span class="vsa-transcript-text"></span>
        <span class="vsa-transcript-jump" aria-hidden="true">${iconHtml("zap", 11)}</span>
      `;
      (row.querySelector(".vsa-transcript-text") as HTMLElement).textContent =
        cleanCaptionText(seg.text);
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.follow = true;
        this.userScrolling = false;
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
    this.progressEl.style.width = "0%";
    this.setCopyEnabled(false);
    this.detachVideoSync();
  }

  setAskHandler(fn: (segments: RawCaptionSegment[]) => void): void {
    this.onAskExternal = fn;
  }

  setAskProviderHandler(fn: (id: string) => void): void {
    this.onAskProviderChange = fn;
  }

  setAskProvider(id: string): void {
    const sel = this.root.querySelector(
      "[data-tx-model]"
    ) as HTMLSelectElement | null;
    if (!sel) return;
    if ([...sel.options].some((o) => o.value === id)) sel.value = id;
    const name = sel.selectedOptions[0]?.textContent || "ChatGPT";
    this.setAskLabel(name);
  }

  setHint(text: string): void {
    const el = this.root.querySelector("[data-tx-hint]") as HTMLElement | null;
    if (el) el.textContent = text;
  }

  getSegments(): RawCaptionSegment[] {
    return this.segments;
  }

  setAskLabel(name: string): void {
    const el = this.root.querySelector("[data-tx-ask-label]") as HTMLElement | null;
    if (el) el.textContent = `Ask ${name}`;
    const btn = this.root.querySelector("[data-tx-ask]") as HTMLButtonElement | null;
    if (btn) btn.title = `Open ${name} with this full transcript`;
  }

  private setCopyEnabled(on: boolean): void {
    const copy = this.root.querySelector("[data-tx-copy]") as HTMLButtonElement | null;
    const ask = this.root.querySelector("[data-tx-ask]") as HTMLButtonElement | null;
    if (copy) copy.disabled = !on;
    if (ask) ask.disabled = !on;
  }

  private fullTranscriptText(): string {
    return this.segments
      .map((s) => `${formatTimestamp(s.startTime)}  ${cleanCaptionText(s.text)}`)
      .join("\n");
  }

  private async copyAll(): Promise<void> {
    const text = this.fullTranscriptText();
    if (!text) return;
    const btn = this.root.querySelector("[data-tx-copy]") as HTMLButtonElement | null;
    const label = this.root.querySelector("[data-tx-copy-label]") as HTMLElement | null;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      if (label) label.textContent = "Copied";
      btn?.classList.add("is-ok");
      this.setHint("Full transcript copied. Paste anywhere with ⌘V.");
      window.setTimeout(() => {
        if (label) label.textContent = "Copy transcript";
        btn?.classList.remove("is-ok");
      }, 1600);
    } catch {
      if (label) label.textContent = "Failed";
      this.setHint("Could not copy — select the lines and copy manually.");
      window.setTimeout(() => {
        if (label) label.textContent = "Copy transcript";
      }, 1600);
    }
  }

  destroy(): void {
    this.detachVideoSync();
  }

  private applyFilter(): void {
    const q = this.filter;
    const rows = this.listEl.querySelectorAll(".vsa-transcript-line");
    let visible = 0;
    rows.forEach((el) => {
      const row = el as HTMLElement;
      const text = row.dataset.text || "";
      const show = !q || text.includes(q);
      row.hidden = !show;
      if (show) visible += 1;
    });
    if (q) {
      this.metaEl.innerHTML = `<b>${visible}</b> match${visible === 1 ? "" : "es"} · “${escapeLite(q)}”`;
    } else if (this.segments.length) {
      this.metaEl.innerHTML = `<b>${this.segments.length}</b> lines · click to jump`;
    }
  }

  private attachVideoSync(): void {
    this.detachVideoSync();
    this.bound = true;

    const tick = () => {
      if (!this.bound) return;
      this.syncToVideo();
      this.raf = window.requestAnimationFrame(tick);
    };
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
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (dur > 0) {
      const pct = Math.min(100, Math.max(0, (t / dur) * 100));
      this.progressEl.style.width = `${pct}%`;
    }

    const idx = findActiveIndex(this.segments, t);
    if (idx !== this.activeIndex) {
      this.setActive(idx, this.follow && !this.userScrolling);
    }

    if (idx >= 0 && !this.filter) {
      this.metaEl.innerHTML = `<span class="vsa-tx-now">Now ${formatTimestamp(t)}</span> · line <b>${idx + 1}</b>/${this.segments.length}`;
    }
  }

  private setActive(index: number, scroll: boolean): void {
    if (index < 0 || index >= this.segments.length) return;

    this.listEl
      .querySelectorAll(
        ".vsa-transcript-line.is-active, .vsa-transcript-line.is-past"
      )
      .forEach((el) => {
        el.classList.remove("is-active", "is-past");
      });

    // Mark past lines (only nearby for perf — full paint is fine for <2k)
    const rows = this.listEl.children;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as HTMLElement;
      if (i < index) row.classList.add("is-past");
      else if (i === index) row.classList.add("is-active");
    }

    const row = this.listEl.querySelector(
      `.vsa-transcript-line[data-index="${index}"]`
    ) as HTMLElement | null;
    if (row && scroll && this.follow) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    this.activeIndex = index;
  }
}

function cleanCaptionText(text: string): string {
  return text
    .replace(/^>>\s*/g, "")
    .replace(/\s*>>\s*/g, " ")
    .replace(/\[music\]/gi, "")
    .replace(/\[applause\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLite(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Binary search: last segment with startTime <= t */
function findActiveIndex(segments: RawCaptionSegment[], t: number): number {
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
  return ans;
}
