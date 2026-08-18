/**
 * Cloudflare R2 (S3-compatible) for screenshot storage.
 *
 * Env:
 *   R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
 *   R2_BUCKET=videosearch
 *   R2_ACCESS_KEY_ID=...
 *   R2_SECRET_ACCESS_KEY=...
 *   R2_PUBLIC_BASE= optional public URL prefix (custom domain or r2.dev)
 *     e.g. https://media.yourdomain.com  or leave empty to use API proxy
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const endpoint = (process.env.R2_ENDPOINT || "").replace(/\/$/, "");
const bucket = process.env.R2_BUCKET || "videosearch";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const publicBase = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");

let client = null;

export function isR2Configured() {
  return Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
}

export function getR2Client() {
  if (!isR2Configured()) return null;
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // R2-friendly
      // AWS SDK JS v3.729+ adds CRC32 checksums by default. R2 rejects
      // those headers with 403 Access Denied on Put/Get/Head.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

/**
 * Upload a JPEG buffer to R2.
 * @returns {{ key: string, publicUrl: string | null, proxyPath: string }}
 */
export async function uploadJpeg(opts) {
  const { userId, videoId, shotId, buffer } = opts;
  const s3 = getR2Client();
  if (!s3) {
    throw new Error(
      "R2 not configured — set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in server/.env"
    );
  }

  const key = `users/${userId}/${videoId}/${shotId}.jpg`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000",
    })
  );

  const publicUrl = publicBase ? `${publicBase}/${key}` : null;
  const proxyPath = `/api/media/${encodeURIComponent(key)}`;

  return { key, publicUrl, proxyPath };
}

export async function getObjectStream(key) {
  const s3 = getR2Client();
  if (!s3) throw new Error("R2 not configured");
  const out = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  return out;
}

export async function checkR2() {
  if (!isR2Configured()) {
    return { ok: false, message: "R2 credentials missing" };
  }
  try {
    const s3 = getR2Client();
    // List — not HeadBucket. Object R/W tokens often 403 HeadBucket
    // even when Put/Get on objects works.
    await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 })
    );
    return {
      ok: true,
      endpoint,
      bucket,
      publicBase: publicBase || null,
    };
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    const code = err?.Code || err?.name || "";
    const base =
      err instanceof Error && err.message && err.message !== "UnknownError"
        ? err.message
        : code || "R2 check failed";
    const hint =
      status === 403
        ? " (403 — check R2 API token has Object Read & Write on this bucket)"
        : status
          ? ` (HTTP ${status})`
          : "";
    return {
      ok: false,
      message: `${base}${hint}`,
      endpoint,
      bucket,
      status: status || null,
    };
  }
}

export function dataUrlToBuffer(dataUrl) {
  const m = String(dataUrl).match(/^data:image\/\w+;base64,(.+)$/);
  const b64 = m ? m[1] : String(dataUrl).replace(/^data:.*?;base64,/, "");
  return Buffer.from(b64, "base64");
}
