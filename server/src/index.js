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
import { User, VaultVideo, SharedCard } from "./models.js";
import {
  extractSourcesFromBio,
  isUsefulVaultSource,
  mergeSourceLinks,
  normalizeClientSource,
} from "./bioSources.js";
import crypto from "crypto";
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
import {
  checkLocalBackup,
  readLocalShot,
  saveLocalShot,
} from "./shotBackup.js";
import {
  checkFil,
  getFilObject,
  isFilConfigured,
  uploadFilJpeg,
} from "./filone.js";
import {
  getLlmConfig,
  serverChatCompletions,
  buildVaultSearchContext,
} from "./ai.js";

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
  const fil = await checkFil();
  const local = await checkLocalBackup();
  return {
    ok: true,
    service: "videosearch-vault-api",
    auth: true,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "down",
    r2: r2.ok
      ? { ok: true, bucket: r2.bucket }
      : { ok: false, message: r2.message || "not configured" },
    backup: {
      filone: fil.ok
        ? { ok: true, bucket: fil.bucket }
        : { ok: false, message: fil.message || "not configured" },
      local: local.ok
        ? { ok: true }
        : { ok: false, message: local.message },
    },
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
  if (!Array.isArray(screenshots)) {
    return { list: [], uploaded: 0, r2Errors: 0, filUploaded: 0, localSaved: 0 };
  }

  const existing = await VaultVideo.findOne({ userId, videoId }).lean();
  const prevById = new Map(
    (existing?.screenshots || []).map((s) => [s.id, s])
  );

  let uploaded = 0;
  let r2Errors = 0;
  let filUploaded = 0;
  let localSaved = 0;
  const list = [];
  const base = (apiBase || PUBLIC_API_BASE).replace(/\/$/, "");

  for (const raw of screenshots) {
    if (!raw?.id) continue;
    const prev = prevById.get(raw.id);
    let imageUrl = raw.imageUrl || prev?.imageUrl || "";
    let r2Key = raw.r2Key || prev?.r2Key || "";
    let filKey = raw.filKey || prev?.filKey || "";
    let backupPath = raw.backupPath || prev?.backupPath || "";
    let dataUrl = raw.dataUrl || prev?.dataUrl || "";

    if (isLocalImagePointer(imageUrl)) {
      imageUrl = isLocalImagePointer(prev?.imageUrl) ? "" : prev?.imageUrl || "";
    }

    if (dataUrl && dataUrl.startsWith("data:image")) {
      let buffer = null;
      try {
        buffer = dataUrlToBuffer(dataUrl);
      } catch (err) {
        console.warn("[vault-api] bad shot dataUrl", raw.id, err?.message);
      }

      if (buffer && buffer.length > 32) {
        try {
          const local = await saveLocalShot({
            userId,
            videoId,
            shotId: raw.id,
            buffer,
          });
          backupPath = local.path;
          localSaved += 1;
        } catch (err) {
          console.warn("[vault-api] local backup failed", raw.id, err?.message);
        }

        if (isFilConfigured()) {
          try {
            const out = await uploadFilJpeg({
              userId,
              videoId,
              shotId: raw.id,
              buffer,
            });
            filKey = out.key;
            filUploaded += 1;
          } catch (err) {
            console.warn("[vault-api] Fil One upload failed", raw.id, err?.message);
          }
        }

        if (isR2Configured()) {
          try {
            const out = await uploadJpeg({
              userId,
              videoId,
              shotId: raw.id,
              buffer,
            });
            await getObjectStream(out.key);
            r2Key = out.key;
            imageUrl = out.publicUrl || `${base}${out.proxyPath}`;
            uploaded += 1;
          } catch (err) {
            r2Errors += 1;
            console.warn("[vault-api] R2 upload failed", raw.id, err?.message);
          }
        }
      }
    } else if (!imageUrl && prev?.imageUrl && !isLocalImagePointer(prev.imageUrl)) {
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
      filKey: filKey || undefined,
      backupPath: backupPath || undefined,
      dataUrl: dataUrl && dataUrl.startsWith("data:") ? dataUrl : undefined,
    });
  }

  return { list, uploaded, r2Errors, filUploaded, localSaved };
}

