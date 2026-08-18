import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  ExternalLink,
  Highlighter,
  Camera,
  Link2,
  Loader2,
  Share2,
  X,
} from "lucide-react";
import type { Session, VaultRow } from "../types";
import { ytThumb, ytWatchUrl } from "../lib/format";
import { buildShareText, shareVaultVideo } from "../lib/shareCard";

type Props = {
  open: boolean;
  row: VaultRow;
  session: Session;
  onClose: () => void;
  onToast?: (msg: string, kind?: "success" | "error" | "info") => void;
};

function looksLikeVideoId(s: string): boolean {
  return /^[A-Za-z0-9_-]{10,12}$/.test(s.trim());
}

function titleOf(row: VaultRow): string {
  const t = String(row.payload?.videoTitle || "").trim();
  if (t && t !== row.video_id && !looksLikeVideoId(t)) return t;
  return t || row.video_id;
}

/** Filter junk Google/YT links client-side for share preview counts. */
function usefulSources(row: VaultRow) {
  const list = row.payload?.sourceLinks || [];
  return list.filter((l) => {
    if (!l?.url) return false;
    const kind = (l.kind || "").toLowerCase();
    if (
      [
        "drive",
        "docs",
        "slides",
        "sheets",
        "form",
        "pdf",
        "github",
        "notion",
        "figma",
        "canva",
        "cloud",
        "telegram",
        "discord",
        "hub",
        "course",
        "resource",
      ].includes(kind)
    ) {
      return true;
    }
    try {
      const h = new URL(l.url).hostname.replace(/^www\./, "").toLowerCase();
      if (h.includes("youtube") || h === "youtu.be") return false;
      if (h === "google.com" || h.endsWith(".google.com")) {
        return (
          h.includes("drive.google") ||
          h.includes("docs.google") ||
          h.includes("slides.google")
        );
      }
      return kind !== "link" || (new URL(l.url).pathname || "/").length > 2;
    } catch {
      return false;
    }
  });
}

export function ShareCardModal({
  open,
  row,
  session,
  onClose,
  onToast,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  const p = row.payload || {};
  const title = titleOf(row);
  const marks = (p.highlights || []).length;
  const shots = (p.screenshots || []).length;
  const sources = usefulSources(row).length;
  const notes =
    (p.highlights || []).filter((h) => h.note?.trim()).length +
    (p.screenshots || []).filter((s) => s.note?.trim()).length;

  // Create share link once per open (not on every vault refresh of `row`)
  useEffect(() => {
    if (!open) {
      setShareUrl(null);
      setCopied(false);
      setError(null);
      setEntered(false);
      setBusy(false);
      return;
    }
    const t = requestAnimationFrame(() => setEntered(true));
    let cancelled = false;
    setBusy(true);
    setError(null);
    shareVaultVideo(session, row)
      .then((r) => {
        if (!cancelled) setShareUrl(r.shareUrl);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not create share");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(t);
    };
    // Only recreate when opening a different video — not on every vault soft-refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session.token, row.video_id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      onToast?.("Share link copied", "success");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      onToast?.("Could not copy", "error");
    }
  };

  const copyFull = async () => {
    if (!shareUrl) return;
    try {
      // Rebuild text from current row + existing URL (no second share token)
      const text = buildShareText(row, shareUrl);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onToast?.("Notes + link copied", "success");
      window.setTimeout(() => setCopied(false), 2200);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : "Copy failed", "error");
    }
  };

  const nativeShare = async () => {
    if (!shareUrl || !navigator.share) return;
    try {
      await navigator.share({
        title,
        text: `Notes from “${title}” on VideoSearch`,
        url: shareUrl,
      });
      onToast?.("Shared", "success");
    } catch (e) {
      if (e instanceof Error && /Abort|cancel/i.test(e.name + e.message)) return;
      onToast?.("Share cancelled", "info");
    }
  };

  return createPortal(
    <div
      className={`share-modal-overlay ${entered ? "is-in" : ""}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`share-modal ${entered ? "is-in" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="share-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="share-modal-thumb-wrap">
          <img
            src={ytThumb(row.video_id)}
            alt=""
            className="share-modal-thumb"
          />
          <div className="share-modal-thumb-shine" aria-hidden />
          <div className="share-modal-badge">
            <Share2 size={12} /> Share card
          </div>
        </div>

        <div className="share-modal-body">
          <p className="share-modal-kicker">Share with notes</p>
          <h2 id="share-modal-title" className="share-modal-title">
            {title}
          </h2>
          {p.channelTitle ? (
            <p className="share-modal-channel">{p.channelTitle}</p>
          ) : null}

          <div className="share-modal-stats">
            <span>
              <Highlighter size={13} /> {marks} marks
            </span>
            <span>
              <Camera size={13} /> {shots} shots
            </span>
            {notes > 0 ? <span>{notes} written</span> : null}
            {sources > 0 ? (
              <span>
                <Link2 size={13} /> {sources} sources
              </span>
            ) : null}
          </div>

          <div className="share-modal-linkbox">
            {busy && !shareUrl ? (
              <p className="share-modal-link-pending">
                <Loader2 size={14} className="spin" /> Creating private link…
              </p>
            ) : error ? (
              <p className="share-modal-link-err">{error}</p>
            ) : (
              <code className="share-modal-url" title={shareUrl || ""}>
                {shareUrl}
              </code>
            )}
          </div>

          <div className="share-modal-actions">
            <button
              type="button"
              className="btn-glow sm share-modal-primary"
              disabled={!shareUrl || busy}
              onClick={() => void copyLink()}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <button
              type="button"
              className="btn-notes"
              disabled={!shareUrl || busy}
              onClick={() => void copyFull()}
            >
              <Copy size={14} /> Copy notes + link
            </button>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <button
                type="button"
                className="btn-notes"
                disabled={!shareUrl || busy}
                onClick={() => void nativeShare()}
              >
                <Share2 size={14} /> System share
              </button>
            ) : null}
            <a
              className="btn-notes"
              href={ytWatchUrl(row.video_id, p.videoUrl)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} /> YouTube
            </a>
          </div>

          <p className="share-modal-hint">
            Anyone with the link can view this card’s marks & notes — they don’t
            need an account.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
