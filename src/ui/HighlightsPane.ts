/**
 * Notes pane — premium marks + screenshots with live cloud status.
 */

import type { VideoHighlight } from "../storage/highlightsStore";
import type { VideoScreenshot } from "../storage/screenshotStore";
import { formatTimestamp } from "../player/seekTo";
import { iconHtml } from "./icons";
import { flashNoteSaved } from "./captureFx";

export type CloudSyncState =
  | "idle"
  | "pending"
  | "uploading"
  | "ok"
  | "error"
  | "offline";

export interface LibraryUiState {
  saved: boolean;
  watchLater: boolean;
  playlists: string[];
}

export interface PlaylistOption {
  name: string;
  count?: number;
}

export interface HighlightsPaneHandlers {
  onAddHighlight: () => void;
  onCaptureFrame: () => void;
  onSeek: (seconds: number) => void;
  onUpdateNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onDeleteScreenshot?: (id: string) => void;
  onUpdateScreenshotNote?: (id: string, note: string) => void;
  onToggleWatchLater?: () => void;
  onToggleSave?: () => void;
  /** Add current video to playlist (create if new name) */
  onAddToPlaylist?: (name: string) => void;
  /** Remove current video from playlist */
  onRemoveFromPlaylist?: (name: string) => void;
  /** Toggle membership in an existing playlist */
  onTogglePlaylist?: (name: string) => void;
  /** Called when playlist panel opens — load existing names */
  onRequestPlaylists?: () => void;
}

export class HighlightsPane {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private shotsEl: HTMLElement;
  private emptyEl: HTMLElement;
  private countEl: HTMLElement;
  private shotCountEl: HTMLElement;
  private cloudEl: HTMLElement;
  private cloudIco: HTMLElement;
  private cloudTxt: HTMLElement;
  private handlers: HighlightsPaneHandlers;
  private items: VideoHighlight[] = [];
  private shots: VideoScreenshot[] = [];
  private library: LibraryUiState = {
    saved: false,
    watchLater: false,
    playlists: [],
  };
  private knownPlaylists: PlaylistOption[] = [];