/**
 * Lightweight screenshot DTO for list/sync responses.
 * NEVER embed full base64 dataUrls in list payloads (they hang Studio).
 * Images load on demand via /api/vault/shot/:videoId/:shotId (or R2 media).
 */
function isLocalImagePointer(url) {
  const s = String(url || "").toLowerCase();
  return (
    !s ||
    s.startsWith("account:") ||
    s.startsWith("blob:") ||
    s.startsWith("chrome-extension:")
  );
}

function isHttpImageUrl(url) {
  const s = String(url || "");
  return s.startsWith("http://") || s.startsWith("https://");
}

function mapScreenshotOut(
  s,
  videoId,
  _includeImages = false,
  apiBase = PUBLIC_API_BASE
) {
  const base = (apiBase || PUBLIC_API_BASE).replace(/\/$/, "");
  const raw = String(s.imageUrl || "");
  const external = isHttpImageUrl(raw) && !isLocalImagePointer(raw) ? raw : undefined;
  const mediaUrl = s.r2Key
    ? `${base}/api/media/${encodeURIComponent(s.r2Key)}`
    : undefined;
  // Lazy proxy always available — never expose account:// pointers to clients
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
    hasImage: Boolean(s.dataUrl || s.r2Key || external || s.id),
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

const metaCache = new Map();

/**
 * Resolve title + channel via YouTube oEmbed (no API key).
 * Returns { title, channelTitle, channelUrl } or null fields.
 */
async function resolveYouTubeMeta(videoId) {
  if (!videoId) return { title: null, channelTitle: null, channelUrl: null };
  if (metaCache.has(videoId)) return metaCache.get(videoId);

  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VideoSearchVault/1.0" },
      signal: AbortSignal.timeout?.(8000),
    });
    if (!res.ok) {
      const empty = { title: null, channelTitle: null, channelUrl: null };
      metaCache.set(videoId, empty);
      return empty;
    }
    const data = await res.json();
    const title = String(data?.title || "").trim();
    const channelTitle = String(data?.author_name || "").trim();
    const channelUrl = String(data?.author_url || "").trim();
    const out = {
      title: title && !isBareVideoId(title) ? title : null,
      channelTitle: channelTitle || null,
      channelUrl: channelUrl || null,
    };
    metaCache.set(videoId, out);
    return out;
  } catch (err) {
    console.warn("[vault-api] oEmbed meta failed", videoId, err?.message);
  }
  const empty = { title: null, channelTitle: null, channelUrl: null };
  metaCache.set(videoId, empty);
  return empty;
}

/** Resolve human title via YouTube oEmbed (no API key). */
async function resolveYouTubeTitle(videoId) {
  const meta = await resolveYouTubeMeta(videoId);
  return meta.title;
}

