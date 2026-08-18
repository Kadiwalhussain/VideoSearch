import { useMemo } from "react";
import { History, Inbox } from "lucide-react";
import { VideoCard } from "../components/VideoCard";
import { EmptyState } from "../components/EmptyState";
import { SessionLoader } from "../components/SessionLoader";
import { useVault } from "../store/VaultContext";
import { rowActivityMs } from "../lib/format";

export function HistoryPage() {
  const { rows, loading } = useVault();

  // Full vault history, newest activity first (not the 12-item “recent” slice)
  const list = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ta =
          rowActivityMs(a) ?? (new Date(a.updated_at).getTime() || 0);
        const tb =
          rowActivityMs(b) ?? (new Date(b.updated_at).getTime() || 0);
        return tb - ta;
      }),
    [rows]
  );

  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <History size={22} /> History
        </h1>
        <p className="view-sub">
          All vault videos by latest activity · {list.length} total · use trash
          to delete a video and its marks
        </p>
      </header>
      {loading && !list.length ? (
        <SessionLoader
          variant="inline"
          title="Loading history"
          sub="Pulling your vault activity…"
        />
      ) : list.length ? (
        <div className="video-grid">
          {list.map((r) => (
            <VideoCard key={r.video_id} row={r} showDelete />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Inbox}
          title="No history yet"
          sub="Mark moments with the extension while signed in — they show up here."
        />
      )}
    </div>
  );
}
