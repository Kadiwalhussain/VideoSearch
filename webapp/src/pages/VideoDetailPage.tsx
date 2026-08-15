import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Clock,
  ExternalLink,
  Highlighter,
} from "lucide-react";
import { useVault } from "../store/VaultContext";
import { useSession } from "../store/SessionContext";
import {
  formatTime,
  relTime,
  rowActivityMs,
  ytThumb,
  ytWatchUrl,
} from "../lib/format";
import { mediaSrc } from "../api/client";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { Inbox } from "lucide-react";

export function VideoDetailPage() {
  const { videoId = "" } = useParams();
  const { getVideo, libraryAction } = useVault();
  const { session } = useSession();
  const row = getVideo(videoId);
  const [tab, setTab] = useState<"marks" | "shots">("marks");
  const [busy, setBusy] = useState(false);

  if (!row) {
    return (
      <div className="view">
        <Link className="link-btn" to="/library">
          <ArrowLeft size={14} /> Library
        </Link>
        <EmptyState icon={Inbox} title="Video not in vault" sub={videoId} />
      </div>
    );
  }

  const p = row.payload || {};
  const marks = p.highlights || [];
  const shots = p.screenshots || [];

  const run = async (action: Parameters<typeof libraryAction>[1]) => {
    setBusy(true);
    try {
      await libraryAction(videoId, action);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view">
      <Link className="link-btn" to="/library">
        <ArrowLeft size={14} /> Library
      </Link>
      <div className="detail-hero glass-card" style={{ marginTop: 12 }}>
        <img
          src={ytThumb(videoId)}
          alt=""
          style={{
            width: 220,
            borderRadius: 12,
            aspectRatio: "16/9",
            objectFit: "cover",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>
            {p.videoTitle || videoId}
          </h1>
          <p className="view-sub">
            Updated {relTime(rowActivityMs(row) ?? row.updated_at)} ·{" "}
            {marks.length} marks · {shots.length} shots
          </p>
          <div className="v-actions" style={{ marginTop: 12 }}>
            <a
              className="btn-watch"
              href={ytWatchUrl(videoId, p.videoUrl)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} /> Watch on YouTube
            </a>
            <button
              type="button"
              className={`btn-notes ${p.watchLater ? "is-active" : ""}`}
              disabled={busy}
              onClick={() => void run("toggle_watch_later")}
            >
              <Clock size={14} /> Watch later
            </button>
            <button
              type="button"
              className={`btn-notes ${p.saved ? "is-active" : ""}`}
              disabled={busy}
              onClick={() => void run("toggle_save")}
            >
              <Bookmark size={14} /> Save
            </button>
          </div>
          {(p.playlists || []).length ? (
            <p className="view-sub" style={{ marginTop: 8 }}>
              Playlists: {(p.playlists || []).join(", ")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="detail-tabs" style={{ marginTop: 20, display: "flex", gap: 8 }}>
        <button
          type="button"
          className={`btn-notes ${tab === "marks" ? "is-active" : ""}`}
          onClick={() => setTab("marks")}
        >
          <Highlighter size={14} /> Marks ({marks.length})
        </button>
        <button
          type="button"
          className={`btn-notes ${tab === "shots" ? "is-active" : ""}`}
          onClick={() => setTab("shots")}
        >
          <Camera size={14} /> Shots ({shots.length})
        </button>
      </div>

      {tab === "marks" ? (
        <div className="notes-list" style={{ marginTop: 16 }}>
          {!marks.length ? (
            <EmptyState icon={Inbox} title="No marks on this video" />
          ) : (
            marks
              .slice()
              .sort((a, b) => a.startTime - b.startTime)
              .map((h) => (
                <article key={h.id} className="note-row glass-card">
                  <div className="note-time">{formatTime(h.startTime)}</div>
                  <div className="note-body">
                    <p>{h.note?.trim() || "Mark (no text)"}</p>
                  </div>
                  <a
                    className="btn-notes"
                    href={ytWatchUrl(videoId, p.videoUrl, h.startTime)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} /> Jump
                  </a>
                </article>
              ))
          )}
        </div>
      ) : (
        <div className="shots-grid" style={{ marginTop: 16 }}>
          {!shots.length ? (
            <EmptyState icon={Inbox} title="No screenshots" />
          ) : (
            shots.map((s) => {
              const src = mediaSrc(s.imageUrl || s.dataUrl, session?.token);
              return (
                <div key={s.id} className="shot-card glass-card">
                  {src ? <img src={src} alt="" /> : <div className="shot-ph" />}
                  <div className="shot-meta">
                    <time>{formatTime(s.videoTime)}</time>
                    <span>{s.note || "—"}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
