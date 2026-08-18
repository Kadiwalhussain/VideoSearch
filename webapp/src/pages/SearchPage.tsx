import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ExternalLink,
  Loader2,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useVault } from "../store/VaultContext";
import { useSession } from "../store/SessionContext";
import { useDialog } from "../store/DialogContext";
import { formatTime, ytWatchUrl } from "../lib/format";
import { aiSearchVault } from "../api/vault";

type Mode = "keyword" | "ai";

export function SearchPage() {
  const [params] = useSearchParams();
  const initial = params.get("q") || "";
  const [q, setQ] = useState(initial);
  const [mode, setMode] = useState<Mode>("ai");
  const { search } = useVault();
  const { session } = useSession();
  const { toast } = useDialog();
  const [hits, setHits] = useState(() => search(initial));
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiCitations, setAiCitations] = useState<
    Array<{
      videoId: string;
      title: string;
      time: number;
      kind: string;
      snippet: string;
      why?: string;
    }>
  >([]);
  const [aiMeta, setAiMeta] = useState<{ provider?: string; model?: string }>(
    {}
  );
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    setQ(initial);
    if (initial.trim()) {
      setHits(search(initial));
      // Auto-run AI when arriving from global ⌘K search with a query
      if (mode === "ai" && session && initial.trim().length >= 2) {
        void (async () => {
          setBusy(true);
          try {
            const out = await aiSearchVault(session, initial.trim());
            setAiAnswer(out.answer);
            setAiCitations(out.citations);
            setAiMeta({ provider: out.provider, model: out.model });
          } catch {
            /* keep keyword hits */
          } finally {
            setBusy(false);
          }
        })();
      }
    } else {
      setHits([]);
    }
    // only re-run when URL query changes, not every mode toggle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const runKeyword = () => {
    setHits(search(q));
    setAiAnswer("");
    setAiCitations([]);
    nav(`/search?q=${encodeURIComponent(q.trim())}`, { replace: true });
  };

  const runAi = async () => {
    const query = q.trim();
    if (!query) return;
    if (!session) {
      toast("Sign in required for AI search", "error");
      return;
    }
    setBusy(true);
    setAiAnswer("");
    setAiCitations([]);
    nav(`/search?q=${encodeURIComponent(query)}`, { replace: true });
    try {
      const out = await aiSearchVault(session, query);
      setAiAnswer(out.answer);
      setAiCitations(out.citations);
      setAiMeta({ provider: out.provider, model: out.model });
      // Also show local keyword hits as backup
      setHits(search(query));
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI search failed", "error");
      // Fall back to keyword
      setHits(search(query));
      setMode("keyword");
    } finally {
      setBusy(false);
    }
  };

  const run = () => {
    if (mode === "ai") void runAi();
    else runKeyword();
  };

  return (
    <div className="view">
      <header className="view-head">
        <h1>
          <Sparkles size={22} /> AI Search
        </h1>
        <p className="view-sub">
          Ask natural questions about your vault — notes, marks, shots, and
          channels — powered by Mistral. Or switch to fast keyword match.
        </p>
      </header>

      <div className="glass-card pad">
        <div className="ai-search-modes" role="tablist">
          <button
            type="button"
            className={`ai-search-mode${mode === "ai" ? " is-on" : ""}`}
            onClick={() => setMode("ai")}
          >
            <Wand2 size={14} /> Ask AI
          </button>
          <button
            type="button"
            className={`ai-search-mode${mode === "keyword" ? " is-on" : ""}`}
            onClick={() => setMode("keyword")}
          >
            <Search size={14} /> Keyword
          </button>
        </div>

        <div className="search-bar in-card">
          <Search size={16} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && run()}
            placeholder={
              mode === "ai"
                ? "e.g. What did I note about biceps? Which channels teach ML?"
                : "e.g. GDP formula, biceps peak, election debate…"
            }
            autoFocus
            disabled={busy}
          />
          <button type="button" onClick={run} title="Search" disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
          </button>
        </div>

        {mode === "ai" && (aiAnswer || busy) ? (
          <div className="ai-answer-card">
            {busy ? (
              <p className="ai-answer-loading">
                <Loader2 size={16} className="spin" /> Thinking over your vault…
              </p>
            ) : (
              <>
                <div className="ai-answer-label">
                  AI answer
                  {aiMeta.model ? (
                    <span>
                      {aiMeta.provider || "llm"} · {aiMeta.model}
                    </span>
                  ) : null}
                </div>
                <p className="ai-answer-text">{aiAnswer}</p>
              </>
            )}
          </div>
        ) : null}

        {mode === "ai" && aiCitations.length > 0 ? (
          <div className="ai-cite-list">
            <div className="ai-cite-head">Sources in your vault</div>
            {aiCitations.map((c, i) => (
              <div key={`${c.videoId}-${i}`} className="ai-cite-row">
                <div className="ai-cite-main">
                  <button
                    type="button"
                    className="ai-cite-title"
                    onClick={() => nav(`/video/${c.videoId}`)}
                  >
                    {c.title}
                  </button>
                  <p>{c.snippet || c.why || "—"}</p>
                  <span className="ai-cite-meta">
                    {c.kind.toUpperCase()}
                    {c.time > 0 ? ` · ${formatTime(c.time)}` : ""}
                  </span>
                </div>
                <div className="ai-cite-actions">
                  <a
                    className="btn-notes"
                    href={ytWatchUrl(c.videoId, undefined, c.time || undefined)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={13} /> Watch
                  </a>
                  <button
                    type="button"
                    className="btn-notes"
                    onClick={() => nav(`/video/${c.videoId}`)}
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="search-results" style={{ marginTop: 16 }}>
          {mode === "keyword" || hits.length ? (
            <>
              {mode === "ai" && hits.length ? (
                <div className="ai-cite-head" style={{ marginBottom: 8 }}>
                  Keyword matches
                </div>
              ) : null}
              {!q.trim() ? (
                <div className="empty">
                  {mode === "ai"
                    ? "Ask anything about your notes, marks, shots, or channels."
                    : "Type a query to search your vault."}
                </div>
              ) : !hits.length && !busy && !aiAnswer ? (
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
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