  constructor(handlers: HighlightsPaneHandlers) {
    this.handlers = handlers;
    this.root = document.createElement("div");
    this.root.className = "vsa-hl-pane";
    this.root.innerHTML = `
      <div class="vsa-hl-head">
        <div class="vsa-hl-head-text">
          <div class="vsa-hl-title">Notes</div>
          <div class="vsa-hl-sub">
            <span class="vsa-hl-count">0</span> marks ·
            <span class="vsa-ss-count">0</span> shots
          </div>
        </div>
        <div class="vsa-cloud-pill" data-cloud-state="idle" title="Cloud vault status">
          <span class="vsa-cloud-pill-ico" data-cloud-ico></span>
          <span class="vsa-cloud-pill-txt" data-cloud-txt>Cloud ready</span>
        </div>
      </div>

      <div class="vsa-lib-bar" data-lib-bar>
        <button type="button" class="vsa-lib-btn" data-lib-wl title="Watch later">
          <span class="vsa-lib-ico" data-lib-wl-ico></span>
          <span data-lib-wl-txt>Watch later</span>
        </button>
        <button type="button" class="vsa-lib-btn" data-lib-save title="Save to library">
          <span class="vsa-lib-ico" data-lib-save-ico></span>
          <span data-lib-save-txt>Save</span>
        </button>
        <button type="button" class="vsa-lib-btn" data-lib-pl title="Add to playlist">
          <span class="vsa-lib-ico" data-lib-pl-ico></span>
          <span>Playlist</span>
        </button>
      </div>
      <div class="vsa-lib-pl-panel" data-lib-pl-form hidden>
        <div class="vsa-lib-pl-label">Your playlists</div>
        <div class="vsa-lib-pl-list" data-lib-pl-list>
          <div class="vsa-lib-pl-empty" data-lib-pl-empty>No playlists yet — create one below</div>
        </div>
        <div class="vsa-lib-pl-create">
          <input type="text" class="vsa-lib-pl-input" data-lib-pl-input placeholder="New playlist name…" maxlength="80" />
          <button type="button" class="vsa-lib-pl-go" data-lib-pl-go>Add</button>
        </div>
        <p class="vsa-lib-pl-hint">Tap a list to add or remove this video. Type a name to create one (e.g. Politics).</p>
      </div>
      <div class="vsa-lib-tags" data-lib-tags hidden></div>

      <div class="vsa-hl-actions vsa-hl-actions-bar">
        <button type="button" class="vsa-hl-add" title="Mark this moment">
          <span class="vsa-hl-add-ico"></span>
          <span>Mark</span>
        </button>
        <button type="button" class="vsa-ss-add" title="Screenshot frame">
          <span class="vsa-ss-add-ico"></span>
          <span>Shot</span>
        </button>
      </div>

      <div class="vsa-ss-section-title">
        <span class="vsa-sec-ico" data-sec-cam></span> Screenshots
      </div>
      <div class="vsa-ss-grid"></div>

      <div class="vsa-hl-section-title">
        <span class="vsa-sec-ico" data-sec-mark></span> Marks &amp; notes
      </div>
      <div class="vsa-hl-empty" hidden>
        <div class="vsa-hl-empty-ico" data-empty-ico></div>
        <strong>No marks yet</strong>
        <p>Tap the red pen on the video, or Mark above. Notes auto-sync to the cloud.</p>
      </div>
      <div class="vsa-hl-list" role="list"></div>
    `;

    this.listEl = this.root.querySelector(".vsa-hl-list") as HTMLElement;
    this.shotsEl = this.root.querySelector(".vsa-ss-grid") as HTMLElement;
    this.emptyEl = this.root.querySelector(".vsa-hl-empty") as HTMLElement;
    this.countEl = this.root.querySelector(".vsa-hl-count") as HTMLElement;
    this.shotCountEl = this.root.querySelector(".vsa-ss-count") as HTMLElement;
    this.cloudEl = this.root.querySelector(".vsa-cloud-pill") as HTMLElement;
    this.cloudIco = this.root.querySelector("[data-cloud-ico]") as HTMLElement;
    this.cloudTxt = this.root.querySelector("[data-cloud-txt]") as HTMLElement;

    const addIco = this.root.querySelector(".vsa-hl-add-ico") as HTMLElement;
    if (addIco) addIco.innerHTML = iconHtml("highlight", 14);
    const camIco = this.root.querySelector(".vsa-ss-add-ico") as HTMLElement;
    if (camIco) camIco.innerHTML = iconHtml("camera", 14);
    const secCam = this.root.querySelector("[data-sec-cam]") as HTMLElement;
    if (secCam) secCam.innerHTML = iconHtml("camera", 12);
    const secMark = this.root.querySelector("[data-sec-mark]") as HTMLElement;
    if (secMark) secMark.innerHTML = iconHtml("highlight", 12);
    const emptyIco = this.root.querySelector("[data-empty-ico]") as HTMLElement;
    if (emptyIco) emptyIco.innerHTML = iconHtml("sparkles", 20);

    this.setCloudState("idle");

    const wlIco = this.root.querySelector("[data-lib-wl-ico]") as HTMLElement;
    if (wlIco) wlIco.innerHTML = iconHtml("clock", 13);
    const saveIco = this.root.querySelector(
      "[data-lib-save-ico]"
    ) as HTMLElement;
    if (saveIco) saveIco.innerHTML = iconHtml("bookmark", 13);
    const plIco = this.root.querySelector("[data-lib-pl-ico]") as HTMLElement;
    if (plIco) plIco.innerHTML = iconHtml("playlist", 13);

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
    this.root.querySelector("[data-lib-wl]")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onToggleWatchLater?.();
    });
    this.root
      .querySelector("[data-lib-save]")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlers.onToggleSave?.();
      });
    this.root.querySelector("[data-lib-pl]")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const form = this.root.querySelector(
        "[data-lib-pl-form]"
      ) as HTMLElement | null;
      if (form) {
        form.hidden = !form.hidden;
        if (!form.hidden) {
          this.handlers.onRequestPlaylists?.();
          this.renderPlaylistPicker();
          (
            this.root.querySelector(
              "[data-lib-pl-input]"
            ) as HTMLInputElement | null
          )?.focus();
        }
      }
    });
    const submitPlaylist = () => {
      const input = this.root.querySelector(
        "[data-lib-pl-input]"
      ) as HTMLInputElement | null;
      const name = input?.value?.trim() || "";
      if (!name) return;
      this.handlers.onAddToPlaylist?.(name);
      if (input) input.value = "";
    };
    this.root
      .querySelector("[data-lib-pl-go]")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        submitPlaylist();
      });
    this.root
      .querySelector("[data-lib-pl-input]")
      ?.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          submitPlaylist();
        }
      });
  }

  setLibraryState(state: LibraryUiState): void {
    this.library = {
      saved: Boolean(state.saved),
      watchLater: Boolean(state.watchLater),
      playlists: Array.isArray(state.playlists) ? state.playlists : [],
    };
    this.renderLibraryBar();
    this.renderPlaylistPicker();
  }

  /** Existing playlists from cloud/local for the picker */
  setKnownPlaylists(list: PlaylistOption[]): void {
    this.knownPlaylists = Array.isArray(list) ? list : [];
    this.renderPlaylistPicker();
  }

  private inPlaylist(name: string): boolean {
    const key = name.toLowerCase();
    return this.library.playlists.some((p) => p.toLowerCase() === key);
  }

  private renderPlaylistPicker(): void {
    const listEl = this.root.querySelector(
      "[data-lib-pl-list]"
    ) as HTMLElement | null;
    const emptyEl = this.root.querySelector(
      "[data-lib-pl-empty]"
    ) as HTMLElement | null;
    if (!listEl) return;

    // Merge known playlists + ones this video is already in
    const map = new Map<string, PlaylistOption>();
    for (const p of this.knownPlaylists) {
      if (!p?.name) continue;
      map.set(p.name.toLowerCase(), p);
    }
    for (const name of this.library.playlists) {
      if (!name) continue;
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { name, count: 1 });
    }
    const items = [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    // Clear old buttons (keep empty node pattern)
    listEl.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "vsa-lib-pl-empty";
      empty.dataset.libPlEmpty = "";
      empty.textContent = "No playlists yet — create one below";
      listEl.appendChild(empty);
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    for (const item of items) {
      const on = this.inPlaylist(item.name);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `vsa-lib-pl-item${on ? " is-on" : ""}`;
      btn.dataset.plName = item.name;
      btn.innerHTML = `
        <span class="vsa-lib-pl-item-check">${on ? "✓" : "+"}</span>
        <span class="vsa-lib-pl-item-name">${escapeAttr(item.name)}</span>
        <span class="vsa-lib-pl-item-meta">${on ? "In list" : item.count != null ? `${item.count} videos` : "Add"}</span>
      `;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.handlers.onTogglePlaylist) {
          this.handlers.onTogglePlaylist(item.name);
        } else if (on) {
          this.handlers.onRemoveFromPlaylist?.(item.name);
        } else {
          this.handlers.onAddToPlaylist?.(item.name);
        }
      });
      listEl.appendChild(btn);
    }
  }

  private renderLibraryBar(): void {
    const wlBtn = this.root.querySelector("[data-lib-wl]") as HTMLElement | null;
    const saveBtn = this.root.querySelector(
      "[data-lib-save]"
    ) as HTMLElement | null;
    const plBtn = this.root.querySelector("[data-lib-pl]") as HTMLElement | null;
    const wlTxt = this.root.querySelector(
      "[data-lib-wl-txt]"
    ) as HTMLElement | null;
    const saveTxt = this.root.querySelector(
      "[data-lib-save-txt]"
    ) as HTMLElement | null;
    const saveIco = this.root.querySelector(
      "[data-lib-save-ico]"
    ) as HTMLElement | null;
    const tags = this.root.querySelector(
      "[data-lib-tags]"
    ) as HTMLElement | null;

    wlBtn?.classList.toggle("is-on", this.library.watchLater);
    saveBtn?.classList.toggle("is-on", this.library.saved);
    plBtn?.classList.toggle("is-on", this.library.playlists.length > 0);
    if (wlTxt) {
      wlTxt.textContent = this.library.watchLater ? "In Watch later" : "Watch later";
    }
    if (saveTxt) {
      saveTxt.textContent = this.library.saved ? "Saved" : "Save";
    }
    if (saveIco) {
      saveIco.innerHTML = iconHtml(
        this.library.saved ? "bookmarkCheck" : "bookmark",
        13
      );
    }
    if (tags) {
      if (this.library.playlists.length) {
        tags.hidden = false;
        tags.innerHTML = "";
        for (const p of this.library.playlists) {
          const tag = document.createElement("button");
          tag.type = "button";
          tag.className = "vsa-lib-tag is-removable";
          tag.title = `Remove from ${p}`;
          tag.innerHTML = `${escapeAttr(p)} <span aria-hidden="true">×</span>`;
          tag.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.handlers.onRemoveFromPlaylist?.(p);
          });
          tags.appendChild(tag);
        }
      } else {
        tags.hidden = true;
        tags.innerHTML = "";
      }
    }
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

    if (
      !this.shotsEl.querySelector(".vsa-ss-row") ||
      this.shotsEl.querySelector(".vsa-ss-empty")
    ) {
      this.renderShots();
      return;
    }
    this.shotsEl.querySelector(".vsa-ss-empty")?.remove();
    const existing = this.shotsEl.querySelector(
      `[data-ss-id="${CSS.escape(shot.id)}"]`
    );
    if (existing) {
      existing.replaceWith(this.renderShot(shot));
    } else {
      const rows = Array.from(
        this.shotsEl.querySelectorAll(".vsa-ss-row")
      ) as HTMLElement[];
      const newRow = this.renderShot(shot);
      let inserted = false;
      for (const c of rows) {
        const id = c.dataset.ssId;
        const other = this.shots.find((s) => s.id === id);
        if (other && other.videoTime > shot.videoTime) {
          this.shotsEl.insertBefore(newRow, c);
          inserted = true;
          break;
        }
      }
      if (!inserted) this.shotsEl.appendChild(newRow);
    }
  }

  /**
   * Update cloud pill. Prefer setCloudState for icon animation.
   * Legacy text API still works for callers.
   */
  setSyncMessage(msg: string, isError = false): void {
    const m = (msg || "").toLowerCase();
    if (isError || /sign in|failed|offline|error|invalid/i.test(msg)) {
      if (/sign in|not logged|login/i.test(msg)) {
        this.setCloudState("offline", msg);
      } else {
        this.setCloudState("error", msg);
      }
      return;
    }
    if (/syncing|uploading|auto-syncing/i.test(m)) {
      this.setCloudState("uploading", "Uploading…");
      return;
    }
    if (/saved|synced|uploaded|r2/i.test(m)) {
      this.setCloudState("ok", "Synced");
      return;
    }
    if (/pending|queue|will sync/i.test(m)) {
      this.setCloudState("pending", "Syncing soon…");
      return;
    }
    this.cloudTxt.textContent = msg || "Cloud ready";
  }

  setCloudState(state: CloudSyncState, label?: string): void {
    this.cloudEl.dataset.cloudState = state;
    const labels: Record<CloudSyncState, string> = {
      idle: "Cloud ready",
      pending: "Syncing soon…",
      uploading: "Uploading…",
      ok: "Synced",
      error: "Sync failed",
      offline: "Sign in to sync",
    };
    this.cloudTxt.textContent = label || labels[state];
    const iconName =
      state === "uploading" || state === "pending"
        ? "cloud"
        : state === "ok"
          ? "cloud"
          : state === "error" || state === "offline"
            ? "cloud"
            : "cloud";
    this.cloudIco.innerHTML = iconHtml(iconName, 13);
    // spinning ring for uploading
    this.cloudEl.classList.toggle("is-spin", state === "uploading");
  }

  flashNew(id: string): void {
    const card = this.listEl.querySelector(
      `[data-hl-id="${CSS.escape(id)}"]`
    ) as HTMLElement | null;
    if (!card) return;
    card.classList.add("is-new");
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const ta = card.querySelector(
      "textarea.vsa-hl-note-input"
    ) as HTMLTextAreaElement | null;
    if (ta) {
      // Focus without breaking list layout
      window.setTimeout(() => {
        ta.focus({ preventScroll: true });
        const len = ta.value.length;
        try {
          ta.setSelectionRange(len, len);
        } catch {
          /* ignore */
        }
      }, 120);
    }
    window.setTimeout(() => card.classList.remove("is-new"), 1400);
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
      this.shotsEl.innerHTML = `<div class="vsa-ss-empty">
        <span class="vsa-ss-empty-ico">${iconHtml("camera", 16)}</span>
        Capture a frame with the blue camera on the video.
      </div>`;
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
    // Compact list row: thumb | time + note | cloud + delete
    const row = document.createElement("div");
    row.className = "vsa-ss-row";
    row.dataset.ssId = s.id;

    const thumbBtn = document.createElement("button");
    thumbBtn.type = "button";
    thumbBtn.className = "vsa-ss-thumb";
    thumbBtn.title = `Jump to ${formatTimestamp(s.videoTime)}`;
    const img = document.createElement("img");
    img.src = s.dataUrl || s.cloudUrl || "";
    img.alt = "";
    img.loading = "lazy";
    thumbBtn.appendChild(img);
    thumbBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onSeek(s.videoTime);
    });

    const mid = document.createElement("div");
    mid.className = "vsa-ss-mid";

    const top = document.createElement("div");
    top.className = "vsa-ss-top";
    const timeBtn = document.createElement("button");
    timeBtn.type = "button";
    timeBtn.className = "vsa-ss-time";
    timeBtn.textContent = formatTimestamp(s.videoTime);
    timeBtn.title = "Jump to this frame";
    timeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onSeek(s.videoTime);
    });
    const cloud = document.createElement("span");
    cloud.className = "vsa-ss-cloud-dot";
    if (s.cloudUrl || s.syncedAt) {
      cloud.classList.add("is-synced");
      cloud.innerHTML = `${iconHtml("cloud", 10)} Cloud`;
      cloud.title = "Synced to cloud";
    } else {
      cloud.innerHTML = `${iconHtml("cloud", 10)} Local`;
      cloud.title = "Saved on this device";
    }
    top.append(timeBtn, cloud);

    const note = document.createElement("input");
    note.type = "text";
    note.className = "vsa-ss-note";
    note.placeholder = "Add a note…";
    note.value = s.note || "";
    let t: number | null = null;
    note.addEventListener("input", () => {
      if (t != null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        this.handlers.onUpdateScreenshotNote?.(s.id, note.value);
        flashNoteSaved(row);
        this.setCloudState("pending");
      }, 450);
    });
    note.addEventListener("click", (e) => e.stopPropagation());
    for (const type of ["keydown", "keyup", "keypress"] as const) {
      note.addEventListener(type, (e) => e.stopPropagation(), false);
    }
    note.addEventListener("blur", () => {
      if (t != null) {
        window.clearTimeout(t);
        t = null;
      }
      this.handlers.onUpdateScreenshotNote?.(s.id, note.value);
      flashNoteSaved(row);
      this.setCloudState("pending");
    });

    mid.append(top, note);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "vsa-ss-del";
    del.title = "Delete screenshot";
    del.innerHTML = iconHtml("trash", 13);
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onDeleteScreenshot?.(s.id);
    });

    row.append(thumbBtn, mid, del);
    return row;
  }

  private renderHighlight(h: VideoHighlight): HTMLElement {
    /**
     * Stable list item — flex column, full width:
     *  [ time | badges ........ trash ]
     *  [ note text (always visible)   ]
     */
    const row = document.createElement("article");
    row.className = "vsa-hl-item";
    row.dataset.hlId = h.id;
    const color = h.color || "#ef4444";
    row.style.setProperty("--hl-color", color);
    if (h.screenshotId) row.classList.add("is-shot-link");
    if (h.note?.trim()) row.classList.add("has-note");

    const head = document.createElement("div");
    head.className = "vsa-hl-item-head";

    const left = document.createElement("div");
    left.className = "vsa-hl-item-left";

    const timeBtn = document.createElement("button");
    timeBtn.type = "button";
    timeBtn.className = "vsa-hl-time";
    timeBtn.innerHTML = `${iconHtml("highlight", 12)}<span>${formatTimestamp(h.startTime)}</span>`;
    timeBtn.title = "Jump to this moment";
    timeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onSeek(h.startTime);
    });
    left.appendChild(timeBtn);

    if (h.screenshotId) {
      const badge = document.createElement("span");
      badge.className = "vsa-hl-link-badge";
      badge.innerHTML = `${iconHtml("camera", 10)} shot`;
      badge.title = "Linked to a screenshot";
      left.appendChild(badge);
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "vsa-hl-del";
    del.title = "Delete mark";
    del.innerHTML = iconHtml("trash", 14);
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handlers.onDelete(h.id);
    });

    head.append(left, del);

    const note = document.createElement("textarea");
    note.className = "vsa-hl-note-input";
    note.placeholder = "Write a note for this moment…";
    note.value = h.note || "";
    note.rows = 2;
    note.spellcheck = true;
    note.setAttribute("aria-label", `Note at ${formatTimestamp(h.startTime)}`);

    const syncHeight = () => {
      note.style.height = "0px";
      const next = Math.min(110, Math.max(40, note.scrollHeight));
      note.style.height = `${next}px`;
    };

    let debounce: number | null = null;
    const persistNote = () => {
      if (debounce != null) {
        window.clearTimeout(debounce);
        debounce = null;
      }
      this.handlers.onUpdateNote(h.id, note.value);
      flashNoteSaved(row);
      this.setCloudState("pending");
    };
    note.addEventListener("input", () => {
      syncHeight();
      row.classList.toggle("has-note", Boolean(note.value.trim()));
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(persistNote, 350);
    });
    // Flush on blur so notes never get lost if the user clicks away
    note.addEventListener("blur", () => {
      row.classList.remove("is-focus");
      persistNote();
    });
    note.addEventListener("click", (e) => e.stopPropagation());
    for (const type of ["keydown", "keyup", "keypress"] as const) {
      note.addEventListener(type, (e) => e.stopPropagation(), false);
    }
    note.addEventListener("focus", () => row.classList.add("is-focus"));

    row.append(head, note);
    // Defer height so layout is ready
    requestAnimationFrame(() => {
      syncHeight();
    });
    return row;
  }
}

function escapeAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
