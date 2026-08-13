import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Sparkles } from "lucide-react";
import { useVault } from "../store/VaultContext";
import { formatTime } from "../lib/format";

export function SearchPage() {
  const [params] = useSearchParams();
  const initial = params.get("q") || "";
  const [q, setQ] = useState(initial);
  const { search } = useVault();
  const [hits, setHits] = useState(() => search(initial));
  const nav = useNavigate();

  useEffect(() => {
    setQ(initial);
    setHits(search(initial));
  }, [initial, search]);

  const run = () => {
    setHits(search(q));
    nav(`/search?q=${encodeURIComponent(q.trim())}`, { replace: true });
  };

  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <Sparkles size={22} /> AI Search
        </h1>
        <p className="view-sub">
          Search across titles, mark notes, and screenshot captions in your vault.
        </p>
      </header>
      <div className="glass-card pad">
        <div className="search-bar in-card">
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="e.g. GDP formula, biceps peak, election debate…"
            autoFocus
          />
          <button type="button" onClick={run} title="Search">
            <Search size={16} />
          </button>
        </div>
        <div className="search-results" style={{ marginTop: 16 }}>
          {!q.trim() ? (
            <div className="empty">Type a query to search your vault.</div>
          ) : !hits.length ? (
            <div className="empty">No matches for “{q}”.</div>
          ) : (
            hits.map((h, i) => (
              <button
                key={`${h.videoId}-${i}`}
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
                  {h.kind === "video" ? "VIDEO" : formatTime(h.time || 0)} ·{" "}
                  {h.kind}
                </time>
                <p>{h.snippet}</p>
                <div className="src">{h.title}</div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
