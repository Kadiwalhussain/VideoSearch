/**
 * Extract useful links from the YouTube video description ("bio") and
 * optionally pinned comments — Drive, docs, PPT, PDFs, sources, etc.
 */

export type SourceLink = {
  id: string;
  url: string;
  label: string;
  kind: string;
  source: "description" | "comment" | "cc";
  createdAt: number;
  startTime?: number;
};

/** Hosts that are never useful “bio sources” (default YT/Google chrome). */
const SKIP_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "music.youtube.com",
  "studio.youtube.com",
  "accounts.google.com",
  "google.com",
  "www.google.com",
  "support.google.com",
  "policies.google.com",
  "myaccount.google.com",
  "ads.google.com",
  "adwords.google.com",
  "play.google.com",
  "maps.google.com",
  "mail.google.com",
  "news.google.com",
  "translate.google.com",
  "gstatic.com",
  "www.gstatic.com",
  "googleapis.com",
  "googleusercontent.com",
  "ggpht.com",
  "ytimg.com",
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "googletagmanager.com",
  "schema.org",
  "w3.org",
]);

/** Google product hosts that *are* real study/work resources. */
const GOOGLE_RESOURCE_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "slides.google.com",
  "sheets.google.com",
  "forms.gle",
  "script.google.com",
  "sites.google.com",
  "colab.research.google.com",
  "datastudio.google.com",
  "lookerstudio.google.com",
]);

/** Kinds we always keep as Sources (real materials, not noise). */
const RESOURCE_KINDS = new Set([
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
  "coupon",
  "app",
  "promo",
]);

/** Unwrap youtube.com/redirect?q=https%3A%2F%2Fdrive.google.com%2F… */
export function unwrapYoutubeRedirect(raw: string): string {
  let s = raw.trim();
  for (let i = 0; i < 3; i++) {
    try {
      const u = new URL(
        s,
        typeof location !== "undefined"
          ? location.origin
          : "https://www.youtube.com"
      );
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const isYt =
        host === "youtube.com" ||
        host.endsWith(".youtube.com") ||
        host === "youtu.be";
      if (
        isYt &&
        (u.pathname.includes("redirect") || u.searchParams.has("q"))
      ) {
        const q = u.searchParams.get("q");
        if (q) {
          s = q;
          continue;
        }
      }
    } catch {
      break;
    }
    break;
  }
  return s;
}

function hashId(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return `lnk_${(h >>> 0).toString(36)}_${url.length.toString(36)}`;
}

export function classifyLink(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("drive.google.com") || u.includes("docs.google.com/file"))
    return "drive";
  if (u.includes("docs.google.com/document")) return "docs";
  if (
    u.includes("docs.google.com/presentation") ||
    u.includes("slides.google.com")
  )
    return "slides";
  if (u.includes("docs.google.com/spreadsheets") || u.includes("sheets.google"))
    return "sheets";
  if (
    u.includes("forms.google") ||
    u.includes("docs.google.com/forms") ||
    u.includes("forms.gle")
  )
    return "form";
  if (/\.(pdf|pptx?|docx?|xlsx?|zip|rar)(\?|$)/i.test(u)) return "pdf";
  if (u.includes("github.com") || u.includes("gist.github")) return "github";
  if (u.includes("notion.so") || u.includes("notion.site")) return "notion";
  if (u.includes("figma.com")) return "figma";
  if (u.includes("canva.com")) return "canva";
  if (
    u.includes("dropbox.com") ||
    u.includes("onedrive") ||
    u.includes("1drv.ms") ||
    u.includes("box.com") ||
    u.includes("mega.nz") ||
    u.includes("mediafire.com")
  )
    return "cloud";
  if (u.includes("t.me/") || u.includes("telegram")) return "telegram";
  if (u.includes("discord.gg") || u.includes("discord.com/invite"))
    return "discord";
  if (
    u.includes("linktr.ee") ||
    u.includes("beacons.ai") ||
    u.includes("bio.link") ||
    u.includes("carrd.co")
  )
    return "hub";
  if (u.includes("apps.apple.com") || u.includes("play.google.com/store"))
    return "app";
  if (u.includes("redeem.coupon/")) return "coupon";
  if (
    u.includes("coursera.org") ||
    u.includes("udemy.com") ||
    u.includes("udacity.com") ||
    u.includes("skillshare.com") ||
    u.includes("edx.org") ||
    u.includes("khanacademy") ||
    u.includes("brilliant.org")
  )
    return "course";
  if (
    u.includes("medium.com") ||
    u.includes("substack.com") ||
    u.includes("dev.to") ||
    u.includes("hashnode") ||
    u.includes("wikipedia.org")
  )
    return "resource";
  return "link";
}

