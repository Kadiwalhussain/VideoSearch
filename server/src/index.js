/**
 * VideoSearch Vault API — Auth + MongoDB + Cloudflare R2
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import { User, VaultVideo } from "./models.js";
import {
  authMiddleware,
  loginUser,
  publicUser,
  registerUser,
  resetPassword,
  verifyToken,
} from "./auth.js";
import {
  checkR2,
  dataUrlToBuffer,
  getObjectStream,
  isR2Configured,
  uploadJpeg,
} from "./r2.js";
import { getLlmConfig, serverChatCompletions } from "./ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** React Studio build output (vite base: /app/) */
const WEBAPP_DIR = path.resolve(__dirname, "../../webapp/dist");
const WEBSITE_ASSETS = path.resolve(__dirname, "../../website/assets");

const PORT = Number(process.env.PORT || 8787);
/** Bind all interfaces so LAN devices can reach the vault (set HOST=127.0.0.1 to lock local-only) */
const HOST = (process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI || "";
const PUBLIC_API_BASE = (
  process.env.PUBLIC_API_BASE || `http://localhost:${PORT}`
).replace(/\/$/, "");

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

/**
 * Absolute API base for media URLs — prefer the request Host so both
 * http://localhost:8787 and http://192.168.x.x:8787 work with the same process.
 */
function apiBaseFromReq(req) {
  const host = String(
    req?.headers?.["x-forwarded-host"] || req?.headers?.host || ""
  ).trim();
  if (host) {
    const proto = String(
      req.headers["x-forwarded-proto"] ||
        (req.secure ? "https" : "http")
    )
      .split(",")[0]
      .trim();
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  return PUBLIC_API_BASE;
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
// Chrome Private Network Access (HTTPS page → localhost): allow preflight
app.use((req, res, next) => {
  if (req.headers["access-control-request-private-network"] === "true") {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});
app.use(express.json({ limit: "25mb" }));
app.use(morgan("dev"));

// Full vault UI — React SPA (vite build → webapp/dist)
app.use(
  "/app",
  express.static(WEBAPP_DIR, {
    index: "index.html",
    // hashed assets always revalidate via filenames
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
  })
);
// Brand assets (logo) used by studio favicon / optional UI
app.use("/app/assets", express.static(WEBSITE_ASSETS));

// SPA client routes: /app/library, /app/video/:id, …
app.get("/app/*", (req, res, next) => {
  // Don't swallow missing static files that look like assets
  if (/\.[a-zA-Z0-9]+$/.test(req.path) && !req.path.endsWith(".html")) {
    return next();
  }
  res.sendFile(path.join(WEBAPP_DIR, "index.html"), (err) => {
    if (err) next();
  });
});

async function healthPayload() {
  const r2 = await checkR2();
  return {
    ok: true,
    service: "videosearch-vault-api",
    auth: true,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "down",
    r2: r2.ok
      ? { ok: true, bucket: r2.bucket }
      : { ok: false, message: r2.message || "not configured" },
  };
}

app.get("/health", async (_req, res) => {
  res.json(await healthPayload());
});

/** Browser-friendly home page — API was always up; / used to 404 */
app.get("/", async (_req, res) => {
  const h = await healthPayload();
  const mongoOk = h.mongo === "connected";
  const r2Ok = Boolean(h.r2?.ok);
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VideoSearch Vault API</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0; min-height: 100vh; font-family: ui-sans-serif, system-ui, sans-serif;
      background: #04060a; color: #e8eef4;
      display: grid; place-items: center; padding: 24px;
    }
    .card {
      width: min(520px, 100%);
      border: 1px solid rgba(45,212,168,.25);
      background: linear-gradient(160deg, rgba(45,212,168,.08), #0c1118);
      border-radius: 18px; padding: 28px 26px; box-shadow: 0 24px 60px rgba(0,0,0,.45);
    }
    h1 { margin: 0 0 6px; font-size: 1.35rem; letter-spacing: -.03em; }
    .sub { color: #8b98a5; margin: 0 0 20px; font-size: .95rem; line-height: 1.45; }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0;
      border-top: 1px solid rgba(255,255,255,.06); font-size: .9rem; }
    .ok { color: #2dd4a8; font-weight: 700; }
    .bad { color: #f87171; font-weight: 700; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem;
      background: rgba(255,255,255,.06); padding: 2px 6px; border-radius: 6px; }
    ul { margin: 16px 0 0; padding-left: 1.1rem; color: #8b98a5; font-size: .88rem; line-height: 1.55; }
    a { color: #38bdf8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>VideoSearch Vault API</h1>
    <p class="sub">Account vault is running. This is the JSON API used by the Chrome extension and webapp — not the marketing site.</p>
    <div class="row"><span>Service</span><span class="ok">online</span></div>
    <div class="row"><span>MongoDB</span><span class="${mongoOk ? "ok" : "bad"}">${h.mongo}</span></div>
    <div class="row"><span>Cloudflare R2</span><span class="${r2Ok ? "ok" : "bad"}">${r2Ok ? "ready · " + (h.r2.bucket || "") : (h.r2.message || "down")}</span></div>
    <div class="row"><span>Auth</span><span class="ok">JWT accounts</span></div>
    <ul>
      <li>Health JSON: <a href="/health"><code>/health</code></a></li>
      <li>Register: <code>POST /api/auth/register</code></li>
      <li>Login: <code>POST /api/auth/login</code></li>
      <li>Web vault UI: <a href="/app/"><code>/app/</code></a></li>
      <li>Extension: avatar → Sign in, then <strong>Open full vault</strong></li>
    </ul>
  </div>
</body>
</html>`);
});

// ─── Auth ───────────────────────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  try {
    const out = await registerUser({
      email: req.body?.email,
      password: req.body?.password,
      displayName: req.body?.displayName,
    });
    res.status(201).json({ ok: true, ...out });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Register failed",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const out = await loginUser({
      email: req.body?.email,
      password: req.body?.password,
    });
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Login failed",
    });
  }
});

/** Reset password (MVP / local — sets a new password for an existing email) */
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const out = await resetPassword({
      email: req.body?.email,
      password: req.body?.password,
    });
    res.json({ ok: true, ...out });
  } catch (err) {
    res.status(err.status || 500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Reset failed",
    });
  }
});

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    if (req.authMode === "service") {
      return res.json({ ok: true, user: req.user });
    }
    const user = await User.findOne({ userId: req.user.userId });
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Me failed",
    });
  }
});

// ─── Helpers ────────────────────────────────────────────────────────

async function refreshUserStats(userId) {
  const all = await VaultVideo.find({ userId }).lean();
  let highlightCount = 0;
  let screenshotCount = 0;
  for (const v of all) {
    highlightCount += (v.highlights || []).length;
    screenshotCount += (v.screenshots || []).length;
  }
  await User.findOneAndUpdate(
    { userId },
    {
      $set: {
        lastSeenAt: new Date(),
        videoCount: all.length,
        highlightCount,
        screenshotCount,
      },
    }
  );
}

async function processScreenshots(userId, videoId, screenshots, apiBase = PUBLIC_API_BASE) {
  if (!Array.isArray(screenshots)) return { list: [], uploaded: 0, r2Errors: 0 };

  const existing = await VaultVideo.findOne({ userId, videoId }).lean();
  const prevById = new Map(
    (existing?.screenshots || []).map((s) => [s.id, s])
  );

  let uploaded = 0;
  let r2Errors = 0;
  const list = [];
  const base = (apiBase || PUBLIC_API_BASE).replace(/\/$/, "");

  for (const raw of screenshots) {
    if (!raw?.id) continue;
    const prev = prevById.get(raw.id);
    let imageUrl = raw.imageUrl || prev?.imageUrl || "";
    let r2Key = raw.r2Key || prev?.r2Key || "";
    let dataUrl = raw.dataUrl || "";

    if (dataUrl && dataUrl.startsWith("data:image") && isR2Configured()) {
      try {
        const buffer = dataUrlToBuffer(dataUrl);
        const out = await uploadJpeg({
          userId,
          videoId,
          shotId: raw.id,
          buffer,
        });
        r2Key = out.key;
        imageUrl = out.publicUrl || `${base}${out.proxyPath}`;
        dataUrl = "";
        uploaded += 1;
      } catch (err) {
        r2Errors += 1;
        console.warn("[vault-api] R2 upload failed", raw.id, err?.message);
      }
    } else if (!imageUrl && prev?.imageUrl) {
      imageUrl = prev.imageUrl;
      r2Key = r2Key || prev.r2Key;
    }

    list.push({
      id: raw.id,
      videoTime: raw.videoTime ?? 0,
      note: raw.note || "",
      width: raw.width,
      height: raw.height,
      createdAt: raw.createdAt || Date.now(),
      imageUrl: imageUrl || undefined,
      r2Key: r2Key || undefined,
      dataUrl: dataUrl && dataUrl.startsWith("data:") ? dataUrl : undefined,
    });
  }

  return { list, uploaded, r2Errors };
}

/**
 * Lightweight screenshot DTO for list/sync responses.
 * NEVER embed full base64 dataUrls in list payloads (they hang Studio).
 * Images load on demand via /api/vault/shot/:videoId/:shotId (or R2 media).
 */
function mapScreenshotOut(
  s,
  videoId,
  _includeImages = false,
  apiBase = PUBLIC_API_BASE
) {
  const base = (apiBase || PUBLIC_API_BASE).replace(/\/$/, "");
  const external =
    s.imageUrl && !String(s.imageUrl).startsWith("data:")
      ? String(s.imageUrl)
      : undefined;
  const mediaUrl = s.r2Key
    ? `${base}/api/media/${encodeURIComponent(s.r2Key)}`
    : undefined;
  // Lazy proxy always available — browser loads one image at a time (no hang)
  const shotProxy =
    videoId && s.id
      ? `${base}/api/vault/shot/${encodeURIComponent(videoId)}/${encodeURIComponent(s.id)}`
      : undefined;

  return {
    id: s.id,
    videoTime: s.videoTime,
    note: s.note,
    width: s.width,
    height: s.height,
    createdAt: s.createdAt,
    imageUrl: external || mediaUrl || shotProxy || undefined,
    r2Key: s.r2Key,
    hasImage: true,
  };
}

// ─── Vault (auth required) ──────────────────────────────────────────

/** Merge mark lists by id — client wins on conflict; never drop unknown server-only rows when client list is partial. */
function mergeById(serverList, clientList) {
  const map = new Map();
  for (const item of serverList || []) {
    if (item?.id) map.set(String(item.id), item);
  }
  for (const item of clientList || []) {
    if (item?.id) map.set(String(item.id), item);
  }
  return [...map.values()];
}

function isBareVideoId(s) {
  return /^[A-Za-z0-9_-]{10,12}$/.test(String(s || "").trim());
}

const titleCache = new Map();

/** Resolve human title via YouTube oEmbed (no API key). */
async function resolveYouTubeTitle(videoId) {
  if (!videoId || !isBareVideoId(videoId) && videoId.length < 6) {
    /* still try */
  }
  if (titleCache.has(videoId)) return titleCache.get(videoId);

  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VideoSearchVault/1.0" },
      signal: AbortSignal.timeout?.(8000),
    });
    if (!res.ok) {
      titleCache.set(videoId, null);
      return null;
    }
    const data = await res.json();
    const title = String(data?.title || "").trim();
    if (title && !isBareVideoId(title)) {
      titleCache.set(videoId, title);
      return title;
    }
  } catch (err) {
    console.warn("[vault-api] oEmbed title failed", videoId, err?.message);
  }
  titleCache.set(videoId, null);
  return null;
}

/** Backfill missing / id-only titles for a user's vault (best-effort). */
async function backfillUserTitles(userId, limit = 40) {
  const rows = await VaultVideo.find({ userId })
    .select("videoId videoTitle")
    .limit(200)
    .lean();
  let fixed = 0;
  for (const r of rows) {
    if (fixed >= limit) break;
    const t = (r.videoTitle || "").trim();
    if (t && t !== r.videoId && !isBareVideoId(t)) continue;
    const resolved = await resolveYouTubeTitle(r.videoId);
    if (!resolved) continue;
    await VaultVideo.updateOne(
      { userId, videoId: r.videoId },
      { $set: { videoTitle: resolved } }
    );
    fixed += 1;
  }
  return fixed;
}

app.post("/api/vault/sync", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      videoId,
      videoTitle = "",
      videoUrl = "",
      highlights = [],
      screenshots = [],
      /** when true, client list fully replaces (after explicit delete-all) */
      replaceHighlights = false,
      replaceScreenshots = false,
    } = req.body || {};

    if (!videoId || typeof videoId !== "string") {
      return res.status(400).json({ ok: false, message: "videoId required" });
    }

    const existing = await VaultVideo.findOne({ userId, videoId }).lean();

    const processed = await processScreenshots(
      userId,
      videoId,
      screenshots,
      apiBaseFromReq(req)
    );

    const clientHighlights = Array.isArray(highlights) ? highlights : [];
    const nextHighlights = replaceHighlights
      ? clientHighlights
      : mergeById(existing?.highlights || [], clientHighlights);

    // Screenshots: merge by id; processed.list already includes R2 keys
    const nextScreenshots = replaceScreenshots
      ? processed.list
      : mergeById(existing?.screenshots || [], processed.list);

    let nextTitle =
      (videoTitle && String(videoTitle).trim()) ||
      existing?.videoTitle ||
      "";
    // Never keep a bare YouTube id as the title when we can resolve a real one
    if (!nextTitle || nextTitle === videoId || isBareVideoId(nextTitle)) {
      const resolved = await resolveYouTubeTitle(videoId);
      if (resolved) nextTitle = resolved;
      else if (!nextTitle) nextTitle = videoId;
    }

    const setDoc = {
      userId,
      videoId,
      videoTitle: nextTitle,
      videoUrl:
        videoUrl ||
        existing?.videoUrl ||
        `https://www.youtube.com/watch?v=${videoId}`,
      highlights: nextHighlights,
      screenshots: nextScreenshots,
      updatedAt: new Date(),
    };
    // Preserve library flags (saved / watch later / playlists) on note/shot sync
    const doc = await VaultVideo.findOneAndUpdate(
      { userId, videoId },
      { $set: setDoc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await refreshUserStats(userId);

    const r2Note = isR2Configured()
      ? ` · R2 ${processed.uploaded} uploaded`
      : " · R2 off";

    res.json({
      ok: true,
      message: `Saved · ${doc.highlights.length} marks · ${doc.screenshots.length} shots${r2Note}`,
      videoId: doc.videoId,
      userId,
      uploadedToR2: processed.uploaded,
      highlightCount: doc.highlights.length,
      screenshotCount: doc.screenshots.length,
    });
  } catch (err) {
    console.error("sync error", err);
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Sync failed",
    });
  }
});

app.get("/api/vault", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    // images=1 still does NOT ship huge base64 blobs — only media URLs (+ tiny inline)
    const includeImages = req.query.images === "1";
    const base = apiBaseFromReq(req);

    // Exclude embedded base64 from Mongo projection — huge win for list speed
    const rows = await VaultVideo.find({ userId })
      .select("-screenshots.dataUrl")
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      ok: true,
      rows: rows.map((r) => mapVaultRow(r, includeImages, base)),
    });

    // Non-blocking: fix bare titles in background (never delay first paint)
    setImmediate(() => {
      backfillUserTitles(userId, 6).catch((e) =>
        console.warn("[vault-api] title backfill", e?.message)
      );
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "List failed",
      rows: [],
    });
  }
});

/** Force full title repair for the signed-in user */
app.post("/api/vault/repair-titles", authMiddleware, async (req, res) => {
  try {
    const fixed = await backfillUserTitles(req.user.userId, 80);
    res.json({ ok: true, fixed, message: `Updated ${fixed} video titles` });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Repair failed",
    });
  }
});

