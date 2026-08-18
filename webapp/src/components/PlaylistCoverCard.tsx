import { Link } from "react-router-dom";
import { ListVideo, Play } from "lucide-react";
import { activityLabel, ytThumb } from "../lib/format";
import type { PlaylistGroup } from "../types";

function looksLikeVideoId(s: string): boolean {
  return /^[A-Za-z0-9_-]{10,12}$/.test(s.trim());
}

function titleOf(row: PlaylistGroup["rows"][0]): string {
  const t = String(row.payload?.videoTitle || "").trim();
  if (t && t !== row.video_id && !looksLikeVideoId(t)) return t;
  return t || row.video_id;
}

export function PlaylistCoverCard({ group }: { group: PlaylistGroup }) {
  const rows = group.rows || [];
  const count = rows.length;
  const cover = rows[0];
  const thumbs = rows.slice(0, 4).map((r) => r.video_id);
  // Pad mosaic to 4 cells for consistent cover art
  while (thumbs.length > 0 && thumbs.length < 4) {
    thumbs.push(thumbs[thumbs.length - 1]);
  }

  let marks = 0;
  let shots = 0;
  for (const r of rows) {
    marks += (r.payload?.highlights || []).length;
    shots += (r.payload?.screenshots || []).length;
  }

  const activity = cover != null ? activityLabel(cover) : "—";
  const leadTitle = cover ? titleOf(cover) : "Empty playlist";

  return (
    <Link
      to={`/playlists/${encodeURIComponent(group.name)}`}
      className="pl-cover glass-card"
    >
      <div
        className={`pl-cover-mosaic ${count === 1 ? "is-single" : ""} ${count === 0 ? "is-empty" : ""}`}
        aria-hidden
      >
        {count === 0 ? (
          <div className="pl-cover-empty">
            <ListVideo size={28} strokeWidth={1.5} />
          </div>
        ) : count === 1 ? (
          <img src={ytThumb(thumbs[0])} alt="" loading="lazy" />
        ) : (
          thumbs.map((id, i) => (
            <img key={`${id}-${i}`} src={ytThumb(id)} alt="" loading="lazy" />
          ))
        )}
        <div className="pl-cover-play">
          <Play size={18} fill="currentColor" />
        </div>
      </div>

      <div className="pl-cover-body">
        <div className="pl-cover-badge">
          <ListVideo size={12} />
          Playlist
        </div>
        <h3 className="pl-cover-name" title={group.name}>
          {group.name}
        </h3>
        <p className="pl-cover-meta">
          {count} video{count === 1 ? "" : "s"}
          {marks > 0 ? ` · ${marks} marks` : ""}
          {shots > 0 ? ` · ${shots} shots` : ""}
          {activity !== "—" ? ` · ${activity}` : ""}
        </p>
        {cover ? (
          <p className="pl-cover-lead" title={leadTitle}>
            Starts with · {leadTitle}
          </p>
        ) : (
          <p className="pl-cover-lead">Add videos from any card or the extension</p>
        )}
      </div>
    </Link>
  );
}
