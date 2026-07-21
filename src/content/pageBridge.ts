/**
 * MAIN-world bridge — YouTube player APIs + page state (not in isolated world).
 */

const SOURCE = "videosearch-ai-bridge";

type YtWindow = Window & {
  ytInitialPlayerResponse?: unknown;
  ytInitialData?: unknown;
  ytcfg?: {
    get?: (key: string) => unknown;
    data_?: Record<string, unknown>;
  };
};

interface YtPlayerLike {
  getPlayerResponse?: () => unknown;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  playVideo?: () => void;
}

function getPlayer(): (HTMLElement & YtPlayerLike) | null {
  return document.getElementById("movie_player") as
    | (HTMLElement & YtPlayerLike)
    | null;
}

function readPlayerResponse(): unknown {
  try {
    const player = getPlayer();
    const fromPlayer = player?.getPlayerResponse?.();
    if (fromPlayer && typeof fromPlayer === "object") return fromPlayer;
  } catch {
    // ignore
  }

  try {
    const w = window as YtWindow;
    if (
      w.ytInitialPlayerResponse &&
      typeof w.ytInitialPlayerResponse === "object"
    ) {
      return w.ytInitialPlayerResponse;
    }
  } catch {
    // ignore
  }

  return null;
}

function readInnertubeApiKey(): string | null {
  try {
    const w = window as YtWindow;
    const fromGet = w.ytcfg?.get?.("INNERTUBE_API_KEY");
    if (typeof fromGet === "string" && fromGet.length > 0) return fromGet;
    const fromData = w.ytcfg?.data_?.INNERTUBE_API_KEY;
    if (typeof fromData === "string" && fromData.length > 0) return fromData;
  } catch {
    // ignore
  }
  return null;
}

function readInnertubeClient(): {
  apiKey: string | null;
  clientName: string | null;
  clientVersion: string | null;
  visitorData: string | null;
  hl: string | null;
  gl: string | null;
} {
  const w = window as YtWindow;
  const get = (key: string): unknown => {
    try {
      return w.ytcfg?.get?.(key);
    } catch {
      return undefined;
    }
  };

  const apiKey =
    (get("INNERTUBE_API_KEY") as string | undefined) ??
    (w.ytcfg?.data_?.INNERTUBE_API_KEY as string | undefined) ??
    null;

  const clientVersion =
    (get("INNERTUBE_CLIENT_VERSION") as string | undefined) ??
    (w.ytcfg?.data_?.INNERTUBE_CLIENT_VERSION as string | undefined) ??
    null;

  const clientName =
    (get("INNERTUBE_CLIENT_NAME") as string | undefined) ??
    // ytcfg sometimes stores numeric client name; prefer string context
    "WEB";

  let visitorData: string | null = null;
  let hl: string | null = "en";
  let gl: string | null = "US";

  try {
    const ctx = get("INNERTUBE_CONTEXT") as
      | {
          client?: {
            visitorData?: string;
            hl?: string;
            gl?: string;
            clientName?: string;
            clientVersion?: string;
          };
        }
      | undefined;
    if (ctx?.client?.visitorData) visitorData = ctx.client.visitorData;
    if (ctx?.client?.hl) hl = ctx.client.hl;
    if (ctx?.client?.gl) gl = ctx.client.gl;
  } catch {
    // ignore
  }

  if (!visitorData) {
    const vd = get("VISITOR_DATA");
    if (typeof vd === "string") visitorData = vd;
  }

  return {
    apiKey: typeof apiKey === "string" ? apiKey : null,
    clientName: typeof clientName === "string" ? String(clientName) : "WEB",
    clientVersion: typeof clientVersion === "string" ? clientVersion : null,
    visitorData,
    hl,
    gl,
  };
}

/**
 * Seek using the official player API when available.
 */
