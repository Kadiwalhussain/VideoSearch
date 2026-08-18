/**
 * Open ChatGPT (or another chosen chat UI) with this video’s full transcript
 * copied and queued for paste. No VideoSearch server involved.
 */

import { formatTimestamp } from "../player/seekTo";
import type { RawCaptionSegment } from "../types/schema";
import {
  ASK_PROVIDERS,
  loadAskProvider,
  saveAskProvider,
  setPendingAsk,
  type AskProvider,
  type AskProviderId,
} from "../settings/askExternalSettings";

export { ASK_PROVIDERS, loadAskProvider, saveAskProvider };
export type { AskProvider, AskProviderId };

export function buildTranscriptDump(
  segments: RawCaptionSegment[],
  meta: { title: string; videoId: string }
): string {
  const lines = segments.map(
    (s) => `${formatTimestamp(s.startTime)}  ${clean(s.text)}`
  );
  const url = meta.videoId
    ? `https://www.youtube.com/watch?v=${meta.videoId}`
    : "";
  return [
    `You are helping me study this YouTube video.`,
    ``,
    `Title: ${meta.title || "Untitled"}`,
    url ? `URL: ${url}` : "",
    ``,
    `Full transcript:`,
    `---`,
    lines.join("\n"),
    `---`,
    ``,
    `I will ask questions next. Answer from this transcript unless I say otherwise.`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function clean(s: string): string {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function openExternalAsk(opts: {
  segments: RawCaptionSegment[];
  videoId: string;
  title: string;
  providerId?: AskProviderId;
}): Promise<{ ok: boolean; provider: AskProvider; message: string }> {
  if (!opts.segments.length) {
    const provider = opts.providerId
      ? ASK_PROVIDERS.find((p) => p.id === opts.providerId) ||
        (await loadAskProvider())
      : await loadAskProvider();
    return {
      ok: false,
      provider,
      message: "No transcript yet — wait until captions load.",
    };
  }

  const provider = opts.providerId
    ? ASK_PROVIDERS.find((p) => p.id === opts.providerId) ||
      (await loadAskProvider())
    : await loadAskProvider();

  if (opts.providerId) await saveAskProvider(provider.id);

  const text = buildTranscriptDump(opts.segments, {
    title: opts.title,
    videoId: opts.videoId,
  });

  await setPendingAsk({
    text,
    providerId: provider.id,
    at: Date.now(),
  });
  await copyText(text);

  const opened = window.open(provider.url, "_blank", "noopener,noreferrer");
  if (!opened) {
    return {
      ok: false,
      provider,
      message: `Transcript copied. Allow pop-ups, or open ${provider.label} and paste (⌘V).`,
    };
  }

  return {
    ok: true,
    provider,
    message: `Opening ${provider.label}… transcript copied. It should paste into the chat. If not, press ⌘V.`,
  };
}