/**
 * True only for real materials from the bio (Drive, PPT, docs, PDFs, GitHub…).
 * Strips default Google / YouTube chrome that appears on almost every video.
 */
export function isUsefulSourceLink(url: string, kind?: string): boolean {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "").toLowerCase();
    path = u.pathname || "/";
  } catch {
    return false;
  }

  if (host === "apps.apple.com") return true;
  if (host === "play.google.com" && path.startsWith("/store")) return true;
  if (host === "redeem.coupon") return true;

  if (SKIP_HOSTS.has(host) || SKIP_HOSTS.has(`www.${host}`)) return false;
  if (host.endsWith(".youtube.com") || host === "youtu.be") return false;
  if (host.endsWith(".ytimg.com") || host.endsWith(".googlevideo.com"))
    return false;

  // Bare google.* is noise; specific Workspace product hosts are OK
  if (host === "google.com" || host.endsWith(".google.com")) {
    if (!GOOGLE_RESOURCE_HOSTS.has(host) && !host.startsWith("docs.google")) {
      // allow drive/docs/slides only
      if (
        !host.includes("drive.google") &&
        !host.includes("docs.google") &&
        !host.includes("slides.google") &&
        !host.includes("sheets.google") &&
        host !== "forms.gle" &&
        host !== "sites.google.com" &&
        host !== "colab.research.google.com"
      ) {
        return false;
      }
    }
  }

  const k = kind || classifyLink(url);
  if (RESOURCE_KINDS.has(k)) return true;

  // Generic “link”: keep only if it looks like a real destination, not homepage spam
  if (k === "link") {
    // file-like or deep path
    if (/\.(pdf|pptx?|docx?|xlsx?|zip|rar|csv|txt)(\?|$)/i.test(url))
      return true;
    if (path.length > 2 && path !== "/") return true;
    // known short resource hosts
    if (
      host.includes("bit.ly") ||
      host.includes("tinyurl") ||
      host.includes("t.co")
    )
      return path.length > 1;
    return false;
  }

  return false;
}

export function kindLabel(kind: string): string {
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
    course: "Course",
    resource: "Resource",
    coupon: "Coupon",
    app: "App",
    promo: "Promo",
    link: "Link",
  };
  return map[kind] || "Link";
}

function normalizeUrl(raw: string): string | null {
  let s = unwrapYoutubeRedirect(raw.trim());
  // strip trailing punctuation from free text
  s = s.replace(/[)\].,;:'"!]+$/g, "");
  if (!/^https?:\/\//i.test(s)) {
    if (/^(www\.|drive\.|docs\.|github\.|notion\.)/i.test(s)) s = `https://${s}`;
    else return null;
  }
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (SKIP_HOSTS.has(u.hostname.toLowerCase()) || SKIP_HOSTS.has(host)) {
      return null;
    }
    if (host.endsWith("youtube.com") || host === "youtu.be") return null;
    // Drop default Google chrome; keep only Workspace resource hosts
    if (host === "google.com" || host.endsWith(".google.com")) {
      const full = u.hostname.toLowerCase();
      if (
        !GOOGLE_RESOURCE_HOSTS.has(full) &&
        !full.includes("drive.google") &&
        !full.includes("docs.google") &&
        !full.includes("slides.google") &&
        !full.includes("sheets.google")
      ) {
        return null;
      }
    }
    const out = u.toString();
    // Final usefulness gate (Drive/PPT/docs/pdf… only)
    if (!isUsefulSourceLink(out)) return null;
    return out;
  } catch {
    return null;
  }
}

