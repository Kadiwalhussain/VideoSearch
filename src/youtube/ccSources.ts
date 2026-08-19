/**
 * Pull sources the instructor says out loud in captions:
 * websites, apps, coupon / promo codes, sponsor URLs.
 * Works on timed caption segments (no DOM).
 */

export type CcSource = {
  id: string;
  url: string;
  label: string;
  kind: string;
  source: "cc";
  createdAt: number;
  startTime: number;
};

const SKIP_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "youtubekids.com",
  "accounts.google.com",
  "google.com",
  "www.google.com",
  "support.google.com",
  "gstatic.com",
  "googleapis.com",
  "schema.org",
  "w3.org",
  "example.com",
  "example.org",
  "localhost",
]);

const JUNK_LABELS = new Set([
  "this",
  "that",
  "website",
  "site",
  "link",
  "here",
  "there",
  "your",
  "our",
  "their",
  "some",
  "any",
  "the",
  "www",
  "http",
  "https",
  "dot",
  "com",
  "org",
  "net",
  "url",
  "page",
  "home",
]);

const COUPON_STOP = new Set([
  "CODE",
  "THE",
  "FOR",
  "OFF",
  "GET",
  "USE",
  "NEW",
  "APP",
  "AND",
  "NOW",
  "THIS",
  "THAT",
  "WITH",
  "FROM",
  "YOUR",
  "PROMO",
  "COUPON",
  "DISCOUNT",
]);

/** TLDs we trust when someone actually says a site. Weak ones (so/online) are ASR noise. */
const STRONG_TLDS = "com|org|net|io|co|app|dev|ai|edu|gg";
const TLDS = STRONG_TLDS;
const WEAK_TLDS = new Set([
  "so",
  "to",
  "me",
  "cc",
  "fm",
  "online",
  "info",
  "us",
  "uk",
  "tv",
  "shop",
  "store",
  "xyz",
]);

const PROMO_HINT =
  /\b(sponsor|sponsored|partner|promo|promotion|coupon|discount|offer|deal|affiliate|use code|promo code)\b/i;

const VISIT_HINT =
  /\b(visit|go to|head to|check out|check it out|open|sign up|signup|try|download|get it at|available at|link is)\b/i;

function hashId(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
  return `cc_${(h >>> 0).toString(36)}_${url.length.toString(36)}`;
}

function cleanHostPart(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+|\.+$/g, "");
}

function spokenNormalize(s: string): string {
  return String(s || "")
    .replace(/[\[\]()<>]/g, " ")
    .replace(/\b(dot)\b/gi, ".")
    .replace(/\b(slash)\b/gi, "/")
    .replace(/\b(dash|hyphen)\b/gi, "-")
    .replace(/\bwww\s+/gi, "www.")
    // Only glue "site . com" — never "time. So" sentence periods
    .replace(
      new RegExp(String.raw`\s+\.\s+(${STRONG_TLDS})\b`, "gi"),
      ".$1"
    )
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeHost(host: string): boolean {
  if (!host || host.length < 4 || host.length > 64) return false;
  if (!host.includes(".")) return false;
  const base = host.replace(/^www\./, "").toLowerCase();
  const parts = base.split(".");
  const tld = parts[parts.length - 1] || "";
  const name = parts[0] || "";
  if (JUNK_LABELS.has(name)) return false;
  if (!/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/.test(base)) return false;
  if (SKIP_HOSTS.has(base) || SKIP_HOSTS.has(host)) return false;
  if (WEAK_TLDS.has(tld)) return false;
  // Glued caption sentences: "betterpreparednexttime.com"
  if (name.length > 22 && !name.includes("-")) return false;
  if ((name.match(/[aeiou]/g) || []).length < 1) return false;
  return true;
}

function toHttps(hostPath: string): string | null {
  let s = hostPath.trim().replace(/^[./]+/, "").replace(/[.,;:!?)]+$/g, "");
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!looksLikeHost(u.hostname.toLowerCase()) && !looksLikeHost(host)) {
      return null;
    }
    if (SKIP_HOSTS.has(host) || SKIP_HOSTS.has(u.hostname.toLowerCase())) {
      return null;
    }
    if (host.endsWith(".youtube.com") || host === "youtu.be") return null;
    return u.toString().replace(/\/$/, "") === `https://${host}`
      ? `https://${host}`
      : u.toString();
  } catch {
    return null;
  }
}

function classifySpoken(url: string, around: string): string {
  const u = url.toLowerCase();
  const a = around.toLowerCase();
  if (/\bcoupon|promo code|discount code|use code\b/.test(a)) return "coupon";
  if (
    /\bapp store|play store|google play|download the app|ios app|android app\b/.test(
      a
    )
  ) {
    return "app";
  }
  if (PROMO_HINT.test(a)) return "promo";
  if (u.includes("github.com")) return "github";
  if (
    u.includes("patreon.com") ||
    u.includes("gumroad.com") ||
    u.includes("ko-fi.com")
  ) {
    return "promo";
  }
  if (
    u.includes("udemy.com") ||
    u.includes("coursera.org") ||
    u.includes("brilliant.org") ||
    u.includes("skillshare.com")
  ) {
    return "course";
  }
  if (VISIT_HINT.test(a)) return "promo";
  return "link";
}

