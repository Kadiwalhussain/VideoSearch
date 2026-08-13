import { Link } from "react-router-dom";
import { ExternalLink, Highlighter, Inbox } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { useVault } from "../store/VaultContext";
import { formatTime, ytWatchUrl } from "../lib/format";

export function NotesPage() {
  const { notes } = useVault();
  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <Highlighter size={22} /> Notes
        </h1>
        <p className="view-sub">
          {notes.length} mark{notes.length === 1 ? "" : "s"} across your vault
        </p>
      </header>
      {!notes.length ? (
        <EmptyState
          icon={Inbox}
          title="No marks yet"
          sub="Use the mark control on YouTube to pin moments."
        />
      ) : (
        <div className="notes-list">
          {notes.map((n) => (
            <article key={`${n.videoId}-${n.highlight.id}`} className="note-row glass-card">
              <div className="note-time">{formatTime(n.highlight.startTime)}</div>
              <div className="note-body">
                <p>{n.highlight.note?.trim() || "Mark (no text)"}</p>
                <Link to={`/video/${n.videoId}`} className="src">
                  {n.title}
                </Link>
              </div>
              <a
                className="btn-notes"
                href={ytWatchUrl(n.videoId, n.videoUrl, n.highlight.startTime)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} /> Watch
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