function extractUrlsFromText(text: string): string[] {
  if (!text) return [];
  const re =
    /https?:\/\/[^\s<>"'{}|\\^`[\]]+|www\.[^\s<>"'{}|\\^`[\]]+/gi;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = normalizeUrl(m[0]);
    if (n) found.push(n);
  }
  return found;
}

function labelNearUrl(text: string, url: string): string {
  // Try "Label: url" or "Label - url" on same line
  const lines = text.split(/\n+/);
  for (const line of lines) {
    if (!line.includes(url.replace(/^https?:\/\//, "").slice(0, 30)) && !line.includes(url)) {
      // fuzzy: host match
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        if (!line.toLowerCase().includes(host.toLowerCase())) continue;
      } catch {
        continue;
      }
    }
    const cleaned = line
      .replace(url, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/[-–—:|•]+\s*$/g, "")
      .replace(/^\s*[-–—:|•]+\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 80) return cleaned;
  }
  try {
    const u = new URL(url);
    return kindLabel(classifyLink(url)) + " · " + u.hostname.replace(/^www\./, "");
  } catch {
    return kindLabel(classifyLink(url));
  }
}

function descriptionTextFromDom(): string {
  // Expand "…more" if present (best-effort)
  const expand =
    document.querySelector(
      "#description-inline-expander tp-yt-paper-button#expand"
    ) as HTMLElement | null ||
    document.querySelector(
      "ytd-text-inline-expander #expand"
    ) as HTMLElement | null ||
    document.querySelector("#expand") as HTMLElement | null;
  try {
    if (expand && expand.offsetParent !== null) expand.click();
  } catch {
    /* ignore */
  }

  const chunks: string[] = [];
  const selectors = [
    "#description-inline-expander",
    "#description-inline-expander yt-attributed-string",
    "ytd-text-inline-expander",
    "#description yt-formatted-string",
    "#description",
    "ytd-expander#description",
    "ytd-video-secondary-info-renderer #description",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const t = el?.textContent?.trim();
    if (t && t.length > 20) chunks.push(t);
  }

  // Anchor hrefs in description (more reliable than text for shortened display)
  const anchors = document.querySelectorAll(
    "#description-inline-expander a[href], #description a[href], ytd-text-inline-expander a[href], ytd-expander#description a[href]"
  );
  for (const a of Array.from(anchors)) {
    const href = (a as HTMLAnchorElement).href;
    if (href) chunks.push(href);
    const txt = a.textContent?.trim();
    if (txt) chunks.push(txt);
  }

  return chunks.join("\n");
}

function pinnedCommentText(): string {
  try {
    const pinned = document.querySelector(
      "ytd-comment-thread-renderer:has(#pinned-comment-badge), ytd-comment-view-model:has([id*='pinned'])"
    );
    return pinned?.textContent?.trim() || "";
  } catch {
    return "";
  }
}

/**
 * Scrape description (+ pinned comment) for external resource links.
 */
export function extractDescriptionLinks(): SourceLink[] {
  const bio = extractFullBio();
  return bio.links;
}

export type VideoBio = {
  /** Plain text, as written (no markdown) */
  text: string;
  /** Full bio with hyperlinks as [label](url) for Studio rendering/editing */
  markdown: string;
  /** Structured links found in bio */
  links: SourceLink[];
  charCount: number;
};

function expandDescription(): void {
  const expand =
    (document.querySelector(
      "#description-inline-expander tp-yt-paper-button#expand"
    ) as HTMLElement | null) ||
    (document.querySelector(
      "ytd-text-inline-expander #expand"
    ) as HTMLElement | null) ||
    (document.querySelector("#expand") as HTMLElement | null);
  try {
    if (expand && expand.offsetParent !== null) expand.click();
  } catch {
    /* ignore */
  }
}

function descriptionRootEl(): HTMLElement | null {
  const selectors = [
    "#description-inline-expander #expanded",
    "#description-inline-expander yt-attributed-string",
    "#description-inline-expander",
    "ytd-text-inline-expander#description-inline-expander",
    "#description yt-formatted-string",
    "#description",
    "ytd-expander#description #content",
    "ytd-expander#description",
    "ytd-watch-metadata #description",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el && (el.innerText || el.textContent || "").trim().length > 10) {
      return el;
    }
  }
  return null;
}