function mapVaultRow(r, includeImages = false, apiBase = PUBLIC_API_BASE) {
  const updatedMs = r.updatedAt ? new Date(r.updatedAt).getTime() : Date.now();
  return {
    video_id: r.videoId,
    // Always ISO string so clients parse consistently
    updated_at: Number.isFinite(updatedMs)
      ? new Date(updatedMs).toISOString()
      : new Date().toISOString(),
    payload: {
      videoId: r.videoId,
      videoTitle: r.videoTitle,
      videoUrl: r.videoUrl,
      highlights: r.highlights || [],
      screenshots: (r.screenshots || []).map((s) =>
        mapScreenshotOut(s, r.videoId, includeImages, apiBase)
      ),
      saved: Boolean(r.saved),
      savedAt: r.savedAt ? new Date(r.savedAt).getTime() : null,
      watchLater: Boolean(r.watchLater),
      watchLaterAt: r.watchLaterAt
        ? new Date(r.watchLaterAt).getTime()
        : null,
      playlists: Array.isArray(r.playlists) ? r.playlists : [],
      updatedAt: Number.isFinite(updatedMs) ? updatedMs : Date.now(),
    },
  };
}

/**
 * Serve one shot image on demand (from R2 or Mongo dataUrl).
 * Keeps vault list tiny while Shots gallery still shows previews.
 */