function seekPlayer(seconds: number): void {
  const t = Math.max(0, Number(seconds) || 0);
  const player = getPlayer();

  try {
    if (player && typeof player.seekTo === "function") {
      player.seekTo(t, true);
      player.playVideo?.();
      return;
    }
  } catch {
    // fall through
  }

  const video =
    document.querySelector<HTMLVideoElement>(
      "#movie_player video.html5-main-video"
    ) ??
    document.querySelector<HTMLVideoElement>("video.html5-main-video") ??
    document.querySelector<HTMLVideoElement>("#movie_player video") ??
    document.querySelector<HTMLVideoElement>("video");

  if (video) {
    try {
      video.currentTime = t;
      void video.play().catch(() => undefined);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Comments bootstrap from window.ytInitialData (MAIN world)
// ---------------------------------------------------------------------------

type Runs = {
  simpleText?: string;
  runs?: Array<{ text?: string }>;
  content?: string;
};

interface BridgeComment {
  id: string;
  author: string;
  text: string;
  likes: number;
  publishedText: string;
  replyCount: number;
}

function textFromRuns(t?: Runs | null): string {
  if (!t) return "";
  if (typeof t.content === "string") return t.content;
  if (t.simpleText) return t.simpleText;
  if (t.runs?.length) return t.runs.map((r) => r.text ?? "").join("");
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

function findTokenIn(node: unknown, depth = 0): string | null {
  if (!node || depth > 45) return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const t = findTokenIn(x, depth + 1);
      if (t) return t;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const o = node as Record<string, unknown>;

  if (o.reloadContinuationData && typeof o.reloadContinuationData === "object") {
    const c = (o.reloadContinuationData as { continuation?: string }).continuation;
    if (c && c.length > 20) return c;
  }
  if (o.continuationItemRenderer) {
    const t = tokenFromContinuationItem(o.continuationItemRenderer);
    if (t) return t;
  }
  if (o.continuationCommand && typeof o.continuationCommand === "object") {
    const t = (o.continuationCommand as { token?: string }).token;
    if (t && t.length > 20) return t;
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") {
      const t = findTokenIn(v, depth + 1);
      if (t) return t;
    }
  }
  return null;
}

function findCommentsContinuation(root: unknown): string | null {
  if (!root || typeof root !== "object") return null;

  // 1) engagementPanels — most reliable on modern watch pages
  const panels = (root as { engagementPanels?: unknown[] }).engagementPanels;
  if (Array.isArray(panels)) {
    for (const panel of panels) {
      if (!panel || typeof panel !== "object") continue;
      const r = (panel as { engagementPanelSectionListRenderer?: Record<string, unknown> })
        .engagementPanelSectionListRenderer;
      if (!r) continue;
      const pid = String(
        r.panelIdentifier ?? r.targetId ?? ""
      ).toLowerCase();
      if (!pid.includes("comment")) continue;
      const tok = findTokenIn(r);
      if (tok) return tok;
    }
  }

  // 2) twoColumnWatchNextResults → itemSection comments
  try {
    const contents = (
      root as {
        contents?: {
          twoColumnWatchNextResults?: {
            results?: { results?: { contents?: unknown[] } };
          };
        };
      }
    ).contents?.twoColumnWatchNextResults?.results?.results?.contents;

    if (Array.isArray(contents)) {
      for (const item of contents) {
        if (!item || typeof item !== "object") continue;
        const section = (item as { itemSectionRenderer?: Record<string, unknown> })
          .itemSectionRenderer;
        if (!section) continue;
        const sid = String(
          section.sectionIdentifier ?? section.targetId ?? ""
        ).toLowerCase();
        if (sid.includes("comment")) {
          const tok = findTokenIn(section);
          if (tok) return tok;
        }
        // untitled stub that only carries a comments continuation
        const blob = JSON.stringify(section).toLowerCase();
        if (blob.includes("comment") && blob.includes("continuation")) {
          const tok = findTokenIn(section);
          if (tok) return tok;
        }
      }
    }
  } catch {
    // ignore
  }

  // 3) sortFilterSubMenuRenderer (Top comments)
  let sortToken: string | null = null;
  const walkSort = (n: unknown, depth: number): void => {
    if (!n || depth > 40 || sortToken) return;
    if (Array.isArray(n)) {
      for (const x of n) walkSort(x, depth + 1);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o.sortFilterSubMenuRenderer) {
      const menu = o.sortFilterSubMenuRenderer as {
        subMenuItems?: Array<{
          title?: string;
          serviceEndpoint?: {
            continuationCommand?: { token?: string };
            commandExecutorCommand?: {
              commands?: Array<{ continuationCommand?: { token?: string } }>;
            };
          };
          continuation?: {
            reloadContinuationData?: { continuation?: string };
          };
        }>;
      };
      const items = menu.subMenuItems ?? [];
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
          sortToken = t;
          return;
        }
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walkSort(v, depth + 1);
    }
  };
  walkSort(root, 0);
  if (sortToken) return sortToken;

  // 4) Deep search for panel/section identifiers containing "comment"
  let deep: string | null = null;
  const walkDeep = (n: unknown, depth: number): void => {
    if (!n || depth > 50 || deep) return;
    if (Array.isArray(n)) {
      for (const x of n) walkDeep(x, depth + 1);
      return;
    }
    if (typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    const idKeys = ["panelIdentifier", "sectionIdentifier", "targetId"];
    for (const k of idKeys) {
      const id = String(o[k] ?? "").toLowerCase();
      if (id.includes("comment")) {
        const tok = findTokenIn(o);
        if (tok) {
          deep = tok;
          return;
        }
      }
    }
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") walkDeep(v, depth + 1);
    }
  };
  walkDeep(root, 0);
  return deep;
}

function walkSeedComments(node: unknown, out: BridgeComment[], depth = 0): void {
  if (!node || depth > 50 || out.length > 40) return;
  if (Array.isArray(node)) {
    for (const x of node) walkSeedComments(x, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  if (obj.commentThreadRenderer && typeof obj.commentThreadRenderer === "object") {
    const thr = obj.commentThreadRenderer as {
      comment?: {
        commentRenderer?: {
          commentId?: string;
          contentText?: Runs;
          authorText?: Runs;
          voteCount?: Runs;
          likeCount?: number | string;
          publishedTimeText?: Runs;
          replyCount?: number | string;
        };
      };
    };
    const r = thr.comment?.commentRenderer;
    if (r?.commentId && r.contentText) {
      const text = textFromRuns(r.contentText).trim();
      if (text) {
        let likes = 0;
        if (typeof r.likeCount === "number") likes = r.likeCount;
        else if (r.voteCount) likes = parseCount(textFromRuns(r.voteCount));
        out.push({
          id: r.commentId,
          author: textFromRuns(r.authorText) || "User",
          text,
          likes,
          publishedText: textFromRuns(r.publishedTimeText),
          replyCount:
            typeof r.replyCount === "number"
              ? r.replyCount
              : parseCount(String(r.replyCount ?? "0")),
        });
      }
    }
    return; // don't enter replies
  }

  if (obj.commentEntityPayload && typeof obj.commentEntityPayload === "object") {
    const e = obj.commentEntityPayload as {
      properties?: {
        commentId?: string;
        content?: { content?: string };
      };
      author?: { displayName?: string };
      toolbar?: { likeCountNotliked?: string };
    };
    const id = e.properties?.commentId;
    const text = e.properties?.content?.content?.trim();
    if (id && text && !out.some((c) => c.id === id)) {
      out.push({
        id,
        author: e.author?.displayName || "User",
        text,
        likes: parseCount(e.toolbar?.likeCountNotliked || "0"),
        publishedText: "",
        replyCount: 0,
      });
    }
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") walkSeedComments(v, out, depth + 1);
  }
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
    for (const v of Object.values(o)) {
      if (v && typeof v === "object") visit(v, depth + 1);
    }
  };
  visit(node, 0);
  return count;
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
    return (
      flexy?.getAttribute("video-id") ||
      flexy?.getAttribute("videoId") ||
      null
    );
  } catch {
    return null;
  }
}

function readCommentsBootstrap(): {
  token: string | null;
  totalReported: number | null;
  seeded: BridgeComment[];
  apiKey: string | null;
  clientName: string | null;
  clientVersion: string | null;
  visitorData: string | null;
  hl: string | null;
  gl: string | null;
  pageVideoId: string | null;
} {
  const client = readInnertubeClient();
  const pageVideoId = readPageVideoId();
  const w = window as YtWindow;

  // Prefer live player/page managers over stale window.ytInitialData
  let data: unknown = null;
  try {
    const flexy = document.querySelector("ytd-watch-flexy") as
      | (HTMLElement & { data?: unknown; __data?: unknown })
      | null;
    data = flexy?.data ?? flexy?.__data ?? null;
  } catch {
    data = null;
  }
  if (!data) {
    try {
      const app = document.querySelector("ytd-app") as
        | (HTMLElement & { data?: unknown })
        | null;
      if (app?.data) data = app.data;
    } catch {
      // ignore
    }
  }
  // Only use ytInitialData if URL video matches (otherwise it's the first page of the session)
  if (!data) {
    try {
      data = w.ytInitialData ?? null;
    } catch {
      data = null;
    }
  }

  const seeded: BridgeComment[] = [];
  let token: string | null = null;
  let totalReported: number | null = null;

  if (data) {
    token = findCommentsContinuation(data);
    totalReported = findCommentsCount(data);
    walkSeedComments(data, seeded);
  }

  return {
    token,
    totalReported,
    seeded,
    apiKey: client.apiKey,
    clientName: client.clientName,
    clientVersion: client.clientVersion,
    visitorData: client.visitorData,
    hl: client.hl,
    gl: client.gl,
    pageVideoId,
  };
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== SOURCE) return;

  if (data.type === "GET_PLAYER_RESPONSE") {
    window.postMessage(
      {
        source: SOURCE,
        type: "GET_PLAYER_RESPONSE_RESULT",
        requestId: data.requestId,
        payload: readPlayerResponse(),
      },
      "*"
    );
    return;
  }

  if (data.type === "GET_INNERTUBE_KEY") {
    window.postMessage(
      {
        source: SOURCE,
        type: "GET_INNERTUBE_KEY_RESULT",
        requestId: data.requestId,
        payload: { apiKey: readInnertubeApiKey() },
      },
      "*"
    );
    return;
  }

  if (data.type === "GET_INNERTUBE_CLIENT") {
    window.postMessage(
      {
        source: SOURCE,
        type: "GET_INNERTUBE_CLIENT_RESULT",
        requestId: data.requestId,
        payload: readInnertubeClient(),
      },
      "*"
    );
    return;
  }

  if (data.type === "GET_COMMENTS_BOOTSTRAP") {
    window.postMessage(
      {
        source: SOURCE,
        type: "GET_COMMENTS_BOOTSTRAP_RESULT",
        requestId: data.requestId,
        payload: readCommentsBootstrap(),
      },
      "*"
    );
    return;
  }

  if (data.type === "SEEK_TO") {
    seekPlayer(Number(data.seconds) || 0);
  }
});

export {};
