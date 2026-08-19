/**
 * Per-video source links on this device so a new watch page
 * never shows the previous lecture's chips, and offline still works.
 */

import type { SourceLink } from "../youtube/descriptionLinks";
import { keepVaultSource } from "../youtube/collectSources";

const PREFIX = "vsa_sources_";

function key(videoId: string): string {
  return `${PREFIX}${videoId}`;
}

async function storageGet(k: string): Promise<unknown> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get(k);
      return data[k];
    }
  } catch {
    /* fall through */
  }
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

async function storageSet(k: string, value: unknown): Promise<void> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [k]: value });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    localStorage.setItem(k, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

export async function loadSourceLinks(videoId: string): Promise<SourceLink[]> {
  if (!videoId) return [];
  const raw = await storageGet(key(videoId));
  if (!Array.isArray(raw)) return [];
  return (raw as SourceLink[]).filter(
    (l) => l && typeof l.url === "string" && keepVaultSource(l)
  );
}

export async function saveSourceLinks(
  videoId: string,
  links: SourceLink[]
): Promise<void> {
  if (!videoId) return;
  await storageSet(
    key(videoId),
    links.filter(keepVaultSource).slice(0, 80)
  );
}
