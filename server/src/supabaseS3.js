/**
 * Supabase Storage over the S3 protocol.
 * S3 access keys stay on the vault server — never in the extension.
 *
 * Env:
 *   SUPABASE_S3_ENDPOINT=https://<ref>.storage.supabase.co/storage/v1/s3
 *   SUPABASE_S3_ACCESS_KEY_ID=...
 *   SUPABASE_S3_SECRET_ACCESS_KEY=...
 *   SUPABASE_S3_BUCKET=vault-shots
 *   SUPABASE_S3_REGION=<project region, e.g. us-east-1>
 *   SUPABASE_URL=https://<ref>.supabase.co
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  ListBucketsCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";

const PROJECT_REF = "xirnfdraklgdtleftcag";
const endpoint = (
  process.env.SUPABASE_S3_ENDPOINT ||
  `https://${PROJECT_REF}.storage.supabase.co/storage/v1/s3`
).replace(/\/$/, "");
const region = process.env.SUPABASE_S3_REGION || "us-east-1";
const bucket = process.env.SUPABASE_S3_BUCKET || "vault-shots";
const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY || "";
const supabaseUrl = (
  process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`
).replace(/\/$/, "");

let client = null;
let bucketReady = false;

export function isSupabaseS3Configured() {
  return Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
}

export function getSupabaseS3Client() {
  if (!isSupabaseS3Configured()) return null;
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

export function supabaseObjectKey(userId, videoId, shotId) {
  const safe = (s) => String(s || "").replace(/[^A-Za-z0-9._-]/g, "_");
  return `users/${safe(userId)}/${safe(videoId)}/${safe(shotId)}.jpg`;
}

export function supabasePublicUrl(key) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;
}

async function ensureBucket() {
  if (bucketReady) return;
  const s3 = getSupabaseS3Client();
  if (!s3) throw new Error("Supabase S3 not configured");
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
      /NoSuchBucket/i.test(String(err?.message || ""));
    if (!missing) throw err;
  }
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  bucketReady = true;
}

/**
 * @returns {{ key: string, publicUrl: string, proxyPath: string }}
 */
export async function uploadSupabaseJpeg({ userId, videoId, shotId, buffer }) {
  const s3 = getSupabaseS3Client();
  if (!s3) {
    throw new Error(
      "Supabase S3 not configured — set SUPABASE_S3_ACCESS_KEY_ID in server/.env"
    );
  }
  await ensureBucket();
  const key = supabaseObjectKey(userId, videoId, shotId);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000",
    })
  );
  return {
    key,
    publicUrl: supabasePublicUrl(key),
    proxyPath: `/api/media/${encodeURIComponent(key)}`,
  };
}

export async function getSupabaseObject(key) {
  const s3 = getSupabaseS3Client();
  if (!s3) throw new Error("Supabase S3 not configured");
  return s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

export async function checkSupabaseS3() {
  if (!isSupabaseS3Configured()) {
    return { ok: false, message: "S3 credentials missing" };
  }
  try {
    const s3 = getSupabaseS3Client();
    await ensureBucket();
    await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    return { ok: true, endpoint, bucket, region };
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    const code = err?.Code || err?.name || "";
    const base =
      err instanceof Error && err.message && err.message !== "UnknownError"
        ? err.message
        : code || "Supabase S3 check failed";
    return {
      ok: false,
      message: status ? `${base} (HTTP ${status})` : base,
      endpoint,
      bucket,
      region,
      status: status || null,
    };
  }
}

export async function listSupabaseBuckets() {
  const s3 = getSupabaseS3Client();
  if (!s3) throw new Error("Supabase S3 not configured");
  const out = await s3.send(new ListBucketsCommand({}));
  return (out.Buckets || []).map((b) => b.Name);
}