/**
 * Walk description DOM: keep text as-is; turn real anchors into markdown links.
 */
function domToBioMarkdown(root: HTMLElement): {
  text: string;
  markdown: string;
  links: SourceLink[];
} {
  const now = Date.now();
  const textParts: string[] = [];
  const mdParts: string[] = [];
  const linkMap = new Map<string, SourceLink>();

  /** Normalize for bio hyperlinks — allow YouTube channel/watch links too. */
  const normalizeAnyUrl = (raw: string): string | null => {
    let s = raw.trim().replace(/[)\].,;:'"!]+$/g, "");
    if (!/^https?:\/\//i.test(s)) {
      if (/^(www\.|youtu\.|m\.youtube)/i.test(s)) s = `https://${s}`;
      else return null;
    }
    try {
      const u = new URL(s);
      if (!["http:", "https:"].includes(u.protocol)) return null;
      return u.toString();
    } catch {
      return null;
    }
  };

  const pushLink = (url: string, label: string, forSources = true) => {
    // Bio keeps every real http(s) link (incl. YT channel) as hyperlink text
    const any = normalizeAnyUrl(url);
    if (!any) return null;
    // Source list: only real materials (not default Google/YT noise)
    if (forSources) {
      const n = normalizeUrl(url);
      if (n && isUsefulSourceLink(n)) {
        const key = n.toLowerCase().replace(/\/$/, "");
        if (!linkMap.has(key)) {
          const kind = classifyLink(n);
          if (!isUsefulSourceLink(n, kind)) {
            /* skip */
          } else {
            linkMap.set(key, {
              id: hashId(key),
              url: n,
              label: (label || kindLabel(kind)).slice(0, 300),
              kind,
              source: "description",
              createdAt: now,
            });
          }
        }
      }
    }
    return any;
  };

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || "";
      if (!t) return;
      textParts.push(t);
      mdParts.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "script" || tag === "style" || tag === "svg") return;

    // Expand/collapse chrome on YT — skip buttons
    if (
      el.id === "expand" ||
      el.id === "collapse" ||
      el.getAttribute("aria-label")?.toLowerCase().includes("show more") ||
      el.getAttribute("aria-label")?.toLowerCase().includes("show less")
    ) {
      return;
    }

    if (tag === "br") {
      textParts.push("\n");
      mdParts.push("\n");
      return;
    }

    if (tag === "a") {
      const a = el as HTMLAnchorElement;
      const href = a.href || a.getAttribute("href") || "";
      const label = (a.textContent || "").replace(/\s+/g, " ").trim();
      // YouTube often uses redirect hrefs — prefer data attrs when present
      const raw =
        a.getAttribute("href") ||
        a.getAttribute("data-href") ||
        href;
      let target = raw;
      try {
        target = unwrapYoutubeRedirect(raw);
      } catch {
        /* use raw */
      }
      const n = pushLink(target, label, true);
      if (n) {
        const safeLabel = (label || n).replace(/[\[\]]/g, "");
        textParts.push(label || n);
        // Always hyperlink in bio — including YT channel / playlist links
        mdParts.push(`[${safeLabel}](${n})`);
      } else {
        textParts.push(label);
        mdParts.push(label);
      }
      return;
    }

    const block =
      tag === "p" ||
      tag === "div" ||
      tag === "li" ||
      tag === "tr" ||
      tag === "h1" ||
      tag === "h2" ||
      tag === "h3";
    if (block && (textParts.length || mdParts.length)) {
      const lastT = textParts[textParts.length - 1] || "";
      if (!lastT.endsWith("\n")) {
        textParts.push("\n");
        mdParts.push("\n");
      }
    }

    for (const child of Array.from(el.childNodes)) walk(child);

    if (block) {
      const lastT = textParts[textParts.length - 1] || "";
      if (!lastT.endsWith("\n")) {
        textParts.push("\n");
        mdParts.push("\n");
      }
    }
  };

  walk(root);

  // Also harvest any plain URLs in text that weren't anchors
  const plain = textParts.join("").replace(/\n{3,}/g, "\n\n").trim();
  for (const url of extractUrlsFromText(plain)) {
    pushLink(url, labelNearUrl(plain, url));
  }

  let markdown = mdParts.join("").replace(/\n{3,}/g, "\n\n").trim();
  // If DOM walk failed to get much, fall back to text + inject markdown links
  if (markdown.length < 20 && plain.length > 20) {
    markdown = plain;
    for (const l of linkMap.values()) {
      if (!markdown.includes(l.url)) continue;
      // leave as-is; plain already has urls
    }
  }

  // Prefer useful kinds first for links array
  const weight = (k: string) => {
    const order = [
      "drive",
      "slides",
      "docs",
      "pdf",
      "sheets",
      "github",
      "notion",
      "cloud",
      "figma",
      "canva",
      "form",
      "hub",
      "link",
    ];
    const i = order.indexOf(k);
    return i === -1 ? 50 : i;
  };
  const links = [...linkMap.values()]
    .sort((a, b) => weight(a.kind) - weight(b.kind))
    .slice(0, 40);

  return { text: plain, markdown, links };
}