/** Backfill missing titles and channel names for a user's vault. */
async function backfillUserTitles(userId, limit = 40) {
  const rows = await VaultVideo.find({ userId })
    .select("videoId videoTitle channelTitle channelUrl")
    .limit(200)
    .lean();
  let fixed = 0;
  for (const r of rows) {
    if (fixed >= limit) break;
    const t = (r.videoTitle || "").trim();
    const ch = (r.channelTitle || "").trim();
    const needTitle = !t || t === r.videoId || isBareVideoId(t);
    const needChannel = !ch;
    if (!needTitle && !needChannel) continue;

    const meta = await resolveYouTubeMeta(r.videoId);
    if (!meta.title && !meta.channelTitle) continue;

    const $set = {};
    if (needTitle && meta.title) $set.videoTitle = meta.title;
    if (needChannel && meta.channelTitle) {
      $set.channelTitle = meta.channelTitle;
      if (meta.channelUrl) $set.channelUrl = meta.channelUrl;
    }
    if (!Object.keys($set).length) continue;

    await VaultVideo.updateOne({ userId, videoId: r.videoId }, { $set });
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
      channelTitle = "",
      channelUrl = "",
      highlights = [],
      screenshots = [],
      sourceLinks = [],
      /** Full description/bio (plain + markdown with hyperlinks) */
      bioText = undefined,
      bioMarkdown = undefined,
      /** when true, client list fully replaces (after explicit delete-all) */
      replaceHighlights = false,
      replaceScreenshots = false,
      replaceSourceLinks = false,
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

    // Description / bio source links — real materials only (not default Google/YT noise)
    const clientLinks = Array.isArray(sourceLinks)
      ? sourceLinks.map(normalizeClientSource).filter(Boolean)
      : [];
    // When bio is saved, always mine it for Drive/PPT/docs/PDF/… links
    const bioForExtract =
      typeof bioMarkdown === "string" || typeof bioText === "string"
        ? `${typeof bioMarkdown === "string" ? bioMarkdown : existing?.bioMarkdown || ""}\n${
            typeof bioText === "string" ? bioText : existing?.bioText || ""
          }`
        : "";
    const extractedFromBio = bioForExtract.trim()
      ? extractSourcesFromBio(
          typeof bioText === "string" ? bioText : existing?.bioText || "",
          typeof bioMarkdown === "string"
            ? bioMarkdown
            : existing?.bioMarkdown || ""
        )
      : [];
    const incomingLinks = mergeSourceLinks(clientLinks, extractedFromBio);
    const nextSourceLinks = replaceSourceLinks
      ? incomingLinks
      : mergeSourceLinks(
          (existing?.sourceLinks || []).filter((l) =>
            isUsefulVaultSource(l.url, l.kind)
          ),
          incomingLinks
        );

    let nextTitle =
      (videoTitle && String(videoTitle).trim()) ||
      existing?.videoTitle ||
      "";
    let nextChannel =
      (channelTitle && String(channelTitle).trim()) ||
      existing?.channelTitle ||
      "";
    let nextChannelUrl =
      (channelUrl && String(channelUrl).trim()) ||
      existing?.channelUrl ||
      "";

    const needMeta =
      !nextTitle ||
      nextTitle === videoId ||
      isBareVideoId(nextTitle) ||
      !nextChannel;
    if (needMeta) {
      const meta = await resolveYouTubeMeta(videoId);
      if (
        (!nextTitle || nextTitle === videoId || isBareVideoId(nextTitle)) &&
        meta.title
      ) {
        nextTitle = meta.title;
      }
      if (!nextChannel && meta.channelTitle) {
        nextChannel = meta.channelTitle;
      }
      if (!nextChannelUrl && meta.channelUrl) {
        nextChannelUrl = meta.channelUrl;
      }
    }
    if (!nextTitle) nextTitle = videoId;

    const setDoc = {
      userId,
      videoId,
      videoTitle: nextTitle,
      channelTitle: nextChannel || "",
      channelUrl: nextChannelUrl || "",
      videoUrl:
        videoUrl ||
        existing?.videoUrl ||
        `https://www.youtube.com/watch?v=${videoId}`,
      highlights: nextHighlights,
      screenshots: nextScreenshots,
      sourceLinks: nextSourceLinks,
      updatedAt: new Date(),
    };

    const viewedAt = nextLastViewedAt(existing, req.body || {});
    if (viewedAt) setDoc.lastViewedAt = viewedAt;

    // Full bio — only overwrite when client sends a non-empty string (or explicit empty with flag)
    if (typeof bioText === "string") {
      setDoc.bioText = String(bioText).slice(0, 100_000);
      setDoc.bioSyncedAt = new Date();
    }
    if (typeof bioMarkdown === "string") {
      setDoc.bioMarkdown = String(bioMarkdown).slice(0, 120_000);
      if (!setDoc.bioSyncedAt) setDoc.bioSyncedAt = new Date();
    }

    // Preserve library flags (saved / watch later / playlists) on note/shot sync
    const doc = await VaultVideo.findOneAndUpdate(
      { userId, videoId },
      { $set: setDoc },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await refreshUserStats(userId);

    const storedShots = processed.list.filter(
      (s) =>
        (s.dataUrl && String(s.dataUrl).startsWith("data:")) ||
        s.r2Key ||
        s.filKey ||
        s.backupPath
    ).length;
    const r2Note = processed.filUploaded
      ? ` · ${processed.filUploaded} backed up to Fil One`
      : processed.uploaded
        ? ` · ${processed.uploaded} in R2`
        : processed.localSaved
          ? ` · ${processed.localSaved} shots on disk`
          : storedShots
            ? ` · ${storedShots} shots stored`
            : processed.r2Errors
              ? " · shots saved in vault (cloud storage unavailable)"
              : "";
    const linkN = (doc.sourceLinks || []).length;
    const extractedN = extractedFromBio.length;
    const linkNote = linkN ? ` · ${linkN} sources` : "";
    const bioNote =
      typeof bioText === "string" && bioText.trim()
        ? extractedN
          ? ` · bio saved · ${extractedN} sources from description`
          : " · bio saved"
        : typeof bioMarkdown === "string" && bioMarkdown.trim()
          ? extractedN
            ? ` · bio saved · ${extractedN} sources from description`
            : " · bio saved"
          : "";

    res.json({
      ok: true,
      message: `Saved · ${doc.highlights.length} marks · ${doc.screenshots.length} shots${linkNote}${bioNote}${r2Note}`,
      videoId: doc.videoId,
      userId,
      uploadedToR2: processed.uploaded,
      highlightCount: doc.highlights.length,
      screenshotCount: doc.screenshots.length,
      sourceLinkCount: linkN,
      sourceLinks: (doc.sourceLinks || []).filter(
        (l) => l && l.url && isUsefulVaultSource(l.url, l.kind)
      ),
      hasBio: Boolean((doc.bioText || doc.bioMarkdown || "").trim()),
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

    // Non-blocking: fill missing titles + channel names (never delay first paint)
    setImmediate(() => {
      backfillUserTitles(userId, 40).catch((e) =>
        console.warn("[vault-api] title/channel backfill", e?.message)
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

const bioSourceBackfill = new Set();

function serializeSource(l) {
  return {
    id: l.id,
    url: l.url,
    label: l.label || "",
    kind: l.kind || "link",
    source: l.source || "description",
    createdAt: l.createdAt || null,
  };
}

/** Merge stored sources with links mined from the saved bio (backfills old videos). */
function sourcesForRow(r) {
  const existing = Array.isArray(r.sourceLinks)
    ? r.sourceLinks.filter((l) => l && l.url && isUsefulVaultSource(l.url, l.kind))
    : [];
  const fromBio = extractSourcesFromBio(r.bioText || "", r.bioMarkdown || "");
  if (!fromBio.length) return existing.map(serializeSource);
  const merged = mergeSourceLinks(existing, fromBio);
  if (
    r._id &&
    merged.length > existing.length &&
    !bioSourceBackfill.has(String(r._id))
  ) {
    bioSourceBackfill.add(String(r._id));
    VaultVideo.updateOne(
      { _id: r._id },
      { $set: { sourceLinks: merged } },
      { timestamps: false }
    ).catch(() => {});
  }
  return merged
    .filter((l) => l && l.url && isUsefulVaultSource(l.url, l.kind))
    .map(serializeSource);
}

function dateMs(v) {
  if (!v) return null;
  const n = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(n) ? n : null;
}

function mapVaultRow(r, includeImages = false, apiBase = PUBLIC_API_BASE) {
  const updatedMs = dateMs(r.updatedAt) ?? Date.now();
  const createdMs = dateMs(r.createdAt);
  const viewedMs = dateMs(r.lastViewedAt);
  return {
    video_id: r.videoId,
    // Always ISO string so clients parse consistently
    updated_at: new Date(updatedMs).toISOString(),
    created_at: createdMs ? new Date(createdMs).toISOString() : undefined,
    payload: {
      videoId: r.videoId,
      videoTitle: r.videoTitle,
      videoUrl: r.videoUrl,
      channelTitle: r.channelTitle || "",
      channelUrl: r.channelUrl || "",
      highlights: r.highlights || [],
      screenshots: (r.screenshots || []).map((s) =>
        mapScreenshotOut(s, r.videoId, includeImages, apiBase)
      ),
      sourceLinks: sourcesForRow(r),
      bioText: r.bioText || "",
      bioMarkdown: r.bioMarkdown || "",
      bioSyncedAt: r.bioSyncedAt
        ? new Date(r.bioSyncedAt).getTime()
        : null,
      saved: Boolean(r.saved),
      savedAt: r.savedAt ? new Date(r.savedAt).getTime() : null,
      watchLater: Boolean(r.watchLater),
      watchLaterAt: r.watchLaterAt
        ? new Date(r.watchLaterAt).getTime()
        : null,
      playlists: Array.isArray(r.playlists) ? r.playlists : [],
      updatedAt: updatedMs,
      lastViewedAt: viewedMs,
      createdAt: createdMs,
    },
  };
}

function parseViewedAt(raw) {
  if (raw == null || raw === "" || raw === false) return null;
  if (raw === true) return new Date();
  const n = typeof raw === "number" ? raw : new Date(raw).getTime();
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n < 1e12 ? n * 1000 : n);
}

/** Stamp lastViewedAt only on a real watch, throttled so syncs don't spam. */
function nextLastViewedAt(existing, body) {
  const watched =
    body?.watched === true ||
    body?.watched === "true" ||
    body?.lastViewedAt != null;
  if (!watched) return null;
  const incoming = parseViewedAt(body.lastViewedAt) || new Date();
  const prev = existing?.lastViewedAt
    ? new Date(existing.lastViewedAt).getTime()
    : 0;
  if (prev && incoming.getTime() - prev < 2 * 60 * 1000) return null;
  return incoming;
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

    const sendJpeg = (bytes, type = "image/jpeg") => {
      res.setHeader("Content-Type", type);
      return res.end(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
    };

    // 1) Local backup on this machine
    try {
      const local = await readLocalShot({ userId, videoId, shotId });
      if (local && local.length > 32) return sendJpeg(local);
    } catch (e) {
      console.warn("[vault-api] local shot read", shotId, e?.message);
    }

    // 2) Fil One backup — only when we already stored a key there
    if (shot.filKey && isFilConfigured()) {
      try {
        const out = await getFilObject(shot.filKey);
        if (out.Body?.transformToByteArray) {
          const bytes = await out.Body.transformToByteArray();
          return sendJpeg(bytes, out.ContentType || "image/jpeg");
        }
      } catch (e) {
        console.warn("[vault-api] shot Fil One miss", shotId, e?.message);
      }
    }

    // 3) Cloudflare R2
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

    // Inline dataUrl in Mongo (used when R2 is down or denied)
    if (shot.dataUrl && String(shot.dataUrl).startsWith("data:image")) {
      const m = String(shot.dataUrl).match(
        /^data:(image\/[\w+.-]+);base64,(.+)$/s
      );
      if (m) {
        res.setHeader("Content-Type", m[1]);
        return res.end(Buffer.from(m[2], "base64"));
      }
    }

    // Real HTTP image only — never redirect to account:// (extension-local pointer)
    if (isHttpImageUrl(shot.imageUrl) && !String(shot.imageUrl).includes("/api/media/")) {
      return res.redirect(302, shot.imageUrl);
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
app.post("/api/vault/view", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const videoId = String(req.body?.videoId || "").trim();
    if (!videoId) {
      return res.status(400).json({ ok: false, message: "videoId required" });
    }
    const existing = await VaultVideo.findOne({ userId, videoId }).lean();
    if (!existing) {
      return res.json({ ok: true, skipped: true, message: "Video not in vault" });
    }
    const viewedAt = nextLastViewedAt(existing, {
      watched: true,
      lastViewedAt: req.body?.lastViewedAt,
    });
    if (!viewedAt) {
      return res.json({
        ok: true,
        skipped: true,
        lastViewedAt: existing.lastViewedAt
          ? new Date(existing.lastViewedAt).getTime()
          : null,
      });
    }
    await VaultVideo.updateOne(
      { userId, videoId },
      { $set: { lastViewedAt: viewedAt } },
      { timestamps: false }
    );
    res.json({
      ok: true,
      videoId,
      lastViewedAt: viewedAt.getTime(),
    });
  } catch (err) {
    console.error("view error", err);
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "View update failed",
    });
  }
});

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
      typeof playlist === "string" ? playlist.trim().slice(0, 120) : "";

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
      let prefixHit = "";
      for (const r of rows) {
        for (const p of r.playlists || []) {
          const pk = String(p).toLowerCase();
          if (pk === key) return p;
          // Merge 80-char truncated imports with the full name
          if (
            pk.length >= 40 &&
            key.length >= 40 &&
            (pk.startsWith(key) || key.startsWith(pk))
          ) {
            if (String(p).length > prefixHit.length) prefixHit = p;
          }
        }
      }
      return prefixHit || name;
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
/**
 * Import a whole YouTube playlist into the vault.
 * Body: {
 *   playlistName: string,
 *   playlistId?: string,
 *   videos: Array<{ videoId, videoTitle?, channelTitle?, channelUrl?, videoUrl? }>
 * }
 * Upserts each video and adds playlistName to its playlists[].
 */
app.post("/api/vault/playlist/import", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const playlistName = String(req.body?.playlistName || "")
      .trim()
      .slice(0, 120);
    const playlistId = String(req.body?.playlistId || "").trim().slice(0, 80);
    const videos = Array.isArray(req.body?.videos) ? req.body.videos : [];

    if (!playlistName) {
      return res
        .status(400)
        .json({ ok: false, message: "playlistName required" });
    }
    if (!videos.length) {
      return res.status(400).json({ ok: false, message: "videos[] required" });
    }
    if (videos.length > 250) {
      return res
        .status(400)
        .json({ ok: false, message: "Max 250 videos per import" });
    }

    // Canonicalize against existing playlist casing
    let canonical = playlistName;
    const existingPl = await VaultVideo.find({
      userId,
      playlists: { $exists: true, $ne: [] },
    })
      .select("playlists")
      .limit(200)
      .lean();
    for (const r of existingPl) {
      for (const p of r.playlists || []) {
        if (String(p).toLowerCase() === playlistName.toLowerCase()) {
          canonical = p;
          break;
        }
      }
    }

    let imported = 0;
    let updated = 0;
    const now = new Date();
    const seen = new Set();

    for (const raw of videos) {
      const videoId = String(raw?.videoId || "").trim();
      if (!videoId || seen.has(videoId)) continue;
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) continue;
      seen.add(videoId);

      const videoTitle = String(raw?.videoTitle || videoId).slice(0, 500);
      const channelTitle = String(raw?.channelTitle || "").slice(0, 200);
      const channelUrl = String(raw?.channelUrl || "").slice(0, 400);
      const videoUrl =
        String(raw?.videoUrl || "").trim() ||
        `https://www.youtube.com/watch?v=${videoId}${
          playlistId ? `&list=${encodeURIComponent(playlistId)}` : ""
        }`;

      const existing = await VaultVideo.findOne({ userId, videoId }).lean();
      let playlists = Array.isArray(existing?.playlists)
        ? [...existing.playlists]
        : [];
      const has = playlists.some(
        (p) => String(p).toLowerCase() === canonical.toLowerCase()
      );
      if (!has) playlists.push(canonical);

      const $set = {
        userId,
        videoId,
        videoUrl: existing?.videoUrl || videoUrl,
        playlists,
        saved: true,
        savedAt: existing?.savedAt || now,
      };
      if (!existing) $set.updatedAt = now;

      // Don't wipe good titles/channels
      const bareTitle =
        !existing?.videoTitle ||
        existing.videoTitle === videoId ||
        isBareVideoId(existing.videoTitle);
      if (bareTitle && videoTitle && videoTitle !== videoId) {
        $set.videoTitle = videoTitle;
      } else if (!existing?.videoTitle) {
        $set.videoTitle = videoTitle || videoId;
      }

      if (!existing?.channelTitle && channelTitle) {
        $set.channelTitle = channelTitle;
        if (channelUrl) $set.channelUrl = channelUrl;
      }

      await VaultVideo.findOneAndUpdate(
        { userId, videoId },
        {
          $set,
          $setOnInsert: {
            highlights: [],
            screenshots: [],
            watchLater: false,
            watchLaterAt: null,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          timestamps: !existing,
        }
      );

      if (existing) updated += 1;
      else imported += 1;
    }

    await refreshUserStats(userId);

    res.json({
      ok: true,
      playlistName: canonical,
      playlistId: playlistId || null,
      imported,
      updated,
      total: imported + updated,
      message: `Saved playlist “${canonical}” · ${imported + updated} videos`,
    });
  } catch (err) {
    console.error("[vault-api] playlist import", err);
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Playlist import failed",
    });
  }
});

app.get("/api/library/playlists", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await VaultVideo.find({
      userId,
      playlists: { $exists: true, $ne: [] },
    })
      .select("playlists videoId videoTitle")
      .lean();

    // Merge case-insensitive + truncated-name duplicates under the longest title
    const counts = new Map(); // lower -> { name, count, videoIds }
    const attach = (name, videoId) => {
      const key = String(name).toLowerCase();
      let matchKey = key;
      for (const [k, cur] of counts) {
        if (
          k === key ||
          (k.length >= 40 &&
            key.length >= 40 &&
            (k.startsWith(key) || key.startsWith(k)))
        ) {
          matchKey = k.length >= key.length ? k : key;
          if (matchKey !== k) {
            counts.set(matchKey, cur);
            if (matchKey !== k) counts.delete(k);
          }
          break;
        }
      }
      const cur = counts.get(matchKey) || {
        name,
        count: 0,
        videoIds: [],
      };
      if (String(name).length > String(cur.name).length) cur.name = name;
      cur.count += 1;
      if (videoId) cur.videoIds.push(videoId);
      counts.set(matchKey, cur);
    };
    for (const r of rows) {
      for (const name of r.playlists || []) {
        if (!name) continue;
        attach(name, r.videoId);
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

/**
 * Create a public share link for a video card (notes + marks + shot captions).
 * POST /api/vault/:videoId/share
 * Body optional: { expiresInDays?: number }
 */
app.post("/api/vault/:videoId/share", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const videoId = String(req.params.videoId || "");
    if (!videoId) {
      return res.status(400).json({ ok: false, message: "videoId required" });
    }

    const doc = await VaultVideo.findOne({ userId, videoId }).lean();
    if (!doc) {
      return res.status(404).json({ ok: false, message: "Video not in vault" });
    }

    const highlights = (doc.highlights || []).map((h) => ({
      id: h.id,
      startTime: h.startTime,
      endTime: h.endTime,
      note: h.note || "",
      color: h.color || "#ef4444",
    }));
    const screenshots = (doc.screenshots || []).map((s) => ({
      id: s.id,
      videoTime: s.videoTime,
      note: s.note || "",
    }));
    const sourceLinks = sourcesForRow(doc).slice(0, 40);
    const noteCount =
      highlights.filter((h) => (h.note || "").trim()).length +
      screenshots.filter((s) => (s.note || "").trim()).length;

    const days = Number(req.body?.expiresInDays);
    const expiresAt =
      Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 86400_000)
        : null;

    const token = crypto.randomBytes(18).toString("hex");
    const sharedBy =
      req.user.displayName || req.user.email || "VideoSearch user";

    await SharedCard.create({
      token,
      userId,
      videoId,
      expiresAt,
      snapshot: {
        videoId: doc.videoId,
        videoTitle: doc.videoTitle || doc.videoId,
        videoUrl:
          doc.videoUrl || `https://www.youtube.com/watch?v=${doc.videoId}`,
        channelTitle: doc.channelTitle || "",
        channelUrl: doc.channelUrl || "",
        sharedBy,
        highlights,
        screenshots,
        sourceLinks,
        markCount: highlights.length,
        shotCount: screenshots.length,
        noteCount,
        sourceCount: sourceLinks.length,
      },
    });

    const base = apiBaseFromReq(req);
    const sharePath = `/app/share/${token}`;
    const shareUrl = `${base}${sharePath}`;

    res.json({
      ok: true,
      token,
      shareUrl,
      sharePath,
      expiresAt,
      message: "Share link created",
      preview: {
        title: doc.videoTitle || doc.videoId,
        channelTitle: doc.channelTitle || "",
        markCount: highlights.length,
        shotCount: screenshots.length,
        noteCount,
        sourceCount: sourceLinks.length,
      },
    });
  } catch (err) {
    console.error("[vault-api] share create", err);
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Share failed",
    });
  }
});

