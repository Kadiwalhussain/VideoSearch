import { Link } from "react-router-dom";
import {
  Bookmark,
  Clock,
  ExternalLink,
  StickyNote,
  Trash2,
} from "lucide-react";
import { relTime, rowActivityMs, ytThumb, ytWatchUrl } from "../lib/format";
import type { VaultRow } from "../types";
import { useVault } from "../store/VaultContext";
import { useDialog } from "../store/DialogContext";
import { useState } from "react";

function looksLikeVideoId(s: string): boolean {
  return /^[A-Za-z0-9_-]{10,12}$/.test(s.trim());
}

function displayTitle(row: VaultRow): string {
  const p = row.payload || {};
  const t = String(p.videoTitle || "").trim();
  if (t && t !== row.video_id && !looksLikeVideoId(t)) return t;
  return t || row.video_id;
}

export function PlaylistTrackRow({
  row,
  index,
  playlistName,
  featured = false,
}: {
  row: VaultRow;
  index: number;
  playlistName: string;
  /** Larger treatment when this is the lead / first video */
  featured?: boolean;
}) {
  const { libraryAction } = useVault();
  const { toast } = useDialog();
  const [busy, setBusy] = useState(false);
  const p = row.payload || {};
  const title = displayTitle(row);
  const marks = (p.highlights || []).length;
  const shots = (p.screenshots || []).length;
  const activity = rowActivityMs(row);

  const meta: string[] = [];
  if (p.channelTitle) meta.push(p.channelTitle);
  if (marks) meta.push(`${marks} mark${marks === 1 ? "" : "s"}`);
  if (shots) meta.push(`${shots} shot${shots === 1 ? "" : "s"}`);
  if (activity != null) meta.push(relTime(activity));

  const remove = async () => {
    setBusy(true);
    try {
      await libraryAction(row.video_id, "remove_playlist", playlistName);
      toast(`Removed from “${playlistName}”`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not remove", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`pl-track glass-card ${featured ? "is-featured" : ""}`}
    >
      <div className="pl-track-index" aria-hidden>
        {index}
      </div>
      <Link to={`/video/${row.video_id}`} className="pl-track-thumb">
        <img src={ytThumb(row.video_id)} alt="" loading="lazy" />
      </Link>
      <div className="pl-track-body">
        <h3 className="pl-track-title" title={title}>
          <Link to={`/video/${row.video_id}`}>{title}</Link>
        </h3>
        <p className="pl-track-meta" title={meta.join(" · ")}>
          {meta.join(" · ") || "In this playlist"}
        </p>
        <div className="pl-track-flags">
          {p.watchLater ? (
            <span className="pl-flag">
              <Clock size={11} /> Later
            </span>
          ) : null}
          {p.saved ? (
            <span className="pl-flag">
              <Bookmark size={11} /> Saved
            </span>
          ) : null}
        </div>
      </div>
      <div className="pl-track-actions">
        <a
          className="btn-notes sm"
          href={ytWatchUrl(row.video_id, p.videoUrl)}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={13} /> Watch
        </a>
        <Link className="btn-notes sm" to={`/video/${row.video_id}`}>
          <StickyNote size={13} /> Open
        </Link>
        <button
          type="button"
          className="btn-notes sm is-danger"
          disabled={busy}
          title={`Remove from ${playlistName}`}
          onClick={() => void remove()}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  );
}
