/**
 * Extract official YouTube chapters when the creator defined them.
 * Sources (in order):
 *  1. playerOverlays multiMarkersPlayerBar (DESCRIPTION_CHAPTERS)
 *  2. engagementPanels macroMarkersList
 *  3. Timestamp lines in the video description
 *
 * These are human-authored titles — best possible "main topics".
 */

export interface YtChapter {
  title: string;
  startTime: number; // seconds
}

/**
 * Fetch all known chapter markers for a video (may be empty).
 */
export async function fetchYouTubeChapters(
  videoId: string
): Promise<YtChapter[]> {
  if (!videoId) return [];

  try {
    const html = await fetchWatchHtml(videoId);
    const fromPlayer = extractChaptersFromPlayerJson(html);
    if (fromPlayer.length > 0) {
      console.info(
        "[VideoSearch AI] YouTube chapters (player):",
        fromPlayer.length,
        fromPlayer.map((c) => c.title)
      );
      return fromPlayer;
    }

    const fromData = extractChaptersFromInitialData(html);
    if (fromData.length > 0) {
      console.info(
        "[VideoSearch AI] YouTube chapters (ytInitialData):",
        fromData.length,
        fromData.map((c) => c.title)
      );
      return fromData;
    }

    const fromDesc = extractChaptersFromDescription(html);
    if (fromDesc.length > 0) {
      console.info(
        "[VideoSearch AI] YouTube chapters (description):",
        fromDesc.length,
        fromDesc.map((c) => c.title)
      );
      return fromDesc;
    }
  } catch (err) {
    console.warn("[VideoSearch AI] Chapter fetch failed:", err);
  }

  return [];
}

