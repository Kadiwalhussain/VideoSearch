import { Link } from "react-router-dom";
import {
  Bookmark,
  Clock,
  ExternalLink,
  ListPlus,
  StickyNote,
} from "lucide-react";
import { relTime, ytThumb, ytWatchUrl } from "../lib/format";
import type { VaultRow } from "../types";
import { useVault } from "../store/VaultContext";
import { useState } from "react";

export function VideoCard({
  row,
  showRemoveWatchLater,
  playlistName,
}: {
  row: VaultRow;
  showRemoveWatchLater?: boolean;
  playlistName?: string;
}) {
  const { libraryAction, playlistNames } = useVault();
  const p = row.payload || {};
  const marks = (p.highlights || []).length;
  const shots = (p.screenshots || []).length;
  const noted = (p.highlights || []).filter((h) => h.note?.trim()).length;
  const [busy, setBusy] = useState(false);
  const [plOpen, setPlOpen] = useState(false);
  const [newPl, setNewPl] = useState("");

  const run = async (action: Parameters<typeof libraryAction>[1], pl?: string) => {
    setBusy(true);
    try {
      await libraryAction(row.video_id, action, pl);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
      setPlOpen(false);
    }
  };

  return (
    <article className="video-card">
      <Link to={`/video/${row.video_id}`} className="v-thumb">
        <img src={ytThumb(row.video_id)} alt="" loading="lazy" />
        <div className="v-play" aria-hidden>
          <span>Watch</span>
        </div>
      </Link>
      <div className="v-body">
        <h3>
          <Link to={`/video/${row.video_id}`}>
            {p.videoTitle || row.video_id}
          </Link>
        </h3>
        <p className="v-meta">
          Updated {relTime(row.updated_at)}
          {marks ? ` · ${marks} note${marks === 1 ? "" : "s"}` : ""}
          {shots ? ` · ${shots} shot${shots === 1 ? "" : "s"}` : ""}
          {noted ? ` · ${noted} written` : ""}
        </p>
        <div className="v-actions">
          <a
            className="btn-watch"
            href={ytWatchUrl(row.video_id, p.videoUrl)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} /> Watch
          </a>
          <Link className="btn-notes" to={`/video/${row.video_id}`}>
            <StickyNote size={14} /> Notes
          </Link>
          <button
            type="button"
            className={`btn-notes ${p.watchLater ? "is-active" : ""}`}
            disabled={busy}
            title="Watch later"
            onClick={() =>
              void run(showRemoveWatchLater ? "unwatch_later" : "toggle_watch_later")
            }
          >
            <Clock size={14} />
          </button>
          <button
            type="button"
            className={`btn-notes ${p.saved ? "is-active" : ""}`}
            disabled={busy}
            title="Save"
            onClick={() => void run("toggle_save")}
          >
            <Bookmark size={14} />
          </button>
          {playlistName ? (
            <button
              type="button"
              className="btn-notes"
              disabled={busy}
              onClick={() => void run("remove_playlist", playlistName)}
            >
              Remove
            </button>
          ) : null}
        </div>
        <div className="pl-dd" style={{ marginTop: 8, position: "relative" }}>
          <button
            type="button"
            className="btn-notes"
            disabled={busy}
            onClick={() => setPlOpen((o) => !o)}
          >
            <ListPlus size={14} /> Playlist
          </button>
          {plOpen ? (
            <div
              className="pl-menu"
              style={{
                position: "absolute",
                zIndex: 20,
                top: "100%",
                left: 0,
                minWidth: 180,
                marginTop: 4,
                padding: 8,
                borderRadius: 12,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow)",
              }}
            >
              {playlistNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="btn-notes"
                  style={{ display: "block", width: "100%", marginBottom: 4 }}
                  onClick={() => void run("add_playlist", name)}
                >
                  {name}
                </button>
              ))}
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <input
                  value={newPl}
                  onChange={(e) => setNewPl(e.target.value)}
                  placeholder="New playlist"
                  style={{
                    flex: 1,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    padding: "6px 8px",
                    fontSize: 12,
                  }}
                />
                <button
                  type="button"
                  className="btn-notes"
                  onClick={() => {
                    if (newPl.trim()) void run("add_playlist", newPl.trim());
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
