import { Clock, Inbox } from "lucide-react";
import { VideoCard } from "../components/VideoCard";
import { EmptyState } from "../components/EmptyState";
import { useVault } from "../store/VaultContext";

export function WatchLaterPage() {
  const { watchLater } = useVault();
  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <Clock size={22} /> Watch later
        </h1>
        <p className="view-sub">{watchLater.length} queued</p>
      </header>
      {watchLater.length ? (
        <div className="video-grid">
          {watchLater.map((r) => (
            <VideoCard key={r.video_id} row={r} showRemoveWatchLater />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Inbox}
          title="Queue is empty"
          sub="Tap the clock on any video card to add it here."
        />
      )}
    </div>
  );
}
