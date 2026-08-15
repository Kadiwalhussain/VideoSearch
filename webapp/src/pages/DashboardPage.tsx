import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  CloudDownload,
  PlayCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { StatCards } from "../components/StatCards";
import { VideoCard } from "../components/VideoCard";
import { useSession } from "../store/SessionContext";
import { useVault } from "../store/VaultContext";
import { useState } from "react";
import { formatTime } from "../lib/format";
import { EmptyState } from "../components/EmptyState";
import { SessionLoader } from "../components/SessionLoader";
import { Inbox } from "lucide-react";

export function DashboardPage() {
  const { session } = useSession();
  const { stats, recent, search, loading, error, refresh } = useVault();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ReturnType<typeof search>>([]);
  const nav = useNavigate();
  const name = session?.user.displayName || session?.user.email || "there";

  const runSearch = () => {
    const h = search(q);
    setHits(h);
  };

  return (
    <div className="view view-dashboard">
      <div className="dash-hero glass-card">
        <div>
          <span className="live-pill">LIVE VAULT</span>
          <h1>Welcome back, {name.split(" ")[0] || name}</h1>
          <p>
            Your synced lectures, notes, and captures — watch on YouTube or open
            notes.
          </p>
        </div>
        <StatCards stats={stats} />
      </div>

      {error ? (
        <div className="empty" style={{ marginBottom: 16, borderColor: "rgba(248,113,113,0.4)" }}>
          {error}{" "}
          <button type="button" className="link-btn" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">
            <CloudDownload size={18} /> Recently synced
          </h2>
          <Link className="link-btn" to="/library">
            View all →
          </Link>
        </div>
        {loading && !recent.length ? (
          <SessionLoader
            variant="inline"
            title="Loading vault"
            sub="Syncing recent videos and activity…"
          />
        ) : recent.length ? (
          <div className="video-grid">
            {recent.map((r) => (
              <VideoCard key={r.video_id} row={r} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Inbox}
            title="Vault is empty"
            sub="Mark moments on YouTube with the extension while signed in — they appear here."
          />
        )}
      </section>

      <div className="dash-split">
        <section className="glass-card pad">
          <div className="card-head">
            <h3>
              <Sparkles size={16} /> AI Search
            </h3>
          </div>
          <div className="search-bar in-card">
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search notes, titles, shot captions…"
            />
            <button type="button" id="dashSearchBtn" title="Search" onClick={runSearch}>
              <Search size={16} />
            </button>
          </div>
          <div className="search-results" style={{ marginTop: 12 }}>
            {hits.map((h, i) => (
              <button
                key={`${h.videoId}-${h.kind}-${i}`}
                type="button"
                className="search-result"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                }}
                onClick={() => nav(`/video/${h.videoId}`)}
              >
                <time>
                  {h.kind === "video"
                    ? "VIDEO"
                    : formatTime(h.time || 0)}{" "}
                  · {h.kind}
                </time>
                <p>{h.snippet}</p>
                <div className="src">{h.title}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-card pad">
          <div className="card-head">
            <h3>
              <Activity size={16} /> Insights
            </h3>
            <Link className="link-btn" to="/analytics">
              Open →
            </Link>
          </div>
          <ul className="insight-list">
            <li>
              <strong>{stats.videos}</strong> videos in vault
            </li>
            <li>
              <strong>{stats.marks}</strong> timeline marks
            </li>
            <li>
              <strong>{stats.shots}</strong> screenshots
            </li>
            <li>
              <strong>{stats.notes}</strong> written notes
            </li>
            <li>
              <strong>{stats.saved}</strong> saved ·{" "}
              <strong>{stats.watchLater}</strong> watch later
            </li>
          </ul>
          <Link className="btn-glow sm" to="/history" style={{ marginTop: 12 }}>
            <PlayCircle size={14} /> Continue in history
          </Link>
        </section>
      </div>
    </div>
  );
}
