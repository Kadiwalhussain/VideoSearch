/**
 * On-machine + Cloudflare Images backup for vault shots.
 * R2 S3 tokens currently 403 — this layer still keeps every JPEG.
 *
 * Env:
 *   SHOT_BACKUP_DIR=server/data/shots
 *   CF_ACCOUNT_ID=...
 *   CF_API_TOKEN=...   # Cloudflare API token with Images Write (or Account Images)
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.resolve(__dirname, "../data/shots");
const backupDir = path.resolve(
  process.env.SHOT_BACKUP_DIR || defaultDir
);

const cfAccountId = (process.env.CF_ACCOUNT_ID || "").trim();
const cfApiToken = (process.env.CF_API_TOKEN || "").trim();

export function isLocalBackupConfigured() {
  return Boolean(backupDir);
}

export function isCfImagesConfigured() {
  return Boolean(cfAccountId && cfApiToken);
}

export function backupRelPath(userId, videoId, shotId) {
  const safe = (s) => String(s || "").replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(safe(userId), safe(videoId), `${safe(shotId)}.jpg`);
}

export function backupAbsPath(userId, videoId, shotId) {
  return path.join(backupDir, backupRelPath(userId, videoId, shotId));
}

export function cfImageCustomId(userId, videoId, shotId) {
  const safe = (s) => String(s || "").replace(/[^A-Za-z0-9._-]/g, "_");
  return `vs/${safe(userId)}/${safe(videoId)}/${safe(shotId)}`;
}

export async function saveLocalShot({ userId, videoId, shotId, buffer }) {
  const abs = backupAbsPath(userId, videoId, shotId);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return { path: backupRelPath(userId, videoId, shotId), abs };
}

export async function readLocalShot({ userId, videoId, shotId }) {
  const abs = backupAbsPath(userId, videoId, shotId);
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

export async function uploadCfImage({ userId, videoId, shotId, buffer }) {
  if (!isCfImagesConfigured()) {
    throw new Error("CF_API_TOKEN / CF_ACCOUNT_ID not set");
  }
  const id = cfImageCustomId(userId, videoId, shotId);
  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: "image/jpeg" }),
    `${shotId}.jpg`
  );
  form.append("id", id);
  form.append("requireSignedURLs", "false");
  form.append(
    "metadata",
    JSON.stringify({ userId, videoId, shotId, source: "videosearch" })
  );

  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    cfAccountId
  )}/images/v1`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfApiToken}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const err =
      data?.errors?.[0]?.message ||
      data?.messages?.[0] ||
      `Cloudflare Images HTTP ${res.status}`;
    const e = new Error(err);
    e.status = res.status;
    throw e;
  }
  const variants = data?.result?.variants || [];
  const publicUrl =
    variants.find((v) => String(v).endsWith("/public")) || variants[0] || "";
  return {
    id: data?.result?.id || id,
    url: publicUrl,
  };
}

export async function checkCfImages() {
  if (!isCfImagesConfigured()) {
    return { ok: false, message: "CF_API_TOKEN / CF_ACCOUNT_ID missing" };
  }
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      cfAccountId
    )}/images/v1?per_page=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfApiToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const msg =
        data?.errors?.[0]?.message || `Cloudflare Images HTTP ${res.status}`;
      return { ok: false, message: msg, status: res.status };
    }
    return { ok: true, account: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "CF Images check failed",
    };
  }
}

export async function checkLocalBackup() {
  try {
    await fs.mkdir(backupDir, { recursive: true });
    return { ok: true, dir: backupDir };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "backup dir failed",
    };
  }
}