function authFromReq(req) {
  const h = req.headers.authorization || "";
  const bearer = h.startsWith("Bearer ") ? h.slice(7) : "";
  const qToken = String(req.query.token || req.query.key || "");
  return bearer || qToken;
}

app.get("/api/vault/shot/:videoId/:shotId", async (req, res) => {
  try {
    const token = authFromReq(req);
    if (!token) {
      return res.status(401).json({ ok: false, message: "Auth required" });
    }
    let userId;
    try {
      if (process.env.VSA_API_KEY && token === process.env.VSA_API_KEY) {
        userId = String(req.query.userId || "");
      } else {
        // JWT payload uses `sub` (same as authMiddleware)
        const payload = verifyToken(token);
        userId = payload.sub || payload.userId || "";
      }
    } catch {
      return res.status(401).json({ ok: false, message: "Invalid token" });
    }
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Auth required" });
    }

    const videoId = String(req.params.videoId || "");
    const shotId = String(req.params.shotId || "");
    if (!videoId || !shotId) {
      return res
        .status(400)
        .json({ ok: false, message: "videoId and shotId required" });
    }

    // Load only matching screenshot (includes dataUrl for this one shot)
    let shot = null;
    const doc = await VaultVideo.findOne(
      { userId, videoId, "screenshots.id": shotId },
      { screenshots: { $elemMatch: { id: shotId } } }
    ).lean();
    shot = doc?.screenshots?.[0] || null;

    // Fallback if elemMatch projection empty (older mongoose edge cases)
    if (!shot) {
      const full = await VaultVideo.findOne(
        { userId, videoId },
        { screenshots: 1 }
      ).lean();
      shot = (full?.screenshots || []).find((s) => s.id === shotId) || null;
    }

    if (!shot) {
      return res.status(404).json({ ok: false, message: "Shot not found" });
    }

    res.setHeader("Cache-Control", "private, max-age=3600");

    // Prefer R2 when configured
    if (shot.r2Key && isR2Configured()) {
      try {
        const out = await getObjectStream(shot.r2Key);
        res.setHeader("Content-Type", out.ContentType || "image/jpeg");
        if (out.Body?.transformToByteArray) {
          const bytes = await out.Body.transformToByteArray();
          return res.end(Buffer.from(bytes));
        }
      } catch (e) {
        console.warn("[vault-api] shot R2 miss", shotId, e?.message);
      }
    }

    // External non-data URL
    if (shot.imageUrl && !String(shot.imageUrl).startsWith("data:")) {
      return res.redirect(302, shot.imageUrl);
    }

    // Inline dataUrl in Mongo (normal path when R2 is unavailable)
    if (shot.dataUrl && String(shot.dataUrl).startsWith("data:image")) {
      const m = String(shot.dataUrl).match(
        /^data:(image\/[\w+.-]+);base64,(.+)$/s
      );
      if (m) {
        res.setHeader("Content-Type", m[1]);
        return res.end(Buffer.from(m[2], "base64"));
      }
    }

    return res
      .status(404)
      .json({ ok: false, message: "No image data for shot" });
  } catch (err) {
    console.error("[vault-api] shot serve error", err);
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Shot failed",
    });
  }
});

