/**
 * Detect YouTube playlist context and collect video entries for vault import.
 */

export type PlaylistVideoEntry = {
  videoId: string;
  videoTitle: string;
  channelTitle?: string;
};

export type PlaylistCapture = {
  playlistId: string;
  playlistName: string;
  videos: PlaylistVideoEntry[];
};

export function getPlaylistIdFromUrl(href = location.href): string | null {
  try {
    const u = new URL(href);
    const list = u.searchParams.get("list");
    if (list && list.trim().length >= 10) return list.trim();
  } catch {
    /* ignore */
  }
  return null;
}

export function isPlaylistPage(href = location.href): boolean {
  try {
    const u = new URL(href);
    if (u.pathname.includes("/playlist")) return Boolean(getPlaylistIdFromUrl(href));
    if (u.pathname.includes("/watch") && u.searchParams.get("list")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function playlistNameFromDom(): string {
  const candidates = [
    document.querySelector(
      "ytd-playlist-header-renderer h1 yt-formatted-string"
    )?.textContent,
    document.querySelector("ytd-playlist-header-renderer h1")?.textContent,
    document.querySelector(
      "#header-description h1 yt-formatted-string"
    )?.textContent,
    document.querySelector(
      "ytd-playlist-panel-renderer #header-description h3 yt-formatted-string"
    )?.textContent,
    document.querySelector(
      "ytd-playlist-panel-renderer h3 a"
    )?.textContent,
    document.querySelector(
      "ytd-playlist-panel-renderer .title"
    )?.textContent,
    document.querySelector("#secondary #playlist #header-description h3 a")
      ?.textContent,
  ];
  for (const c of candidates) {
    const t = (c || "").replace(/\s+/g, " ").trim();
    if (t && t.length > 1 && t.length < 200) return t;
  }
  return "";
}

function videosFromPlaylistPanel(): PlaylistVideoEntry[] {
  const out: PlaylistVideoEntry[] = [];
  const seen = new Set<string>();

  const nodes = document.querySelectorAll(
    "ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer"
  );
  nodes.forEach((node) => {
    const a =
      (node.querySelector("a#wc-endpoint") as HTMLAnchorElement | null) ||
      (node.querySelector("a#video-title") as HTMLAnchorElement | null) ||
      (node.querySelector("a[href*='watch?v=']") as HTMLAnchorElement | null);
    if (!a?.href) return;
    let videoId = "";
    try {
      videoId = new URL(a.href, location.origin).searchParams.get("v") || "";
    } catch {
      return;
    }
    if (!videoId || seen.has(videoId)) return;
    seen.add(videoId);
    const title =
      (
        node.querySelector("#video-title")?.textContent ||
        a.textContent ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim() || videoId;
    const channel =
      node
        .querySelector(
          "#byline, ytd-channel-name, .ytd-channel-name, #channel-name"
        )
        ?.textContent?.replace(/\s+/g, " ")
        .trim() || undefined;
    out.push({ videoId, videoTitle: title.slice(0, 300), channelTitle: channel });
  });

  return out;
}

/** Walk ytInitialData for playlist video ids (best-effort). */
function videosFromInitialData(): PlaylistVideoEntry[] {
  try {
    const w = window as unknown as { ytInitialData?: unknown };
    const data = w.ytInitialData;
    if (!data || typeof data !== "object") return [];
    const found: PlaylistVideoEntry[] = [];
    const seen = new Set<string>();

    const walk = (node: unknown, depth: number) => {
      if (!node || depth > 25) return;
      if (Array.isArray(node)) {
        for (const x of node) walk(x, depth + 1);
        return;
      }
      if (typeof node !== "object") return;
      const o = node as Record<string, unknown>;

      // playlistVideoRenderer / playlistPanelVideoRenderer
      const pvr =
        (o.playlistVideoRenderer as Record<string, unknown> | undefined) ||
        (o.playlistPanelVideoRenderer as Record<string, unknown> | undefined);
      if (pvr) {
        const videoId = String(pvr.videoId || "").trim();
        if (videoId && !seen.has(videoId)) {
          seen.add(videoId);
          let title = videoId;
          const titleRuns =
            (pvr.title as { runs?: Array<{ text?: string }> } | undefined)
              ?.runs ||
            (
              pvr.title as { simpleText?: string } | undefined
            );
          if (Array.isArray((titleRuns as { runs?: unknown })?.runs)) {
            title =
              ((titleRuns as { runs: Array<{ text?: string }> }).runs || [])
                .map((r) => r.text || "")
                .join("")
                .trim() || videoId;
          } else if (
            titleRuns &&
            typeof titleRuns === "object" &&
            "simpleText" in titleRuns
          ) {
            title = String(
              (titleRuns as { simpleText?: string }).simpleText || videoId
            );
          }
          found.push({
            videoId,
            videoTitle: title.slice(0, 300),
          });
        }
      }

      for (const v of Object.values(o)) {
        if (v && typeof v === "object") walk(v, depth + 1);
      }
    };

    walk(data, 0);
    return found;
  } catch {
    return [];
  }
}

/**
 * Capture current YouTube playlist context.
 * Works on /playlist?list=… and /watch?v=…&list=…
 */
export function captureCurrentPlaylist(): PlaylistCapture | null {
  const playlistId = getPlaylistIdFromUrl();
  if (!playlistId) return null;

  const nameFromDom = playlistNameFromDom();
  const playlistName =
    nameFromDom ||
    `YouTube playlist ${playlistId.slice(0, 12)}`;

  const fromDom = videosFromPlaylistPanel();
  const fromData = videosFromInitialData();

  // Prefer longer list
  const base = fromDom.length >= fromData.length ? fromDom : fromData;
  const merge = new Map<string, PlaylistVideoEntry>();
  for (const v of [...fromData, ...fromDom, ...base]) {
    if (!v.videoId) continue;
    const prev = merge.get(v.videoId);
    if (!prev) merge.set(v.videoId, v);
    else {
      merge.set(v.videoId, {
        videoId: v.videoId,
        videoTitle:
          v.videoTitle && v.videoTitle !== v.videoId
            ? v.videoTitle
            : prev.videoTitle,
        channelTitle: v.channelTitle || prev.channelTitle,
      });
    }
  }

  // Ensure current watch video is included
  try {
    const cur = new URL(location.href).searchParams.get("v");
    if (cur && !merge.has(cur)) {
      const title =
        document.querySelector("h1.ytd-watch-metadata yt-formatted-string")
          ?.textContent?.trim() || cur;
      merge.set(cur, { videoId: cur, videoTitle: title.slice(0, 300) });
    }
  } catch {
    /* ignore */
  }

  const videos = [...merge.values()];
  if (!videos.length) return null;

  return {
    playlistId,
    playlistName: playlistName.slice(0, 120),
    videos,
  };
}
