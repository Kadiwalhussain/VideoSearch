import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ListVideo, Inbox } from "lucide-react";
import { useVault } from "../store/VaultContext";
import { VideoCard } from "../components/VideoCard";
import { EmptyState } from "../components/EmptyState";

export function PlaylistDetailPage() {
  const { name = "" } = useParams();
  const decoded = decodeURIComponent(name);
  const { playlists } = useVault();
  const group = playlists.find(
    (g) => g.name.toLowerCase() === decoded.toLowerCase()
  );

  return (
    <div className="view">
      <header className="view-head">
        <Link className="link-btn" to="/playlists">
          <ArrowLeft size={14} /> All playlists
        </Link>
        <h1>
          <ListVideo size={22} /> {decoded}
        </h1>
        <p className="view-sub">{group?.rows.length || 0} videos</p>
      </header>
      {group?.rows.length ? (
        <div className="video-grid">
          {group.rows.map((r) => (
            <VideoCard key={r.video_id} row={r} playlistName={group.name} />
          ))}
        </div>
      ) : (
        <EmptyState icon={Inbox} title="Empty playlist" />
      )}
    </div>
  );
}