async function fetchWatchHtml(videoId: string): Promise<string> {
  const res = await fetch(
    `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    {
      credentials: "include",
      headers: {
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }
  );
  if (!res.ok) return "";
  return res.text();
}

// ---------------------------------------------------------------------------
// Player JSON (ytInitialPlayerResponse)
// ---------------------------------------------------------------------------

function extractChaptersFromPlayerJson(html: string): YtChapter[] {
  const json = extractJsonAssignment(html, "ytInitialPlayerResponse");
  if (!json) return [];

  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const chapters: YtChapter[] = [];

    // Path: playerOverlays → decoratedPlayerBar → multiMarkersPlayerBar → markersMap
    walkForMarkersMap(root, chapters);
    if (chapters.length > 0) return dedupeSort(chapters);

    // Nested search for chapterRenderer objects
    walkForChapterRenderers(root, chapters);
    return dedupeSort(chapters);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// ytInitialData (engagement panels, etc.)
// ---------------------------------------------------------------------------

function extractChaptersFromInitialData(html: string): YtChapter[] {
  const json = extractJsonAssignment(html, "ytInitialData");
  if (!json) return [];

  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const chapters: YtChapter[] = [];
    walkForMacroMarkers(root, chapters);
    walkForChapterRenderers(root, chapters);
    walkForMarkersMap(root, chapters);
    return dedupeSort(chapters);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Description timestamps: "0:00 Intro" / "1:05:30 Deep dive"
// ---------------------------------------------------------------------------

function extractChaptersFromDescription(html: string): YtChapter[] {
  // shortDescription in player response
  const playerJson = extractJsonAssignment(html, "ytInitialPlayerResponse");
  let description = "";
  if (playerJson) {
    try {
      const root = JSON.parse(playerJson) as {
        videoDetails?: { shortDescription?: string };
      };
      description = root.videoDetails?.shortDescription ?? "";
    } catch {
      // ignore
    }
  }

  if (!description) {
    // Fallback: scrape from HTML
    const m = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/);
    if (m) {
      try {
        description = JSON.parse(`"${m[1]}"`) as string;
      } catch {
        description = m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
    }
  }

  if (!description) return [];
  return parseDescriptionChapters(description);
}

export function parseDescriptionChapters(description: string): YtChapter[] {
  const lines = description.split(/\r?\n/);
  const chapters: YtChapter[] = [];
  // 0:00 Title  |  0:00 - Title  |  (0:00) Title  |  1:02:03 Title
  const re =
    /^\s*(?:[(\[]?)(\d{1,2}:\d{2}(?::\d{2})?)(?:[)\]]?)\s*[-–—:]?\s+(.+?)\s*$/;

  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const startTime = parseClock(m[1]);
    const title = cleanTitle(m[2]);
    if (title.length < 2) continue;
    chapters.push({ title, startTime });
  }

  // Need at least 2 timed lines to treat as chapters
  if (chapters.length < 2) return [];
  // First should start near 0
  if (chapters[0].startTime > 30) return [];
  return dedupeSort(chapters);
}

// ---------------------------------------------------------------------------
// Deep walkers
// ---------------------------------------------------------------------------

function walkForMarkersMap(
  node: unknown,
  out: YtChapter[],
  depth = 0
): void {
  if (!node || depth > 40) return;
  if (Array.isArray(node)) {
    for (const item of node) walkForMarkersMap(item, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (Array.isArray(obj.markersMap)) {
    for (const entry of obj.markersMap) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as { key?: string; value?: { chapters?: unknown[] } };
      const key = (e.key ?? "").toUpperCase();
      if (
        key.includes("CHAPTER") ||
        key === "DESCRIPTION_CHAPTERS" ||
        key === "AUTO_CHAPTERS"
      ) {
        const list = e.value?.chapters;
        if (Array.isArray(list)) {
          for (const ch of list) parseChapterNode(ch, out);
        }
      }
    }
  }

  // Also: value.chapters directly
  if (Array.isArray(obj.chapters)) {
    for (const ch of obj.chapters) parseChapterNode(ch, out);
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") walkForMarkersMap(v, out, depth + 1);
  }
}

function walkForChapterRenderers(
  node: unknown,
  out: YtChapter[],
  depth = 0
): void {
  if (!node || depth > 40) return;
  if (Array.isArray(node)) {
    for (const item of node) walkForChapterRenderers(item, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (obj.chapterRenderer && typeof obj.chapterRenderer === "object") {
    parseChapterNode(obj, out);
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") walkForChapterRenderers(v, out, depth + 1);
  }
}

function walkForMacroMarkers(
  node: unknown,
  out: YtChapter[],
  depth = 0
): void {
  if (!node || depth > 40) return;
  if (Array.isArray(node)) {
    for (const item of node) walkForMacroMarkers(item, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  const item = obj.macroMarkersListItemRenderer as
    | {
        title?: { simpleText?: string; runs?: Array<{ text?: string }> };
        timeDescription?: { simpleText?: string };
        onTap?: {
          watchEndpoint?: { startTimeSeconds?: string | number };
        };
      }
    | undefined;

  if (item) {
    const title = textFromRuns(item.title);
    let start = 0;
    const tSec = item.onTap?.watchEndpoint?.startTimeSeconds;
    if (tSec != null) start = Number(tSec) || 0;
    else if (item.timeDescription?.simpleText) {
      start = parseClock(item.timeDescription.simpleText);
    }
    if (title) out.push({ title: cleanTitle(title), startTime: start });
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") walkForMacroMarkers(v, out, depth + 1);
  }
}

function parseChapterNode(node: unknown, out: YtChapter[]): void {
  if (!node || typeof node !== "object") return;
  const obj = node as {
    chapterRenderer?: {
      title?: { simpleText?: string; runs?: Array<{ text?: string }> };
      timeRangeStartMillis?: number | string;
    };
  };
  const ch = obj.chapterRenderer;
  if (!ch) return;
  const title = textFromRuns(ch.title);
  const ms = Number(ch.timeRangeStartMillis ?? 0);
  if (!title) return;
  out.push({
    title: cleanTitle(title),
    startTime: Number.isFinite(ms) ? ms / 1000 : 0,
  });
}

function textFromRuns(
  t?: { simpleText?: string; runs?: Array<{ text?: string }> }
): string {
  if (!t) return "";
  if (t.simpleText) return t.simpleText;
  if (t.runs?.length) return t.runs.map((r) => r.text ?? "").join("");
  return "";
}

function parseClock(s: string): number {
  const parts = s.trim().split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function cleanTitle(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/^[-–—:|.\s]+|[-–—:|.\s]+$/g, "")
    .trim();
}

function dedupeSort(chapters: YtChapter[]): YtChapter[] {
  const byTime = new Map<number, YtChapter>();
  for (const c of chapters) {
    const t = Math.round(c.startTime * 10) / 10;
    const title = c.title.trim();
    if (!title) continue;
    if (!byTime.has(t)) byTime.set(t, { title, startTime: c.startTime });
  }
  return [...byTime.values()].sort((a, b) => a.startTime - b.startTime);
}

/** Extract `var NAME = {...};` JSON from watch HTML. */
function extractJsonAssignment(html: string, name: string): string | null {
  const markers = [`var ${name} = `, `${name} = `, `window["${name}"] = `];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    let i = idx + marker.length;
    while (html[i] === " " || html[i] === "\n") i++;
    if (html[i] !== "{") continue;
    const sliced = sliceBalancedObject(html, i);
    if (sliced) return sliced;
  }
  return null;
}

function sliceBalancedObject(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}