function sliceBalancedObject(s: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function readYtInitial(name: string): Record<string, unknown> | null {
  try {
    const w = window as unknown as Record<string, unknown>;
    const live = w[name];
    if (live && typeof live === "object") return live as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  try {
    const needle = `${name} = `;
    const scripts = document.getElementsByTagName("script");
    for (const s of Array.from(scripts)) {
      const t = s.textContent || "";
      const i = t.indexOf(needle);
      if (i === -1) continue;
      const start = t.indexOf("{", i);
      if (start < 0) continue;
      const json = sliceBalancedObject(t, start);
      if (!json) continue;
      return JSON.parse(json) as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function pickAttributedContent(node: unknown, depth = 0): string {
  if (!node || depth > 8) return "";
  if (typeof node !== "object") return "";
  const o = node as Record<string, unknown>;
  if (typeof o.content === "string" && o.content.length > 20) {
    return o.content;
  }
  for (const key of [
    "attributedDescriptionBodyText",
    "attributedDescription",
    "expandableVideoDescriptionBodyRenderer",
    "structuredDescriptionContentRenderer",
  ]) {
    if (o[key]) {
      const found = pickAttributedContent(o[key], depth + 1);
      if (found) return found;
    }
  }
  if (Array.isArray(o.items)) {
    for (const item of o.items) {
      const found = pickAttributedContent(item, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

/** Full description + links from ytInitialPlayerResponse (not the truncated DOM). */
function extractFromYtPayloads(): { text: string; links: SourceLink[] } {
  const now = Date.now();
  const chunks: string[] = [];
  const map = new Map<string, SourceLink>();

  const addText = (t: string) => {
    if (t && t.trim().length > 8) chunks.push(t.trim());
  };

  const pr = readYtInitial("ytInitialPlayerResponse");
  const details = (pr?.videoDetails || {}) as { shortDescription?: string };
  if (details.shortDescription) addText(details.shortDescription);

  const data = readYtInitial("ytInitialData");
  if (data) {
    const panels = (data.engagementPanels || []) as unknown[];
    for (const p of panels) addText(pickAttributedContent(p));
    addText(
      pickAttributedContent(
        (data as { contents?: unknown }).contents
      )
    );
  }

  const text = chunks.sort((a, b) => b.length - a.length)[0] || "";
  for (const url of extractUrlsFromText(text)) {
    const key = url.toLowerCase().replace(/\/$/, "");
    if (map.has(key)) continue;
    map.set(key, {
      id: hashId(key),
      url,
      label: labelNearUrl(text, url),
      kind: classifyLink(url),
      source: "description",
      createdAt: now,
    });
  }
  return { text, links: [...map.values()] };
}

function mergeBioLinks(a: SourceLink[], b: SourceLink[]): SourceLink[] {
  const map = new Map<string, SourceLink>();
  for (const l of [...a, ...b]) {
    const key = l.url.toLowerCase().replace(/\/$/, "");
    if (!map.has(key)) map.set(key, l);
  }
  return [...map.values()].slice(0, 60);
}

/**
 * Expand “Show more”, then copy the complete description/bio with hyperlinks.
 */
export function extractFullBio(): VideoBio {
  expandDescription();
  const fromPage = extractFromYtPayloads();
  const root = descriptionRootEl();
  if (!root) {
    const fallback = (descriptionTextFromDom().trim() || fromPage.text).trim();
    const now = Date.now();
    const map = new Map<string, SourceLink>();
    for (const url of extractUrlsFromText(fallback)) {
      const key = url.toLowerCase().replace(/\/$/, "");
      if (map.has(key)) continue;
      map.set(key, {
        id: hashId(key),
        url,
        label: labelNearUrl(fallback, url),
        kind: classifyLink(url),
        source: "description",
        createdAt: now,
      });
    }
    const links = mergeBioLinks([...map.values()], fromPage.links);
    const text = fallback.length >= fromPage.text.length ? fallback : fromPage.text;
    return {
      text,
      markdown: text,
      links,
      charCount: text.length,
    };
  }
  const { text, markdown, links } = domToBioMarkdown(root);
  const bestText =
    fromPage.text.length > text.length + 40 ? fromPage.text : text;
  let bestMd = markdown;
  if (fromPage.text.length > markdown.length + 40) {
    bestMd = fromPage.text;
    for (const l of fromPage.links) {
      if (bestMd.includes(l.url) && !bestMd.includes(`](${l.url})`)) {
        const safe = (l.label || l.url).replace(/[[\]]/g, "");
        bestMd = bestMd.split(l.url).join(`[${safe}](${l.url})`);
      }
    }
  }
  return {
    text: bestText,
    markdown: bestMd,
    links: mergeBioLinks(links, fromPage.links),
    charCount: bestText.length,
  };
}

const BIO_BAR_ID = "vsa-bio-sync-bar";
const BIO_CHIP_ID = "vsa-bio-source-chip"; // legacy id cleanup

function ensureBioChipStyles(): void {
  // Always refresh styles so animation updates land without hard cache
  document.getElementById("vsa-bio-source-styles")?.remove();
  const style = document.createElement("style");
  style.id = "vsa-bio-source-styles";
  style.textContent = `
#${BIO_BAR_ID} {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  font: 600 12px/1 system-ui, -apple-system, Segoe UI, sans-serif;
}
#${BIO_BAR_ID} button[data-vsa-bio-sync] {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(52,211,153,0.4);
  cursor: pointer;
  border-radius: 999px;
  padding: 8px 14px 8px 12px;
  font: inherit;
  font-weight: 750;
  letter-spacing: -0.01em;
  color: #ecfdf5;
  background: linear-gradient(135deg, rgba(52,211,153,0.32), rgba(56,189,248,0.2));
  box-shadow: 0 6px 18px rgba(0,0,0,0.28), 0 0 0 1px rgba(52,211,153,0.08) inset;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.2s ease;
}
#${BIO_BAR_ID} button[data-vsa-bio-sync]:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(52,211,153,0.6);
  box-shadow: 0 10px 24px rgba(0,0,0,0.32), 0 0 20px rgba(52,211,153,0.15);
}
#${BIO_BAR_ID} button[data-vsa-bio-sync]:disabled {
  cursor: default;
  opacity: 0.95;
}
#${BIO_BAR_ID} .vsa-bio-sync-ico {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
#${BIO_BAR_ID} .vsa-bio-sync-ico svg {
  width: 15px;
  height: 15px;
  display: block;
}
/* Syncing spinner */
#${BIO_BAR_ID}.is-busy button[data-vsa-bio-sync] {
  border-color: rgba(56,189,248,0.55);
  background: linear-gradient(135deg, rgba(56,189,248,0.28), rgba(99,102,241,0.22));
  pointer-events: none;
}
#${BIO_BAR_ID}.is-busy .vsa-bio-sync-ico {
  animation: vsa-bio-spin 0.75s linear infinite;
}
@keyframes vsa-bio-spin {
  to { transform: rotate(360deg); }
}
/* Pulse ring while syncing */
#${BIO_BAR_ID}.is-busy button[data-vsa-bio-sync]::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 999px;
  border: 2px solid rgba(56,189,248,0.35);
  animation: vsa-bio-pulse 1s ease-out infinite;
  pointer-events: none;
}
@keyframes vsa-bio-pulse {
  0% { opacity: 0.9; transform: scale(0.96); }
  100% { opacity: 0; transform: scale(1.12); }
}
#${BIO_BAR_ID} button[data-vsa-bio-sync] {
  position: relative;
}
/* Success */
#${BIO_BAR_ID}.is-ok button[data-vsa-bio-sync] {
  border-color: rgba(34,197,94,0.6);
  background: linear-gradient(135deg, rgba(34,197,94,0.4), rgba(52,211,153,0.22));
  animation: vsa-bio-pop 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes vsa-bio-pop {
  0% { transform: scale(0.96); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
#${BIO_BAR_ID}.is-ok .vsa-bio-sync-ico {
  animation: none;
  color: #86efac;
}
/* Error */
#${BIO_BAR_ID}.is-error button[data-vsa-bio-sync] {
  border-color: rgba(248,113,113,0.55);
  background: linear-gradient(135deg, rgba(248,113,113,0.28), rgba(239,68,68,0.15));
  color: #fecaca;
}
.vsa-bio-host-rel {
  position: relative !important;
}
  `.trim();
  document.documentElement.appendChild(style);
}

const SYNC_ICON_IDLE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>`;
const SYNC_ICON_BUSY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
const SYNC_ICON_OK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
const SYNC_ICON_ERR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`;

function findDescriptionHost(): HTMLElement | null {
  const selectors = [
    "ytd-watch-metadata #description",
    "#description-inner",
    "ytd-text-inline-expander#description-inline-expander",
    "#description-inline-expander",
    "ytd-expander#description",
    "#description",
    "ytd-video-secondary-info-renderer #description",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

/**
 * Top-right Sync bio control on the YouTube description (no copy button).
 * Shows a spinning sync animation while uploading, then a success state.
 */
export function mountBioSyncBar(opts: {
  onSync: () => void;
  linkCount?: number;
  charCount?: number;
}): boolean {
  ensureBioChipStyles();
  document.getElementById(BIO_CHIP_ID)?.remove();

  const host = findDescriptionHost();
  if (!host) return false;

  host.classList.add("vsa-bio-host-rel");

  let bar = document.getElementById(BIO_BAR_ID) as HTMLDivElement | null;
  if (!bar) {
    bar = document.createElement("div");
    bar.id = BIO_BAR_ID;
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "VideoSearch sync bio");
    host.appendChild(bar);
  }

  const chars = opts.charCount ?? 0;
  const links = opts.linkCount ?? 0;
  const sub =
    chars > 0
      ? `${chars.toLocaleString()} chars${links ? ` · ${links} links` : ""}`
      : "Sync full description to VideoSearch";

  bar.classList.remove("is-ok", "is-busy", "is-error");
  bar.innerHTML = `
    <button type="button" data-vsa-bio-sync title="Sync full bio into VideoSearch · ${sub.replace(/"/g, "")}">
      <span class="vsa-bio-sync-ico" data-vsa-bio-ico>${SYNC_ICON_IDLE}</span>
      <span data-vsa-bio-label>Sync bio</span>
    </button>
  `;

  const syncBtn = bar.querySelector(
    "[data-vsa-bio-sync]"
  ) as HTMLButtonElement | null;
  // Avoid duplicate handlers if remounted
  syncBtn?.replaceWith(syncBtn.cloneNode(true));
  const btn = bar.querySelector(
    "[data-vsa-bio-sync]"
  ) as HTMLButtonElement | null;
  btn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    opts.onSync();
  });

  return true;
}

/** @deprecated use mountBioSyncBar */
export function mountDescriptionLinksChip(opts: {
  onSave: () => void;
  links?: SourceLink[];
}): boolean {
  return mountBioSyncBar({
    onSync: opts.onSave,
    linkCount: opts.links?.length,
  });
}

export function setBioSyncBarStatus(
  state: "idle" | "saving" | "ok" | "error",
  message?: string
): void {
  const bar = document.getElementById(BIO_BAR_ID);
  if (!bar) return;
  bar.classList.remove("is-ok", "is-busy", "is-error");
  const syncBtn = bar.querySelector(
    "[data-vsa-bio-sync]"
  ) as HTMLButtonElement | null;
  const ico = bar.querySelector("[data-vsa-bio-ico]") as HTMLElement | null;
  const label = bar.querySelector(
    "[data-vsa-bio-label]"
  ) as HTMLElement | null;

  if (state === "saving") {
    bar.classList.add("is-busy");
    if (syncBtn) syncBtn.disabled = true;
    if (ico) ico.innerHTML = SYNC_ICON_BUSY;
    if (label) label.textContent = message || "Syncing…";
    return;
  }
  if (state === "ok") {
    bar.classList.add("is-ok");
    if (syncBtn) syncBtn.disabled = false;
    if (ico) ico.innerHTML = SYNC_ICON_OK;
    if (label) label.textContent = message || "Synced";
    // After a moment, return to idle label so they can re-sync
    window.setTimeout(() => {
      const b = document.getElementById(BIO_BAR_ID);
      if (!b || !b.classList.contains("is-ok")) return;
      b.classList.remove("is-ok");
      const i = b.querySelector("[data-vsa-bio-ico]") as HTMLElement | null;
      const l = b.querySelector("[data-vsa-bio-label]") as HTMLElement | null;
      if (i) i.innerHTML = SYNC_ICON_IDLE;
      if (l) l.textContent = "Sync bio";
    }, 2600);
    return;
  }
  if (state === "error") {
    bar.classList.add("is-error");
    if (syncBtn) syncBtn.disabled = false;
    if (ico) ico.innerHTML = SYNC_ICON_ERR;
    if (label) label.textContent = message || "Failed";
    window.setTimeout(() => {
      const b = document.getElementById(BIO_BAR_ID);
      if (!b || !b.classList.contains("is-error")) return;
      b.classList.remove("is-error");
      const i = b.querySelector("[data-vsa-bio-ico]") as HTMLElement | null;
      const l = b.querySelector("[data-vsa-bio-label]") as HTMLElement | null;
      if (i) i.innerHTML = SYNC_ICON_IDLE;
      if (l) l.textContent = "Sync bio";
    }, 2800);
    return;
  }
  if (syncBtn) syncBtn.disabled = false;
  if (ico) ico.innerHTML = SYNC_ICON_IDLE;
  if (label) label.textContent = "Sync bio";
}

/** @deprecated use setBioSyncBarStatus */
export function setDescriptionLinksChipStatus(
  state: "idle" | "saving" | "ok" | "error",
  message?: string
): void {
  setBioSyncBarStatus(state, message);
}

export function removeDescriptionLinksChip(): void {
  document.getElementById(BIO_BAR_ID)?.remove();
  document.getElementById(BIO_CHIP_ID)?.remove();
  document
    .querySelectorAll(".vsa-bio-host-rel")
    .forEach((el) => el.classList.remove("vsa-bio-host-rel"));
}

export const removeBioSyncBar = removeDescriptionLinksChip;
