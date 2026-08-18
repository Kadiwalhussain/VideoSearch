/**
 * Fil One S3 backup (https://app.fil.one).
 * Path-style addressing required. Keys from the Fil One dashboard.
 *
 * FIL_ENDPOINT=https://eu-west-1.s3.fil.one
 * FIL_REGION=eu-west-1
 * FIL_BUCKET=videosearch-shots
 * FIL_ACCESS_KEY_ID=...
 * FIL_SECRET_ACCESS_KEY=...
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

const endpoint = (process.env.FIL_ENDPOINT || "https://us-east-1.s3.fil.one").replace(
  /\/$/,
  ""
);
const region = process.env.FIL_REGION || "us-east-1";
const bucket = process.env.FIL_BUCKET || "videosearch-shots";
const accessKeyId = process.env.FIL_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.FIL_SECRET_ACCESS_KEY || "";

let client = null;
let bucketReady = false;

export function isFilConfigured() {
  return Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
}

export function getFilClient() {
  if (!isFilConfigured()) return null;
  if (!client) {
    client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

export function filObjectKey(userId, videoId, shotId) {
  const safe = (s) => String(s || "").replace(/[^A-Za-z0-9._-]/g, "_");
  return `users/${safe(userId)}/${safe(videoId)}/${safe(shotId)}.jpg`;
}

async function ensureBucket() {
  if (bucketReady) return;
  const s3 = getFilClient();
  if (!s3) throw new Error("Fil One not configured");
  try {
    await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    bucketReady = true;
    return;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    const missing =
      status === 404 ||
      err?.name === "NotFound" ||
      err?.Code === "NoSuchBucket" ||
      /NoSuchBucket/i.test(err?.message || "");
    if (!missing) throw err;
  }
  // us-east-1 supports CreateBucket; eu-west-1 does not
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    bucketReady = true;
    return;
  } catch (err) {
    const code = err?.name || err?.Code || "";
    if (/BucketAlready|owned by you/i.test(code + (err?.message || ""))) {
      bucketReady = true;
      return;
    }
    const msg =
      "Create bucket “" +
      bucket +
      "” in the Fil One dashboard (region " +
      region +
      "). This API key cannot create buckets.";
    const e = new Error(msg);
    e.status = err?.$metadata?.httpStatusCode;
    throw e;
  }
}

export async function uploadFilJpeg({ userId, videoId, shotId, buffer }) {
  const s3 = getFilClient();
  if (!s3) throw new Error("Fil One not configured — set FIL_ACCESS_KEY_ID");
  await ensureBucket();
  const key = filObjectKey(userId, videoId, shotId);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "image/jpeg",
      CacheControl: "private, max-age=31536000",
    })
  );
  return { key, bucket };
}

export async function getFilObject(key) {
  const s3 = getFilClient();
  if (!s3) throw new Error("Fil One not configured");
  return s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

export async function checkFil() {
  if (!isFilConfigured()) {
    return { ok: false, message: "FIL_ACCESS_KEY_ID missing" };
  }
  try {
    const s3 = getFilClient();
    await ensureBucket();
    await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    return { ok: true, endpoint, region, bucket };
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    const missing = status === 404 || /NoSuchBucket|Create bucket/i.test(err?.message || "");
    return {
      ok: false,
      message: missing
        ? `Create bucket “${bucket}” at app.fil.one (region ${region})`
        : err instanceof Error
          ? err.message
          : "Fil One check failed",
      status: status || null,
      endpoint,
      bucket,
    };
  }
}