/**
 * Save video to library / watch later / playlists.
 * Does not wipe notes or screenshots.
 *
 * body: {
 *   videoId, videoTitle?, videoUrl?,
 *   action: 'save' | 'unsave' | 'watch_later' | 'unwatch_later'
 *         | 'toggle_save' | 'toggle_watch_later'
 *         | 'add_playlist' | 'remove_playlist',
 *   playlist?: string
 * }
 */
app.post("/api/vault/library", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      videoId,
      videoTitle = "",
      videoUrl = "",
      action,
      playlist,
    } = req.body || {};

    if (!videoId || typeof videoId !== "string") {
      return res.status(400).json({ ok: false, message: "videoId required" });
    }
    if (!action || typeof action !== "string") {
      return res.status(400).json({ ok: false, message: "action required" });
    }

    const existing = await VaultVideo.findOne({ userId, videoId }).lean();
    const now = new Date();
    const set = {
      userId,
      videoId,
      updatedAt: now,
      videoTitle:
        (videoTitle && String(videoTitle).slice(0, 500)) ||
        existing?.videoTitle ||
        videoId,
      videoUrl:
        (videoUrl && String(videoUrl)) ||
        existing?.videoUrl ||
        `https://www.youtube.com/watch?v=${videoId}`,
    };

    let playlists = Array.isArray(existing?.playlists)
      ? [...existing.playlists]
      : [];
    let saved = Boolean(existing?.saved);
    let watchLater = Boolean(existing?.watchLater);
    let savedAt = existing?.savedAt || null;
    let watchLaterAt = existing?.watchLaterAt || null;

    const plName =
      typeof playlist === "string" ? playlist.trim().slice(0, 80) : "";

    /** Case-insensitive find; prefer existing casing so "politics" matches "Politics" */
    const findPlaylistIndex = (name) => {
      const key = name.toLowerCase();
      return playlists.findIndex((p) => String(p).toLowerCase() === key);
    };
    /** Resolve canonical name from user's library if this playlist already exists */
    const resolveCanonicalName = async (name) => {
      const key = name.toLowerCase();
      const rows = await VaultVideo.find({
        userId,
        playlists: { $exists: true, $ne: [] },
      })
        .select("playlists")
        .lean();
      for (const r of rows) {
        for (const p of r.playlists || []) {
          if (String(p).toLowerCase() === key) return p;
        }
      }
      return name;
    };

    switch (action) {
      case "save":
        saved = true;
        savedAt = now;
        break;
      case "unsave":
        saved = false;
        savedAt = null;
        break;
      case "toggle_save":
        saved = !saved;
        savedAt = saved ? now : null;
        break;
      case "watch_later":
        watchLater = true;
        watchLaterAt = now;
        break;
      case "unwatch_later":
        watchLater = false;
        watchLaterAt = null;
        break;
      case "toggle_watch_later":
        watchLater = !watchLater;
        watchLaterAt = watchLater ? now : null;
        break;
      case "add_playlist":
      case "toggle_playlist": {
        if (!plName) {
          return res
            .status(400)
            .json({ ok: false, message: "playlist name required" });
        }
        const idx = findPlaylistIndex(plName);
        if (action === "toggle_playlist" && idx >= 0) {
          playlists.splice(idx, 1);
          break;
        }
        if (idx < 0) {
          const canonical = await resolveCanonicalName(plName);
          playlists.push(canonical);
        }
        // already in list with add_playlist → no-op (still ok)
        saved = true;
        if (!savedAt) savedAt = now;
        break;
      }
      case "remove_playlist": {
        if (!plName) {
          return res
            .status(400)
            .json({ ok: false, message: "playlist name required" });
        }
        const key = plName.toLowerCase();
        playlists = playlists.filter(
          (p) => String(p).toLowerCase() !== key
        );
        break;
      }
      default:
        return res.status(400).json({
          ok: false,
          message: `Unknown action: ${action}`,
        });
    }

    set.saved = saved;
    set.watchLater = watchLater;
    set.savedAt = savedAt;
    set.watchLaterAt = watchLaterAt;
    set.playlists = playlists;

    const doc = await VaultVideo.findOneAndUpdate(
      { userId, videoId },
      {
        $set: set,
        $setOnInsert: {
          highlights: [],
          screenshots: [],
        },
      },
      { upsert: true, new: true }
    );

    await refreshUserStats(userId);

    res.json({
      ok: true,
      message: libraryActionMessage(action, plName, doc),
      videoId: doc.videoId,
      library: {
        saved: Boolean(doc.saved),
        savedAt: doc.savedAt ? new Date(doc.savedAt).getTime() : null,
        watchLater: Boolean(doc.watchLater),
        watchLaterAt: doc.watchLaterAt
          ? new Date(doc.watchLaterAt).getTime()
          : null,
        playlists: doc.playlists || [],
      },
    });
  } catch (err) {
    console.error("library error", err);
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Library update failed",
    });
  }
});

