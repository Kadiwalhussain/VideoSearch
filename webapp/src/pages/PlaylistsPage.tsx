import { useMemo, useState } from "react";
import { ListVideo, Inbox, Search } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { SessionLoader } from "../components/SessionLoader";
import { useVault } from "../store/VaultContext";
import { PlaylistCoverCard } from "../components/PlaylistCoverCard";

export function PlaylistsPage() {
  const { playlists, loading } = useVault();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return playlists;
    return playlists.filter((g) => {
      if (g.name.toLowerCase().includes(needle)) return true;
      return g.rows.some((r) => {
        const t = (r.payload?.videoTitle || "").toLowerCase();
        const c = (r.payload?.channelTitle || "").toLowerCase();
        return t.includes(needle) || c.includes(needle);
      });
    });
  }, [playlists, q]);

  const totalVideos = playlists.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="view">
      <header className="view-head pl-index-head">
        <div>
          <h1>
            <ListVideo size={22} /> Playlists
          </h1>
          <p className="view-sub">
            {playlists.length} playlist{playlists.length === 1 ? "" : "s"}
            {totalVideos > 0
              ? ` · ${totalVideos} video${totalVideos === 1 ? "" : "s"} total`
              : ""}
            {" · "}open one to watch the lead video, then the full list
          </p>
        </div>
        {playlists.length > 0 ? (
          <label className="pl-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search playlists or videos…"
              aria-label="Search playlists"
            />
          </label>
        ) : null}
      </header>

      {loading && !playlists.length ? (
        <SessionLoader
          variant="inline"
          title="Loading playlists"
          sub="Organizing your lists from the vault…"
        />
      ) : !playlists.length ? (
        <EmptyState
          icon={Inbox}
          title="No playlists yet"
          sub="Add videos to a playlist from any card (＋ playlist) or from the extension. Each list will show here as its own cover."
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={Search}
          title="No matching playlists"
          sub={`Nothing matches “${q.trim()}”. Try another name or video title.`}
        />
      ) : (
        <div className="pl-cover-grid">
          {filtered.map((g) => (
            <PlaylistCoverCard key={g.name.toLowerCase()} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
