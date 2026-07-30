/**
 * Capture the current YouTube video frame as a JPEG data URL.
 * Tuned for smooth UI (smaller max width + reasonable quality).
 */

import { getMainVideo } from "../player/seekTo";

export interface FrameCaptureResult {
  dataUrl: string;
  width: number;
  height: number;
  capturedAt: number;
  videoTime: number;
}

/**
 * Grab the visible video frame. Returns null if video not ready / CORS-tainted.
 * Defaults favor snappy capture for the popup UX.
 */
export async function captureVideoFrame(
  quality = 0.72,
  maxW = 960
): Promise<FrameCaptureResult | null> {
  const video = getMainVideo();
  if (!video) return null;
  if (video.readyState < 2) {
    await waitForFrame(video, 1200);
  }
  if (!video.videoWidth || !video.videoHeight) return null;

  // Yield so shutter flash can paint before heavy canvas work
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  const scale = Math.min(1, maxW / video.videoWidth);
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  try {
    ctx.drawImage(video, 0, 0, w, h);
    // toDataURL is sync — keep quality moderate
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    // free canvas memory hint
    canvas.width = 0;
    canvas.height = 0;
    if (!dataUrl || dataUrl.length < 100) return null;
    return {
      dataUrl,
      width: w,
      height: h,
      capturedAt: Date.now(),
      videoTime: video.currentTime || 0,
    };
  } catch (err) {
    console.warn("[VideoSearch AI] Frame capture failed (tainted?)", err);
    return null;
  }
}

function waitForFrame(video: HTMLVideoElement, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    const t = window.setTimeout(() => {
      video.removeEventListener("loadeddata", onReady);
      resolve();
    }, ms);
    const onReady = () => {
      window.clearTimeout(t);
      video.removeEventListener("loadeddata", onReady);
      resolve();
    };
    video.addEventListener("loadeddata", onReady);
  });
}
