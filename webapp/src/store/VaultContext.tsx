import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchVault,
  libraryAction as apiLibrary,
  repairTitles,
  deleteVideo as apiDeleteVideo,
  deleteHighlight as apiDeleteHighlight,
  deleteScreenshot as apiDeleteScreenshot,
} from "../api/vault";
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

const CACHE_KEY = "vsa_vault_cache_v2";
/** Min gap between automatic refetches (focus / soft refresh) */
const SOFT_REFRESH_MS = 45_000;

type VaultCtx = {
  rows: VaultRow[];
  loading: boolean;
  error: string | null;
  stats: VaultStats;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
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
  repairTitles: () => Promise<{ fixed: number; message: string }>;
  /** Remove video from vault (history, library, all marks/shots). */
  deleteVideo: (videoId: string) => Promise<void>;
  /** Remove one mark from a video. */
  deleteMark: (videoId: string, highlightId: string) => Promise<void>;
  /** Remove one shot from a video. */
  deleteShot: (videoId: string, shotId: string) => Promise<void>;
};

const Ctx = createContext<VaultCtx | null>(null);

function readCache(userId?: string): VaultRow[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; rows?: VaultRow[] };
    if (userId && parsed.userId && parsed.userId !== userId) return null;
    return Array.isArray(parsed.rows) ? parsed.rows : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string | undefined, rows: VaultRow[]) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ userId, rows, at: Date.now() })
    );
  } catch {
    /* quota — ignore */
  }
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user?.userId;
  const [rows, setRows] = useState<VaultRow[]>(() => readCache(userId) || []);
  const [loading, setLoading] = useState(() => !(readCache(userId)?.length));
  const [error, setError] = useState<string | null>(null);
  const lastFetchAt = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!session) {
        setRows([]);
        setLoading(false);
        return;
      }

      const now = Date.now();
      if (
        !opts?.force &&
        lastFetchAt.current &&
        now - lastFetchAt.current < SOFT_REFRESH_MS &&
        rows.length > 0
      ) {
        return;
      }

      if (inFlight.current) {
        await inFlight.current;
        return;
      }

      const run = (async () => {
        // Only show full-page loading when we have nothing cached
        if (rows.length === 0) setLoading(true);
        setError(null);
        try {
          // Fast path: no images=1, no blocking title repair
          const data = await fetchVault(session);
          setRows(data);
          writeCache(session.user?.userId, data);
          lastFetchAt.current = Date.now();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load vault");
        } finally {
          setLoading(false);
        }
      })();

      inFlight.current = run;
      try {
        await run;
      } finally {
        inFlight.current = null;
      }
    },
    [session, rows.length]
  );

  useEffect(() => {
    if (!session) {
      setRows([]);
      return;
    }
    // Hydrate from cache immediately, then soft-refresh
    const cached = readCache(session.user?.userId);
    if (cached?.length) {
      setRows(cached);
      setLoading(false);
    }
    void refresh({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / session change only
  }, [session?.token, session?.user?.userId]);

  // Soft refresh when tab regains focus — throttled, never blocks UI
  useEffect(() => {
    const onFocus = () => {
      if (session) void refresh({ force: false });
    };
    const onVis = () => {
      if (document.visibilityState === "visible" && session) {
        void refresh({ force: false });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session, refresh]);

  const repairTitlesFn = useCallback(async () => {
    if (!session) throw new Error("Not signed in");
    const out = await repairTitles(session);
    await refresh({ force: true });
    return out;
  }, [session, refresh]);

  const deleteVideoFn = useCallback(
    async (videoId: string) => {
      if (!session) throw new Error("Not signed in");
      await apiDeleteVideo(session, videoId);
      setRows((prev) => {
        const next = prev.filter((r) => r.video_id !== videoId);
        writeCache(session.user?.userId, next);
        return next;
      });
    },
    [session]
  );

  const deleteMarkFn = useCallback(
    async (videoId: string, highlightId: string) => {
      if (!session) throw new Error("Not signed in");
      await apiDeleteHighlight(session, videoId, highlightId);
      setRows((prev) => {
        const next = prev.map((r) => {
          if (r.video_id !== videoId) return r;
          const highlights = (r.payload.highlights || []).filter(
            (h) => h.id !== highlightId
          );
          return {
            ...r,
            updated_at: new Date().toISOString(),
            payload: { ...r.payload, highlights },
          };
        });
        writeCache(session.user?.userId, next);
        return next;
      });
    },
    [session]
  );

  const deleteShotFn = useCallback(
    async (videoId: string, shotId: string) => {
      if (!session) throw new Error("Not signed in");
      await apiDeleteScreenshot(session, videoId, shotId);
      setRows((prev) => {
        const next = prev.map((r) => {
          if (r.video_id !== videoId) return r;
          const screenshots = (r.payload.screenshots || []).filter(
            (s) => s.id !== shotId
          );
          return {
            ...r,
            updated_at: new Date().toISOString(),
            payload: { ...r.payload, screenshots },
          };
        });
        writeCache(session.user?.userId, next);
        return next;
      });
    },
    [session]
  );

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
        await refresh({ force: true });
        return;
      }
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.video_id === videoId);
        let next: VaultRow[];
        if (idx === -1) {
          next = [
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
        } else {
          next = [...prev];
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
        }
        writeCache(session.user?.userId, next);
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
      refresh: (o) => refresh(o),
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
      repairTitles: repairTitlesFn,
      deleteVideo: deleteVideoFn,
      deleteMark: deleteMarkFn,
      deleteShot: deleteShotFn,
    };
  }, [
    rows,
    loading,
    error,
    refresh,
    libraryAction,
    repairTitlesFn,
    deleteVideoFn,
    deleteMarkFn,
    deleteShotFn,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault(): VaultCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault outside provider");
  return v;
}
