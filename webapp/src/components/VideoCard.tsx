import { Link } from "react-router-dom";
import {
  Bookmark,
  Clock,
  ExternalLink,
  ListPlus,
  StickyNote,
  Trash2,
} from "lucide-react";
import { relTime, rowActivityMs, ytThumb, ytWatchUrl } from "../lib/format";
import type { VaultRow } from "../types";
import { useVault } from "../store/VaultContext";
import { useDialog } from "../store/DialogContext";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function looksLikeVideoId(s: string): boolean {
  return /^[A-Za-z0-9_-]{10,12}$/.test(s.trim());
}

function displayTitle(row: VaultRow): string {
  const p = row.payload || {};
  const t = String(p.videoTitle || "").trim();
  if (t && t !== row.video_id && !looksLikeVideoId(t)) return t;
  // last resort: never show empty
  return t || row.video_id;
}

function activityLabel(row: VaultRow): string {
  const ms = rowActivityMs(row);
  return ms != null ? relTime(ms) : "—";
}

export function VideoCard({
  row,
  showRemoveWatchLater,
  playlistName,
  showDelete = false,
}: {
  row: VaultRow;
  showRemoveWatchLater?: boolean;
  playlistName?: string;
  /** Show delete control (history / library). */
  showDelete?: boolean;
}) {
  const { libraryAction, playlistNames, deleteVideo } = useVault();
  const { confirm, toast } = useDialog();
  const p = row.payload || {};
  const marks = (p.highlights || []).length;
  const shots = (p.screenshots || []).length;
  const noted = (p.highlights || []).filter((h) => h.note?.trim()).length;
  const [busy, setBusy] = useState(false);
  const [plOpen, setPlOpen] = useState(false);
  const [newPl, setNewPl] = useState("");
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const plBtnRef = useRef<HTMLButtonElement>(null);

  const title = displayTitle(row);

  useEffect(() => {
    if (!plOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (plBtnRef.current?.contains(t)) return;
      const menu = document.getElementById(`v-pl-portal-${row.video_id}`);
      if (menu?.contains(t)) return;
      setPlOpen(false);
    };
    const onScroll = () => setPlOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [plOpen, row.video_id]);

  const openPlaylist = () => {
    const el = plBtnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const menuW = 210;
      let left = r.right - menuW;
      if (left < 8) left = 8;
      if (left + menuW > window.innerWidth - 8) {
        left = window.innerWidth - menuW - 8;
      }
      // Open downward if room, else upward
      const spaceBelow = window.innerHeight - r.bottom;
      const top =
        spaceBelow < 220 ? Math.max(8, r.top - 220) : r.bottom + 6;
      setMenuPos({ top, left });
    }
    setPlOpen((o) => !o);
  };

  const run = async (
    action: Parameters<typeof libraryAction>[1],
    pl?: string
  ) => {
    setBusy(true);
    try {
      await libraryAction(row.video_id, action, pl);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setBusy(false);
      setPlOpen(false);
    }
  };

  const onDelete = async () => {
    const title = displayTitle(row);
    const ok = await confirm({
      title: "Delete video?",
      message: `“${title}” will be removed from History and Library.\n\nAll marks and shots for this video will be deleted. This cannot be undone.`,
      confirmLabel: "Delete video",
      cancelLabel: "Keep video",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteVideo(row.video_id);
      toast("Video deleted from vault", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setBusy(false);
    }
  };

  // One clean meta line — never duplicate on the thumbnail
  const metaParts: string[] = [activityLabel(row)];
  if (marks > 0) metaParts.push(`${marks} mark${marks === 1 ? "" : "s"}`);
  if (shots > 0) metaParts.push(`${shots} shot${shots === 1 ? "" : "s"}`);
  // only show written-note count when it adds signal (not same as marks)
  if (noted > 0 && noted !== marks) {
    metaParts.push(`${noted} written`);
  }
  if (marks === 0 && shots === 0) metaParts.push("No activity yet");
  const metaText = metaParts.join(" · ");

  return (
    <article className="video-card">
      <Link to={`/video/${row.video_id}`} className="v-thumb">
        <img src={ytThumb(row.video_id)} alt="" loading="lazy" />
        <div className="v-play" aria-hidden>
          <span>▶</span>
        </div>
      </Link>

      <div className="v-body">
        <h3 title={title}>
          <Link to={`/video/${row.video_id}`}>{title}</Link>
        </h3>
        <p className="v-meta" title={metaText}>
          {metaText}
        </p>

        {/* Full-bleed action bar: primary actions | icon cluster */}
        <div className="v-bar">
          <div className="v-bar-primary">
            <a
              className="v-bar-watch"
              href={ytWatchUrl(row.video_id, p.videoUrl)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} strokeWidth={2.25} aria-hidden />
              <span>Watch</span>
            </a>
            <Link className="v-bar-open" to={`/video/${row.video_id}`}>
              <StickyNote size={14} strokeWidth={2.25} aria-hidden />
              <span>Open</span>
            </Link>
          </div>
          <div className="v-bar-icons">
            <button
              type="button"
              className={`v-bar-ico ${p.watchLater ? "is-on" : ""}`}
              disabled={busy}
              title="Watch later"
              aria-label="Watch later"
              onClick={() =>
                void run(
                  showRemoveWatchLater
                    ? "unwatch_later"
                    : "toggle_watch_later"
                )
              }
            >
              <Clock size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              className={`v-bar-ico ${p.saved ? "is-on" : ""}`}
              disabled={busy}
              title="Save"
              aria-label="Save"
              onClick={() => void run("toggle_save")}
            >
              <Bookmark size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              ref={plBtnRef}
              className={`v-bar-ico ${plOpen ? "is-on" : ""}`}
              disabled={busy}
              title="Playlist"
              aria-label="Playlist"
              aria-expanded={plOpen}
              onClick={openPlaylist}
            >
              <ListPlus size={15} strokeWidth={2} />
            </button>
            {showDelete ? (
              <button
                type="button"
                className="v-bar-ico is-danger"
                disabled={busy}
                title="Delete from vault"
                aria-label="Delete from vault"
                onClick={() => void onDelete()}
              >
                <Trash2 size={15} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {plOpen &&
        createPortal(
          <div
            id={`v-pl-portal-${row.video_id}`}
            className="v-pl-portal"
            style={{ top: menuPos.top, left: menuPos.left }}
            role="menu"
          >
            <div className="v-pl-menu-title">Playlists</div>
            {playlistNames.length === 0 ? (
              <div className="v-pl-empty">No playlists yet</div>
            ) : (
              playlistNames.map((name) => {
                const on = (p.playlists || []).some(
                  (x) => x.toLowerCase() === name.toLowerCase()
                );
                return (
                  <button
                    key={name}
                    type="button"
                    className={`v-pl-item ${on ? "is-on" : ""}`}
                    onClick={() =>
                      void run(on ? "remove_playlist" : "add_playlist", name)
                    }
                  >
                    {on ? "✓ " : ""}
                    {name}
                  </button>
                );
              })
            )}
            {playlistName ? (
              <button
                type="button"
                className="v-pl-item danger"
                onClick={() => void run("remove_playlist", playlistName)}
              >
                Remove from “{playlistName}”
              </button>
            ) : null}
            <div className="v-pl-new">
              <input
                value={newPl}
                onChange={(e) => setNewPl(e.target.value)}
                placeholder="New playlist"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPl.trim()) {
                    void run("add_playlist", newPl.trim());
                    setNewPl("");
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (newPl.trim()) {
                    void run("add_playlist", newPl.trim());
                    setNewPl("");
                  }
                }}
              >
                Add
              </button>
            </div>
          </div>,
          document.body
        )}
    </article>
  );
}