function libraryActionMessage(action, playlist, doc) {
  const inList =
    playlist &&
    (doc.playlists || []).some(
      (p) => String(p).toLowerCase() === String(playlist).toLowerCase()
    );
  switch (action) {
    case "save":
    case "toggle_save":
      return doc.saved ? "Saved to library" : "Removed from library";
    case "unsave":
      return "Removed from library";
    case "watch_later":
    case "toggle_watch_later":
      return doc.watchLater ? "Added to Watch later" : "Removed from Watch later";
    case "unwatch_later":
      return "Removed from Watch later";
    case "add_playlist":
      return `Added to “${playlist}”`;
    case "toggle_playlist":
      return inList
        ? `Added to “${playlist}”`
        : `Removed from “${playlist}”`;
    case "remove_playlist":
      return `Removed from “${playlist}”`;
    default:
      return "Library updated";
  }
}

/** Playlist names + video counts for the signed-in user */
app.get("/api/library/playlists", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await VaultVideo.find({
      userId,
      playlists: { $exists: true, $ne: [] },
    })
      .select("playlists videoId videoTitle")
      .lean();

    // Merge case-insensitive duplicates under first-seen casing
    const counts = new Map(); // lower -> { name, count, videoIds }
    for (const r of rows) {
      for (const name of r.playlists || []) {
        if (!name) continue;
        const key = String(name).toLowerCase();
        const cur = counts.get(key) || {
          name,
          count: 0,
          videoIds: [],
        };
        cur.count += 1;
        if (r.videoId) cur.videoIds.push(r.videoId);
        counts.set(key, cur);
      }
    }

    const playlists = [...counts.values()]
      .map(({ name, count, videoIds }) => ({ name, count, videoIds }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const watchLaterCount = await VaultVideo.countDocuments({
      userId,
      watchLater: true,
    });
    const savedCount = await VaultVideo.countDocuments({
      userId,
      saved: true,
    });

    res.json({
      ok: true,
      playlists,
      watchLaterCount,
      savedCount,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Playlists failed",
      playlists: [],
    });
  }
});

