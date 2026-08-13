import { Link } from "react-router-dom";
import { ListVideo, Inbox } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { useVault } from "../store/VaultContext";
import { VideoCard } from "../components/VideoCard";

export function PlaylistsPage() {
  const { playlists } = useVault();
  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <ListVideo size={22} /> Playlists
        </h1>
        <p className="view-sub">
          {playlists.length} playlist{playlists.length === 1 ? "" : "s"} · shared
          with extension
        </p>
      </header>
      {!playlists.length ? (
        <EmptyState
          icon={Inbox}
          title="No playlists yet"
          sub="Add videos to a playlist from any card or the extension."
        />
      ) : (
        playlists.map((g) => (
          <section key={g.name} className="section" style={{ marginBottom: 28 }}>
            <div className="section-head">
              <h2 className="section-title">
                <ListVideo size={18} /> {g.name}
              </h2>
              <Link className="link-btn" to={`/playlists/${encodeURIComponent(g.name)}`}>
                {g.rows.length} videos →
              </Link>
            </div>
            <div className="video-grid">
              {g.rows.map((r) => (
                <VideoCard
                  key={r.video_id}
                  row={r}
                  playlistName={g.name}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
