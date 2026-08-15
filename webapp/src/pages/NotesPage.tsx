import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  FileText,
  Film,
  Highlighter,
  Inbox,
  Search,
  StickyNote,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { useVault } from "../store/VaultContext";
import { useSession } from "../store/SessionContext";
import {
  formatTime,
  relTime,
  ytThumb,
  ytWatchUrl,
} from "../lib/format";
import { mediaSrc } from "../api/client";
import type { NoteItem } from "../types";

type Filter = "all" | "written" | "silent";

function markColor(color?: string): string {
  if (!color) return "var(--accent)";
  const c = color.trim();
  if (c.startsWith("#") || c.startsWith("rgb") || c.startsWith("hsl")) return c;
  // named / short keys from extension
  const map: Record<string, string> = {
    red: "#fb7185",
    rose: "#fb7185",
    pink: "#f472b6",
    orange: "#fb923c",
    yellow: "#fbbf24",
    green: "#34d399",
    emerald: "#34d399",
    blue: "#38bdf8",
    cyan: "#22d3ee",
    purple: "#a78bfa",
    violet: "#a78bfa",
  };
  return map[c.toLowerCase()] || "var(--accent)";
}

export function NotesPage() {
  const { notes, shots } = useVault();
  const { session } = useSession();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shotById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of shots) {
      const src = mediaSrc(s.shot.imageUrl || s.shot.dataUrl, session?.token);
      if (src) m.set(s.shot.id, src);
    }
    // also index by video+time for soft match
    return m;
  }, [shots, session?.token]);

  const written = useMemo(
    () => notes.filter((n) => n.highlight.note?.trim()).length,
    [notes]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return notes.filter((n) => {
      const text = (n.highlight.note || "").trim();
      if (filter === "written" && !text) return false;
      if (filter === "silent" && text) return false;
      if (!query) return true;
      return (
        text.toLowerCase().includes(query) ||
        n.title.toLowerCase().includes(query) ||
        formatTime(n.highlight.startTime).includes(query)
      );
    });
  }, [notes, q, filter]);

  // Group for “by video” strip counts
  const videoCount = useMemo(() => {
    const s = new Set(filtered.map((n) => n.videoId));
    return s.size;
  }, [filtered]);

  const thumbFor = (n: NoteItem): string => {
    const sid = n.highlight.screenshotId;
    if (sid && shotById.has(sid)) return shotById.get(sid)!;
    // nearest shot on same video around the mark time (±3s)
    const t = n.highlight.startTime;
    let best: string | null = null;
    let bestD = 4;
    for (const s of shots) {
      if (s.videoId !== n.videoId) continue;
      const d = Math.abs((s.shot.videoTime || 0) - t);
      if (d < bestD) {
        const src = mediaSrc(s.shot.imageUrl || s.shot.dataUrl, session?.token);
        if (src) {
          best = src;
          bestD = d;
        }
      }
    }
    return best || ytThumb(n.videoId);
  };

  return (
    <div className="view notes-page">
      <header className="view-head notes-page-head">
        <div>
          <h1>
            <Highlighter size={22} /> Notes
          </h1>
          <p className="view-sub">
            {notes.length} mark{notes.length === 1 ? "" : "s"}
            {written ? ` · ${written} with text` : ""}
            {videoCount ? ` · ${videoCount} video${videoCount === 1 ? "" : "s"}` : ""}
            {" · "}every moment you pinned, with preview
          </p>
        </div>
        <div className="notes-toolbar">
          <label className="notes-search">
            <Search size={14} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search notes or titles…"
              aria-label="Search notes"
            />
          </label>
          <div className="notes-filters" role="tablist" aria-label="Filter notes">
            {(
              [
                ["all", "All"],
                ["written", "With text"],
                ["silent", "Marks only"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={`notes-filter${filter === id ? " is-on" : ""}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {!notes.length ? (
        <EmptyState
          icon={Inbox}
          title="No marks yet"
          sub="Use the mark control on YouTube to pin moments — they show up here with previews."
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={Search}
          title="No matches"
          sub="Try another search or filter."
        />
      ) : (
        <div className="notes-grid">
          {filtered.map((n) => {
            const text = n.highlight.note?.trim() || "";
            const hasText = Boolean(text);
            const color = markColor(n.highlight.color);
            const thumb = thumbFor(n);
            const isShot = Boolean(
              n.highlight.screenshotId && shotById.has(n.highlight.screenshotId)
            ) || (thumb && !thumb.includes("ytimg.com"));

            return (
              <article
                key={`${n.videoId}-${n.highlight.id}`}
                className={`note-card${hasText ? "" : " is-silent"}`}
                style={{ ["--mark-color" as string]: color }}
              >
                <Link
                  to={`/video/${n.videoId}`}
                  className="note-card-thumb"
                  title={n.title}
                >
                  <img src={thumb} alt="" loading="lazy" />
                  <div className="note-card-thumb-shade" />
                  <span className="note-card-time">
                    {formatTime(n.highlight.startTime)}
                  </span>
                  {isShot ? (
                    <span className="note-card-badge shot">
                      <Film size={11} /> Capture
                    </span>
                  ) : (
                    <span className="note-card-badge mark">
                      <Highlighter size={11} /> Mark
                    </span>
                  )}
                  <span className="note-card-color" aria-hidden />
                </Link>

                <div className="note-card-body">
                  <div className="note-card-text">
                    {hasText ? (
                      <p title={text}>{text}</p>
                    ) : (
                      <p className="note-card-empty">
                        <StickyNote size={14} /> Mark without text
                      </p>
                    )}
                  </div>

                  <Link to={`/video/${n.videoId}`} className="note-card-video">
                    <img src={ytThumb(n.videoId)} alt="" />
                    <div>
                      <strong title={n.title}>{n.title}</strong>
                      <span>
                        {n.highlight.createdAt
                          ? relTime(n.highlight.createdAt)
                          : n.highlight.updatedAt
                            ? relTime(n.highlight.updatedAt)
                            : "In vault"}
                        {n.highlight.endTime != null &&
                        n.highlight.endTime > n.highlight.startTime
                          ? ` · ${formatTime(n.highlight.startTime)}–${formatTime(n.highlight.endTime)}`
                          : ""}
                      </span>
                    </div>
                  </Link>

                  <div className="note-card-actions">
                    <a
                      className="note-card-watch"
                      href={ytWatchUrl(
                        n.videoId,
                        n.videoUrl,
                        n.highlight.startTime
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={13} />
                      Watch at {formatTime(n.highlight.startTime)}
                    </a>
                    <Link
                      className="note-card-open"
                      to={`/video/${n.videoId}`}
                    >
                      <FileText size={13} />
                      Open
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
