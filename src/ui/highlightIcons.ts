/**
 * Timeline / highlight icons — Lucide-backed for consistency.
 */

import { iconHtml as lucideIcon, iconSvg } from "./icons";

export const ICON_HIGHLIGHT = iconSvg("highlight", 16, 2);
export const ICON_NOTE = iconSvg("notes", 16, 2);
export const ICON_BOOKMARK = iconSvg("notes", 16, 2.2);
export const ICON_CAMERA = iconSvg("camera", 16, 2);

export function iconHtml(
  kind: "highlight" | "note" | "bookmark" | "camera",
  size = 16
): string {
  const name =
    kind === "camera"
      ? "camera"
      : kind === "note" || kind === "bookmark"
        ? "notes"
        : "highlight";
  return lucideIcon(name as "camera" | "notes" | "highlight", size, 2);
}