app.get("/api/vault/:videoId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const r = await VaultVideo.findOne({
      userId,
      videoId: req.params.videoId,
    }).lean();
    if (!r) return res.status(404).json({ ok: false, message: "Not found" });
    res.json({ ok: true, ...mapVaultRow(r, true, apiBaseFromReq(req)) });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Get failed",
    });
  }
});

/** Delete entire video from vault (history / library / all marks & shots). */
app.delete("/api/vault/:videoId", authMiddleware, async (req, res) => {
  try {
    const videoId = String(req.params.videoId || "");
    if (!videoId) {
      return res.status(400).json({ ok: false, message: "videoId required" });
    }
    const result = await VaultVideo.deleteOne({
      userId: req.user.userId,
      videoId,
    });
    await refreshUserStats(req.user.userId);
    res.json({
      ok: true,
      deleted: result.deletedCount > 0,
      videoId,
      message:
        result.deletedCount > 0
          ? "Video removed from vault"
          : "Video was not in vault",
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Delete failed",
    });
  }
});

/**
 * Delete one mark/highlight from a video.
 * DELETE /api/vault/:videoId/highlights/:highlightId
 */
app.delete(
  "/api/vault/:videoId/highlights/:highlightId",
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const videoId = String(req.params.videoId || "");
      const highlightId = String(req.params.highlightId || "");
      if (!videoId || !highlightId) {
        return res.status(400).json({
          ok: false,
          message: "videoId and highlightId required",
        });
      }

      const doc = await VaultVideo.findOne({ userId, videoId });
      if (!doc) {
        return res.status(404).json({ ok: false, message: "Video not found" });
      }

      const before = (doc.highlights || []).length;
      doc.highlights = (doc.highlights || []).filter(
        (h) => String(h.id) !== highlightId
      );
      const removed = before - doc.highlights.length;
      if (!removed) {
        return res.status(404).json({ ok: false, message: "Mark not found" });
      }
      doc.updatedAt = new Date();
      await doc.save();
      await refreshUserStats(userId);

      res.json({
        ok: true,
        videoId,
        highlightId,
        remaining: doc.highlights.length,
        message: "Mark deleted",
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        message: err instanceof Error ? err.message : "Delete mark failed",
      });
    }
  }
);

