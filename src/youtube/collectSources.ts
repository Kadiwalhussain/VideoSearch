import type { RawCaptionSegment } from "../types/schema";
import {
  extractDescriptionLinks,
  type SourceLink,
} from "./descriptionLinks";
import {
  extractSourcesFromCaptions,
  isKeepableSource,
  rememberCcSources,
  rememberedCcSources,
  type CcSource,
} from "./ccSources";

function keyOf(url: string): string {
  return String(url || "")
    .trim()
    .toLowerCase()
    .replace(/\/$/, "");
}

export function mergeVaultSources(
  ...lists: Array<Array<SourceLink | CcSource> | undefined>
): SourceLink[] {
  const map = new Map<string, SourceLink>();
  for (const list of lists) {
    for (const raw of list || []) {
      const key = keyOf(raw.url);
      if (!key) continue;
      const item: SourceLink = {
        id: raw.id,
        url: raw.url,
        label: raw.label,
        kind: raw.kind,
        source: raw.source,
        createdAt: raw.createdAt,
        startTime: "startTime" in raw ? raw.startTime : undefined,
      };
      const prev = map.get(key);
      if (!prev) {
        map.set(key, item);
        continue;
      }
      map.set(key, {
        ...prev,
        ...item,
        label:
          (item.label || "").length > (prev.label || "").length
            ? item.label
            : prev.label,
        kind:
          item.kind && item.kind !== "link" ? item.kind : prev.kind || item.kind,
        source: prev.source === "description" ? prev.source : item.source,
        startTime: prev.startTime ?? item.startTime,
        id: prev.id || item.id,
      });
    }
  }
  const rank = (s?: string) =>
    s === "description" ? 0 : s === "comment" ? 1 : 2;
  return [...map.values()]
    .filter(isKeepableSource)
    .sort((a, b) => rank(a.source) - rank(b.source) || (a.startTime || 0) - (b.startTime || 0));
}

/** YouTube watch id currently on the page (SPA-safe). */
export function watchVideoIdFromPage(): string | null {
  const host = document.querySelector("ytd-watch-flexy");
  const attr = host?.getAttribute("video-id");
  if (attr && attr.length >= 8) return attr;
  try {
    return new URL(location.href).searchParams.get("v");
  } catch {
    return null;
  }
}

export function pageMatchesVideo(videoId?: string): boolean {
  if (!videoId) return false;
  return watchVideoIdFromPage() === videoId;
}

/** Bio links + spoken CC sources. Never mixes the previous watch page. */
export function collectPageSources(
  videoId?: string,
  segments?: RawCaptionSegment[]
): SourceLink[] {
  const pageOk = !videoId || pageMatchesVideo(videoId);
  let bio: SourceLink[] = [];
  if (pageOk) {
    try {
      bio = extractDescriptionLinks();
    } catch {
      /* page may not be ready */
    }
  }
  const fromSegs =
    pageOk && segments && segments.length
      ? extractSourcesFromCaptions(segments)
      : [];
  if (videoId && fromSegs.length) rememberCcSources(videoId, fromSegs);
  const cached = videoId ? rememberedCcSources(videoId) : [];
  return mergeVaultSources(bio, cached, fromSegs);
}
