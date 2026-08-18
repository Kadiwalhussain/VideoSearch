import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Clock,
  ExternalLink,
  FileText,
  Highlighter,
  Inbox,
  Link2,
  Pencil,
  Save,
  Share2,
  Trash2,
} from "lucide-react";
import { useVault } from "../store/VaultContext";
import { useSession } from "../store/SessionContext";
import { useDialog } from "../store/DialogContext";
import {
  formatTime,
  relTime,
  rowActivityMs,
  ytThumb,
  ytWatchUrl,
} from "../lib/format";
import { shotSrc } from "../api/client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EmptyState } from "../components/EmptyState";
import { ShareCardModal } from "../components/ShareCardModal";
import { filterUsefulSources } from "../lib/sourceFilter";
import type { SourceLink, VaultPayload } from "../types";

/** Render bio markdown with [label](url) as real hyperlinks; rest as plain text. */
function renderBioMarkdown(md: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(md)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={`t${i++}`}>{md.slice(last, m.index)}</span>);
    }
    nodes.push(
      <a
        key={`a${i++}`}
        href={m[2]}
        target="_blank"
        rel="noreferrer"
        className="bio-link"
      >
        {m[1]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < md.length) {
    nodes.push(<span key={`t${i++}`}>{md.slice(last)}</span>);
  }
  return nodes;
}

