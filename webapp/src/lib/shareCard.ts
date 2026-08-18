import type { VaultRow } from "../types";
import { formatTime, ytWatchUrl } from "./format";
import { createVideoShare } from "../api/vault";
import type { Session } from "../types";

export function buildShareText(row: VaultRow, shareUrl?: string): string {
  const p = row.payload || {};
  const title = p.videoTitle || row.video_id;
  const channel = p.channelTitle ? `\nChannel: ${p.channelTitle}` : "";
  const watch = ytWatchUrl(row.video_id, p.videoUrl);
  const marks = p.highlights || [];
  const shots = p.screenshots || [];

  const markLines = marks
    .slice()
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
    .slice(0, 40)
    .map((h) => {
      const t = formatTime(h.startTime || 0);
      const note = (h.note || "").trim() || "Mark";
      return `• [${t}] ${note}`;
    });

  const shotLines = shots
    .slice()
    .sort((a, b) => (a.videoTime || 0) - (b.videoTime || 0))
    .slice(0, 20)
    .map((s) => {
      const t = formatTime(s.videoTime || 0);
      const note = (s.note || "").trim() || "Shot";
      return `• [${t}] ${note}`;
    });

  const parts = [
    `📺 ${title}${channel}`,
    `Watch: ${watch}`,
    "",
    `Marks (${marks.length}):`,
    markLines.length ? markLines.join("\n") : "• (none)",
  ];

  if (shots.length) {
    parts.push("", `Shots (${shots.length}):`, shotLines.join("\n"));
  }

  const sources = p.sourceLinks || [];
  if (sources.length) {
    const sourceLines = sources.slice(0, 25).map((l) => {
      const label = (l.label || l.kind || "Link").trim();
      return `• ${label}: ${l.url}`;
    });
    parts.push("", `Sources (${sources.length}):`, sourceLines.join("\n"));
  }

  if (shareUrl) {
    parts.push("", `Shared card: ${shareUrl}`);
  }

  parts.push("", "— Shared from VideoSearch Studio");
  return parts.join("\n");
}

export async function shareVaultVideo(
  session: Session,
  row: VaultRow
): Promise<{ shareUrl: string; text: string }> {
  const created = await createVideoShare(session, row.video_id);
  const text = buildShareText(row, created.shareUrl);
  return { shareUrl: created.shareUrl, text };
}

/** Prefer native share sheet; fall back to clipboard. */
export async function presentShare(opts: {
  title: string;
  text: string;
  url: string;
}): Promise<"shared" | "copied"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
      });
      return "shared";
    } catch (e) {
      // User cancelled share sheet — not an error
      if (e instanceof Error && /Abort|cancel/i.test(e.name + e.message)) {
        throw e;
      }
    }
  }
  await navigator.clipboard.writeText(`${opts.text}`);
  return "copied";
}
