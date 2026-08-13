import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fetchVault, libraryAction as apiLibrary } from "../api/vault";
import {
  allNotes,
  allShots,
  playlistGroups,
  savedRows,
  searchVault,
  vaultStats,
  watchLaterRows,
  findRow,
  recentRows,
  allPlaylistNames,
} from "../lib/vaultSelectors";
import type {
  LibraryAction,
  NoteItem,
  PlaylistGroup,
  SearchHit,
  ShotItem,
  VaultRow,
  VaultStats,
} from "../types";
import { useSession } from "./SessionContext";

type VaultCtx = {
  rows: VaultRow[];
  loading: boolean;
  error: string | null;
  stats: VaultStats;
  refresh: () => Promise<void>;
  watchLater: VaultRow[];
  saved: VaultRow[];
  notes: NoteItem[];
  shots: ShotItem[];
  playlists: PlaylistGroup[];
  playlistNames: string[];
  recent: VaultRow[];
  search: (q: string) => SearchHit[];
  getVideo: (id: string) => VaultRow | undefined;
  libraryAction: (
    videoId: string,
    action: LibraryAction,
    playlist?: string
  ) => Promise<void>;
};

const Ctx = createContext<VaultCtx | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchVault(session);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vault");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Soft refresh when tab regains focus (extension may have synced)
  useEffect(() => {
    const onFocus = () => {
      if (session) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [session, refresh]);

  const libraryAction = useCallback(
    async (videoId: string, action: LibraryAction, playlist?: string) => {
      if (!session) throw new Error("Not signed in");
      const row = findRow(rows, videoId);
      const p = row?.payload;
      const videoTitle = p?.videoTitle || videoId;
      const videoUrl =
        p?.videoUrl || `https://www.youtube.com/watch?v=${videoId}`;
      const { library } = await apiLibrary(session, {
        videoId,
        videoTitle,
        videoUrl,
        action,
        playlist,
      });
      if (!library) {
        await refresh();
        return;
      }
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.video_id === videoId);
        if (idx === -1) {
          return [
            {
              video_id: videoId,
              updated_at: new Date().toISOString(),
              payload: {
                videoId,
                videoTitle,
                videoUrl,
                highlights: [],
                screenshots: [],
                ...library,
              },
            },
            ...prev,
          ];
        }
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          payload: {
            ...next[idx].payload,
            saved: library.saved,
            savedAt: library.savedAt,
            watchLater: library.watchLater,
            watchLaterAt: library.watchLaterAt,
            playlists: library.playlists || [],
          },
        };
        return next;
      });
    },
    [session, rows, refresh]
  );

  const value = useMemo<VaultCtx>(() => {
    const stats = vaultStats(rows);
    return {
      rows,
      loading,
      error,
      stats,
      refresh,
      watchLater: watchLaterRows(rows),
      saved: savedRows(rows),
      notes: allNotes(rows),
      shots: allShots(rows),
      playlists: playlistGroups(rows),
      playlistNames: allPlaylistNames(rows),
      recent: recentRows(rows, 12),
      search: (q) => searchVault(rows, q),
      getVideo: (id) => findRow(rows, id),
      libraryAction,
    };
  }, [rows, loading, error, refresh, libraryAction]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault(): VaultCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault outside provider");
  return v;
}
