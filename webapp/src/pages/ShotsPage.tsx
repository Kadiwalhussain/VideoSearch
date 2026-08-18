import { useMemo, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  Inbox,
  Search,
  X,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { useVault } from "../store/VaultContext";
import { useSession } from "../store/SessionContext";
import { formatTime, relTime, ytThumb, ytWatchUrl } from "../lib/format";
import { shotSrc } from "../api/client";
import type { ShotItem } from "../types";

type Group = {
  videoId: string;
  title: string;
  videoUrl: string;
  updatedAt?: string;
  shots: ShotItem[];
};

/** Lazy image with graceful fallback — never blocks the page */
function ShotImg({
  src,
  className,
  alt = "",
}: {
  src: string;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`shot-ph${className ? ` ${className}` : ""}`}>
        <Camera size={22} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

export function ShotsPage() {
  const { shots, rows } = useVault();
  const { session } = useSession();
  const [lb, setLb] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [videoFilter, setVideoFilter] = useState<string>("all");

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const s of shots) {
      const row = rows.find((r) => r.video_id === s.videoId);
      let g = map.get(s.videoId);
      if (!g) {
        g = {
          videoId: s.videoId,
          title: s.title,
          videoUrl: s.videoUrl,
          updatedAt: row?.updated_at,
          shots: [],
        };
        map.set(s.videoId, g);
      }
      g.shots.push(s);
    }
    for (const g of map.values()) {
      g.shots.sort(
        (a, b) => (b.shot.createdAt || 0) - (a.shot.createdAt || 0)
      );
    }
    return [...map.values()].sort(
      (a, b) =>
        (b.shots[0]?.shot.createdAt || 0) - (a.shots[0]?.shot.createdAt || 0)
    );
  }, [shots, rows]);

  const flatFiltered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return shots.filter((s) => {
      if (videoFilter !== "all" && s.videoId !== videoFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.shot.note || "").toLowerCase().includes(q)
      );
    });
  }, [shots, filter, videoFilter]);

  const openFlat = useCallback(
    (item: ShotItem) => {
      const idx = flatFiltered.findIndex(
        (s) => s.shot.id === item.shot.id && s.videoId === item.videoId
      );
      setLb(idx >= 0 ? idx : 0);
    },
    [flatFiltered]
  );

  useEffect(() => {
    if (lb == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLb(null);
      if (e.key === "ArrowLeft")
        setLb((i) =>
          i == null ? i : (i - 1 + flatFiltered.length) % flatFiltered.length
        );
      if (e.key === "ArrowRight")
        setLb((i) =>
          i == null ? i : (i + 1) % flatFiltered.length
        );
    };
    window.addEventListener("keydown", onKey);
    // Lock page scroll while lightbox is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lb, flatFiltered.length]);

  const active = lb != null ? flatFiltered[lb] : null;

  return (
    <div className="view shots-gallery">
      <header className="view-head shots-gallery-head">
        <div>
          <h1>
            <Camera size={22} /> Shots gallery
          </h1>
          <p className="view-sub">
            {shots.length} capture{shots.length === 1 ? "" : "s"} ·{" "}
            {groups.length} video{groups.length === 1 ? "" : "s"} · like a photo
            roll of everything you froze on YouTube
          </p>
        </div>
        <div className="shots-toolbar">
          <label className="shots-search">
            <Search size={14} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search notes or titles…"
            />
          </label>
          <select
            className="shots-video-filter"
            value={videoFilter}
            onChange={(e) => setVideoFilter(e.target.value)}
            aria-label="Filter by video"
          >
            <option value="all">All videos</option>
            {groups.map((g) => (
              <option key={g.videoId} value={g.videoId}>
                {g.title.slice(0, 48)}
                {g.title.length > 48 ? "…" : ""} ({g.shots.length})
              </option>
            ))}
          </select>
        </div>
      </header>

      {!shots.length ? (
        <EmptyState
          icon={Inbox}
          title="No screenshots yet"
          sub="Use the camera control on YouTube — pins appear on the timeline and land here."
        />
      ) : !flatFiltered.length ? (
        <EmptyState
          icon={Search}
          title="No matches"
          sub="Try another filter or clear the search."
        />
      ) : videoFilter === "all" && !filter.trim() ? (
        <div className="shot-albums">
          {groups.map((g) => (
            <section key={g.videoId} className="shot-album glass-card">
              <div className="shot-album-head">
                <Link to={`/video/${g.videoId}`} className="shot-album-video">
                  <img src={ytThumb(g.videoId)} alt="" />
                  <div>
                    <strong>{g.title}</strong>
                    <span>
                      {g.shots.length} shot{g.shots.length === 1 ? "" : "s"}
                      {g.updatedAt ? ` · ${relTime(g.updatedAt)}` : ""}
                    </span>
                  </div>
                </Link>
                <div className="shot-album-actions">
                  <a
                    className="btn-notes"
                    href={ytWatchUrl(g.videoId, g.videoUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} /> Watch
                  </a>
                  <Link className="btn-notes" to={`/video/${g.videoId}`}>
                    <Film size={14} /> Open
                  </Link>
                </div>
              </div>
              <div className="shot-album-grid">
                {g.shots.map((s) => {
                  const src = shotSrc(s.videoId, s.shot, session?.token);
                  return (
                    <button
                      key={s.shot.id}
                      type="button"
                      className="shot-tile"
                      onClick={() => openFlat(s)}
                    >
                      <ShotImg src={src} />
                      <div className="shot-tile-meta">
                        <time>{formatTime(s.shot.videoTime)}</time>
                        {s.shot.note?.trim() ? (
                          <span>{s.shot.note}</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="shot-masonry">
          {flatFiltered.map((s) => {
            const src = shotSrc(s.videoId, s.shot, session?.token);
            return (
              <button
                key={`${s.videoId}-${s.shot.id}`}
                type="button"
                className="shot-tile tall glass-card"
                onClick={() => openFlat(s)}
              >
                <ShotImg src={src} />
                <div className="shot-tile-footer">
                  <time>{formatTime(s.shot.videoTime)}</time>
                  <span className="shot-from">{s.title}</span>
                  {s.shot.note?.trim() ? (
                    <span className="shot-note">{s.shot.note}</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {active
        ? createPortal(
            <div
              className="shot-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label="Shot preview"
              onClick={() => setLb(null)}
            >
              <button
                type="button"
                className="shot-lb-close"
                onClick={() => setLb(null)}
                aria-label="Close"
              >
                <X size={22} />
              </button>
              {flatFiltered.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="shot-lb-nav prev"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLb((i) =>
                        i == null
                          ? 0
                          : (i - 1 + flatFiltered.length) % flatFiltered.length
                      );
                    }}
                    aria-label="Previous"
                  >
                    <ChevronLeft size={28} />
                  </button>
                  <button
                    type="button"
                    className="shot-lb-nav next"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLb((i) =>
                        i == null ? 0 : (i + 1) % flatFiltered.length
                      );
                    }}
                    aria-label="Next"
                  >
                    <ChevronRight size={28} />
                  </button>
                </>
              ) : null}
              <div
                className="shot-lb-stage"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="shot-lb-frame">
                  <ShotImg
                    src={shotSrc(active.videoId, active.shot, session?.token)}
                  />
                </div>
                <div className="shot-lb-info">
                  <div className="shot-lb-video">
                    <img src={ytThumb(active.videoId)} alt="" />
                    <div>
                      <Link to={`/video/${active.videoId}`}>
                        {active.title}
                      </Link>
                      <span>
                        {formatTime(active.shot.videoTime)}
                        {lb != null
                          ? ` · ${lb + 1} / ${flatFiltered.length}`
                          : ""}
                      </span>
                    </div>
                  </div>
                  <p className="shot-lb-note">
                    {active.shot.note?.trim() || "No note on this capture"}
                  </p>
                  <div className="shot-lb-actions">
                    <a
                      className="btn-watch"
                      href={ytWatchUrl(
                        active.videoId,
                        active.videoUrl,
                        active.shot.videoTime
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} /> Watch at this moment
                    </a>
                    <Link
                      className="btn-notes"
                      to={`/video/${active.videoId}`}
                    >
                      Open in vault
                    </Link>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
