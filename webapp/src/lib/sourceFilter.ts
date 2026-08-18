import type { SourceLink } from "../types";

/**
 * Real bio materials only — Drive, PPT, docs, PDFs, GitHub…
 * Hides default Google / YouTube links that appear on every video.
 */
export function isUsefulSource(link: SourceLink | { url?: string; kind?: string }): boolean {
  const url = link?.url;
  if (!url) return false;
  let host = "";
  let path = "/";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "").toLowerCase();
    path = u.pathname || "/";
  } catch {
    return false;
  }

  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".ytimg.com")
  ) {
    return false;
  }

  const noise = new Set([
    "google.com",
    "accounts.google.com",
    "support.google.com",
    "policies.google.com",
    "myaccount.google.com",
    "ads.google.com",
    "play.google.com",
    "maps.google.com",
    "mail.google.com",
    "news.google.com",
    "gstatic.com",
    "googleapis.com",
    "googleusercontent.com",
    "doubleclick.net",
    "googlesyndication.com",
    "googleadservices.com",
    "googletagmanager.com",
    "schema.org",
  ]);
  if (noise.has(host)) return false;

  const kind = (link.kind || "").toLowerCase();
  const resourceKinds = new Set([
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
  ]);
  if (resourceKinds.has(kind)) return true;

  if (
    host.includes("drive.google") ||
    host.includes("docs.google") ||
    host.includes("slides.google") ||
    host.includes("sheets.google") ||
    host === "forms.gle" ||
    host === "sites.google.com" ||
    host === "colab.research.google.com"
  ) {
    return true;
  }
  if (host.endsWith(".google.com")) return false;

  if (/\.(pdf|pptx?|docx?|xlsx?|zip|rar)(\?|$)/i.test(url)) return true;
  if (kind === "link" && path.length > 2 && path !== "/") return true;
  return false;
}

export function filterUsefulSources(
  links?: SourceLink[] | null
): SourceLink[] {
  if (!Array.isArray(links)) return [];
  return links.filter(isUsefulSource);
}
