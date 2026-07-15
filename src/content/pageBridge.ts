/**
 * MAIN-world bridge — YouTube player APIs live here (not in the isolated world).
 */

const SOURCE = "videosearch-ai-bridge";

type YtWindow = Window & {
  ytInitialPlayerResponse?: unknown;
  ytcfg?: {
    get?: (key: string) => unknown;
    data_?: { INNERTUBE_API_KEY?: string };
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

  if (data.type === "SEEK_TO") {
    seekPlayer(Number(data.seconds) || 0);
  }
});

export {};