/**
 * Delete one screenshot/shot from a video.
 * DELETE /api/vault/:videoId/screenshots/:shotId
 */
app.delete(
  "/api/vault/:videoId/screenshots/:shotId",
  authMiddleware,
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const videoId = String(req.params.videoId || "");
      const shotId = String(req.params.shotId || "");
      if (!videoId || !shotId) {
        return res
          .status(400)
          .json({ ok: false, message: "videoId and shotId required" });
      }

      const doc = await VaultVideo.findOne({ userId, videoId });
      if (!doc) {
        return res.status(404).json({ ok: false, message: "Video not found" });
      }

      const before = (doc.screenshots || []).length;
      doc.screenshots = (doc.screenshots || []).filter(
        (s) => String(s.id) !== shotId
      );
      const removed = before - doc.screenshots.length;
      if (!removed) {
        return res.status(404).json({ ok: false, message: "Shot not found" });
      }
      doc.updatedAt = new Date();
      await doc.save();
      await refreshUserStats(userId);

      res.json({
        ok: true,
        videoId,
        shotId,
        remaining: doc.screenshots.length,
        message: "Shot deleted",
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        message: err instanceof Error ? err.message : "Delete shot failed",
      });
    }
  }
);

// ─── AI (server-side LLM for perfect Chat / Ask / Topics) ───────────

app.get("/api/ai/status", authMiddleware, (req, res) => {
  const cfg = getLlmConfig();
  res.json({
    ok: true,
    configured: cfg.configured,
    provider: cfg.provider,
    model: cfg.configured ? cfg.model : null,
    baseUrl: cfg.configured ? cfg.baseUrl : null,
  });
});

/**
 * Authenticated chat completions proxy.
 * Body: { messages, temperature?, max_tokens?, model? }
 */
app.post("/api/ai/chat", authMiddleware, async (req, res) => {
  try {
    const { messages, temperature, max_tokens, model } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "messages[] required",
      });
    }
    // Hard cap payload size for abuse
    const est = JSON.stringify(messages).length;
    if (est > 120_000) {
      return res.status(413).json({
        ok: false,
        message: "Prompt too large",
      });
    }

    const cleaned = messages
      .filter(
        (m) =>
          m &&
          typeof m.content === "string" &&
          ["system", "user", "assistant"].includes(m.role)
      )
      .map((m) => ({
        role: m.role,
        content: String(m.content).slice(0, 24_000),
      }))
      .slice(0, 24);

    if (!cleaned.length) {
      return res.status(400).json({ ok: false, message: "No valid messages" });
    }

    const result = await serverChatCompletions({
      messages: cleaned,
      temperature:
        typeof temperature === "number"
          ? Math.min(1.2, Math.max(0, temperature))
          : 0.28,
      max_tokens:
        typeof max_tokens === "number"
          ? Math.min(4096, Math.max(64, max_tokens))
          : 1400,
      model: typeof model === "string" ? model : undefined,
    });

    res.json({
      ok: true,
      content: result.content,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
    });
  } catch (err) {
    const code = err?.code || "";
    if (code === "AI_NOT_CONFIGURED") {
      return res.status(503).json({
        ok: false,
        message: err.message,
        code,
      });
    }
    console.error("[vault-api] AI chat error", err);
    res.status(err?.status && err.status < 600 ? err.status : 502).json({
      ok: false,
      message: err instanceof Error ? err.message : "AI request failed",
      code: code || "AI_ERROR",
    });
  }
});

