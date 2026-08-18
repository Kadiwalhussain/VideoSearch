import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Camera,
  ExternalLink,
  Highlighter,
  Link2,
  Loader2,
  Play,
  Share2,
} from "lucide-react";
import { Ambient } from "../components/Ambient";
import { defaultApiUrl } from "../api/client";
import { fetchSharedCard } from "../api/vault";
import { formatTime, ytThumb, ytWatchUrl } from "../lib/format";
import { isUsefulSource } from "../lib/sourceFilter";

function kindLabel(kind?: string): string {
  const map: Record<string, string> = {
    drive: "Drive",
    docs: "Doc",
    slides: "Slides",
    sheets: "Sheet",
    form: "Form",
    pdf: "PDF",
    github: "GitHub",
    notion: "Notion",
    figma: "Figma",
    canva: "Canva",
    cloud: "Cloud",
    hub: "Hub",
    course: "Course",
    resource: "Read",
  };
  return map[kind || ""] || "Link";
}

export function SharePage() {
  const { token = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof fetchSharedCard>
  > | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReady(false);
    fetchSharedCard(defaultApiUrl(), token)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load share");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (loading || error || !data) return;
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, [loading, error, data]);

  const snap = data?.snapshot;
  const marks = snap?.highlights || [];
  const shots = snap?.screenshots || [];
  const sources = (snap?.sourceLinks || []).filter(isUsefulSource);

  return (
    <div className="page page-auth share-page">
      <Ambient />
      <div className="share-shell">
        <header className="share-top">
          <div className="share-brand">
            <Share2 size={16} />
            <span>VideoSearch · Shared card</span>
          </div>
          <Link className="btn-notes" to="/login">
            Open Studio
          </Link>
        </header>

        {loading ? (
          <div className="share-card glass-card share-card-anim">
            <p className="share-loading">
              <Loader2 size={18} className="spin" /> Loading shared card…
            </p>
          </div>
        ) : error ? (
          <div className="share-card glass-card share-card-anim">
            <h1>Link unavailable</h1>
            <p className="view-sub">{error}</p>
            <Link className="btn-glow sm" to="/login" style={{ marginTop: 12 }}>
              Go to Studio
            </Link>
          </div>
        ) : snap ? (
          <article
            className={`share-card glass-card share-card-pro ${ready ? "is-in" : ""}`}
          >
            <div className="share-cinematic">
              <img
                src={ytThumb(snap.videoId)}
                alt=""
                className="share-cinematic-bg"
              />
              <div className="share-cinematic-veil" />
              <div className="share-cinematic-content">
                <a
                  className="share-cinematic-thumb"
                  href={ytWatchUrl(snap.videoId, snap.videoUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src={ytThumb(snap.videoId)} alt="" />
                  <span className="share-cinematic-play" aria-hidden>
                    <Play size={22} fill="currentColor" />
                  </span>
                </a>
                <div className="share-cinematic-meta">
                  <p className="share-by">
                    Shared by {snap.sharedBy || "a VideoSearch user"}
                  </p>
                  <h1>{snap.videoTitle || snap.videoId}</h1>
                  {snap.channelTitle ? (
                    <p className="share-channel">{snap.channelTitle}</p>
                  ) : null}
                  <div className="share-stats">
                    <span>
                      <Highlighter size={13} />{" "}
                      {snap.markCount ?? marks.length} marks
                    </span>
                    <span>
                      <Camera size={13} /> {snap.shotCount ?? shots.length}{" "}
                      shots
                    </span>
                    {sources.length ? (
                      <span>
                        <Link2 size={13} /> {sources.length} sources
                      </span>
                    ) : null}
                    <span>{snap.noteCount ?? 0} written</span>
                  </div>
                  <a
                    className="btn-glow sm"
                    href={ytWatchUrl(snap.videoId, snap.videoUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} /> Watch on YouTube
                  </a>
                </div>
              </div>
            </div>

            <section className="share-section share-section-anim">
              <h2>
                <Highlighter size={16} /> Marks & notes
              </h2>
              {!marks.length ? (
                <p className="view-sub">No marks on this share.</p>
              ) : (
                <ul className="share-list">
                  {marks
                    .slice()
                    .sort(
                      (a, b) => (a.startTime || 0) - (b.startTime || 0)
                    )
                    .map((h, i) => (
                      <li
                        key={h.id || i}
                        style={{ animationDelay: `${i * 40}ms` }}
                        className="share-list-item-anim"
                      >
                        <a
                          href={ytWatchUrl(
                            snap.videoId,
                            snap.videoUrl,
                            h.startTime
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="share-time"
                        >
                          {formatTime(h.startTime || 0)}
                        </a>
                        <div>
                          <p>{(h.note || "").trim() || "Mark (no text)"}</p>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            {shots.length > 0 ? (
              <section className="share-section share-section-anim">
                <h2>
                  <Camera size={16} /> Shots
                </h2>
                <ul className="share-list">
                  {shots
                    .slice()
                    .sort(
                      (a, b) => (a.videoTime || 0) - (b.videoTime || 0)
                    )
                    .map((s, i) => (
                      <li
                        key={s.id || i}
                        style={{ animationDelay: `${i * 40}ms` }}
                        className="share-list-item-anim"
                      >
                        <a
                          href={ytWatchUrl(
                            snap.videoId,
                            snap.videoUrl,
                            s.videoTime
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="share-time"
                        >
                          {formatTime(s.videoTime || 0)}
                        </a>
                        <div>
                          <p>{(s.note || "").trim() || "Frame capture"}</p>
                        </div>
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}

            {sources.length > 0 ? (
              <section className="share-section share-section-anim">
                <h2>
                  <Link2 size={16} /> Resources from bio
                </h2>
                <div className="share-sources-grid">
                  {sources.map((l, i) => (
                    <a
                      key={l.id || l.url || i}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="share-source-chip"
                      style={{ animationDelay: `${i * 45}ms` }}
                    >
                      <span className="share-source-kind">
                        {kindLabel(l.kind)}
                      </span>
                      <span className="share-source-label">
                        {(l.label || "").trim() || l.url}
                      </span>
                      <ExternalLink size={13} />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <footer className="share-foot">
              Shared via VideoSearch Studio · notes stay private to this link
            </footer>
          </article>
        ) : null}
      </div>
    </div>
  );
}
