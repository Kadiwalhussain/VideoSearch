/**
 * Watch-page shortcuts.
 *   Mac: ⌘M mark · ⌘C capture (copy still works if text is selected)
 *   Windows/Linux: Ctrl+M · Ctrl+C (same copy rule)
 */

export function isMacPlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const plat =
    nav.userAgentData?.platform || navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad/i.test(plat);
}

export function shortcutLabel(kind: "mark" | "capture"): string {
  const mac = isMacPlatform();
  if (kind === "mark") return mac ? "⌘M" : "Ctrl+M";
  return mac ? "⌘C" : "Ctrl+C";
}

function isTypingTarget(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (node as HTMLInputElement).type || "text";
    return ![
      "button",
      "submit",
      "checkbox",
      "radio",
      "file",
      "range",
      "color",
      "hidden",
      "image",
      "reset",
    ].includes(type);
  }
  if (node.isContentEditable) return true;
  return false;
}

function hasCopyableSelection(): boolean {
  try {
    const sel = window.getSelection()?.toString() ?? "";
    if (sel.trim().length > 0) return true;
  } catch {
    /* ignore */
  }
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    return start != null && end != null && start !== end;
  }
  return false;
}

export type HotkeyAction = "mark" | "capture";

/**
 * Returns the action for this keydown, or null.
 * Does not steal Copy when the user has selected text.
 */
export function matchWatchHotkey(e: KeyboardEvent): HotkeyAction | null {
  if (e.repeat || e.altKey || e.shiftKey) return null;
  const accel = e.metaKey || e.ctrlKey;
  if (!accel) return null;
  if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) {
    return null;
  }

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const code = e.code;

  if (code === "KeyM" || key === "m") return "mark";
  if (code === "KeyC" || key === "c") {
    if (hasCopyableSelection()) return null;
    return "capture";
  }
  return null;
}
