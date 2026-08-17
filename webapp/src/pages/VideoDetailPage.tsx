import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Clock,
  ExternalLink,
  Highlighter,
  Inbox,
  Trash2,
} from "lucide-react";
import { useVault } from "../store/VaultContext";
import { useSession } from "../store/SessionContext";
import { useDialog } from "../store/DialogContext";
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

export function VideoDetailPage() {
  const { videoId = "" } = useParams();
  const { getVideo, libraryAction, deleteVideo, deleteMark, deleteShot } =
    useVault();
  const { session } = useSession();
  const { confirm, toast } = useDialog();
  const nav = useNavigate();
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
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteVideo = async () => {
    const title = p.videoTitle || videoId;
    const ok = await confirm({
      title: "Delete video?",
      message: `“${title}” will be removed from your vault.\n\nAll marks and shots for this video will be deleted permanently.`,
      confirmLabel: "Delete video",
      cancelLabel: "Keep video",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteVideo(videoId);
      toast("Video deleted", "success");
      nav("/history");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteMark = async (highlightId: string, note?: string) => {
    const label = note?.trim() ? `“${note.trim().slice(0, 80)}”` : "this mark";
    const ok = await confirm({
      title: "Delete mark?",
      message: `${label} will be removed from this video. The video stays in your vault.`,
      confirmLabel: "Delete mark",
      cancelLabel: "Keep mark",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMark(videoId, highlightId);
      toast("Mark deleted", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete mark failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteShot = async (shotId: string) => {
    const ok = await confirm({
      title: "Delete shot?",
      message: "This screenshot will be removed from your vault.",
      confirmLabel: "Delete shot",
      cancelLabel: "Keep shot",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteShot(videoId, shotId);
      toast("Shot deleted", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete shot failed", "error");
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
            <button
              type="button"
              className="btn-notes is-danger"
              disabled={busy}
              onClick={() => void onDeleteVideo()}
            >
              <Trash2 size={14} /> Delete video
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
                  <div className="note-row-actions">
                    <a
                      className="btn-notes"
                      href={ytWatchUrl(videoId, p.videoUrl, h.startTime)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} /> Jump
                    </a>
                    <button
                      type="button"
                      className="btn-notes is-danger"
                      disabled={busy || !h.id}
                      title="Delete mark"
                      onClick={() => void onDeleteMark(h.id, h.note)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
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
                    <button
                      type="button"
                      className="btn-notes is-danger sm"
                      disabled={busy}
                      title="Delete shot"
                      onClick={() => void onDeleteShot(s.id)}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
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
