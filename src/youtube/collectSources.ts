import type { RawCaptionSegment } from "../types/schema";
import {
  extractDescriptionLinks,
  type SourceLink,
} from "./descriptionLinks";
import {
  extractSourcesFromCaptions,
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
  return [...map.values()];
}

/** Bio links + spoken CC sources (cached after index, or from these segments). */
export function collectPageSources(
  videoId?: string,
  segments?: RawCaptionSegment[]
): SourceLink[] {
  let bio: SourceLink[] = [];
  try {
    bio = extractDescriptionLinks();
  } catch {
    /* page may not be ready */
  }
  const fromSegs =
    segments && segments.length ? extractSourcesFromCaptions(segments) : [];
  if (videoId && fromSegs.length) rememberCcSources(videoId, fromSegs);
  const cached = videoId ? rememberedCcSources(videoId) : [];
  return mergeVaultSources(bio, cached, fromSegs);
}
