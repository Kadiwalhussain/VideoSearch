/**
 * Fetch top-level YouTube comments for sentiment analysis.
 *
 * Strategy (in order):
 *  1. MAIN-world bridge → real ytInitialData continuation + ytcfg client
 *  2. Fresh watch HTML → ytInitialData continuation
 *  3. Innertube youtubei/v1/next with that continuation (paginated)
 *  4. DOM scrape of already-rendered comment threads (always works if YT painted them)
 *
 * Why the old path failed:
 *  - document.innerHTML often has no usable ytInitialData on SPA navigations
 *  - generic continuation tokens point at related videos, not comments → 0 results
 */

export interface YtComment {
  id: string;
  author: string;
  text: string;
  likes: number;
  publishedText: string;
  replyCount: number;
}

export interface CommentsFetchResult {
  videoId: string;
  comments: YtComment[];
  truncated: boolean;
  totalReported: number | null;
}

const FALLBACK_INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const BRIDGE_SOURCE = "videosearch-ai-bridge";

const DEFAULT_MAX = 150;
const MAX_PAGES = 15;

interface ClientContext {
  apiKey: string;
  clientName: string;
  clientVersion: string;
  visitorData: string | null;
  hl: string;
  gl: string;
}

interface Bootstrap {
  token: string | null;
  totalReported: number | null;
  seeded: YtComment[];
  client: ClientContext;
}

/**
 * Pull top-level comments (Top sort when available). Caps at maxComments.
 * Always scoped to `videoId` — never reuses another video's SPA state.
 */
