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
  verifyToken,
} from "./auth.js";
import {
  checkR2,
  dataUrlToBuffer,
  getObjectStream,
  isR2Configured,
  uploadJpeg,
} from "./r2.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP_DIR = path.resolve(__dirname, "../../webapp");
const WEBSITE_ASSETS = path.resolve(__dirname, "../../website/assets");

const PORT = Number(process.env.PORT || 8787);
const MONGODB_URI = process.env.MONGODB_URI || "";
const PUBLIC_API_BASE = (
  process.env.PUBLIC_API_BASE || `http://localhost:${PORT}`
).replace(/\/$/, "");

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "25mb" }));
app.use(morgan("dev"));

// Full vault UI (login + browse notes / shots)
app.use("/app", express.static(WEBAPP_DIR, { index: "index.html" }));
app.use("/app/assets", express.static(WEBSITE_ASSETS));

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

async function processScreenshots(userId, videoId, screenshots) {
  if (!Array.isArray(screenshots)) return { list: [], uploaded: 0, r2Errors: 0 };

  const existing = await VaultVideo.findOne({ userId, videoId }).lean();
  const prevById = new Map(
    (existing?.screenshots || []).map((s) => [s.id, s])
  );

  let uploaded = 0;
  let r2Errors = 0;
  const list = [];

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
        imageUrl = out.publicUrl || `${PUBLIC_API_BASE}${out.proxyPath}`;
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

function mapScreenshotOut(s, includeImages) {
  const imageUrl =
    s.imageUrl ||
    (s.dataUrl?.startsWith("data:") ? s.dataUrl : undefined) ||
    (s.r2Key
      ? `${PUBLIC_API_BASE}/api/media/${encodeURIComponent(s.r2Key)}`
      : undefined);

  return {
    id: s.id,
    videoTime: s.videoTime,
    note: s.note,
    width: s.width,
    height: s.height,
    createdAt: s.createdAt,
    imageUrl: includeImages
      ? imageUrl
      : s.imageUrl || (s.dataUrl ? "inline" : undefined),
    dataUrl:
      includeImages && s.dataUrl?.startsWith("data:") ? s.dataUrl : undefined,
    r2Key: s.r2Key,
  };
}

// ─── Vault (auth required) ──────────────────────────────────────────

app.post("/api/vault/sync", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      videoId,
      videoTitle = "",
      videoUrl = "",
      highlights = [],
      screenshots = [],
    } = req.body || {};

    if (!videoId || typeof videoId !== "string") {
      return res.status(400).json({ ok: false, message: "videoId required" });
    }

    const processed = await processScreenshots(userId, videoId, screenshots);

    const doc = await VaultVideo.findOneAndUpdate(
      { userId, videoId },
      {
        $set: {
          userId,
          videoId,
          videoTitle,
          videoUrl: videoUrl || `https://www.youtube.com/watch?v=${videoId}`,
          highlights: Array.isArray(highlights) ? highlights : [],
          screenshots: processed.list,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    await refreshUserStats(userId);

    const r2Note = isR2Configured()
      ? ` · R2 ${processed.uploaded} uploaded`
      : " · R2 off";

    res.json({
      ok: true,
      message: `Saved for ${userId} · ${doc.highlights.length} marks · ${doc.screenshots.length} shots${r2Note}`,
      videoId: doc.videoId,
      userId,
      uploadedToR2: processed.uploaded,
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
    const includeImages = req.query.images === "1";
    const rows = await VaultVideo.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      ok: true,
      rows: rows.map((r) => ({
        video_id: r.videoId,
        updated_at: r.updatedAt,
        payload: {
          videoId: r.videoId,
          videoTitle: r.videoTitle,
          videoUrl: r.videoUrl,
          highlights: r.highlights || [],
          screenshots: (r.screenshots || []).map((s) =>
            mapScreenshotOut(s, includeImages)
          ),
          updatedAt: new Date(r.updatedAt).getTime(),
        },
      })),
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "List failed",
      rows: [],
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
    res.json({
      ok: true,
      video_id: r.videoId,
      updated_at: r.updatedAt,
      payload: {
        videoId: r.videoId,
        videoTitle: r.videoTitle,
        videoUrl: r.videoUrl,
        highlights: r.highlights || [],
        screenshots: (r.screenshots || []).map((s) =>
          mapScreenshotOut(s, true)
        ),
        updatedAt: new Date(r.updatedAt).getTime(),
      },
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Get failed",
    });
  }
});

app.delete("/api/vault/:videoId", authMiddleware, async (req, res) => {
  try {
    await VaultVideo.deleteOne({
      userId: req.user.userId,
      videoId: req.params.videoId,
    });
    await refreshUserStats(req.user.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : "Delete failed",
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

async function main() {
  console.log("[vault-api] connecting MongoDB…");
  await mongoose.connect(MONGODB_URI);
  console.log("[vault-api] MongoDB connected");

  const r2 = await checkR2();
  if (r2.ok) console.log(`[vault-api] R2 ready · ${r2.bucket}`);
  else console.warn(`[vault-api] R2: ${r2.message}`);

  app.listen(PORT, () => {
    console.log(`[vault-api] http://localhost:${PORT}`);
    console.log(`[vault-api] web vault: http://localhost:${PORT}/app/`);
    console.log(`[vault-api] auth: POST /api/auth/register | /api/auth/login`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
