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
  saveVideoBio as apiSaveBio,
  recordVideoView as apiRecordView,
  fetchPlaylistSections,
  savePlaylistSection,
  type PlaylistSections,
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

const CACHE_KEY = "vsa_vault_cache_v3";
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
  /** Save / edit full YouTube bio for a video. */
  saveBio: (
    videoId: string,
    opts: { bioText: string; bioMarkdown?: string }
  ) => Promise<{ sourceCount: number }>;
  /** Stamp lastViewedAt when the user actually watches. */
  recordView: (videoId: string) => void;
  /** Section of a playlist ("" = unsorted). */
  sectionOf: (playlist: string) => string;
  /** Every section the user has used, A–Z. */
  sectionNames: string[];
  /** Put a playlist in a section ("" takes it out). */
  setPlaylistSection: (playlist: string, section: string) => Promise<void>;
};

const NO_SECTIONS: PlaylistSections = { sections: [], names: [] };
const SECTIONS_CACHE_KEY = "vsa_playlist_sections_v1";

function readSectionsCache(userId?: string): PlaylistSections {
  try {
    const raw = sessionStorage.getItem(SECTIONS_CACHE_KEY);
    if (!raw) return NO_SECTIONS;
    const parsed = JSON.parse(raw) as { userId?: string } & PlaylistSections;
    if (!userId || parsed.userId !== userId) return NO_SECTIONS;
    return { sections: parsed.sections || [], names: parsed.names || [] };
  } catch {
    return NO_SECTIONS;
  }
}

