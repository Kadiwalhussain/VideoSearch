/**
 * Lucide icons → HTML for the extension panel (vanilla DOM).
 */

import type { IconNode } from "lucide";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Cloud,
  ExternalLink,
  Eye,
  EyeOff,
  Highlighter,
  LayoutGrid,
  ListVideo,
  LogOut,
  MessageSquare,
  Minus,
  Bookmark,
  BookmarkCheck,
  Clock,
  FolderPlus,
  Link2,
  RefreshCw,
  Search,
  Send,
  Settings,
  Smile,
  Sparkles,
  Trash2,
  User,
  Zap,
} from "lucide";

export type IconName =
  | "search"
  | "chat"
  | "notes"
  | "more"
  | "camera"
  | "highlight"
  | "topics"
  | "live"
  | "mood"
  | "settings"
  | "vault"
  | "user"
  | "back"
  | "minimize"
  | "send"
  | "cloud"
  | "logout"
  | "external"
  | "sparkles"
  | "zap"
  | "eye"
  | "eyeOff"
  | "trash"
  | "refresh"
  | "grid"
  | "bookmark"
  | "bookmarkCheck"
  | "clock"
  | "playlist"
  | "link";

const MAP: Record<IconName, IconNode> = {
  search: Search,
  chat: MessageSquare,
  notes: Highlighter,
  more: LayoutGrid,
  camera: Camera,
  highlight: Highlighter,
  topics: BookOpen,
  live: ListVideo,
  mood: Smile,
  settings: Settings,
  vault: Cloud,
  user: User,
  back: ArrowLeft,
  minimize: Minus,
  send: Send,
  cloud: Cloud,
  logout: LogOut,
  external: ExternalLink,
  sparkles: Sparkles,
  zap: Zap,
  eye: Eye,
  eyeOff: EyeOff,
  trash: Trash2,
  refresh: RefreshCw,
  grid: LayoutGrid,
  bookmark: Bookmark,
  bookmarkCheck: BookmarkCheck,
  clock: Clock,
  playlist: FolderPlus,
  link: Link2,
};

function attrsToString(attrs: Record<string, string | number>): string {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, "&quot;")}"`)
    .join(" ");
}

/** Render a Lucide icon as an SVG HTML string */
export function iconSvg(
  name: IconName,
  size = 16,
  strokeWidth = 2
): string {
  const node = MAP[name];
  if (!node) return "";
  const body = node
    .map(([tag, attrs]) => {
      const a = { ...attrs } as Record<string, string | number>;
      return `<${tag} ${attrsToString(a)}/>`;
    })
    .join("");
  return `<svg class="vsa-icon vsa-icon-${name}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Wrapper span for layout */
export function iconHtml(
  name: IconName,
  size = 16,
  strokeWidth = 2
): string {
  return `<span class="vsa-ico" style="display:inline-flex;width:${size}px;height:${size}px;flex-shrink:0;align-items:center;justify-content:center;color:inherit">${iconSvg(name, size, strokeWidth)}</span>`;
}
