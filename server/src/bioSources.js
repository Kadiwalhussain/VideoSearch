/**
 * Pull real resource links out of a YouTube bio / description.
 * Used whenever bio is synced or saved so Sources stay in sync automatically.
 */

const SKIP_HOSTS = new Set([
  "youtube.com",
  "youtu.be",
  "music.youtube.com",
  "studio.youtube.com",
  "accounts.google.com",
  "google.com",
  "support.google.com",
  "policies.google.com",
  "myaccount.google.com",
  "ads.google.com",
  "play.google.com",
  "maps.google.com",
  "mail.google.com",
  "news.google.com",
  "translate.google.com",
  "gstatic.com",
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

export function classifyLink(url) {
  const u = String(url || "").toLowerCase();
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
  if (
    u.includes("t.me/") ||
    u.includes("telegram") ||
    u.includes("wa.me/") ||
    u.includes("whatsapp.com")
  )
    return "telegram";
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
    u.includes("wikipedia.org") ||
    u.includes("archive.org") ||
    u.includes("reddit.com") ||
    u.includes("facebook.com") ||
    u.includes("instagram.com") ||
    u.includes("linkedin.com") ||
    u.includes("patreon.com") ||
    u.includes("gumroad.com")
  )
    return "resource";
  return "link";
}

export function kindLabel(kind) {
  const map = {
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
    telegram: "Chat",
    discord: "Discord",
    hub: "Link hub",
    course: "Course",
    resource: "Read",
    link: "Link",
  };
  return map[kind] || "Link";
}

/** Unwrap youtube.com/redirect?q=https%3A%2F%2Fdrive.google.com%2F… */
export function unwrapRedirect(raw) {
  let s = String(raw || "").trim();
  for (let i = 0; i < 3; i++) {
    try {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\./, "").toLowerCase();
      const isYt =
        host === "youtube.com" ||
        host.endsWith(".youtube.com") ||
        host === "youtu.be";
      if (isYt && (u.pathname.includes("redirect") || u.searchParams.has("q"))) {
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

export function isUsefulVaultSource(url, kind) {
  if (!url || typeof url !== "string") return false;
  const unwrapped = unwrapRedirect(url);
  let host = "";
  let path = "/";
  try {
    const u = new URL(unwrapped);
    host = u.hostname.replace(/^www\./, "").toLowerCase();
    path = u.pathname || "/";
  } catch {
    return false;
  }

  if (host === "apps.apple.com") return true;
  if (host === "play.google.com" && path.startsWith("/store")) return true;
  if (host === "redeem.coupon") return true;

  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".ytimg.com")
  ) {
    return false;
  }
  if (SKIP_HOSTS.has(host) || SKIP_HOSTS.has(`www.${host}`)) return false;

  const k = String(kind || classifyLink(unwrapped)).toLowerCase();
  if (RESOURCE_KINDS.has(k)) return true;

  if (
    GOOGLE_RESOURCE_HOSTS.has(host) ||
    host.includes("drive.google") ||
    host.includes("docs.google") ||
    host.includes("slides.google") ||
    host.includes("sheets.google")
  ) {
    return true;
  }
  if (host.endsWith(".google.com")) return false;

  if (/\.(pdf|pptx?|docx?|xlsx?|zip|rar)(\?|$)/i.test(unwrapped)) return true;
  if (path.length > 2 && path !== "/") return true;
  return false;
}

function hashId(url) {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return `lnk_${(h >>> 0).toString(36)}_${url.length.toString(36)}`;
}

function normalizeUrl(raw) {
  let s = unwrapRedirect(String(raw || "").trim());
  s = s.replace(/[)\].,;:'"!]+$/g, "");
  if (!/^https?:\/\//i.test(s)) {
    if (/^(www\.|drive\.|docs\.|github\.|notion\.)/i.test(s)) s = `https://${s}`;
    else return null;
  }
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const out = u.toString();
    if (!isUsefulVaultSource(out, classifyLink(out))) return null;
    return out;
  } catch {
    return null;
  }
}

function labelNearUrl(text, url) {
  const lines = String(text || "").split(/\n+/);
  for (const line of lines) {
    let hit = line.includes(url);
    if (!hit) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        hit = line.toLowerCase().includes(host.toLowerCase());
      } catch {
        continue;
      }
    }
    if (!hit) continue;
    const cleaned = line
      .replace(url, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/\[[^\]]*\]\([^)]+\)/g, "")
      .replace(/[-–—:|•]+\s*$/g, "")
      .replace(/^\s*[-–—:|•]+\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 80) return cleaned;
  }
  try {
    const u = new URL(url);
    return `${kindLabel(classifyLink(url))} · ${u.hostname.replace(/^www\./, "")}`;
  } catch {
    return kindLabel(classifyLink(url));
  }
}

