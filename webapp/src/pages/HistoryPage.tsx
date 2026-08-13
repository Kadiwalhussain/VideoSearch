import { History } from "lucide-react";
import { VideoCard } from "../components/VideoCard";
import { EmptyState } from "../components/EmptyState";
import { useVault } from "../store/VaultContext";
import { Inbox } from "lucide-react";

export function HistoryPage() {
  const { recent, rows } = useVault();
  const list = recent.length ? recent : rows;
  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <History size={22} /> History
        </h1>
        <p className="view-sub">Most recently updated vault videos</p>
      </header>
      {list.length ? (
        <div className="video-grid">
          {list.map((r) => (
            <VideoCard key={r.video_id} row={r} />
          ))}
        </div>
      ) : (
        <EmptyState icon={Inbox} title="No history yet" />
      )}
    </div>
  );
}