/** Public: load a shared video card snapshot (no auth). */
app.get("/api/share/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token || token.length < 16) {
      return res.status(400).json({ ok: false, message: "Invalid share link" });
    }

    const card = await SharedCard.findOne({ token }).lean();
    if (!card) {
      return res.status(404).json({ ok: false, message: "Share not found" });
    }
    if (card.expiresAt && new Date(card.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ ok: false, message: "Share link expired" });
    }

    // Best-effort view counter
    SharedCard.updateOne({ token }, { $inc: { viewCount: 1 } }).catch(() => {});

    res.json({
      ok: true,
      token: card.token,
      createdAt: card.createdAt,
      expiresAt: card.expiresAt,
      snapshot: card.snapshot,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Share load failed",
    });
  }
});

/**
 * AI Search over the signed-in user's vault (Mistral / configured LLM).
 * Body: { query: string }
 * Returns natural-language answer + structured citations.
 */
app.post("/api/vault/ai-search", authMiddleware, async (req, res) => {
  try {
    const query = String(req.body?.query || "").trim();
    if (!query || query.length < 2) {
      return res.status(400).json({ ok: false, message: "query required" });
    }
    if (query.length > 500) {
      return res.status(400).json({ ok: false, message: "query too long" });
    }

    const rows = await VaultVideo.find({ userId: req.user.userId })
      .select(
        "videoId videoTitle channelTitle channelUrl highlights screenshots updatedAt"
      )
      .sort({ updatedAt: -1 })
      .limit(80)
      .lean();

    // Slim highlights/screenshots (no dataUrl)
    const slim = rows.map((r) => ({
      videoId: r.videoId,
      videoTitle: r.videoTitle,
      channelTitle: r.channelTitle,
      highlights: (r.highlights || []).map((h) => ({
        id: h.id,
        startTime: h.startTime,
        note: h.note,
      })),
      screenshots: (r.screenshots || []).map((s) => ({
        id: s.id,
        videoTime: s.videoTime,
        note: s.note,
      })),
    }));

    const context = buildVaultSearchContext(slim);
    if (!context.trim()) {
      return res.json({
        ok: true,
        answer:
          "Your vault is empty. Mark moments or capture frames on YouTube first, then ask again.",
        citations: [],
        provider: getLlmConfig().provider,
        model: getLlmConfig().model,
      });
    }

    const system = `You are VideoSearch Studio AI. Answer ONLY from the user's vault notes/marks/shots/titles below.
Rules:
- Be concise and practical.
- Prefer concrete citations with video id and timestamp in seconds.
- If the vault does not contain the answer, say so clearly.
- Output valid JSON only (no markdown fences) with this shape:
{
  "answer": "string",
  "citations": [
    { "videoId": "string", "title": "string", "time": 0, "kind": "video|mark|shot", "snippet": "string", "why": "string" }
  ]
}
Max 8 citations. time is seconds on the video (0 if whole video).`;

    const result = await serverChatCompletions({
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `USER QUESTION:\n${query}\n\nVAULT DATA:\n${context}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 1100,
    });

    let parsed = null;
    const raw = result.content || "";
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      parsed = { answer: raw, citations: [] };
    }

    const citations = Array.isArray(parsed.citations)
      ? parsed.citations
          .filter((c) => c && c.videoId)
          .slice(0, 8)
          .map((c) => ({
            videoId: String(c.videoId),
            title: String(c.title || c.videoId),
            time: Math.max(0, Math.floor(Number(c.time) || 0)),
            kind: ["video", "mark", "shot"].includes(c.kind) ? c.kind : "mark",
            snippet: String(c.snippet || c.why || "").slice(0, 400),
            why: String(c.why || "").slice(0, 200),
          }))
      : [];

    res.json({
      ok: true,
      answer: String(parsed.answer || raw).slice(0, 4000),
      citations,
      provider: result.provider,
      model: result.model,
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
    console.error("[vault-api] ai-search error", err);
    res.status(err?.status && err.status < 600 ? err.status : 502).json({
      ok: false,
      message: err instanceof Error ? err.message : "AI search failed",
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