export async function fetchYouTubeComments(
  videoId: string,
  options?: { maxComments?: number; onProgress?: (n: number) => void }
): Promise<CommentsFetchResult> {
  if (!videoId || !/^[\w-]{6,}$/.test(videoId)) {
    throw new Error(`Invalid YouTube video id: ${videoId}`);
  }

  // Guard: page URL must match (SPA can lag behind)
  const pageId = readPageVideoId();
  if (pageId && pageId !== videoId) {
    console.warn(
      "[VideoSearch AI] comments: page video mismatch",
      pageId,
      "vs",
      videoId
    );
  }

  const maxComments = Math.min(
    Math.max(options?.maxComments ?? DEFAULT_MAX, 20),
    400
  );
  const onProgress = options?.onProgress;

  // Nudge YouTube to hydrate the comments section (lazy-loaded on many layouts)
  onProgress?.(0);
  await nudgeCommentsSection();

  // Prefer fresh network bootstrap for THIS videoId (stale ytInitialData caused same mood on every video)
  const boot = await bootstrapComments(videoId);
  console.info("[VideoSearch AI] comments bootstrap:", {
    hasToken: Boolean(boot.token),
    seeded: boot.seeded.length,
    totalReported: boot.totalReported,
    client: boot.client.clientName,
    version: boot.client.clientVersion?.slice?.(0, 12),
  });

  const comments: YtComment[] = [];
  const seen = new Set<string>();

  const pushAll = (list: YtComment[]) => {
    for (const c of list) {
      if (!c.id || !c.text || seen.has(c.id)) continue;
      seen.add(c.id);
      comments.push(c);
      if (comments.length >= maxComments) break;
    }
    onProgress?.(comments.length);
  };

  pushAll(boot.seeded);

  // Paginate Innertube continuations
  let token = boot.token;
  let pages = 0;
  let consecutiveEmpty = 0;

  while (token && comments.length < maxComments && pages < MAX_PAGES) {
    pages += 1;
    try {
      const page = await fetchContinuation(token, boot.client);
      const before = comments.length;
      pushAll(page.comments);
      console.info(
        "[VideoSearch AI] comments page",
        pages,
        "got",
        page.comments.length,
        "total",
        comments.length,
        "next",
        Boolean(page.nextToken)
      );
      token = page.nextToken;

      if (comments.length === before) {
        consecutiveEmpty += 1;
        if (consecutiveEmpty >= 2) break;
      } else {
        consecutiveEmpty = 0;
      }

      if (!token) break;
    } catch (err) {
      console.warn("[VideoSearch AI] comments page failed:", err);
      break;
    }
  }

  // DOM fallback only when the page is showing THIS video (avoids SPA leftovers)
  if (comments.length < 12 && readPageVideoId() === videoId) {
    await nudgeCommentsSection();
    await sleep(350);
    const fromDom = scrapeDomComments(maxComments);
    if (fromDom.length) {
      console.info(
        "[VideoSearch AI] comments DOM scrape:",
        fromDom.length,
        "(API had",
        comments.length + ")"
      );
      pushAll(fromDom);
    }
  }

  // Force next(videoId) if still empty, then re-bootstrap token
  if (comments.length === 0) {
    try {
      const forced = await fetchNextByVideoId(videoId, boot.client);
      pushAll(forced.comments);
      token = forced.nextToken ?? boot.token;
      // Re-read token from fresh next response path
      if (!token) {
        const boot2 = await bootstrapComments(videoId);
        token = boot2.token;
      }
      pages = 0;
      consecutiveEmpty = 0;
      while (token && comments.length < maxComments && pages < MAX_PAGES) {
        pages += 1;
        const page = await fetchContinuation(token, boot.client);
        const beforeCount: number = comments.length;
        pushAll(page.comments);
        token = page.nextToken;
        if (comments.length === beforeCount) {
          consecutiveEmpty += 1;
          if (consecutiveEmpty >= 2) break;
        } else consecutiveEmpty = 0;
        if (!page.comments.length && !token) break;
      }
    } catch (err) {
      console.warn("[VideoSearch AI] comments next(videoId) failed:", err);
    }
  }

  // Final DOM pass
  if (comments.length < 5 && readPageVideoId() === videoId) {
    await nudgeCommentsSection();
    await sleep(500);
    pushAll(scrapeDomComments(maxComments));
  }

  console.info(
    "[VideoSearch AI] comments fetched:",
    comments.length,
    "pages:",
    pages,
    "totalReported:",
    boot.totalReported
  );

  return {
    videoId,
    comments,
    truncated:
      comments.length >= maxComments ||
      (boot.totalReported != null && comments.length < boot.totalReported),
    totalReported: boot.totalReported,
  };
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrapComments(videoId: string): Promise<Bootstrap> {
  const defaultClient = await resolveClientContext(videoId);

  // 1) ALWAYS fetch fresh watch HTML for this videoId first
  //    (window.ytInitialData is often STALE after SPA navigation → same comments forever)
  try {
    const html = await fetchWatchHtml(videoId);
    const fromHtml = extractFromInitialData(html);
    const ver = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/);
    if (ver?.[1]) defaultClient.clientVersion = ver[1];
    const key = extractApiKeyFromHtml(html);
    if (key) defaultClient.apiKey = key;
    const visitor = html.match(/"VISITOR_DATA"\s*:\s*"([^"]+)"/);
    if (visitor?.[1]) defaultClient.visitorData = visitor[1];

    if (fromHtml.token || fromHtml.seeded.length) {
      console.info(
        "[VideoSearch AI] comments bootstrap from fresh HTML",
        videoId,
        "token",
        Boolean(fromHtml.token),
        "seeded",
        fromHtml.seeded.length
      );
      return { ...fromHtml, client: defaultClient };
    }
  } catch (err) {
    console.warn("[VideoSearch AI] comments HTML bootstrap failed:", err);
  }

  // 2) MAIN world bridge — only if it reports the SAME videoId
  try {
    const fromBridge = await requestFromPageBridge<{
      token?: string | null;
      totalReported?: number | null;
      seeded?: YtComment[];
      apiKey?: string | null;
      clientName?: string | null;
      clientVersion?: string | null;
      visitorData?: string | null;
      hl?: string | null;
      gl?: string | null;
      pageVideoId?: string | null;
    }>("GET_COMMENTS_BOOTSTRAP", 2500);

    if (fromBridge) {
      const client: ClientContext = {
        apiKey: fromBridge.apiKey || defaultClient.apiKey,
        clientName: fromBridge.clientName || defaultClient.clientName,
        clientVersion: fromBridge.clientVersion || defaultClient.clientVersion,
        visitorData: fromBridge.visitorData ?? defaultClient.visitorData,
        hl: fromBridge.hl || defaultClient.hl,
        gl: fromBridge.gl || defaultClient.gl,
      };
      // Adopt client always
      Object.assign(defaultClient, {
        apiKey: client.apiKey,
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        visitorData: client.visitorData,
      });

      const bridgeVid = fromBridge.pageVideoId ?? readPageVideoId();
      const sameVideo = !bridgeVid || bridgeVid === videoId;
      if (
        sameVideo &&
        (fromBridge.token || (fromBridge.seeded && fromBridge.seeded.length))
      ) {
        console.info(
          "[VideoSearch AI] comments bootstrap from bridge",
          videoId
        );
        return {
          token: fromBridge.token ?? null,
          totalReported: fromBridge.totalReported ?? null,
          seeded: fromBridge.seeded ?? [],
          client,
        };
      }
      if (!sameVideo) {
        console.warn(
          "[VideoSearch AI] ignoring stale bridge data for",
          bridgeVid,
          "want",
          videoId
        );
      }
    }
  } catch (err) {
    console.warn("[VideoSearch AI] comments bridge bootstrap failed:", err);
  }

  // 3) next(videoId) discovery will run later; no generic live-HTML token (too easy to be stale)
  return {
    token: null,
    totalReported: null,
    seeded: [],
    client: defaultClient,
  };
}