function writeSectionsCache(userId: string | undefined, s: PlaylistSections) {
  try {
    sessionStorage.setItem(SECTIONS_CACHE_KEY, JSON.stringify({ userId, ...s }));
  } catch {
    /* quota — ignore */
  }
}

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
  const [sections, setSections] = useState<PlaylistSections>(() =>
    readSectionsCache(userId)
  );

  // Callbacks read rows through a ref so they keep a stable identity. Without
  // it every row change rebuilt the context value, which re-ran all eight
  // selectors and re-rendered every card on the page.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

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
        rowsRef.current.length > 0
      ) {
        return;
      }

      // Wait for any in-flight fetch, then re-run if this call needs force
      if (inFlight.current) {
        await inFlight.current;
        if (!opts?.force) return;
        // force after soft fetch: fall through and fetch again
      }

      const run = (async () => {
        // Only show full-page loading when we have nothing cached
        if (rowsRef.current.length === 0) setLoading(true);
        setError(null);
        try {
          // Fast path: no images=1, no blocking title repair
          const [data, secs] = await Promise.all([
            fetchVault(session),
            // Older vault servers have no sections yet: keep playlists working
            fetchPlaylistSections(session).catch(() => null),
          ]);
          setRows(data);
          writeCache(session.user?.userId, data);
          if (secs) {
            setSections(secs);
            writeSectionsCache(session.user?.userId, secs);
          }
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
    [session]
  );

  useEffect(() => {
    setSections(readSectionsCache(session?.user?.userId));
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

  // Vault API was unreachable: keep showing cached rows and quietly reconnect,
  // so changes the extension queued while it was down appear without a reload.
  useEffect(() => {
    if (!session || !error) return;
    const retry = () => void refresh({ force: true });
    const timer = window.setInterval(retry, 15_000);
    window.addEventListener("online", retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [session, error, refresh]);

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
      const row = findRow(rowsRef.current, videoId);
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
              completed: Boolean(library.completed),
              completedAt: library.completedAt ?? null,
            },
          };
        }
        writeCache(session.user?.userId, next);
        return next;
      });
    },
    [session, refresh]
  );

  const recordView = useCallback(
    (videoId: string) => {
      if (!session || !videoId) return;
      const now = Date.now();
      const existing = rowsRef.current.find((r) => r.video_id === videoId);
      setRows((prev) => {
        const next = prev.map((r) => {
          if (r.video_id !== videoId) return r;
          const prevView = r.payload?.lastViewedAt || 0;
          if (prevView && now - prevView < 2 * 60 * 1000) return r;
          return {
            ...r,
            payload: { ...r.payload, lastViewedAt: now },
          };
        });
        writeCache(session.user?.userId, next);
        return next;
      });
      void apiRecordView(session, videoId, {
        videoTitle: existing?.payload?.videoTitle,
        channelTitle: existing?.payload?.channelTitle,
        channelUrl: existing?.payload?.channelUrl,
      }).then(() => {
        if (!existing) void refresh({ force: true });
      });
    },
    [session, refresh]
  );

  const saveBioFn = useCallback(
    async (
      videoId: string,
      opts: { bioText: string; bioMarkdown?: string }
    ) => {
      if (!session) throw new Error("Not signed in");
      const row = findRow(rowsRef.current, videoId);
      const title = row?.payload?.videoTitle || videoId;
      const saved = await apiSaveBio(session, {
        videoId,
        videoTitle: title,
        bioText: opts.bioText,
        bioMarkdown: opts.bioMarkdown ?? opts.bioText,
      });
      const now = Date.now();
      setRows((prev) => {
        const next = prev.map((r) => {
          if (r.video_id !== videoId) return r;
          return {
            ...r,
            updated_at: new Date().toISOString(),
            payload: {
              ...r.payload,
              bioText: opts.bioText,
              bioMarkdown: opts.bioMarkdown ?? opts.bioText,
              bioSyncedAt: now,
              sourceLinks: saved.sourceLinks?.length
                ? saved.sourceLinks
                : r.payload?.sourceLinks,
            },
          };
        });
        writeCache(session.user?.userId, next);
        return next;
      });
      return { sourceCount: saved.sourceLinks?.length ?? 0 };
    },
    [session]
  );

  const setPlaylistSection = useCallback(
    async (playlist: string, section: string) => {
      if (!session) throw new Error("Not signed in");
      const next = await savePlaylistSection(session, playlist, section);
      setSections(next);
      writeSectionsCache(session.user?.userId, next);
    },
    [session]
  );

  const sectionInfo = useMemo(() => {
    const map = new Map(
      sections.sections.map((s) => [s.playlist.toLowerCase(), s.section])
    );
    return {
      sectionOf: (playlist: string) => map.get(playlist.toLowerCase()) || "",
      sectionNames: sections.names,
    };
  }, [sections]);

  // Every selector walks the whole vault, so they key on `rows` alone —
  // flipping `loading` must not re-derive notes, shots and playlists.
  const derived = useMemo(
    () => ({
      stats: vaultStats(rows),
      watchLater: watchLaterRows(rows),
      saved: savedRows(rows),
      notes: allNotes(rows),
      shots: allShots(rows),
      playlists: playlistGroups(rows),
      playlistNames: allPlaylistNames(rows),
      recent: recentRows(rows, 12),
      search: (q: string) => searchVault(rows, q),
      getVideo: (id: string) => findRow(rows, id),
    }),
    [rows]
  );

  const value = useMemo<VaultCtx>(() => {
    return {
      rows,
      loading,
      error,
      refresh: (o) => refresh(o),
      ...derived,
      libraryAction,
      repairTitles: repairTitlesFn,
      deleteVideo: deleteVideoFn,
      deleteMark: deleteMarkFn,
      deleteShot: deleteShotFn,
      saveBio: saveBioFn,
      recordView,
      ...sectionInfo,
      setPlaylistSection,
    };
  }, [
    sectionInfo,
    setPlaylistSection,
    rows,
    loading,
    error,
    derived,
    refresh,
    libraryAction,
    repairTitlesFn,
    deleteVideoFn,
    deleteMarkFn,
    deleteShotFn,
    saveBioFn,
    recordView,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault(): VaultCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault outside provider");
  return v;
}
