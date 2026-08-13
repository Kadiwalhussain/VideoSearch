import { VideoCard } from "../components/VideoCard";
import { EmptyState } from "../components/EmptyState";
import { useVault } from "../store/VaultContext";
import { Library, Inbox } from "lucide-react";

export function LibraryPage() {
  const { rows, loading, stats } = useVault();
  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <Library size={22} /> Library
        </h1>
        <p className="view-sub">
          {stats.videos} video{stats.videos === 1 ? "" : "s"} in your vault. Watch
          on YouTube or open notes and screenshots.
        </p>
      </header>
      {loading && !rows.length ? (
        <div className="empty">Loading…</div>
      ) : rows.length ? (
        <div className="video-grid">
          {rows.map((r) => (
            <VideoCard key={r.video_id} row={r} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Inbox}
          title="No videos yet"
          sub="Sync from the extension while signed in."
        />
      )}
    </div>
  );
}