function readPageVideoId(): string | null {
  try {
    const q = new URLSearchParams(location.search).get("v");
    if (q) return q;
  } catch {
    // ignore
  }
  try {
    const flexy = document.querySelector("ytd-watch-flexy");
    const v =
      flexy?.getAttribute("video-id") ||
      flexy?.getAttribute("videoId") ||
      null;
    if (v) return v;
  } catch {
    // ignore
  }
  return null;
}

function extractFromInitialData(html: string): {
  token: string | null;
  totalReported: number | null;
  seeded: YtComment[];
} {
  const json = extractJsonAssignment(html, "ytInitialData");
  if (!json) {
    return { token: null, totalReported: null, seeded: [] };
  }
  try {
    const root = JSON.parse(json) as unknown;
    return extractCommentsBootstrapFromData(root);
  } catch {
    return { token: null, totalReported: null, seeded: [] };
  }
}

/** Shared extraction used by HTML parse + pageBridge */
export function extractCommentsBootstrapFromData(root: unknown): {
  token: string | null;
  totalReported: number | null;
  seeded: YtComment[];
} {
  const seeded: YtComment[] = [];
  walkComments(root, seeded);

  const token =
    findCommentsSectionContinuation(root) ??
    findReloadContinuation(root) ??
    null;

  const totalReported = findCommentsCount(root);
  return { token, totalReported, seeded };
}

// ---------------------------------------------------------------------------
// Innertube requests
// ---------------------------------------------------------------------------

function buildContext(client: ClientContext) {
  const ctx: Record<string, unknown> = {
    client: {
      clientName: client.clientName || "WEB",
      clientVersion: client.clientVersion || "2.20250310.01.00",
      hl: client.hl || "en",
      gl: client.gl || "US",
      userAgent:
        typeof navigator !== "undefined"
          ? navigator.userAgent
          : "Mozilla/5.0",
      platform: "DESKTOP",
    },
    user: {},
    request: {
      useSsl: true,
    },
  };
  if (client.visitorData) {
    (ctx.client as Record<string, unknown>).visitorData = client.visitorData;
  }
  return ctx;
}

async function fetchContinuation(
  token: string,
  client: ClientContext
): Promise<{ comments: YtComment[]; nextToken: string | null }> {
  const url = `https://www.youtube.com/youtubei/v1/next?prettyPrint=false&key=${encodeURIComponent(client.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Youtube-Client-Name": client.clientName === "WEB" ? "1" : "1",
      "X-Youtube-Client-Version": client.clientVersion,
      ...(client.visitorData
        ? { "X-Goog-Visitor-Id": client.visitorData }
        : {}),
    },
    body: JSON.stringify({
      context: buildContext(client),
      continuation: token,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Comments HTTP ${res.status}: ${text.slice(0, 160)}`);
  }

  const data = (await res.json()) as unknown;
  const comments: YtComment[] = [];
  walkComments(data, comments);
  // Newer YT also nests under onResponseReceivedEndpoints
  walkOnResponseEndpoints(data, comments);

  // Prefer next-page token for more *threads*, not reply continuations
  const nextToken =
    findCommentsNextContinuation(data) ??
    findCommentsSectionContinuation(data) ??
    findContinuationTokenPreferComments(data);

  return { comments, nextToken };
}

/** Explicitly walk continuation endpoint payloads (most reliable path). */
function walkOnResponseEndpoints(data: unknown, out: YtComment[]): void {
  if (!data || typeof data !== "object") return;
  const root = data as {
    onResponseReceivedEndpoints?: unknown[];
    onResponseReceivedActions?: unknown[];
    frameworkUpdates?: unknown;
  };
  const endpoints = [
    ...(root.onResponseReceivedEndpoints ?? []),
    ...(root.onResponseReceivedActions ?? []),
  ];
  for (const ep of endpoints) {
    if (!ep || typeof ep !== "object") continue;
    const e = ep as Record<string, unknown>;
    const reload = e.reloadContinuationItemsCommand as
      | { continuationItems?: unknown[] }
      | undefined;
    const append = e.appendContinuationItemsAction as
      | { continuationItems?: unknown[] }
      | undefined;
    if (reload?.continuationItems) walkComments(reload.continuationItems, out);
    if (append?.continuationItems) walkComments(append.continuationItems, out);
    // Some payloads nest commandRunner / actions
    walkComments(ep, out);
  }
  if (root.frameworkUpdates) walkComments(root.frameworkUpdates, out);
}

