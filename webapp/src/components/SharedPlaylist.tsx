import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  Highlighter,
  ListPlus,
  ListVideo,
  Loader2,
  Play,
} from "lucide-react";
import { importPlaylist, type SharedPlaylistVideo } from "../api/vault";
import { formatTime, ytThumb, ytWatchUrl } from "../lib/format";
import { useSession } from "../store/SessionContext";
import { useDialog } from "../store/DialogContext";

/** Read-only view of a shared playlist, with "save a copy" for signed-in viewers. */
export function SharedPlaylist({
  name,
  sharedBy,
  videos,
  expiresAt,
}: {
  name: string;
  sharedBy?: string;
  videos: SharedPlaylistVideo[];
  expiresAt?: string | null;
}) {
  const { session } = useSession();
  const { toast } = useDialog();
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const totals = useMemo(() => {
    let marks = 0;
    let seconds = 0;
    for (const v of videos) {
      marks += (v.highlights || []).length;
      seconds += v.durationSec || 0;
    }
    return { marks, seconds };
  }, [videos]);

  const saveCopy = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const out = await importPlaylist(session, name, videos);
      setSaved(true);
      toast(out.message || `Saved “${name}” to your vault`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save playlist", "error");
    } finally {
      setSaving(false);
    }
  };

  const lead = videos[0];

  return (
    <article className="share-card glass-card share-card-pro is-in shared-pl">
      <div className="share-cinematic">
        {lead ? (
          <img src={ytThumb(lead.videoId)} alt="" className="share-cinematic-bg" />
        ) : null}
        <div className="share-cinematic-veil" />
        <div className="share-cinematic-content">
          <div className="share-cinematic-meta">
            <p className="share-by">
              <ListVideo size={14} /> Playlist
              {sharedBy ? ` · shared by ${sharedBy}` : ""}
            </p>
            <h1>{name}</h1>
            <div className="share-stats">
              <span>
                {videos.length} video{videos.length === 1 ? "" : "s"}
              </span>
              {totals.seconds ? <span>{formatTime(totals.seconds)} total</span> : null}
              {totals.marks ? <span>{totals.marks} marks</span> : null}
            </div>
            <div className="shared-pl-actions">
              {lead ? (
                <a
                  className="btn-glow sm"
                  href={ytWatchUrl(lead.videoId, lead.videoUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Play size={14} /> Play first video
                </a>
              ) : null}
              {session ? (
                <button
                  type="button"
                  className="btn-notes"
                  disabled={saving || saved}
                  onClick={() => void saveCopy()}
                >
                  {saving ? <Loader2 size={14} className="spin" /> : <ListPlus size={14} />}{" "}
                  {saved ? "Saved to your vault" : "Save a copy to my vault"}
                </button>
              ) : (
                <Link className="btn-notes" to="/login">
                  <ListPlus size={14} /> Sign in to save a copy
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      <ol className="shared-pl-list">
        {videos.map((v, i) => {
          const marks = (v.highlights || [])
            .slice()
            .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
          const isOpen = open === v.videoId;
          return (
            <li key={v.videoId} className="shared-pl-item">
              <div className="shared-pl-row">
                <span className="shared-pl-index">{i + 1}</span>
                <a
                  className="shared-pl-thumb"
                  href={ytWatchUrl(v.videoId, v.videoUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src={ytThumb(v.videoId)} alt="" loading="lazy" />
                  {v.durationSec ? (
                    <span className="v-duration">{formatTime(v.durationSec)}</span>
                  ) : null}
                </a>
                <div className="shared-pl-meta">
                  <a
                    className="shared-pl-title"
                    href={ytWatchUrl(v.videoId, v.videoUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {v.videoTitle || v.videoId}
                  </a>
                  {v.channelTitle ? (
                    <span className="shared-pl-channel">{v.channelTitle}</span>
                  ) : null}
                  {marks.length ? (
                    <button
                      type="button"
                      className="shared-pl-toggle"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : v.videoId)}
                    >
                      <Highlighter size={13} /> {marks.length} mark
                      {marks.length === 1 ? "" : "s"}
                      <ChevronDown size={13} className={isOpen ? "is-open" : ""} />
                    </button>
                  ) : null}
                </div>
              </div>
              {isOpen ? (
                <ul className="share-list shared-pl-marks">
                  {marks.map((h, j) => (
                    <li key={h.id || j}>
                      <a
                        className="share-time"
                        href={ytWatchUrl(v.videoId, v.videoUrl, h.startTime)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {formatTime(h.startTime || 0)}
                      </a>
                      <span>{h.note?.trim() || "Marked moment"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>

      {expiresAt ? (
        <footer className="share-foot">
          Link expires {new Date(expiresAt).toLocaleDateString()}
        </footer>
      ) : null}
    </article>
  );
}
