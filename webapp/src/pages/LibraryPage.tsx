import { useMemo, useState } from "react";
import { VideoCard } from "../components/VideoCard";
import { EmptyState } from "../components/EmptyState";
import { SessionLoader } from "../components/SessionLoader";
import { useVault } from "../store/VaultContext";
import { libraryRows } from "../lib/vaultSelectors";
import { Bookmark, Inbox, Library } from "lucide-react";

type Filter = "all" | "saved";

export function LibraryPage() {
  const { rows, loading, stats, saved } = useVault();
  const [filter, setFilter] = useState<Filter>("all");
  const library = useMemo(() => libraryRows(rows), [rows]);

  const list = useMemo(
    () => (filter === "saved" ? saved : library),
    [filter, saved, library]
  );

  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <Library size={22} /> Library
        </h1>
        <p className="view-sub">
          {library.length} in this account
          {stats.saved > 0 ? ` · ${stats.saved} bookmarked` : ""}
          {stats.marks ? ` · ${stats.marks} marks` : ""}
          {stats.shots ? ` · ${stats.shots} shots` : ""}.
          Each login only shows that user’s vault.
        </p>
      </header>

      <div className="detail-tabs-bar" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`btn-notes ${filter === "all" ? "is-active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All ({library.length})
        </button>
        <button
          type="button"
          className={`btn-notes ${filter === "saved" ? "is-active" : ""}`}
          onClick={() => setFilter("saved")}
        >
          <Bookmark size={14} /> Saved ({saved.length})
        </button>
      </div>

      {loading && !rows.length ? (
        <SessionLoader
          variant="inline"
          title="Loading library"
          sub="Pulling videos, marks, and shots from your vault…"
        />
      ) : list.length ? (
        <div className="video-grid">
          {list.map((r) => (
            <VideoCard key={r.video_id} row={r} showDelete />
          ))}
        </div>
      ) : filter === "saved" ? (
        <EmptyState
          icon={Bookmark}
          title="Nothing saved yet"
          sub="Tap the bookmark on any card or video to pin it here."
        />
      ) : (
        <EmptyState
          icon={Inbox}
          title="Nothing in library yet"
          sub="Marks, shots, Save, Watch later, and playlists from this account show up here."
        />
      )}
    </div>
  );
}