// Media: JWT query token OR public proxy
app.get("/api/media/*", async (req, res) => {
  try {
    const h = req.headers.authorization || "";
    const bearer = h.startsWith("Bearer ") ? h.slice(7) : "";
    const qToken = String(req.query.token || req.query.key || "");
    const token = bearer || qToken;
    const open = process.env.R2_PUBLIC_PROXY === "1";

    if (!open) {
      if (!token) {
        return res.status(401).json({ ok: false, message: "Auth required" });
      }
      try {
        if (token !== process.env.VSA_API_KEY) verifyToken(token);
      } catch {
        return res.status(401).json({ ok: false, message: "Invalid token" });
      }
    }

    const key = decodeURIComponent(req.params[0] || "");
    if (!key || key.includes("..")) {
      return res.status(400).json({ ok: false, message: "Invalid key" });
    }

    const out = await getObjectStream(key);
    res.setHeader("Content-Type", out.ContentType || "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    if (out.Body?.transformToByteArray) {
      const bytes = await out.Body.transformToByteArray();
      return res.end(Buffer.from(bytes));
    }
    res.status(500).json({ ok: false, message: "Cannot read body" });
  } catch (err) {
    res.status(404).json({
      ok: false,
      message: err instanceof Error ? err.message : "Not found",
    });
  }
});

const LOCAL_MONGO =
  process.env.MONGODB_URI_FALLBACK || "mongodb://127.0.0.1:27017/videosearch";

function mongoLabel(uri) {
  if (/127\.0\.0\.1|localhost/.test(uri)) return "local";
  if (/mongodb\.net|atlas/i.test(uri)) return "Atlas";
  return "remote";
}

async function connectMongo() {
  const candidates = [MONGODB_URI, LOCAL_MONGO].filter(Boolean);
  const seen = new Set();
  let lastErr;

  for (const uri of candidates) {
    if (seen.has(uri)) continue;
    seen.add(uri);
    const label = mongoLabel(uri);
    try {
      console.log(`[vault-api] connecting MongoDB (${label})…`);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
      console.log(`[vault-api] MongoDB connected (${label})`);
      if (label !== "Atlas" && MONGODB_URI && uri !== MONGODB_URI) {
        console.warn(
          "[vault-api] Using fallback DB — Atlas unreachable. Whitelist this machine IP in Atlas Network Access to restore cloud data."
        );
      }
      return label;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[vault-api] Mongo (${label}) failed: ${msg.slice(0, 160)}`);
      try {
        await mongoose.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  throw lastErr || new Error("Could not connect to MongoDB");
}

async function main() {
  await connectMongo();

  const r2 = await checkR2();
  if (r2.ok) console.log(`[vault-api] R2 ready · ${r2.bucket}`);
  else console.warn(`[vault-api] R2: ${r2.message}`);

  // Dual-stack when HOST is 0.0.0.0/:: — Chrome often resolves "localhost" → ::1.
  // Binding only 0.0.0.0 makes http://localhost:8787 fail in the extension.
  const listenOpts =
    HOST === "0.0.0.0" || HOST === "::"
      ? { port: PORT, host: "::", ipv6Only: false }
      : { port: PORT, host: HOST };

  const server = app.listen(listenOpts, () => {
    const ai = getLlmConfig();
    const addr = server.address();
    console.log(
      `[vault-api] listening`,
      typeof addr === "object" && addr
        ? `${addr.address}:${addr.port}`
        : `${HOST}:${PORT}`
    );
    console.log(`[vault-api] local:   http://127.0.0.1:${PORT}/app/`);
    console.log(`[vault-api] local:   http://localhost:${PORT}/app/`);
    console.log(
      `[vault-api] network: http://<lan-ip>:${PORT}/app/  (same Wi‑Fi)`
    );
    console.log(`[vault-api] health:  http://127.0.0.1:${PORT}/health`);
    console.log(`[vault-api] auth: POST /api/auth/register | /api/auth/login`);
    console.log(
      ai.configured
        ? `[vault-api] AI ready · ${ai.provider} · ${ai.model}`
        : `[vault-api] AI off · set XAI_API_KEY in server/.env for Chat/Ask/Topics`
    );
  });
}

main().catch((e) => {
  console.error(e);
  if (
    String(e?.message || e).includes("whitelist") ||
    String(e?.message || e).includes("ServerSelection")
  ) {
    console.error(
      "\n[vault-api] Fix: MongoDB Atlas Network Access → Add IP Access List\n" +
        "  • Add your current public IP, or temporarily 0.0.0.0/0 for local dev\n" +
        "  • Or run local mongod and set MONGODB_URI=mongodb://127.0.0.1:27017/videosearch\n"
    );
  }
  process.exit(1);
});
