import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  FileText,
  Highlighter,
  Inbox,
  Search,
  StickyNote,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { useVault } from "../store/VaultContext";
import {
  formatTime,
  relTime,
  ytThumb,
  ytWatchUrl,
} from "../lib/format";
import type { NoteItem } from "../types";

type Filter = "all" | "written" | "silent";

function markColor(color?: string): string {
  if (!color) return "#34d399";
  const c = String(color).trim();
  if (c.startsWith("#") && (c.length === 7 || c.length === 4)) return c;
  if (c.startsWith("rgb") || c.startsWith("hsl")) return c;
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
  return map[c.toLowerCase()] || "#34d399";
}

function noteKey(n: NoteItem, index: number): string {
  const id = n.highlight.id || `t${n.highlight.startTime}`;
  return `${n.videoId}__${id}__${index}`;
}

export function NotesPage() {
  const { notes } = useVault();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  // Deduplicate by videoId+highlight.id (server sometimes has dups)
  const uniqueNotes = useMemo(() => {
    const seen = new Set<string>();
    const out: NoteItem[] = [];
    for (const n of notes) {
      const id = n.highlight.id || `${n.highlight.startTime}`;
      const k = `${n.videoId}:${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(n);
    }
    return out;
  }, [notes]);

  const written = useMemo(
    () => uniqueNotes.filter((n) => n.highlight.note?.trim()).length,
    [uniqueNotes]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return uniqueNotes.filter((n) => {
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
  }, [uniqueNotes, q, filter]);

  const videoCount = useMemo(
    () => new Set(filtered.map((n) => n.videoId)).size,
    [filtered]
  );

  return (
    <div className="view notes-page">
      <header className="notes-page-head">
        <div className="notes-page-title">
          <h1>
            <Highlighter size={22} /> Notes
          </h1>
          <p className="view-sub">
            {uniqueNotes.length} mark{uniqueNotes.length === 1 ? "" : "s"}
            {written ? ` · ${written} with text` : ""}
            {videoCount ? ` · ${videoCount} video${videoCount === 1 ? "" : "s"}` : ""}
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

      {!uniqueNotes.length ? (
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
          {filtered.map((n, index) => {
            const text = n.highlight.note?.trim() || "";
            const hasText = Boolean(text);
            const color = markColor(n.highlight.color);
            const thumb = ytThumb(n.videoId);
            const when =
              n.highlight.createdAt || n.highlight.updatedAt
                ? relTime(n.highlight.createdAt || n.highlight.updatedAt)
                : null;

            return (
              <article
                key={noteKey(n, index)}
                className="note-card"
                style={{ borderTopColor: color }}
              >
                <Link
                  to={`/video/${n.videoId}`}
                  className="note-card-thumb"
                  title={n.title}
                >
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                  <div className="note-card-thumb-shade" aria-hidden />
                  <span className="note-card-time">
                    {formatTime(n.highlight.startTime)}
                  </span>
                  <span className="note-card-badge">
                    <Highlighter size={11} /> Mark
                  </span>
                </Link>

                <div className="note-card-body">
                  {hasText ? (
                    <p className="note-card-text" title={text}>
                      {text}
                    </p>
                  ) : (
                    <p className="note-card-text note-card-empty">
                      <StickyNote size={14} /> Mark without text
                    </p>
                  )}

                  <div className="note-card-meta">
                    <img src={thumb} alt="" loading="lazy" decoding="async" />
                    <div className="note-card-meta-copy">
                      <strong title={n.title}>{n.title}</strong>
                      <span>
                        {when || "In vault"}
                        {n.highlight.endTime != null &&
                        n.highlight.endTime > n.highlight.startTime
                          ? ` · ${formatTime(n.highlight.startTime)}–${formatTime(n.highlight.endTime)}`
                          : ""}
                      </span>
                    </div>
                  </div>

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
                    <Link className="note-card-open" to={`/video/${n.videoId}`}>
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
