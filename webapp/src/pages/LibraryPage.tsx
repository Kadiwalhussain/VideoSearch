import { VideoCard } from "../components/VideoCard";
import { EmptyState } from "../components/EmptyState";
import { SessionLoader } from "../components/SessionLoader";
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
          {stats.videos} video{stats.videos === 1 ? "" : "s"} in your vault.
          Watch, open notes, or delete videos you no longer need.
        </p>
      </header>
      {loading && !rows.length ? (
        <SessionLoader
          variant="inline"
          title="Loading library"
          sub="Pulling videos, marks, and shots from your vault…"
        />
      ) : rows.length ? (
        <div className="video-grid">
          {rows.map((r) => (
            <VideoCard key={r.video_id} row={r} showDelete />
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
