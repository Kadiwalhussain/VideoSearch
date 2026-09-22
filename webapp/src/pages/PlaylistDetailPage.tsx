import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Inbox,
  ListVideo,
  Loader2,
  Play,
  Share2,
  StickyNote,
} from "lucide-react";
import { useVault } from "../store/VaultContext";
import { useSession } from "../store/SessionContext";
import { useDialog } from "../store/DialogContext";
import { createPlaylistShare } from "../api/vault";
import { EmptyState } from "../components/EmptyState";
import { ExportPdfButton } from "../components/ExportPdfButton";
import { PlaylistTrackRow } from "../components/PlaylistTrackRow";
import { PlaylistSectionPicker } from "../components/PlaylistSectionPicker";
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
  const { session } = useSession();
  const { toast } = useDialog();
  const [shareUrl, setShareUrl] = useState("");
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the link is visible to copy by hand */
    }
  };

  const share = async (listName: string) => {
    if (!session) return;
    setSharing(true);
    try {
      const out = await createPlaylistShare(session, listName);
      setShareUrl(out.shareUrl);
      await copy(out.shareUrl);
      toast("Playlist link copied — anyone with it can view (read-only)", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not share playlist", "error");
    } finally {
      setSharing(false);
    }
  };
  const group = playlists.find(
    (g) => g.name.toLowerCase() === decoded.toLowerCase()
  );
  const rows = group?.rows || [];
  const lead = rows[0];
  const rest = rows.slice(1);

  let marks = 0;
  let shots = 0;
  let watched = 0;
  for (const r of rows) {
    if (r.payload?.completed) watched += 1;
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
              <PlaylistSectionPicker playlist={group.name} />
              <p className="pl-hero-stats">
                {rows.length} video{rows.length === 1 ? "" : "s"}
                {` · ${watched} watched`}
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
                <button
                  type="button"
                  className="btn-notes"
                  disabled={sharing}
                  onClick={() => void share(group.name)}
                  title="Create a read-only link to this playlist"
                >
                  {sharing ? <Loader2 size={14} className="spin" /> : <Share2 size={14} />} Share list
                </button>
                <ExportPdfButton
                  rows={rows}
                  title={decoded}
                  subtitle={`Playlist · ${rows.length} video${rows.length === 1 ? "" : "s"} · ${marks} marks · ${shots} shots`}
                  fileBase={`${decoded} - videosearch`}
                  label="Export PDF"
                  disabled={!marks && !shots}
                />
              </div>
            </div>
          </section>

          {shareUrl ? (
            <div className="pl-share-box glass-card">
              <Share2 size={16} />
              <input
                readOnly
                value={shareUrl}
                aria-label="Playlist share link"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button type="button" className="btn-notes" onClick={() => void copy(shareUrl)}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}

          {/* Full playlist queue */}
          <section className="pl-queue">
            <div className="pl-queue-head">
              <h2>
                <ListVideo size={18} /> Full playlist
              </h2>
              <span className="pl-queue-count">
                {watched}/{rows.length} watched
              </span>
            </div>
            <div
              className="pl-progress"
              role="progressbar"
              aria-label="Watched in this playlist"
              aria-valuemin={0}
              aria-valuemax={rows.length}
              aria-valuenow={watched}
            >
              <span style={{ width: `${(watched / rows.length) * 100}%` }} />
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
