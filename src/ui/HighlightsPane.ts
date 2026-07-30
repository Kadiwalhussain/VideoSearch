/**
 * Notes pane — marks + screenshots (Lucide icons).
 */

import type { VideoHighlight } from "../storage/highlightsStore";
import type { VideoScreenshot } from "../storage/screenshotStore";
import { formatTimestamp } from "../player/seekTo";
import { iconHtml } from "./icons";
import { flashNoteSaved } from "./captureFx";

export interface HighlightsPaneHandlers {
  onAddHighlight: () => void;
  onCaptureFrame: () => void;
  onSyncCloud?: () => void;
  onSeek: (seconds: number) => void;
  onUpdateNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onDeleteScreenshot?: (id: string) => void;
  onUpdateScreenshotNote?: (id: string, note: string) => void;
}

export class HighlightsPane {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private shotsEl: HTMLElement;
  private emptyEl: HTMLElement;
  private countEl: HTMLElement;
  private shotCountEl: HTMLElement;
  private syncMsg: HTMLElement;
  private handlers: HighlightsPaneHandlers;
  private items: VideoHighlight[] = [];
  private shots: VideoScreenshot[] = [];

  constructor(handlers: HighlightsPaneHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "vsa-hl-pane";
    this.root.innerHTML = `
      <div class="vsa-hl-head">
        <div>
          <div class="vsa-hl-title">This video</div>
          <div class="vsa-hl-sub">
            <span class="vsa-hl-count">0</span> marks ·
            <span class="vsa-ss-count">0</span> shots
          </div>
        </div>
        <div class="vsa-hl-actions">
          <button type="button" class="vsa-hl-add" title="Mark time">
            <span class="vsa-hl-add-ico"></span>
            <span>Mark</span>
          </button>
          <button type="button" class="vsa-ss-add" title="Screenshot frame">
            <span class="vsa-ss-add-ico"></span>
            <span>Shot</span>
          </button>
        </div>
      </div>
      <div class="vsa-hl-sync-row">
        <button type="button" class="vsa-hl-sync">
          <span class="vsa-hl-sync-ico"></span>
          <span>Sync</span>
        </button>
        <span class="vsa-hl-sync-msg"></span>
      </div>
      <div class="vsa-ss-section-title">Screenshots</div>
      <div class="vsa-ss-grid"></div>
      <div class="vsa-hl-section-title">Marks &amp; notes</div>
      <div class="vsa-hl-empty" hidden>No marks yet — use the camera or pen on the video.</div>
      <div class="vsa-hl-list" role="list"></div>
    `;

    this.listEl = this.root.querySelector(".vsa-hl-list") as HTMLElement;
    this.shotsEl = this.root.querySelector(".vsa-ss-grid") as HTMLElement;
    this.emptyEl = this.root.querySelector(".vsa-hl-empty") as HTMLElement;
    this.countEl = this.root.querySelector(".vsa-hl-count") as HTMLElement;
    this.shotCountEl = this.root.querySelector(".vsa-ss-count") as HTMLElement;
    this.syncMsg = this.root.querySelector(".vsa-hl-sync-msg") as HTMLElement;

    const addIco = this.root.querySelector(".vsa-hl-add-ico") as HTMLElement;
    if (addIco) addIco.innerHTML = iconHtml("highlight", 14);
    const camIco = this.root.querySelector(".vsa-ss-add-ico") as HTMLElement;
    if (camIco) camIco.innerHTML = iconHtml("camera", 14);
    const syncIco = this.root.querySelector(".vsa-hl-sync-ico") as HTMLElement;
    if (syncIco) syncIco.innerHTML = iconHtml("cloud", 13);

    this.root.querySelector(".vsa-hl-add")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onAddHighlight();
    });
    this.root.querySelector(".vsa-ss-add")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onCaptureFrame();
    });
    this.root.querySelector(".vsa-hl-sync")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onSyncCloud?.();
    });
  }

  setHighlights(items: VideoHighlight[]): void {
    this.items = items.slice().sort((a, b) => a.startTime - b.startTime);
    this.countEl.textContent = String(this.items.length);
    this.renderList();
  }

  setScreenshots(shots: VideoScreenshot[]): void {
    this.shots = shots.slice().sort((a, b) => a.videoTime - b.videoTime);
    this.shotCountEl.textContent = String(this.shots.length);
    this.renderShots();
  }

  /** Fast path: append one shot without re-rendering the whole grid */
  appendScreenshot(shot: VideoScreenshot): void {
    const exists = this.shots.some((s) => s.id === shot.id);
    if (!exists) {
      this.shots = [...this.shots, shot].sort(
        (a, b) => a.videoTime - b.videoTime
      );
    } else {
      this.shots = this.shots
        .map((s) => (s.id === shot.id ? shot : s))
        .sort((a, b) => a.videoTime - b.videoTime);
    }
    this.shotCountEl.textContent = String(this.shots.length);
    this.emptyEl.hidden = true;

    // If grid was empty placeholder, rebuild once
    if (
      !this.shotsEl.querySelector(".vsa-ss-card") ||
      this.shotsEl.querySelector(".vsa-ss-empty")
    ) {
      this.renderShots();
      return;
    }
    // Remove empty placeholder if present
    this.shotsEl.querySelector(".vsa-ss-empty")?.remove();
    const existing = this.shotsEl.querySelector(
      `[data-ss-id="${CSS.escape(shot.id)}"]`
    );
    if (existing) {
      existing.replaceWith(this.renderShot(shot));
    } else {
      // insert in time order
      const cards = Array.from(
        this.shotsEl.querySelectorAll(".vsa-ss-card")
      ) as HTMLElement[];
      const newCard = this.renderShot(shot);
      let inserted = false;
      for (const c of cards) {
        const id = c.dataset.ssId;
        const other = this.shots.find((s) => s.id === id);
        if (other && other.videoTime > shot.videoTime) {
          this.shotsEl.insertBefore(newCard, c);
          inserted = true;
          break;
        }
      }
      if (!inserted) this.shotsEl.appendChild(newCard);
    }
  }

  setSyncMessage(msg: string, isError = false): void {
    this.syncMsg.textContent = msg;
    this.syncMsg.classList.toggle("is-error", isError);
  }

  flashNew(id: string): void {
    const card = this.listEl.querySelector(
      `[data-hl-id="${CSS.escape(id)}"]`
    ) as HTMLElement | null;
    if (!card) return;
    card.classList.add("is-new");
    const ta = card.querySelector("textarea") as HTMLTextAreaElement | null;
    ta?.focus();
    window.setTimeout(() => card.classList.remove("is-new"), 1200);
  }

  flashShot(id: string): void {
    const card = this.shotsEl.querySelector(
      `[data-ss-id="${CSS.escape(id)}"]`
    ) as HTMLElement | null;
    if (!card) return;
    card.classList.add("is-new");
    window.setTimeout(() => card.classList.remove("is-new"), 1200);
  }

  private renderList(): void {
    this.listEl.innerHTML = "";
    this.emptyEl.hidden = this.items.length > 0 || this.shots.length > 0;
    for (const h of this.items) {
      this.listEl.appendChild(this.renderHighlight(h));
    }
  }

  private renderShots(): void {
    if (!this.shots.length) {
      this.shotsEl.innerHTML = `<div class="vsa-ss-empty">Tap the camera on the video to capture a frame.</div>`;
      this.emptyEl.hidden = this.items.length > 0;
      return;
    }
    this.emptyEl.hidden = true;
    this.shotsEl.innerHTML = "";
    for (const s of this.shots) {
      this.shotsEl.appendChild(this.renderShot(s));
    }
  }

  private renderShot(s: VideoScreenshot): HTMLElement {
    const card = document.createElement("div");
    card.className = "vsa-ss-card";
    card.dataset.ssId = s.id;
    const img = document.createElement("img");
    img.src = s.dataUrl || s.cloudUrl || "";
    img.alt = `Frame ${formatTimestamp(s.videoTime)}`;
    img.loading = "lazy";
    img.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onSeek(s.videoTime);
    });
    const meta = document.createElement("div");
    meta.className = "vsa-ss-meta";
    meta.innerHTML = `<time>${formatTimestamp(s.videoTime)}</time>`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "vsa-hl-del";
    del.title = "Delete";
    del.innerHTML = iconHtml("trash", 13);
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onDeleteScreenshot?.(s.id);
    });
    meta.appendChild(del);
    const ta = document.createElement("textarea");
    ta.className = "vsa-hl-note";
    ta.placeholder = "Note…";
    ta.value = s.note || "";
    ta.rows = 2;
    let t: number | null = null;
    ta.addEventListener("input", () => {
      if (t != null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        this.handlers.onUpdateScreenshotNote?.(s.id, ta.value);
        flashNoteSaved(card);
      }, 450);
    });
    ta.addEventListener("click", (e) => e.stopPropagation());
    card.append(img, meta, ta);
    if (s.cloudUrl) {
      const badge = document.createElement("div");
      badge.className = "vsa-ss-cloud";
      badge.innerHTML = `${iconHtml("cloud", 10)} synced`;
      card.appendChild(badge);
    }
    return card;
  }

  private renderHighlight(h: VideoHighlight): HTMLElement {
    const card = document.createElement("div");
    card.className = "vsa-hl-card";
    card.dataset.hlId = h.id;
    if (h.color) card.style.borderLeftColor = h.color;
    card.innerHTML = `
      <div class="vsa-hl-card-head">
        <button type="button" class="vsa-hl-time">${formatTimestamp(h.startTime)}</button>
        <button type="button" class="vsa-hl-del" title="Delete"></button>
      </div>
    `;
    const timeBtn = card.querySelector(".vsa-hl-time") as HTMLButtonElement;
    timeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onSeek(h.startTime);
    });
    const del = card.querySelector(".vsa-hl-del") as HTMLButtonElement;
    del.innerHTML = iconHtml("trash", 13);
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onDelete(h.id);
    });
    const ta = document.createElement("textarea");
    ta.className = "vsa-hl-note";
    ta.placeholder = "Write a note…";
    ta.value = h.note || "";
    ta.rows = 2;
    let t: number | null = null;
    ta.addEventListener("input", () => {
      if (t != null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        this.handlers.onUpdateNote(h.id, ta.value);
        flashNoteSaved(card);
      }, 450);
    });
    ta.addEventListener("click", (e) => e.stopPropagation());
    card.appendChild(ta);
    return card;
  }
}
