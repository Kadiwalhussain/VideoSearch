import { useMemo } from "react";
import { History, Inbox } from "lucide-react";
import { VideoCard } from "../components/VideoCard";
import { EmptyState } from "../components/EmptyState";
import { SessionLoader } from "../components/SessionLoader";
import { useVault } from "../store/VaultContext";
import { historyRows } from "../lib/vaultSelectors";

export function HistoryPage() {
  const { rows, loading } = useVault();

  const list = useMemo(() => historyRows(rows), [rows]);

  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <History size={22} /> History
        </h1>
        <p className="view-sub">
          Videos you opened on YouTube while signed in · {list.length} total
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
          sub="Open a YouTube video while signed in — it shows up here. Save is separate."
        />
      )}
    </div>
  );
}
