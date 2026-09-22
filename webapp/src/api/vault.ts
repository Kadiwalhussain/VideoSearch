import { apiFetch } from "./client";
import type {
  LibraryAction,
  LibraryState,
  Session,
  SourceLink,
  VaultRow,
} from "../types";

/**
 * Lightweight vault list — media URLs only, no base64 screenshots.
 * Use YouTube thumbs for cards; load shot images via /api/media when needed.
 */
export async function fetchVault(session: Session): Promise<VaultRow[]> {
  const res = await apiFetch(session.url, "/api/vault", {
    token: session.token,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return (data.rows || []) as VaultRow[];
}

export async function libraryAction(
  session: Session,
  opts: {
    videoId: string;
    videoTitle?: string;
    videoUrl?: string;
    action: LibraryAction;
    playlist?: string;
  }
): Promise<{ message: string; library?: LibraryState }> {
  const res = await apiFetch(session.url, "/api/vault/library", {
    method: "POST",
    token: session.token,
    body: JSON.stringify({
      videoId: opts.videoId,
      videoTitle: opts.videoTitle,
      videoUrl:
        opts.videoUrl || `https://www.youtube.com/watch?v=${opts.videoId}`,
      action: opts.action,
      playlist: opts.playlist,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Library update failed (${res.status})`);
  }
  return {
    message: data.message || "Updated",
    library: data.library as LibraryState | undefined,
  };
}

export async function fetchPlaylists(
  session: Session
): Promise<Array<{ name: string; count: number; videoIds?: string[] }>> {
  const res = await apiFetch(session.url, "/api/library/playlists", {
    token: session.token,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data.playlists || [];
}

export type PlaylistSections = {
  /** Section per playlist; playlists missing here are unsorted */
  sections: Array<{ playlist: string; section: string }>;
  /** Every section name the user has used */
  names: string[];
};

export async function fetchPlaylistSections(
  session: Session
): Promise<PlaylistSections> {
  const res = await apiFetch(session.url, "/api/library/sections", {
    token: session.token,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return { sections: data.sections || [], names: data.names || [] };
}

/** Put a playlist in a section ("" takes it out). */
export async function savePlaylistSection(
  session: Session,
  playlist: string,
  section: string
): Promise<PlaylistSections> {
  const res = await apiFetch(session.url, "/api/library/sections", {
    method: "POST",
    token: session.token,
    body: JSON.stringify({ playlist, section }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Section update failed (${res.status})`);
  }
  return { sections: data.sections || [], names: data.names || [] };
}

/** Backfill full YouTube titles when stored title is just the video id */
export async function repairTitles(
  session: Session
): Promise<{ fixed: number; message: string }> {
  const res = await apiFetch(session.url, "/api/vault/repair-titles", {
    method: "POST",
    token: session.token,
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return {
    fixed: Number(data.fixed) || 0,
    message: data.message || "Titles updated",
  };
}

/** Record that the signed-in user actually watched this video. */
export async function recordVideoView(
  session: Session,
  videoId: string,
  meta?: { videoTitle?: string; channelTitle?: string; channelUrl?: string }
): Promise<void> {
  if (!videoId) return;
  try {
    await apiFetch(session.url, "/api/vault/view", {
      method: "POST",
      token: session.token,
      body: JSON.stringify({
        videoId,
        videoTitle: meta?.videoTitle,
        channelTitle: meta?.channelTitle,
        channelUrl: meta?.channelUrl,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        watched: true,
      }),
    });
  } catch {
    /* view tracking is best-effort */
  }
}

/** Remove a whole video (marks + shots + library flags) from the vault. */
export async function deleteVideo(
  session: Session,
  videoId: string
): Promise<{ message: string }> {
  const res = await apiFetch(
    session.url,
    `/api/vault/${encodeURIComponent(videoId)}`,
    { method: "DELETE", token: session.token }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Delete failed (${res.status})`);
  }
  return { message: data.message || "Video removed" };
}

/** Remove one mark/highlight from a video. */
export async function deleteHighlight(
  session: Session,
  videoId: string,
  highlightId: string
): Promise<{ message: string; remaining?: number }> {
  const res = await apiFetch(
    session.url,
    `/api/vault/${encodeURIComponent(videoId)}/highlights/${encodeURIComponent(highlightId)}`,
    { method: "DELETE", token: session.token }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Delete mark failed (${res.status})`);
  }
  return {
    message: data.message || "Mark deleted",
    remaining: data.remaining,
  };
}

/** Create a public share link for a vault video card. */
/** Save / update full YouTube bio for a video (editable later in Studio). */
export async function saveVideoBio(
  session: Session,
  opts: {
    videoId: string;
    videoTitle?: string;
    bioText: string;
    bioMarkdown?: string;
  }
): Promise<{ message: string; sourceLinks?: SourceLink[] }> {
  const res = await apiFetch(session.url, "/api/vault/sync", {
    method: "POST",
    token: session.token,
    body: JSON.stringify({
      videoId: opts.videoId,
      videoTitle: opts.videoTitle,
      videoUrl: `https://www.youtube.com/watch?v=${opts.videoId}`,
      highlights: [],
      screenshots: [],
      sourceLinks: [],
      bioText: opts.bioText,
      bioMarkdown: opts.bioMarkdown ?? opts.bioText,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Bio save failed (${res.status})`);
  }
  return {
    message: data.message || "Bio saved",
    sourceLinks: Array.isArray(data.sourceLinks) ? data.sourceLinks : undefined,
  };
}

export async function createVideoShare(
  session: Session,
  videoId: string,
  opts?: { expiresInDays?: number }
): Promise<{
  shareUrl: string;
  sharePath: string;
  token: string;
  preview?: {
    title?: string;
    channelTitle?: string;
    markCount?: number;
    shotCount?: number;
    noteCount?: number;
  };
}> {
  const res = await apiFetch(
    session.url,
    `/api/vault/${encodeURIComponent(videoId)}/share`,
    {
      method: "POST",
      token: session.token,
      body: JSON.stringify({
        expiresInDays: opts?.expiresInDays ?? null,
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Share failed (${res.status})`);
  }
  // Prefer same-origin app URL when Studio is on the vault host
  let shareUrl = String(data.shareUrl || "");
  if (typeof window !== "undefined" && data.sharePath) {
    shareUrl = `${window.location.origin}${data.sharePath}`;
  }
  return {
    shareUrl,
    sharePath: String(data.sharePath || ""),
    token: String(data.token || ""),
    preview: data.preview,
  };
}

export interface SharedPlaylistVideo {
  videoId: string;
  videoTitle?: string;
  videoUrl?: string;
  channelTitle?: string;
  durationSec?: number;
  highlights?: Array<{
    id?: string;
    startTime?: number;
    endTime?: number;
    note?: string;
    color?: string;
  }>;
  shotCount?: number;
}

/** Share a whole playlist as a read-only link. */
export async function createPlaylistShare(
  session: Session,
  playlistName: string
): Promise<{ shareUrl: string; token: string }> {
  const res = await apiFetch(session.url, "/api/playlists/share", {
    method: "POST",
    token: session.token,
    body: JSON.stringify({ playlistName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Share failed (${res.status})`);
  }
  let shareUrl = String(data.shareUrl || "");
  if (typeof window !== "undefined" && data.sharePath) {
    shareUrl = `${window.location.origin}${data.sharePath}`;
  }
  return { shareUrl, token: String(data.token || "") };
}

/** Copy a shared playlist into the signed-in viewer's vault. */
export async function importPlaylist(
  session: Session,
  playlistName: string,
  videos: SharedPlaylistVideo[]
): Promise<{ message: string; total?: number }> {
  const res = await apiFetch(session.url, "/api/vault/playlist/import", {
    method: "POST",
    token: session.token,
    body: JSON.stringify({
      playlistName,
      videos: videos.slice(0, 250).map((v) => ({
        videoId: v.videoId,
        videoTitle: v.videoTitle,
        channelTitle: v.channelTitle,
        videoUrl: v.videoUrl,
      })),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Import failed (${res.status})`);
  }
  return { message: data.message || "Playlist saved", total: data.total };
}

/** Public fetch of a shared card or playlist (no auth). */
export async function fetchSharedCard(
  apiBase: string,
  token: string
): Promise<{
  kind: "video" | "playlist";
  snapshot: {
    videoId: string;
    videoTitle?: string;
    videoUrl?: string;
    channelTitle?: string;
    channelUrl?: string;
    sharedBy?: string;
    highlights?: Array<{
      id?: string;
      startTime?: number;
      endTime?: number;
      note?: string;
      color?: string;
    }>;
    screenshots?: Array<{
      id?: string;
      videoTime?: number;
      note?: string;
    }>;
    sourceLinks?: Array<{
      id?: string;
      url?: string;
      label?: string;
      kind?: string;
    }>;
    markCount?: number;
    shotCount?: number;
    noteCount?: number;
    sourceCount?: number;
    playlistName?: string;
    videos?: SharedPlaylistVideo[];
  };
  createdAt?: string;
  expiresAt?: string | null;
}> {
  const base = apiBase.replace(/\/$/, "");
  const res = await fetch(`${base}/api/share/${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Share load failed (${res.status})`);
  }
  return {
    kind: data.kind === "playlist" ? "playlist" : "video",
    snapshot: data.snapshot,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
  };
}

/** AI search over the vault (Mistral / configured LLM). */
export async function aiSearchVault(
  session: Session,
  query: string
): Promise<{
  answer: string;
  citations: Array<{
    videoId: string;
    title: string;
    time: number;
    kind: string;
    snippet: string;
    why?: string;
  }>;
  provider?: string;
  model?: string;
}> {
  const res = await apiFetch(session.url, "/api/vault/ai-search", {
    method: "POST",
    token: session.token,
    body: JSON.stringify({ query }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `AI search failed (${res.status})`);
  }
  return {
    answer: String(data.answer || ""),
    citations: Array.isArray(data.citations) ? data.citations : [],
    provider: data.provider,
    model: data.model,
  };
}

/** Remove one screenshot from a video. */
export async function deleteScreenshot(
  session: Session,
  videoId: string,
  shotId: string
): Promise<{ message: string; remaining?: number }> {
  const res = await apiFetch(
    session.url,
    `/api/vault/${encodeURIComponent(videoId)}/screenshots/${encodeURIComponent(shotId)}`,
    { method: "DELETE", token: session.token }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Delete shot failed (${res.status})`);
  }
  return {
    message: data.message || "Shot deleted",
    remaining: data.remaining,
  };
}