function addLink(map, url, label, now) {
  const n = normalizeUrl(url);
  if (!n) return;
  const key = n.toLowerCase().replace(/\/$/, "");
  if (map.has(key)) {
    const prev = map.get(key);
    if (label && label.length > (prev.label || "").length) prev.label = label;
    return;
  }
  const kind = classifyLink(n);
  map.set(key, {
    id: hashId(key),
    url: n,
    label: String(label || kindLabel(kind)).slice(0, 300),
    kind,
    source: "description",
    createdAt: now,
  });
}

/**
 * Extract useful source links from plain bio + markdown bio.
 */
export function extractSourcesFromBio(bioText = "", bioMarkdown = "") {
  const text = String(bioText || "");
  const md = String(bioMarkdown || "");
  const blob = `${md}\n${text}`;
  const now = Date.now();
  const map = new Map();

  const mdRe = /\[([^\]]{0,200})\]\((https?:\/\/[^)\s]+)\)/gi;
  let m;
  while ((m = mdRe.exec(blob)) !== null) {
    addLink(map, m[2], (m[1] || "").trim(), now);
  }

  const urlRe = /https?:\/\/[^\s<>"'{}|\\^`\[\]]+/gi;
  while ((m = urlRe.exec(blob)) !== null) {
    addLink(map, m[0], labelNearUrl(blob, unwrapRedirect(m[0])), now);
  }

  const wwwRe = /(?<![/?#=])www\.[^\s<>"'{}|\\^`\[\]]+/gi;
  while ((m = wwwRe.exec(blob)) !== null) {
    addLink(map, m[0], labelNearUrl(blob, m[0]), now);
  }

  const weight = (k) => {
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
      "telegram",
      "discord",
      "course",
      "resource",
      "link",
    ];
    const i = order.indexOf(k);
    return i === -1 ? 50 : i;
  };

  return [...map.values()]
    .sort((a, b) => weight(a.kind) - weight(b.kind))
    .slice(0, 60);
}

export function mergeSourceLinks(serverList, clientList) {
  const map = new Map();
  const keyOf = (l) =>
    unwrapRedirect(String(l?.url || ""))
      .trim()
      .toLowerCase()
      .replace(/\/$/, "");
  for (const item of serverList || []) {
    const k = keyOf(item);
    if (k) map.set(k, item);
  }
  for (const item of clientList || []) {
    const k = keyOf(item);
    if (!k) continue;
    const prev = map.get(k);
    if (!prev) map.set(k, item);
    else {
      map.set(k, {
        ...prev,
        ...item,
        label: item.label || prev.label,
        kind: item.kind && item.kind !== "link" ? item.kind : prev.kind,
        id: prev.id || item.id,
        createdAt: prev.createdAt || item.createdAt || Date.now(),
      });
    }
  }
  return [...map.values()];
}

export function normalizeClientSource(l) {
  if (!l || typeof l.url !== "string" || !l.url.trim()) return null;
  const url = unwrapRedirect(String(l.url).trim()).slice(0, 2000);
  const kind = String(l.kind || classifyLink(url)).slice(0, 40);
  if (!isUsefulVaultSource(url, kind)) return null;
  const out = {
    id:
      String(l.id || "").trim() ||
      hashId(url.toLowerCase().replace(/\/$/, "")),
    url,
    label: String(l.label || "").trim().slice(0, 300),
    kind,
    source: String(l.source || "description").slice(0, 40),
    createdAt: Number(l.createdAt) || Date.now(),
  };
  const start = Number(l.startTime);
  if (Number.isFinite(start) && start >= 0) out.startTime = start;
  return out;
}
