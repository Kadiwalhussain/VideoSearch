import { apiFetch } from "./client";
import type {
  LibraryAction,
  LibraryState,
  Session,
  VaultRow,
} from "../types";

export async function fetchVault(session: Session): Promise<VaultRow[]> {
  const res = await apiFetch(session.url, "/api/vault?images=1", {
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
