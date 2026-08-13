/**
 * Capture FX: shutter flash + photo review popup + save animation.
 * Only two video controls (camera + mark) live in timelineHighlights.
 */

import { iconHtml } from "./icons";

const STYLE_ID = "vsa-capture-fx-style";
const POPUP_ID = "vsa-capture-popup";
const FLASH_ID = "vsa-capture-flash";

export interface CapturePopupResult {
  note: string;
  saved: boolean;
}

/**
 * Isolate popup fields from YouTube without breaking Save/Skip clicks.
 *
 * IMPORTANT: never stopPropagation on pointer/click in the *capture* phase on
 * the popup root — that blocks the event before it reaches the buttons.
 * MAIN-world YouTube hotkeys are handled in pageBridge while inputs are focused.
 */
function wirePopupFieldIsolation(
  root: HTMLElement,
  ta: HTMLTextAreaElement,
  opts: {
    onSave: () => void;
    onSkip: () => void;
  }
): void {
  const stopBubble = (e: Event) => e.stopPropagation();

  // Keys only on the textarea (target phase / bubble). Do NOT capture-stop on root.
  for (const type of [
    "keydown",
    "keyup",
    "keypress",
    "input",
    "beforeinput",
  ] as const) {
    ta.addEventListener(type, stopBubble, false);
  }

  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      opts.onSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      opts.onSkip();
    }
  });

  // Bubble phase only — children (Save/Skip) receive the event first
  for (const type of [
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
  ] as const) {
    root.addEventListener(type, stopBubble, false);
  }
}