async function fetchNextByVideoId(
  videoId: string,
  client: ClientContext
): Promise<{ comments: YtComment[]; nextToken: string | null }> {
  const url = `https://www.youtube.com/youtubei/v1/next?prettyPrint=false&key=${encodeURIComponent(client.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Youtube-Client-Version": client.clientVersion,
      ...(client.visitorData
        ? { "X-Goog-Visitor-Id": client.visitorData }
        : {}),
    },
    body: JSON.stringify({
      context: buildContext(client),
      videoId,
    }),
  });
  if (!res.ok) {
    return { comments: [], nextToken: null };
  }
  const data = (await res.json()) as unknown;
  const comments: YtComment[] = [];
  walkComments(data, comments);
  const nextToken =
    findCommentsSectionContinuation(data) ??
    findReloadContinuation(data) ??
    findCommentsNextContinuation(data);
  return { comments, nextToken };
}

// ---------------------------------------------------------------------------
// DOM scrape fallback
// ---------------------------------------------------------------------------

/** Scroll/focus the comments area so YT hydrates threads into the DOM. */
async function nudgeCommentsSection(): Promise<void> {
  try {
    const el =
      document.querySelector("#comments") ||
      document.querySelector("ytd-comments") ||
      document.querySelector("ytd-comments-header-renderer") ||
      document.querySelector("#below");
    if (el && "scrollIntoView" in el) {
      (el as HTMLElement).scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    }
    // Also dispatch a tiny scroll so IntersectionObservers fire
    window.dispatchEvent(new Event("scroll"));
  } catch {
    // ignore
  }
  await sleep(200);
}

function scrapeDomComments(max: number): YtComment[] {
  const out: YtComment[] = [];
  const seen = new Set<string>();

  const push = (
    id: string,
    author: string,
    text: string,
    likes: number,
    publishedText: string
  ) => {
    if (!text || out.length >= max) return;
    const cleanId = id || `dom-${hashStr(text + author)}`;
    if (seen.has(cleanId)) return;
    seen.add(cleanId);
    out.push({
      id: cleanId,
      author: author.replace(/^@/, "").trim() || "User",
      text: text.trim(),
      likes,
      publishedText,
      replyCount: 0,
    });
  };

  // Classic thread renderer
  document
    .querySelectorAll("ytd-comment-thread-renderer")
    .forEach((el, i) => {
      const text =
        textFromEl(
          el.querySelector(
            "#content-text, yt-attributed-string#content-text, #content-text *"
          )
        ) || textFromEl(el.querySelector("#content-text"));
      const author = textFromEl(
        el.querySelector("#author-text, #author-text span, a#author-text")
      );
      const likes = parseCount(
        textFromEl(el.querySelector("#vote-count-middle, #vote-count-left")) ||
          "0"
      );
      const publishedText = textFromEl(
        el.querySelector(
          ".published-time-text a, #published-time-text, yt-formatted-string.published-time-text a"
        )
      );
      const href =
        (
          el.querySelector(
            "a[href*='lc=']"
          ) as HTMLAnchorElement | null
        )?.href ?? "";
      const lc = href.match(/[?&]lc=([\w-]+)/)?.[1] ?? `thread-${i}`;
      push(lc, author, text, likes, publishedText);
    });

  // Newer view-model based comments
  document.querySelectorAll("ytd-comment-view-model").forEach((el, i) => {
    // Skip replies nested under a thread we already handled
    if (el.closest("ytd-comment-replies-renderer")) return;
    const text =
      textFromEl(
        el.querySelector(
          "#content-text, yt-attributed-string, .yt-core-attributed-string"
        )
      ) || "";
    const author = textFromEl(
      el.querySelector(
        "#author-text, a[href*='/@'], ytd-channel-name #text, #name"
      )
    );
    const likes = parseCount(
      textFromEl(
        el.querySelector(
          "#vote-count-middle, button[aria-label*='like'] span, .yt-spec-button-shape-with-label__label"
        )
      ) || "0"
    );
    const publishedText = textFromEl(
      el.querySelector("a[href*='lc='], .published-time-text")
    );
    const href =
      (
        el.querySelector("a[href*='lc=']") as HTMLAnchorElement | null
      )?.href ?? "";
    const lc = href.match(/[?&]lc=([\w-]+)/)?.[1] ?? `vm-${i}`;
    push(lc, author, text, likes, publishedText);
  });

  // Generic: any expander body that looks like a comment block
  if (out.length === 0) {
    document
      .querySelectorAll(
        "#contents ytd-comment-thread-renderer #content-text, #comments #content-text"
      )
      .forEach((el, i) => {
        const text = textFromEl(el);
        if (!text) return;
        const root =
          el.closest("ytd-comment-thread-renderer") ||
          el.closest("ytd-comment-view-model") ||
          el.parentElement;
        const author = textFromEl(
          root?.querySelector("#author-text, a#author-text") ?? null
        );
        push(`gen-${i}`, author, text, 0, "");
      });
  }

  return out;
}

function textFromEl(el: Element | null): string {
  if (!el) return "";
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// Walkers / parsers
// ---------------------------------------------------------------------------

function walkComments(node: unknown, out: YtComment[], depth = 0): void {
  if (!node || depth > 55) return;
  if (Array.isArray(node)) {
    for (const item of node) walkComments(item, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (obj.commentThreadRenderer && typeof obj.commentThreadRenderer === "object") {
    const thr = obj.commentThreadRenderer as {
      comment?: { commentRenderer?: unknown };
      commentViewModel?: unknown;
    };
    if (thr.comment?.commentRenderer) {
      const parsed = parseCommentRenderer(thr.comment.commentRenderer);
      if (parsed) out.push(parsed);
    } else if (thr.commentViewModel) {
      const parsed = parseCommentViewModel(thr.commentViewModel);
      if (parsed) out.push(parsed);
    }
    // Skip replies subtree
    return;
  }

  // frameworkUpdates / entity payloads (newer YT)
  if (obj.commentEntityPayload && typeof obj.commentEntityPayload === "object") {
    const parsed = parseCommentEntity(obj.commentEntityPayload);
    if (parsed && !out.some((c) => c.id === parsed.id)) out.push(parsed);
  }

  if (obj.commentRenderer && typeof obj.commentRenderer === "object") {
    const cr = obj.commentRenderer as { parentCommentId?: string };
    if (!cr.parentCommentId) {
      const parsed = parseCommentRenderer(obj.commentRenderer);
      if (parsed && !out.some((c) => c.id === parsed.id)) out.push(parsed);
    }
  }

  for (const [k, v] of Object.entries(obj)) {
    // Skip heavy unrelated branches sometimes
    if (k === "frameworkUpdates" || k === "entities") {
      walkComments(v, out, depth + 1);
      continue;
    }
    if (v && typeof v === "object") walkComments(v, out, depth + 1);
  }
}

function parseCommentRenderer(node: unknown): YtComment | null {
  if (!node || typeof node !== "object") return null;
  const r = node as {
    commentId?: string;
    contentText?: Runs;
    authorText?: Runs;
    voteCount?: Runs;
    likeCount?: number | string;
    publishedTimeText?: Runs;
    replyCount?: number | string;
  };

  const id = r.commentId ?? "";
  const text = textFromRuns(r.contentText).trim();
  if (!id || !text) return null;

  let likes = 0;
  if (typeof r.likeCount === "number") likes = r.likeCount;
  else if (typeof r.likeCount === "string") likes = parseCount(r.likeCount);
  else if (r.voteCount) likes = parseCount(textFromRuns(r.voteCount));

  let replyCount = 0;
  if (typeof r.replyCount === "number") replyCount = r.replyCount;
  else if (typeof r.replyCount === "string")
    replyCount = parseCount(r.replyCount);

  return {
    id,
    author: textFromRuns(r.authorText) || "User",
    text,
    likes,
    publishedText: textFromRuns(r.publishedTimeText),
    replyCount,
  };
}

function parseCommentViewModel(node: unknown): YtComment | null {
  if (!node || typeof node !== "object") return null;
  // Some payloads nest commentViewModel.commentViewModel
  const root = node as Record<string, unknown>;
  const vm =
    (root.commentViewModel as Record<string, unknown> | undefined) ?? root;

  // Try common text paths
  const text =
    deepFindRunsText(vm, ["content", "contentText", "commentText"]) ||
    deepStringField(vm, "content");
  if (!text) return null;

  const id =
    deepStringField(vm, "commentId") ||
    deepStringField(vm, "key") ||
    hashStr(text);

  const author =
    deepFindRunsText(vm, ["author", "authorText", "channelName"]) || "User";
  const likes = parseCount(
    deepStringField(vm, "likeCount") ||
      deepStringField(vm, "voteCount") ||
      "0"
  );

  return {
    id,
    author,
    text: text.trim(),
    likes,
    publishedText: deepFindRunsText(vm, ["publishedTime", "publishedTimeText"]),
    replyCount: 0,
  };
}

function parseCommentEntity(node: unknown): YtComment | null {
  if (!node || typeof node !== "object") return null;
  const e = node as {
    properties?: {
      commentId?: string;
      content?: { content?: string };
    };
    author?: { displayName?: string };
    toolbar?: { likeCountNotliked?: string; likeCountLiked?: string };
  };
  const id = e.properties?.commentId ?? "";
  const text = e.properties?.content?.content?.trim() ?? "";
  if (!id || !text) return null;
  return {
    id,
    author: e.author?.displayName || "User",
    text,
    likes: parseCount(
      e.toolbar?.likeCountNotliked || e.toolbar?.likeCountLiked || "0"
    ),
    publishedText: "",
    replyCount: 0,
  };
}

type Runs = {
  simpleText?: string;
  runs?: Array<{ text?: string }>;
  content?: string;
};

function textFromRuns(t?: Runs | null): string {
  if (!t) return "";
  if (typeof t.content === "string") return t.content;
  if (t.simpleText) return t.simpleText;
  if (t.runs?.length) return t.runs.map((r) => r.text ?? "").join("");
  return "";
}

function deepFindRunsText(node: unknown, keys: string[]): string {
  if (!node || typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  for (const k of keys) {
    if (k in obj) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object") {
        const t = textFromRuns(v as Runs);
        if (t) return t;
      }
    }
  }
  // shallow scan
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const t = textFromRuns(v as Runs);
      if (t && t.length > 2) return t;
    }
  }
  return "";
}

function deepStringField(node: unknown, key: string, depth = 0): string {
  if (!node || depth > 8) return "";
  if (typeof node !== "object") return "";
  const obj = node as Record<string, unknown>;
  if (typeof obj[key] === "string") return obj[key] as string;
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = deepStringField(v, key, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function parseCount(s: string): number {
  const t = s.trim().replace(/,/g, "").toUpperCase();
  if (!t) return 0;
  const m = t.match(/^([\d.]+)\s*([KMB])?/);
  if (!m) {
    const n = parseInt(t.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }
  let n = parseFloat(m[1]);
  if (m[2] === "K") n *= 1_000;
  if (m[2] === "M") n *= 1_000_000;
  if (m[2] === "B") n *= 1_000_000_000;
  return Math.round(n);
}

// ---------------------------------------------------------------------------
// Continuation token discovery (comments-only)
// ---------------------------------------------------------------------------

function findCommentsSectionContinuation(node: unknown): string | null {
  let found: string | null = null;

  const visit = (n: unknown, depth: number, pathHint: string): void => {
    if (!n || depth > 50 || found) return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x, depth + 1, pathHint);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;

    // engagement panel comments
    if (o.engagementPanelSectionListRenderer) {
      const panel = o.engagementPanelSectionListRenderer as {
        panelIdentifier?: string;
        targetId?: string;
        header?: unknown;
        content?: unknown;
      };
      const pid = (
        panel.panelIdentifier ??
        panel.targetId ??
        ""
      ).toLowerCase();
      if (pid.includes("comment")) {
        const tok =
          findReloadContinuation(panel) ??
          findContinuationInNode(panel, true);
        if (tok) {
          found = tok;
          return;
        }
      }
    }

    // itemSectionRenderer for comments
    if (o.itemSectionRenderer) {
      const section = o.itemSectionRenderer as {
        sectionIdentifier?: string;
        targetId?: string;
        contents?: unknown[];
      };
      const id = (
        section.sectionIdentifier ??
        section.targetId ??
        ""
      ).toLowerCase();
      if (
        id.includes("comment") ||
        pathHint.includes("comment") ||
        // untitled section that only has a continuation stub under results
        (Array.isArray(section.contents) &&
          section.contents.length <= 3 &&
          JSON.stringify(section.contents).includes("continuationItemRenderer") &&
          JSON.stringify(section).toLowerCase().includes("comment"))
      ) {
        const tok = findContinuationInNode(section, true);
        if (tok) {
          found = tok;
          return;
        }
      }
    }

    // Sort filter sub-menu "Top comments" / "Newest first"
    if (o.sortFilterSubMenuRenderer) {
      const menu = o.sortFilterSubMenuRenderer as {
        subMenuItems?: Array<{
          title?: string;
          serviceEndpoint?: {
            continuationCommand?: { token?: string };
            commandExecutorCommand?: {
              commands?: Array<{
                continuationCommand?: { token?: string };
              }>;
            };
          };
          continuation?: { reloadContinuationData?: { continuation?: string } };
        }>;
      };
      const items = menu.subMenuItems ?? [];
      // Prefer Top comments
      const ordered = [
        ...items.filter((i) => /top/i.test(i.title ?? "")),
        ...items,
      ];
      for (const item of ordered) {
        const t =
          item.serviceEndpoint?.continuationCommand?.token ??
          item.serviceEndpoint?.commandExecutorCommand?.commands?.find(
            (c) => c.continuationCommand?.token
          )?.continuationCommand?.token ??
          item.continuation?.reloadContinuationData?.continuation;
        if (t) {
          found = t;
          return;
        }
      }
    }

    const nextHint =
      pathHint +
      " " +
      (typeof o.panelIdentifier === "string" ? o.panelIdentifier : "") +
      " " +
      (typeof o.sectionIdentifier === "string" ? o.sectionIdentifier : "") +
      " " +
      (typeof o.targetId === "string" ? o.targetId : "");

    for (const v of Object.values(o)) {
      if (v && typeof v === "object") visit(v, depth + 1, nextHint);
    }
  };

  visit(node, 0, "");
  return found;
}

function findReloadContinuation(node: unknown): string | null {
  let found: string | null = null;
  const visit = (n: unknown, depth: number): void => {
    if (!n || depth > 50 || found) return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x, depth + 1);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o.reloadContinuationData && typeof o.reloadContinuationData === "object") {
      const r = o.reloadContinuationData as { continuation?: string };
      if (r.continuation && r.continuation.length > 20) {
        found = r.continuation;
        return;
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") visit(v, depth + 1);
    }
  };
  visit(node, 0);
  return found;
}

/** Next page of threads (continuationItemRenderer at list end). */
function findCommentsNextContinuation(node: unknown): string | null {
  // Prefer continuationItemRenderer that is NOT a reply button
  let found: string | null = null;
  const visit = (n: unknown, depth: number, underReplies: boolean): void => {
    if (!n || depth > 50 || found) return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x, depth + 1, underReplies);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;

    const nowReplies =
      underReplies ||
      "commentRepliesRenderer" in o ||
      "replies" in o && depth > 0 && Boolean(
        (o as { commentThreadRenderer?: unknown }).commentThreadRenderer
      );

    if (o.continuationItemRenderer && !nowReplies) {
      const tok = tokenFromContinuationItem(o.continuationItemRenderer);
      // Trigger buttons for "Show more replies" often have button label
      const asStr = JSON.stringify(o.continuationItemRenderer).toLowerCase();
      if (
        tok &&
        !asStr.includes("replies") &&
        !asStr.includes("reply")
      ) {
        found = tok;
        return;
      }
      // Still accept if it's a plain continuation without button
      if (tok && !asStr.includes("buttonrenderer")) {
        found = tok;
        return;
      }
    }

    for (const [k, v] of Object.entries(o)) {
      if (!v || typeof v !== "object") continue;
      const childReplies =
        nowReplies ||
        k === "replies" ||
        k === "commentRepliesRenderer";
      visit(v, depth + 1, childReplies);
    }
  };
  visit(node, 0, false);
  return found;
}

function findContinuationInNode(
  node: unknown,
  commentsOnly: boolean
): string | null {
  let found: string | null = null;
  const visit = (n: unknown, depth: number): void => {
    if (!n || depth > 40 || found) return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x, depth + 1);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;

    if (o.continuationItemRenderer) {
      const tok = tokenFromContinuationItem(o.continuationItemRenderer);
      if (tok) {
        found = tok;
        return;
      }
    }
    if (o.reloadContinuationData) {
      const r = o.reloadContinuationData as { continuation?: string };
      if (r.continuation) {
        found = r.continuation;
        return;
      }
    }
    if (o.continuationCommand) {
      const t = (o.continuationCommand as { token?: string }).token;
      if (t && t.length > 20) {
        found = t;
        return;
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") visit(v, depth + 1);
    }
  };
  visit(node, 0);
  if (!found && !commentsOnly) {
    found = findContinuationTokenPreferComments(node);
  }
  return found;
}

function tokenFromContinuationItem(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const cir = node as {
    continuationEndpoint?: {
      continuationCommand?: { token?: string };
      commandExecutorCommand?: {
        commands?: Array<{ continuationCommand?: { token?: string } }>;
      };
    };
    button?: {
      buttonRenderer?: {
        command?: { continuationCommand?: { token?: string } };
      };
    };
  };
  return (
    cir.continuationEndpoint?.continuationCommand?.token ??
    cir.button?.buttonRenderer?.command?.continuationCommand?.token ??
    cir.continuationEndpoint?.commandExecutorCommand?.commands?.find(
      (c) => c.continuationCommand?.token
    )?.continuationCommand?.token ??
    null
  );
}

function findContinuationTokenPreferComments(node: unknown): string | null {
  // Last resort: any continuationItemRenderer token
  let found: string | null = null;
  const visit = (n: unknown, depth: number): void => {
    if (!n || depth > 45 || found) return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x, depth + 1);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o.continuationItemRenderer) {
      const t = tokenFromContinuationItem(o.continuationItemRenderer);
      if (t) {
        found = t;
        return;
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") visit(v, depth + 1);
    }
  };
  visit(node, 0);
  return found;
}

function findCommentsCount(node: unknown): number | null {
  let count: number | null = null;
  const visit = (n: unknown, depth: number): void => {
    if (!n || depth > 45 || count != null) return;
    if (Array.isArray(n)) {
      for (const x of n) visit(x, depth + 1);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;

    if (o.commentsHeaderRenderer) {
      const h = o.commentsHeaderRenderer as {
        countText?: Runs;
        commentsCount?: Runs;
      };
      const raw = textFromRuns(h.countText) || textFromRuns(h.commentsCount);
      const nCount = parseCount(raw.replace(/comments?/i, "").trim());
      if (nCount > 0) {
        count = nCount;
        return;
      }
    }

    // header.contextTitle / contextualInfo
    if (o.contextualInfo || o.countText) {
      const raw =
        textFromRuns(o.contextualInfo as Runs) ||
        textFromRuns(o.countText as Runs);
      if (/comment/i.test(raw)) {
        const nCount = parseCount(raw.replace(/comments?/i, "").trim());
        if (nCount > 0) {
          count = nCount;
          return;
        }
      }
    }

    for (const v of Object.values(o)) {
      if (v && typeof v === "object") visit(v, depth + 1);
    }
  };
  visit(node, 0);
  return count;
}

/** Regex fallback in serialized HTML for comments continuations. */
function findCommentsTokenInHtml(html: string): string | null {
  // Look near "comment" for continuation tokens
  const patterns = [
    /"continuation"\s*:\s*"([A-Za-z0-9_%=\-]{40,})"[^]{0,200}comment/i,
    /comment[^]{0,200}"continuation"\s*:\s*"([A-Za-z0-9_%=\-]{40,})"/i,
    /"reloadContinuationData"\s*:\s*\{\s*"continuation"\s*:\s*"([A-Za-z0-9_%=\-]{40,})"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].replace(/\\u0025/g, "%");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Client context + bridge
// ---------------------------------------------------------------------------

async function resolveClientContext(videoId: string): Promise<ClientContext> {
  let apiKey = FALLBACK_INNERTUBE_KEY;
  let clientVersion = "2.20250310.01.00";
  let clientName = "WEB";
  let visitorData: string | null = null;
  let hl = "en";
  let gl = "US";

  try {
    const fromBridge = await requestFromPageBridge<{
      apiKey?: string | null;
      clientName?: string | null;
      clientVersion?: string | null;
      visitorData?: string | null;
      hl?: string | null;
      gl?: string | null;
    }>("GET_INNERTUBE_CLIENT", 1200);
    if (fromBridge?.apiKey) apiKey = fromBridge.apiKey;
    if (fromBridge?.clientVersion) clientVersion = fromBridge.clientVersion;
    if (fromBridge?.clientName) clientName = fromBridge.clientName;
    if (fromBridge?.visitorData) visitorData = fromBridge.visitorData;
    if (fromBridge?.hl) hl = fromBridge.hl;
    if (fromBridge?.gl) gl = fromBridge.gl;
  } catch {
    // ignore
  }

  if (apiKey === FALLBACK_INNERTUBE_KEY) {
    const fromDom = extractApiKeyFromHtml(document.documentElement.innerHTML);
    if (fromDom) apiKey = fromDom;
    else {
      try {
        const html = await fetchWatchHtml(videoId);
        const k = extractApiKeyFromHtml(html);
        if (k) apiKey = k;
        const ver = html.match(/"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/);
        if (ver?.[1]) clientVersion = ver[1];
      } catch {
        // ignore
      }
    }
  }

  return { apiKey, clientName, clientVersion, visitorData, hl, gl };
}

function requestFromPageBridge<T>(
  type: string,
  timeoutMs: number
): Promise<T | null> {
  return new Promise((resolve) => {
    const requestId = `vsa-${type}-${Math.random().toString(36).slice(2)}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve(null);
    }, timeoutMs);

    function onMsg(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== BRIDGE_SOURCE) return;
      if (data.type !== `${type}_RESULT` || data.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      resolve((data.payload as T) ?? null);
    }

    window.addEventListener("message", onMsg);
    try {
      window.postMessage({ source: BRIDGE_SOURCE, type, requestId }, "*");
    } catch {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      resolve(null);
    }
  });
}

function extractApiKeyFromHtml(html: string): string | null {
  const m = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([a-zA-Z0-9_-]+)"/);
  return m?.[1] ?? null;
}

async function fetchWatchHtml(videoId: string): Promise<string> {
  const res = await fetch(
    `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    {
      credentials: "include",
      headers: { Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
    }
  );
  if (!res.ok) return "";
  return res.text();
}

function extractJsonAssignment(html: string, name: string): string | null {
  const markers = [`var ${name} = `, `${name} = `, `window["${name}"] = `];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    let i = idx + marker.length;
    while (html[i] === " " || html[i] === "\n") i++;
    if (html[i] !== "{") continue;
    const sliced = sliceBalancedObject(html, i);
    if (sliced) return sliced;
  }
  return null;
}

function sliceBalancedObject(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