function add(
  map: Map<string, CcSource>,
  url: string,
  label: string,
  kind: string,
  startTime: number,
  now: number
): void {
  const key = url.toLowerCase().replace(/\/$/, "");
  if (!key) return;
  const prev = map.get(key);
  if (prev) {
    if (label.length > prev.label.length) prev.label = label.slice(0, 300);
    if (kind !== "link" && prev.kind === "link") prev.kind = kind;
    if (startTime < prev.startTime) prev.startTime = startTime;
    return;
  }
  map.set(key, {
    id: hashId(key),
    url,
    label: label.slice(0, 300),
    kind,
    source: "cc",
    createdAt: now,
    startTime,
  });
}

function pullUrls(text: string, startTime: number, map: Map<string, CcSource>, now: number): void {
  const spoken = spokenNormalize(text);
  const around = text;

  const urlRe = new RegExp(
    String.raw`(?:https?:\/\/|www\.)[a-z0-9][a-z0-9./?=&%#_-]{2,}|[a-z0-9][a-z0-9-]{1,40}\.(?:${TLDS})(?:\/[a-z0-9./?=&%#_-]*)?`,
    "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(spoken)) !== null) {
    const url = toHttps(m[0]);
    if (!url) continue;
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const kind = classifySpoken(url, around);
    add(map, url, host, kind, startTime, now);
  }

  const spokenHost = new RegExp(
    String.raw`\b((?:[a-z0-9-]{2,24}\s+){0,3}[a-z0-9-]{2,24})\.(?:${TLDS})\b`,
    "gi"
  );
  while ((m = spokenHost.exec(spoken)) !== null) {
    const glued = m[0].replace(/\s+/g, "");
    const url = toHttps(glued);
    if (!url) continue;
    const kind = classifySpoken(url, around);
    add(map, url, glued.replace(/^www\./, ""), kind, startTime, now);
  }
}

function pullCoupons(
  text: string,
  startTime: number,
  map: Map<string, CcSource>,
  nearbyUrl: string | null,
  now: number
): void {
  const re =
    /\b(?:use|try|enter|apply)?\s*(?:my\s+)?(?:promo|coupon|discount|offer|voucher)?\s*code\s*(?:is|:|-)?\s*([A-Z0-9][A-Z0-9_-]{2,18})\b/gi;
  const loose =
    /\b(?:use code|promo code|coupon code|discount code)\s+([A-Za-z0-9][A-Za-z0-9_-]{2,18})\b/gi;
  for (const rx of [re, loose]) {
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text)) !== null) {
      const code = m[1].toUpperCase();
      if (COUPON_STOP.has(code)) continue;
      if (code.length < 3) continue;
      if (!/[0-9]/.test(code) && code.length < 5) continue;
      const url = nearbyUrl || `https://redeem.coupon/${encodeURIComponent(code)}`;
      add(map, url, `Code ${code}`, "coupon", startTime, now);
    }
  }
}

function pullApps(
  text: string,
  startTime: number,
  map: Map<string, CcSource>,
  now: number
): void {
  const store =
    /\b(?:on|in|from)\s+(?:the\s+)?(app store|ios app store|google play|play store)\b/i.exec(
      text
    );
  if (!store) return;
  const before = text.slice(0, store.index).trim();
  const nameMatch =
    /(?:download|get|grab|try|open)?\s*(?:the\s+)?([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})\s*$/.exec(
      before
    ) ||
    /([A-Za-z][A-Za-z0-9]{2,24})\s+(?:app|application)\b/i.exec(text);
  const name = (nameMatch?.[1] || "").replace(/\s+/g, " ").trim();
  if (!name || JUNK_LABELS.has(name.toLowerCase())) return;
  const q = encodeURIComponent(name);
  const storeName = store[1].toLowerCase();
  const url = /play|google/.test(storeName)
    ? `https://play.google.com/store/search?q=${q}`
    : `https://apps.apple.com/search?term=${q}`;
  add(map, url, `${name} · ${store[1]}`, "app", startTime, now);
}

export function extractSourcesFromCaptions(
  segments: Array<{ startTime: number; text: string }>
): CcSource[] {
  const now = Date.now();
  const map = new Map<string, CcSource>();
  const list = Array.isArray(segments) ? segments : [];
  if (!list.length) return [];

  const WINDOW = 5;
  for (let i = 0; i < list.length; i++) {
    const slice = list.slice(i, i + WINDOW);
    const text = slice.map((s) => s.text || "").join(" ");
    if (text.trim().length < 6) continue;
    const t = Number(list[i].startTime) || 0;
    pullUrls(text, t, map, now);
  }

  for (let i = 0; i < list.length; i++) {
    const slice = list.slice(Math.max(0, i - 2), i + 4);
    const text = slice.map((s) => s.text || "").join(" ");
    const t = Number(list[i].startTime) || 0;
    let nearby: string | null = null;
    for (const v of map.values()) {
      if (Math.abs(v.startTime - t) < 45 && v.kind !== "coupon") {
        nearby = v.url;
        break;
      }
    }
    pullCoupons(text, t, map, nearby, now);
    pullApps(text, t, map, now);
  }

  return [...map.values()]
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 40);
}

const memory = new Map<string, CcSource[]>();

export function rememberCcSources(videoId: string, links: CcSource[]): void {
  if (!videoId) return;
  memory.set(videoId, links);
}

export function rememberedCcSources(videoId: string): CcSource[] {
  return memory.get(videoId) || [];
}
