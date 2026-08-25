import { useMemo } from "react";
import { History, Inbox } from "lucide-react";
import { VideoCard } from "../components/VideoCard";
import { EmptyState } from "../components/EmptyState";
import { SessionLoader } from "../components/SessionLoader";
import { useVault } from "../store/VaultContext";
import { rowActivityMs } from "../lib/format";

export function HistoryPage() {
  const { rows, loading } = useVault();

  // Watched videos only — Saved / Watch later / playlists have their own pages
  const list = useMemo(
    () =>
      rows
        .filter((r) => Boolean(r.payload?.lastViewedAt))
        .sort((a, b) => {
          const ta = rowActivityMs(a) || 0;
          const tb = rowActivityMs(b) || 0;
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
          Videos you actually watched · {list.length} total · Save, Watch later,
          and playlists stay on their own pages
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