function bindPopupActions(
  saveBtn: HTMLButtonElement,
  skipBtn: HTMLButtonElement,
  onSave: () => void,
  onSkip: () => void
): void {
  const fire =
    (fn: () => void) =>
    (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
  saveBtn.addEventListener("click", fire(onSave));
  skipBtn.addEventListener("click", fire(onSkip));
  // Extra path if YouTube swallows click but not pointerup
  saveBtn.addEventListener("pointerup", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSave();
  });
  skipBtn.addEventListener("pointerup", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSkip();
  });
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${FLASH_ID} {
      position: absolute !important;
      inset: 0 !important;
      z-index: 70 !important;
      pointer-events: none !important;
      background: #fff !important;
      opacity: 0 !important;
      will-change: opacity !important;
      animation: vsa-shutter-flash 0.28s ease-out forwards !important;
    }
    @keyframes vsa-shutter-flash {
      0% { opacity: 0; }
      15% { opacity: 0.75; }
      100% { opacity: 0; }
    }

    #${POPUP_ID} {
      position: absolute !important;
      left: 50% !important;
      right: auto !important;
      bottom: 84px !important;
      transform: translateX(-50%) !important;
      z-index: 80 !important;
      width: min(300px, calc(100% - 32px)) !important;
      font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif !important;
      color: #f4f5f7 !important;
      pointer-events: auto !important;
      animation: vsa-polaroid-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) both !important;
      transform-origin: 50% 100% !important;
      will-change: transform, opacity !important;
    }
    #movie_player.ytp-autohide #${POPUP_ID} {
      bottom: 28px !important;
    }
    @keyframes vsa-polaroid-in {
      0% { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.94); }
      100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    }
    #${POPUP_ID}.is-saving {
      animation: vsa-polaroid-save 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) forwards !important;
    }
    @keyframes vsa-polaroid-save {
      0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(0.55); }
    }
    #${POPUP_ID}.is-dismiss {
      animation: vsa-polaroid-out 0.28s ease forwards !important;
    }
    @keyframes vsa-polaroid-out {
      to { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.92); }
    }

    #${POPUP_ID} .vsa-cap-card {
      border-radius: 16px !important;
      overflow: hidden !important;
      background: #12151c !important;
      border: 1px solid rgba(255,255,255,0.12) !important;
      box-shadow:
        0 0 0 1px rgba(62,207,142,0.12),
        0 24px 48px rgba(0,0,0,0.55),
        0 0 40px rgba(62,207,142,0.08) !important;
      backdrop-filter: blur(16px) !important;
    }
    #${POPUP_ID} .vsa-cap-head {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 8px !important;
      padding: 10px 12px 0 !important;
    }
    #${POPUP_ID} .vsa-cap-title {
      display: inline-flex !important;
      align-items: center !important;
      gap: 7px !important;
      font-size: 12px !important;
      font-weight: 750 !important;
      letter-spacing: -0.02em !important;
      color: #f4f5f7 !important;
    }
    #${POPUP_ID} .vsa-cap-title .vsa-ico { color: #6cb6ff !important; }
    #${POPUP_ID} .vsa-cap-time {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
      font-size: 11px !important;
      font-weight: 600 !important;
      color: #6cb6ff !important;
      background: rgba(108,182,255,0.12) !important;
      border: 1px solid rgba(108,182,255,0.28) !important;
      border-radius: 999px !important;
      padding: 3px 8px !important;
    }
    #${POPUP_ID} .vsa-cap-thumb {
      margin: 10px 12px 0 !important;
      border-radius: 12px !important;
      overflow: hidden !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
      background: #000 !important;
      max-height: 148px !important;
      aspect-ratio: 16/9 !important;
      position: relative !important;
    }
    #${POPUP_ID} .vsa-cap-thumb img {
      width: 100% !important;
      height: 100% !important;
      object-fit: cover !important;
      display: block !important;
    }
    #${POPUP_ID} .vsa-cap-body { padding: 10px 12px 12px !important; }
    #${POPUP_ID} .vsa-cap-label {
      display: block !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      letter-spacing: 0.08em !important;
      text-transform: uppercase !important;
      color: #5a616e !important;
      margin-bottom: 6px !important;
    }
    #${POPUP_ID} textarea {
      width: 100% !important;
      min-height: 64px !important;
      resize: vertical !important;
      border-radius: 10px !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
      background: rgba(0,0,0,0.4) !important;
      color: #f4f5f7 !important;
      font-family: inherit !important;
      font-size: 12.5px !important;
      padding: 9px 10px !important;
      outline: none !important;
      box-sizing: border-box !important;
      margin: 0 0 10px !important;
    }
    #${POPUP_ID} textarea:focus {
      border-color: rgba(62,207,142,0.4) !important;
      box-shadow: 0 0 0 3px rgba(62,207,142,0.12) !important;
    }
    #${POPUP_ID} .vsa-cap-actions {
      display: flex !important;
      gap: 8px !important;
    }
    #${POPUP_ID} .vsa-cap-save,
    #${POPUP_ID} .vsa-cap-skip {
      flex: 1 !important;
      border-radius: 10px !important;
      padding: 10px 12px !important;
      font-family: inherit !important;
      font-size: 12.5px !important;
      font-weight: 750 !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
      border: none !important;
      transition: transform 0.12s ease, filter 0.12s !important;
    }
    #${POPUP_ID} .vsa-cap-save {
      background: #3ecf8e !important;
      color: #04140c !important;
    }
    #${POPUP_ID} .vsa-cap-skip {
      background: transparent !important;
      color: #8b929e !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
    }
    #${POPUP_ID} .vsa-cap-save:hover,
    #${POPUP_ID} .vsa-cap-skip:hover { transform: translateY(-1px) !important; }
    #${POPUP_ID} .vsa-cap-saved-toast {
      position: absolute !important;
      left: 50% !important;
      top: 40% !important;
      transform: translate(-50%, -50%) scale(0.8) !important;
      background: rgba(12,18,16,0.92) !important;
      border: 1px solid rgba(62,207,142,0.4) !important;
      color: #3ecf8e !important;
      font-weight: 750 !important;
      font-size: 13px !important;
      padding: 10px 16px !important;
      border-radius: 999px !important;
      opacity: 0 !important;
      pointer-events: none !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
    }
    #${POPUP_ID}.is-saving .vsa-cap-saved-toast {
      animation: vsa-toast-pop 0.45s ease forwards !important;
    }
    @keyframes vsa-toast-pop {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
      40% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
      100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }

    /* Note save checkmark animation in panel */
    .vsa-note-saved-flash {
      position: relative !important;
    }
    .vsa-note-saved-flash::after {
      content: "Saved" !important;
      position: absolute !important;
      right: 8px !important;
      top: 8px !important;
      font-size: 10px !important;
      font-weight: 750 !important;
      color: #04140c !important;
      background: #3ecf8e !important;
      padding: 3px 8px !important;
      border-radius: 999px !important;
      animation: vsa-note-badge 1.1s ease forwards !important;
      pointer-events: none !important;
      z-index: 5 !important;
    }
    @keyframes vsa-note-badge {
      0% { opacity: 0; transform: translateY(4px) scale(0.9); }
      20% { opacity: 1; transform: translateY(0) scale(1); }
      80% { opacity: 1; }
      100% { opacity: 0; transform: translateY(-4px); }
    }
  `;
  document.documentElement.appendChild(style);
}

function getPlayer(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("#movie_player") ??
    document.querySelector<HTMLElement>(".html5-video-player")
  );
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** White shutter flash over the video */
export function playShutterFlash(): void {
  ensureStyles();
  const player = getPlayer();
  if (!player) return;
  document.getElementById(FLASH_ID)?.remove();
  const flash = document.createElement("div");
  flash.id = FLASH_ID;
  const cs = getComputedStyle(player);
  if (cs.position === "static") player.style.position = "relative";
  player.appendChild(flash);
  window.setTimeout(() => flash.remove(), 500);
}

/**
 * Photo-style review popup on the video.
 * User can add a note then Save → flies into Notes, or Skip.
 */
export function showCapturePopup(opts: {
  dataUrl: string;
  videoTime: number;
}): Promise<CapturePopupResult> {
  ensureStyles();
  const player = getPlayer();
  document.getElementById(POPUP_ID)?.remove();

  return new Promise((resolve) => {
    const host = player || document.body;
    if (player) {
      const cs = getComputedStyle(player);
      if (cs.position === "static") player.style.position = "relative";
    }

    const root = document.createElement("div");
    root.id = POPUP_ID;
    root.setAttribute("data-vsa", "capture-popup");
    root.innerHTML = `
      <div class="vsa-cap-card">
        <div class="vsa-cap-head">
          <div class="vsa-cap-title">
            ${iconHtml("camera", 14)}
            Captured
          </div>
          <span class="vsa-cap-time">${formatTime(opts.videoTime)}</span>
        </div>
        <div class="vsa-cap-thumb">
          <img alt="Captured frame" draggable="false" />
        </div>
        <div class="vsa-cap-body">
          <label class="vsa-cap-label">Add a note</label>
          <textarea placeholder="What is on this frame? (board formula, slide title…)" rows="3"></textarea>
          <div class="vsa-cap-actions">
            <button type="button" class="vsa-cap-skip">Skip</button>
            <button type="button" class="vsa-cap-save">
              ${iconHtml("notes", 14)}
              Save to Notes
            </button>
          </div>
        </div>
        <div class="vsa-cap-saved-toast">
          ${iconHtml("sparkles", 14)}
          Saved to Notes
        </div>
      </div>
    `;

    const img = root.querySelector("img") as HTMLImageElement;
    img.src = opts.dataUrl;
    const ta = root.querySelector("textarea") as HTMLTextAreaElement;
    const saveBtn = root.querySelector(".vsa-cap-save") as HTMLButtonElement;
    const skipBtn = root.querySelector(".vsa-cap-skip") as HTMLButtonElement;

    let settled = false;
    const finish = (saved: boolean, note: string) => {
      if (settled) return;
      settled = true;
      if (saved) {
        root.classList.add("is-saving");
        window.setTimeout(() => {
          root.remove();
          resolve({ note, saved: true });
        }, 400);
      } else {
        root.classList.add("is-dismiss");
        window.setTimeout(() => {
          root.remove();
          resolve({ note: "", saved: false });
        }, 200);
      }
    };

    const doSave = () => finish(true, ta.value.trim());
    // still saved as shot, just no note from popup
    const doSkip = () => finish(true, "");
    bindPopupActions(saveBtn, skipBtn, doSave, doSkip);
    wirePopupFieldIsolation(root, ta, { onSave: doSave, onSkip: doSkip });

    host.appendChild(root);
    window.setTimeout(() => {
      ta.focus({ preventScroll: true });
    }, 180);
  });
}

/** Flash a “Saved” badge on a note card in the panel */
export function flashNoteSaved(el: HTMLElement | null): void {
  if (!el) return;
  ensureStyles();
  el.classList.remove("vsa-note-saved-flash");
  // reflow
  void el.offsetWidth;
  el.classList.add("vsa-note-saved-flash");
  window.setTimeout(() => el.classList.remove("vsa-note-saved-flash"), 1200);
}

const MARK_POPUP_ID = "vsa-mark-popup";
const MARK_STYLE_ID = "vsa-mark-fx-style";

export interface MarkNotePopupResult {
  note: string;
  /** false only if user dismissed without saving the mark note path — we always keep the mark */
  kept: boolean;
}

function ensureMarkStyles(): void {
  if (document.getElementById(MARK_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = MARK_STYLE_ID;
  style.textContent = `
    #${MARK_POPUP_ID} {
      position: absolute !important;
      left: 50% !important;
      right: auto !important;
      bottom: 84px !important;
      z-index: 82 !important;
      width: min(320px, calc(100% - 32px)) !important;
      font-family: "Plus Jakarta Sans", "Inter", ui-sans-serif, system-ui, sans-serif !important;
      color: #f4f5f7 !important;
      pointer-events: auto !important;
      animation: vsa-mark-in 0.38s cubic-bezier(0.16, 1, 0.3, 1) both !important;
      transform-origin: 50% 100% !important;
    }
    #movie_player.ytp-autohide #${MARK_POPUP_ID} {
      bottom: 28px !important;
    }
    @keyframes vsa-mark-in {
      0% { opacity: 0; transform: translateX(-50%) translateY(18px) scale(0.92); }
      60% { opacity: 1; transform: translateX(-50%) translateY(-4px) scale(1.02); }
      100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    }
    #${MARK_POPUP_ID}.is-saving {
      animation: vsa-mark-save 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) forwards !important;
    }
    @keyframes vsa-mark-save {
      0% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
      100% { opacity: 0; transform: translateX(-50%) translateY(-40px) scale(0.5); }
    }
    #${MARK_POPUP_ID}.is-dismiss {
      animation: vsa-mark-out 0.25s ease forwards !important;
    }
    @keyframes vsa-mark-out {
      to { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.94); }
    }
    #${MARK_POPUP_ID} .vsa-mark-card {
      border-radius: 18px !important;
      overflow: hidden !important;
      background: linear-gradient(165deg, #1a1214 0%, #12151c 55%, #0e1118 100%) !important;
      border: 1px solid rgba(248,113,113,0.35) !important;
      box-shadow:
        0 0 0 1px rgba(248,113,113,0.12),
        0 28px 56px rgba(0,0,0,0.55),
        0 0 48px rgba(239,68,68,0.12) !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-glow {
      height: 3px !important;
      background: linear-gradient(90deg, #f87171, #fb7185, #fbbf24) !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-head {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 10px !important;
      padding: 12px 14px 0 !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-title {
      display: inline-flex !important;
      align-items: center !important;
      gap: 8px !important;
      font-size: 13px !important;
      font-weight: 800 !important;
      letter-spacing: -0.02em !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-title .vsa-ico { color: #fca5a5 !important; }
    #${MARK_POPUP_ID} .vsa-mark-time {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
      font-size: 12px !important;
      font-weight: 750 !important;
      color: #fecaca !important;
      background: rgba(248,113,113,0.15) !important;
      border: 1px solid rgba(248,113,113,0.3) !important;
      border-radius: 999px !important;
      padding: 4px 10px !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-body {
      padding: 10px 14px 14px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 8px !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-sub {
      margin: 0 !important;
      font-size: 12px !important;
      line-height: 1.4 !important;
      color: #8b95a8 !important;
    }
    #${MARK_POPUP_ID} label {
      font-size: 10px !important;
      font-weight: 750 !important;
      letter-spacing: 0.08em !important;
      text-transform: uppercase !important;
      color: #6b7280 !important;
    }
    #${MARK_POPUP_ID} textarea {
      width: 100% !important;
      box-sizing: border-box !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
      border-radius: 12px !important;
      background: rgba(0,0,0,0.35) !important;
      color: #f4f5f7 !important;
      font-family: inherit !important;
      font-size: 13px !important;
      line-height: 1.45 !important;
      padding: 10px 12px !important;
      resize: none !important;
      outline: none !important;
      min-height: 72px !important;
    }
    #${MARK_POPUP_ID} textarea:focus {
      border-color: rgba(248,113,113,0.45) !important;
      box-shadow: 0 0 0 3px rgba(248,113,113,0.12) !important;
    }
    #${MARK_POPUP_ID} textarea::placeholder { color: #5c6678 !important; }
    #${MARK_POPUP_ID} .vsa-mark-actions {
      display: flex !important;
      gap: 8px !important;
      margin-top: 4px !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-skip {
      flex: 1 !important;
      border: 1px solid rgba(255,255,255,0.1) !important;
      background: transparent !important;
      color: #8b95a8 !important;
      border-radius: 11px !important;
      padding: 10px !important;
      font-family: inherit !important;
      font-size: 12.5px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-skip:hover {
      color: #f4f5f7 !important;
      border-color: rgba(255,255,255,0.18) !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-save {
      flex: 1.35 !important;
      border: none !important;
      border-radius: 11px !important;
      padding: 10px !important;
      font-family: inherit !important;
      font-size: 12.5px !important;
      font-weight: 800 !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 6px !important;
      color: #1a0508 !important;
      background: linear-gradient(135deg, #fca5a5, #f87171 50%, #ef4444) !important;
      box-shadow: 0 8px 22px rgba(239,68,68,0.3) !important;
    }
    #${MARK_POPUP_ID} .vsa-mark-save:hover { filter: brightness(1.05) !important; }
  `;
  document.documentElement.appendChild(style);
}

/**
 * Animated mark popup after pinning a moment.
 * Optional note — Skip keeps the mark without text.
 */
export function showMarkNotePopup(opts: {
  videoTime: number;
}): Promise<MarkNotePopupResult> {
  ensureMarkStyles();
  const player = getPlayer();
  document.getElementById(MARK_POPUP_ID)?.remove();

  return new Promise((resolve) => {
    const host = player || document.body;
    if (player) {
      const cs = getComputedStyle(player);
      if (cs.position === "static") player.style.position = "relative";
    }

    const root = document.createElement("div");
    root.id = MARK_POPUP_ID;
    root.setAttribute("data-vsa", "mark-popup");
    root.innerHTML = `
      <div class="vsa-mark-card">
        <div class="vsa-mark-glow"></div>
        <div class="vsa-mark-head">
          <div class="vsa-mark-title">
            ${iconHtml("highlight", 15)}
            Moment marked
          </div>
          <span class="vsa-mark-time">${formatTime(opts.videoTime)}</span>
        </div>
        <div class="vsa-mark-body">
          <p class="vsa-mark-sub">Want to remember why? Add a note — or skip and keep the pin only.</p>
          <label>Optional note</label>
          <textarea placeholder="e.g. definition, formula, important point…" rows="3"></textarea>
          <div class="vsa-mark-actions">
            <button type="button" class="vsa-mark-skip">Skip note</button>
            <button type="button" class="vsa-mark-save">
              ${iconHtml("notes", 14)}
              Save note
            </button>
          </div>
        </div>
      </div>
    `;

    const ta = root.querySelector("textarea") as HTMLTextAreaElement;
    const saveBtn = root.querySelector(".vsa-mark-save") as HTMLButtonElement;
    const skipBtn = root.querySelector(".vsa-mark-skip") as HTMLButtonElement;

    let settled = false;
    const finish = (note: string, animated: boolean) => {
      if (settled) return;
      settled = true;
      root.classList.add(animated ? "is-saving" : "is-dismiss");
      window.setTimeout(
        () => {
          root.remove();
          resolve({ note, kept: true });
        },
        animated ? 420 : 220
      );
    };

    const doSave = () => finish(ta.value.trim(), true);
    const doSkip = () => finish("", false);
    bindPopupActions(saveBtn, skipBtn, doSave, doSkip);
    wirePopupFieldIsolation(root, ta, { onSave: doSave, onSkip: doSkip });

    host.appendChild(root);
    window.setTimeout(() => {
      ta.focus({ preventScroll: true });
      const len = ta.value.length;
      try {
        ta.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }, 200);
  });
}