function sourceKindLabel(kind?: string): string {
  const map: Record<string, string> = {
    drive: "Google Drive",
    docs: "Google Doc",
    slides: "Slides / PPT",
    sheets: "Spreadsheet",
    form: "Form",
    pdf: "PDF",
    github: "GitHub",
    notion: "Notion",
    figma: "Figma",
    canva: "Canva",
    cloud: "Cloud file",
    telegram: "Telegram",
    discord: "Discord",
    hub: "Link hub",
    link: "Link",
  };
  return map[kind || ""] || "Link";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

export function VideoDetailPage() {
  const { videoId = "" } = useParams();
  const {
    getVideo,
    libraryAction,
    deleteVideo,
    deleteMark,
    deleteShot,
    saveBio,
    loading,
  } = useVault();
  const { session } = useSession();
  const { confirm, toast } = useDialog();
  const nav = useNavigate();
  const row = getVideo(videoId);
  const [tab, setTab] = useState<"marks" | "shots" | "sources" | "bio">(
    "marks"
  );
  const [busy, setBusy] = useState(false);
  const [bioEdit, setBioEdit] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  const p: VaultPayload = row?.payload || { videoId };
  const bioMarkdownStored = (p.bioMarkdown || p.bioText || "").trim();

  useEffect(() => {
    setBioDraft(p.bioMarkdown || p.bioText || "");
    setBioEdit(false);
  }, [videoId, p.bioMarkdown, p.bioText]);

  const bioPreview = useMemo(
    () =>
      renderBioMarkdown(bioEdit ? bioDraft : bioMarkdownStored),
    [bioEdit, bioDraft, bioMarkdownStored]
  );

  if (loading && !row) {
    return (
      <div className="view">
        <Link className="link-btn" to="/library">
          <ArrowLeft size={14} /> Library
        </Link>
        <EmptyState
          icon={Inbox}
          title="Loading video…"
          sub="Pulling this card from your vault"
        />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="view">
        <Link className="link-btn" to="/library">
          <ArrowLeft size={14} /> Library
        </Link>
        <EmptyState icon={Inbox} title="Video not in vault" sub={videoId} />
      </div>
    );
  }

  const marks = p.highlights || [];
  const shots = p.screenshots || [];
  const sources: SourceLink[] = filterUsefulSources(p.sourceLinks);
  const bioMarkdown = bioMarkdownStored;
  const hasBio = Boolean(bioMarkdown);

  const run = async (action: Parameters<typeof libraryAction>[1]) => {
    setBusy(true);
    try {
      await libraryAction(videoId, action);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteVideo = async () => {
    const title = p.videoTitle || videoId;
    const ok = await confirm({
      title: "Delete video?",
      message: `“${title}” will be removed from your vault.\n\nAll marks and shots for this video will be deleted permanently.`,
      confirmLabel: "Delete video",
      cancelLabel: "Keep video",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteVideo(videoId);
      toast("Video deleted", "success");
      nav("/history");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteMark = async (highlightId: string, note?: string) => {
    const label = note?.trim() ? `“${note.trim().slice(0, 80)}”` : "this mark";
    const ok = await confirm({
      title: "Delete mark?",
      message: `${label} will be removed from this video. The video stays in your vault.`,
      confirmLabel: "Delete mark",
      cancelLabel: "Keep mark",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMark(videoId, highlightId);
      toast("Mark deleted", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete mark failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteShot = async (shotId: string) => {
    const ok = await confirm({
      title: "Delete shot?",
      message: "This screenshot will be removed from your vault.",
      confirmLabel: "Delete shot",
      cancelLabel: "Keep shot",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteShot(videoId, shotId);
      toast("Shot deleted", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete shot failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const onSaveBio = async () => {
    setBusy(true);
    try {
      // Keep plain text (strip markdown markers) + preserve markdown for links
      const plain = bioDraft
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
        .trim();
      const out = await saveBio(videoId, {
        bioText: plain || bioDraft,
        bioMarkdown: bioDraft,
      });
      setBioEdit(false);
      toast(
        out.sourceCount
          ? `Bio saved · ${out.sourceCount} source${out.sourceCount === 1 ? "" : "s"} extracted`
          : "Bio saved",
        "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Bio save failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view">
      <Link className="link-btn" to="/library">
        <ArrowLeft size={14} /> Library
      </Link>

      <div className="detail-hero-pro glass-card">
        <img
          className="detail-hero-bg"
          src={ytThumb(videoId)}
          alt=""
          aria-hidden
        />
        <div className="detail-hero-veil" aria-hidden />
        <div className="detail-hero-inner">
          <img
            className="detail-hero-thumb"
            src={ytThumb(videoId)}
            alt=""
          />
          <div className="detail-hero-body">
            {p.channelTitle ? (
              <p className="view-sub" style={{ marginBottom: 4 }}>
                {p.channelTitle}
              </p>
            ) : null}
            <h1>{p.videoTitle || videoId}</h1>
            <p className="view-sub">
              Updated {relTime(rowActivityMs(row) ?? row.updated_at)} ·{" "}
              {marks.length} marks · {shots.length} shots
              {sources.length ? ` · ${sources.length} sources` : ""}
              {hasBio ? " · bio" : ""}
            </p>
            <div className="v-actions" style={{ marginTop: 14 }}>
              <a
                className="btn-watch"
                href={ytWatchUrl(videoId, p.videoUrl)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} /> Watch
              </a>
              <button
                type="button"
                className={`btn-notes ${p.watchLater ? "is-active" : ""}`}
                disabled={busy}
                onClick={() => void run("toggle_watch_later")}
              >
                <Clock size={14} /> Later
              </button>
              <button
                type="button"
                className={`btn-notes ${p.saved ? "is-active" : ""}`}
                disabled={busy}
                onClick={() => void run("toggle_save")}
              >
                <Bookmark size={14} /> Save
              </button>
              <button
                type="button"
                className="btn-glow sm"
                disabled={busy || !session}
                onClick={() => {
                  if (!session) {
                    toast("Sign in to share", "error");
                    return;
                  }
                  setShareOpen(true);
                }}
                title="Share this video’s marks and notes"
              >
                <Share2 size={14} /> Share
              </button>
              <button
                type="button"
                className="btn-notes is-danger"
                disabled={busy}
                onClick={() => void onDeleteVideo()}
              >
                <Trash2 size={14} />
              </button>
            </div>
            {(p.playlists || []).length ? (
              <p className="view-sub" style={{ marginTop: 10 }}>
                Playlists: {(p.playlists || []).join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="detail-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "marks"}
          className={`btn-notes ${tab === "marks" ? "is-active" : ""}`}
          onClick={() => setTab("marks")}
        >
          <Highlighter size={14} /> Marks ({marks.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "shots"}
          className={`btn-notes ${tab === "shots" ? "is-active" : ""}`}
          onClick={() => setTab("shots")}
        >
          <Camera size={14} /> Shots ({shots.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "bio"}
          className={`btn-notes ${tab === "bio" ? "is-active" : ""}`}
          onClick={() => setTab("bio")}
        >
          <FileText size={14} /> Bio
          {hasBio ? <span className="detail-tab-dot" title="Bio synced" /> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sources"}
          className={`btn-notes ${tab === "sources" ? "is-active" : ""}`}
          onClick={() => setTab("sources")}
        >
          <Link2 size={14} /> Sources ({sources.length})
        </button>
      </div>

      {tab === "marks" ? (
        <div className="notes-list" style={{ marginTop: 16 }}>
          {!marks.length ? (
            <EmptyState icon={Inbox} title="No marks on this video" />
          ) : (
            marks
              .slice()
              .sort((a, b) => a.startTime - b.startTime)
              .map((h) => (
                <article key={h.id} className="note-row glass-card">
                  <div className="note-time">{formatTime(h.startTime)}</div>
                  <div className="note-body">
                    <p>{h.note?.trim() || "Mark (no text)"}</p>
                  </div>
                  <div className="note-row-actions">
                    <a
                      className="btn-notes"
                      href={ytWatchUrl(videoId, p.videoUrl, h.startTime)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={14} /> Jump
                    </a>
                    <button
                      type="button"
                      className="btn-notes is-danger"
                      disabled={busy || !h.id}
                      title="Delete mark"
                      onClick={() => void onDeleteMark(h.id, h.note)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </article>
              ))
          )}
        </div>
      ) : tab === "shots" ? (
        <div className="shots-grid" style={{ marginTop: 16 }}>
          {!shots.length ? (
            <EmptyState icon={Inbox} title="No screenshots" />
          ) : (
            shots.map((s) => {
              const src = shotSrc(videoId, s, session?.token);
              return (
                <div key={s.id} className="shot-card glass-card">
                  {src ? <img src={src} alt="" /> : <div className="shot-ph" />}
                  <div className="shot-meta">
                    <time>{formatTime(s.videoTime)}</time>
                    <span>{s.note || "—"}</span>
                    <button
                      type="button"
                      className="btn-notes is-danger sm"
                      disabled={busy}
                      title="Delete shot"
                      onClick={() => void onDeleteShot(s.id)}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : tab === "bio" ? (
        <div className="bio-panel glass-card" style={{ marginTop: 16 }}>
          <div className="bio-panel-head">
            <div>
              <h2 className="bio-panel-title">
                <FileText size={16} /> Description / bio
              </h2>
              <p className="view-sub" style={{ margin: "4px 0 0" }}>
                {hasBio
                  ? p.bioSyncedAt
                    ? `Synced ${relTime(p.bioSyncedAt)} · edit anytime`
                    : "Full YouTube description — links stay clickable"
                  : "Sync the full description from YouTube (top-right Copy / Sync bio on the video page)"}
              </p>
            </div>
            <div className="bio-panel-actions">
              {bioEdit ? (
                <>
                  <button
                    type="button"
                    className="btn-notes"
                    disabled={busy}
                    onClick={() => {
                      setBioDraft(p.bioMarkdown || p.bioText || "");
                      setBioEdit(false);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-glow sm"
                    disabled={busy}
                    onClick={() => void onSaveBio()}
                  >
                    <Save size={14} /> Save bio
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-notes"
                  disabled={busy}
                  onClick={() => {
                    setBioDraft(p.bioMarkdown || p.bioText || "");
                    setBioEdit(true);
                  }}
                >
                  <Pencil size={14} /> {hasBio ? "Edit" : "Write bio"}
                </button>
              )}
            </div>
          </div>

          {bioEdit ? (
            <>
              <textarea
                className="bio-editor"
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                rows={16}
                placeholder="Paste or edit the full description…&#10;Links: [label](https://example.com)"
                spellCheck
              />
              <p className="bio-hint">
                Tip: keep links as <code>[label](https://…)</code> so they stay
                clickable. Plain text is fine too.
              </p>
            </>
          ) : !hasBio ? (
            <EmptyState
              icon={FileText}
              title="No bio synced yet"
              sub="On YouTube, expand the description, then click Sync bio (top-right of the bio). The full text and hyperlinks land here so you can edit them later."
            />
          ) : (
            <pre className="bio-body">{bioPreview}</pre>
          )}
        </div>
      ) : (
        <div className="sources-list" style={{ marginTop: 16 }}>
          {!sources.length ? (
            <EmptyState
              icon={Link2}
              title="No resource links yet"
              sub="Sync the bio from YouTube. Only real materials show here (Drive, PPT, docs, PDFs, GitHub…) — not default Google/YouTube links."
            />
          ) : (
            sources.map((l) => (
              <a
                key={l.id || l.url}
                className="source-row glass-card"
                href={l.url}
                target="_blank"
                rel="noreferrer"
              >
                <div className="source-kind">{sourceKindLabel(l.kind)}</div>
                <div className="source-body">
                  <strong>{l.label?.trim() || sourceKindLabel(l.kind)}</strong>
                  <span>{hostOf(l.url)}</span>
                </div>
                <ExternalLink size={14} className="source-ext" />
              </a>
            ))
          )}
        </div>
      )}

      {session && row ? (
        <ShareCardModal
          open={shareOpen}
          row={row}
          session={session}
          onClose={() => setShareOpen(false)}
          onToast={toast}
        />
      ) : null}
    </div>
  );
}
