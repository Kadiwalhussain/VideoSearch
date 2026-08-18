import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Inbox,
  ListVideo,
  Play,
  StickyNote,
} from "lucide-react";
import { useVault } from "../store/VaultContext";
import { EmptyState } from "../components/EmptyState";
import { PlaylistTrackRow } from "../components/PlaylistTrackRow";
import {
  activityLabel,
  ytThumb,
  ytWatchUrl,
} from "../lib/format";

function looksLikeVideoId(s: string): boolean {
  return /^[A-Za-z0-9_-]{10,12}$/.test(s.trim());
}

function displayTitle(videoId: string, raw?: string): string {
  const t = String(raw || "").trim();
  if (t && t !== videoId && !looksLikeVideoId(t)) return t;
  return t || videoId;
}

export function PlaylistDetailPage() {
  const { name = "" } = useParams();
  const decoded = decodeURIComponent(name);
  const { playlists, loading } = useVault();
  const group = playlists.find(
    (g) => g.name.toLowerCase() === decoded.toLowerCase()
  );
  const rows = group?.rows || [];
  const lead = rows[0];
  const rest = rows.slice(1);

  let marks = 0;
  let shots = 0;
  for (const r of rows) {
    marks += (r.payload?.highlights || []).length;
    shots += (r.payload?.screenshots || []).length;
  }

  return (
    <div className="view pl-detail">
      <header className="view-head">
        <Link className="link-btn" to="/playlists">
          <ArrowLeft size={14} /> All playlists
        </Link>
      </header>

      {loading && !group ? (
        <EmptyState
          icon={ListVideo}
          title="Loading playlist…"
          sub="Organizing your lists from the vault"
        />
      ) : !group ? (
        <EmptyState
          icon={Inbox}
          title="Playlist not found"
          sub={`No playlist named “${decoded}”. It may have been emptied or renamed.`}
        />
      ) : !rows.length ? (
        <>
          <div className="pl-hero glass-card is-empty">
            <div className="pl-hero-body">
              <div className="pl-hero-badge">
                <ListVideo size={13} /> Playlist
              </div>
              <h1>{decoded}</h1>
              <p className="view-sub">Empty · add videos from any card or the extension</p>
            </div>
          </div>
          <EmptyState icon={Inbox} title="Empty playlist" />
        </>
      ) : (
        <>
          {/* Lead video first — clean featured block */}
          <section className="pl-hero glass-card">
            <Link
              to={`/video/${lead.video_id}`}
              className="pl-hero-thumb"
              aria-label={`Open ${displayTitle(lead.video_id, lead.payload?.videoTitle)}`}
            >
              <img
                src={ytThumb(lead.video_id)}
                alt=""
                loading="eager"
              />
              <span className="pl-hero-play" aria-hidden>
                <Play size={28} fill="currentColor" />
              </span>
            </Link>
            <div className="pl-hero-body">
              <div className="pl-hero-badge">
                <ListVideo size={13} /> Playlist
              </div>
              <h1 title={decoded}>{decoded}</h1>
              <p className="pl-hero-stats">
                {rows.length} video{rows.length === 1 ? "" : "s"}
                {marks > 0 ? ` · ${marks} marks` : ""}
                {shots > 0 ? ` · ${shots} shots` : ""}
                {activityLabel(lead) !== "—"
                  ? ` · ${activityLabel(lead)}`
                  : ""}
              </p>

              <div className="pl-hero-now">
                <span className="pl-hero-now-label">Playing first</span>
                <strong title={displayTitle(lead.video_id, lead.payload?.videoTitle)}>
                  {displayTitle(lead.video_id, lead.payload?.videoTitle)}
                </strong>
                {lead.payload?.channelTitle ? (
                  <span className="pl-hero-channel">
                    {lead.payload.channelTitle}
                  </span>
                ) : null}
              </div>

              <div className="pl-hero-actions">
                <a
                  className="btn-glow sm"
                  href={ytWatchUrl(lead.video_id, lead.payload?.videoUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={14} /> Watch first video
                </a>
                <Link className="btn-notes" to={`/video/${lead.video_id}`}>
                  <StickyNote size={14} /> Open notes
                </Link>
              </div>
            </div>
          </section>

          {/* Full playlist queue */}
          <section className="pl-queue">
            <div className="pl-queue-head">
              <h2>
                <ListVideo size={18} /> Full playlist
              </h2>
              <span className="pl-queue-count">
                {rows.length} item{rows.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="pl-track-list">
              {/* First video also appears as #1 in the list */}
              <PlaylistTrackRow
                row={lead}
                index={1}
                playlistName={group.name}
                featured
              />
              {rest.map((r, i) => (
                <PlaylistTrackRow
                  key={r.video_id}
                  row={r}
                  index={i + 2}
                  playlistName={group.name}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
