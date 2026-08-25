/**
 * Dual-write Mongo vault rows to Supabase (service role).
 * Never called from the browser. Failures are logged and do not block Mongo.
 */

const DEFAULT_URL = "https://xirnfdraklgdtleftcag.supabase.co";

function supabaseUrl() {
  return String(process.env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, "");
}

function serviceKey() {
  return String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      ""
  ).trim();
}

export function supabaseConfigured() {
  return Boolean(serviceKey());
}

function restHeaders(extra = {}) {
  const key = serviceKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function eq(value) {
  return encodeURIComponent(String(value ?? ""));
}

function toIso(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function lean(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === "function") return doc.toObject();
  return doc;
}

async function rest(method, path, { body, prefer } = {}) {
  const key = serviceKey();
  if (!key) return { skipped: true };
  const url = `${supabaseUrl()}/rest/v1/${path}`;
  const headers = restHeaders(
    prefer ? { Prefer: prefer } : { Prefer: "return=minimal" }
  );
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(
      `supabase ${method} ${path.split("?")[0]} ${res.status}: ${text.slice(0, 400)}`
    );
    err.status = res.status;
    err.body = text;
    throw err;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function supabaseStatus() {
  if (!serviceKey()) {
    return { ok: false, message: "not configured" };
  }
  try {
    await rest("GET", "vault_videos?select=video_id&limit=1", {
      prefer: "count=exact",
    });
    return { ok: true, project: "xirnfdraklgdtleftcag" };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message.slice(0, 180) : "unreachable",
    };
  }
}

export function mapUser(doc) {
  const u = lean(doc) || {};
  const userId = String(u.userId || "");
  if (!userId) return null;
  return {
    user_id: userId,
    email: u.email ? String(u.email).toLowerCase() : null,
    display_name: String(u.displayName || ""),
    google_id: String(u.googleId || ""),
    auth_provider: String(u.authProvider || "password"),
    last_seen_at: toIso(u.lastSeenAt),
    token_version: Number(u.tokenVersion || 0),
    video_count: Number(u.videoCount || 0),
    highlight_count: Number(u.highlightCount || 0),
    screenshot_count: Number(u.screenshotCount || 0),
    mongo_id: u._id ? String(u._id) : null,
    created_at: toIso(u.createdAt) || new Date().toISOString(),
    updated_at: toIso(u.updatedAt) || new Date().toISOString(),
  };
}

export function mapVideo(doc) {
  const v = lean(doc) || {};
  const userId = String(v.userId || "");
  const videoId = String(v.videoId || "");
  if (!userId || !videoId) return null;
  return {
    user_id: userId,
    video_id: videoId,
    video_title: String(v.videoTitle || ""),
    video_url: String(v.videoUrl || ""),
    channel_title: String(v.channelTitle || ""),
    channel_url: String(v.channelUrl || ""),
    bio_text: String(v.bioText || ""),
    bio_markdown: String(v.bioMarkdown || ""),
    bio_synced_at: toIso(v.bioSyncedAt),
    saved: Boolean(v.saved),
    saved_at: toIso(v.savedAt),
    watch_later: Boolean(v.watchLater),
    watch_later_at: toIso(v.watchLaterAt),
    playlists: Array.isArray(v.playlists)
      ? v.playlists.map((p) => String(p)).filter(Boolean)
      : [],
    last_viewed_at: toIso(v.lastViewedAt),
    mongo_id: v._id ? String(v._id) : null,
    created_at: toIso(v.createdAt) || new Date().toISOString(),
    updated_at: toIso(v.updatedAt) || new Date().toISOString(),
  };
}

export function mapHighlights(doc) {
  const v = lean(doc) || {};
  const userId = String(v.userId || "");
  const videoId = String(v.videoId || "");
  return (v.highlights || [])
    .filter((h) => h && h.id)
    .map((h) => ({
      user_id: userId,
      video_id: videoId,
      highlight_id: String(h.id),
      start_time: Number.isFinite(Number(h.startTime)) ? Number(h.startTime) : null,
      end_time: Number.isFinite(Number(h.endTime)) ? Number(h.endTime) : null,
      note: String(h.note || ""),
      color: String(h.color || "#ef4444"),
      screenshot_id: h.screenshotId ? String(h.screenshotId) : null,
      created_at: toIso(h.createdAt),
      updated_at: toIso(h.updatedAt),
    }));
}

export function mapScreenshots(doc) {
  const v = lean(doc) || {};
  const userId = String(v.userId || "");
  const videoId = String(v.videoId || "");
  return (v.screenshots || [])
    .filter((s) => s && s.id)
    .map((s) => ({
      user_id: userId,
      video_id: videoId,
      screenshot_id: String(s.id),
      video_time: Number.isFinite(Number(s.videoTime)) ? Number(s.videoTime) : null,
      note: String(s.note || ""),
      width: Number.isFinite(Number(s.width)) ? Number(s.width) : null,
      height: Number.isFinite(Number(s.height)) ? Number(s.height) : null,
      image_url: s.imageUrl ? String(s.imageUrl) : null,
      r2_key: s.r2Key ? String(s.r2Key) : null,
      supabase_key: s.supabaseKey ? String(s.supabaseKey) : null,
      data_url: s.dataUrl ? String(s.dataUrl) : null,
      backup_path: s.backupPath ? String(s.backupPath) : null,
      fil_key: s.filKey ? String(s.filKey) : null,
      cf_image_id: s.cfImageId ? String(s.cfImageId) : null,
      cf_image_url: s.cfImageUrl ? String(s.cfImageUrl) : null,
      created_at: toIso(s.createdAt),
    }));
}

export function mapSourceLinks(doc) {
  const v = lean(doc) || {};
  const userId = String(v.userId || "");
  const videoId = String(v.videoId || "");
  return (v.sourceLinks || [])
    .filter((l) => l && l.id && l.url)
    .map((l) => ({
      user_id: userId,
      video_id: videoId,
      link_id: String(l.id),
      url: String(l.url),
      label: String(l.label || ""),
      kind: String(l.kind || "link"),
      source: String(l.source || "description"),
      start_time: Number.isFinite(Number(l.startTime)) ? Number(l.startTime) : null,
      created_at: toIso(l.createdAt),
    }));
}

export function mapSharedCard(doc) {
  const c = lean(doc) || {};
  const token = String(c.token || "");
  if (!token) return null;
  return {
    token,
    user_id: String(c.userId || ""),
    video_id: String(c.videoId || ""),
    snapshot: c.snapshot && typeof c.snapshot === "object" ? c.snapshot : {},
    view_count: Number(c.viewCount || 0),
    expires_at: toIso(c.expiresAt),
    mongo_id: c._id ? String(c._id) : null,
    created_at: toIso(c.createdAt) || new Date().toISOString(),
    updated_at: toIso(c.updatedAt) || new Date().toISOString(),
  };
}

async function replaceChildren(table, userId, videoId, rows, idCol) {
  await rest(
    "DELETE",
    `${table}?user_id=eq.${eq(userId)}&video_id=eq.${eq(videoId)}`
  );
  if (!rows.length) return;
  await rest("POST", table, {
    body: rows,
    prefer: "return=minimal,resolution=merge-duplicates",
  });
  void idCol;
}

export async function upsertUser(doc) {
  if (!supabaseConfigured()) return { skipped: true };
  const row = mapUser(doc);
  if (!row) return { skipped: true };
  await rest("POST", "vault_users", {
    body: row,
    prefer: "return=minimal,resolution=merge-duplicates",
  });
  return { ok: true, userId: row.user_id };
}

export async function logAuthEvent(userId, event, provider = "password") {
  if (!supabaseConfigured()) return { skipped: true };
  const id = String(userId || "");
  if (!id) return { skipped: true };
  await rest("POST", "vault_auth_events", {
    body: {
      user_id: id,
      event: String(event || "login"),
      provider: String(provider || "password"),
    },
    prefer: "return=minimal",
  });
  return { ok: true };
}

export async function upsertVideo(doc) {
  if (!supabaseConfigured()) return { skipped: true };
  const row = mapVideo(doc);
  if (!row) return { skipped: true };
  await rest("POST", "vault_videos", {
    body: row,
    prefer: "return=minimal,resolution=merge-duplicates",
  });
  await replaceChildren(
    "vault_highlights",
    row.user_id,
    row.video_id,
    mapHighlights(doc),
    "highlight_id"
  );
  await replaceChildren(
    "vault_screenshots",
    row.user_id,
    row.video_id,
    mapScreenshots(doc),
    "screenshot_id"
  );
  await replaceChildren(
    "vault_source_links",
    row.user_id,
    row.video_id,
    mapSourceLinks(doc),
    "link_id"
  );
  return { ok: true, userId: row.user_id, videoId: row.video_id };
}

export async function deleteVideo(userId, videoId) {
  if (!supabaseConfigured()) return { skipped: true };
  if (!userId || !videoId) return { skipped: true };
  await rest(
    "DELETE",
    `vault_videos?user_id=eq.${eq(userId)}&video_id=eq.${eq(videoId)}`
  );
  return { ok: true };
}

export async function upsertSharedCard(doc) {
  if (!supabaseConfigured()) return { skipped: true };
  const row = mapSharedCard(doc);
  if (!row) return { skipped: true };
  await rest("POST", "vault_shared_cards", {
    body: row,
    prefer: "return=minimal,resolution=merge-duplicates",
  });
  return { ok: true, token: row.token };
}

export async function countVaultTables() {
  if (!supabaseConfigured()) return { skipped: true };
  const names = [
    "vault_users",
    "vault_videos",
    "vault_highlights",
    "vault_screenshots",
    "vault_source_links",
    "vault_shared_cards",
    "vault_auth_events",
  ];
  const out = {};
  for (const name of names) {
    const url = `${supabaseUrl()}/rest/v1/${name}?select=*&limit=0`;
    const res = await fetch(url, {
      method: "HEAD",
      headers: restHeaders({ Prefer: "count=exact" }),
    });
    const range = res.headers.get("content-range") || "";
    const total = range.split("/")[1];
    out[name] = total === "*" || total == null ? null : Number(total);
    if (!res.ok && out[name] == null) {
      out[name] = { error: res.status };
    }
  }
  return out;
}

export async function applySchemaViaManagement(sql) {
  const token = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
  if (!token) return { skipped: true, reason: "no SUPABASE_ACCESS_TOKEN" };
  const res = await fetch(
    "https://api.supabase.com/v1/projects/xirnfdraklgdtleftcag/database/query",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`schema apply ${res.status}: ${text.slice(0, 400)}`);
  }
  return { ok: true };
}

export async function pushAllFromMongo({ users, videos, shares }) {
  const summary = {
    users: 0,
    videos: 0,
    highlights: 0,
    screenshots: 0,
    sourceLinks: 0,
    shares: 0,
    errors: [],
  };
  for (const u of users || []) {
    try {
      await upsertUser(u);
      summary.users += 1;
    } catch (err) {
      summary.errors.push(`user ${u.userId}: ${err.message}`);
    }
  }
  for (const v of videos || []) {
    try {
      await upsertVideo(v);
      summary.videos += 1;
      summary.highlights += (v.highlights || []).length;
      summary.screenshots += (v.screenshots || []).length;
      summary.sourceLinks += (v.sourceLinks || []).length;
    } catch (err) {
      summary.errors.push(`video ${v.userId}/${v.videoId}: ${err.message}`);
    }
  }
  for (const s of shares || []) {
    try {
      await upsertSharedCard(s);
      summary.shares += 1;
    } catch (err) {
      summary.errors.push(`share ${s.token}: ${err.message}`);
    }
  }
  return summary;
}

const inflight = new Map();

function enqueue(kind, key, task) {
  const id = `${kind}:${key}`;
  const n = (inflight.get(id) || 0) + 1;
  inflight.set(id, n);
  Promise.resolve()
    .then(async () => {
      if (inflight.get(id) !== n) return;
      await task();
    })
    .catch((err) => {
      console.warn(
        `[vault-api] supabase ${kind} failed:`,
        err instanceof Error ? err.message.slice(0, 180) : err
      );
    });
}

function queryUserId(q = {}) {
  return q.userId || q.user_id || null;
}

function queryVideoId(q = {}) {
  return q.videoId || q.video_id || null;
}

let hooked = false;

export function attachSupabaseMirrors({ User, VaultVideo, SharedCard }) {
  if (hooked) return;
  hooked = true;

  User.schema.post("save", function (doc) {
    enqueue("user", doc?.userId || "unknown", () => upsertUser(doc));
  });
  User.schema.post("findOneAndUpdate", async function (doc) {
    const fresh = (await this.model.findOne(this.getQuery()).lean()) || doc;
    if (fresh) enqueue("user", fresh.userId, () => upsertUser(fresh));
  });
  User.schema.post("updateOne", async function () {
    const Model = this.model;
    const doc = await Model.findOne(this.getQuery()).lean();
    if (doc) enqueue("user", doc.userId, () => upsertUser(doc));
  });

  VaultVideo.schema.post("save", function (doc) {
    enqueue(
      "video",
      `${doc?.userId}:${doc?.videoId}`,
      () => upsertVideo(doc)
    );
  });
  VaultVideo.schema.post("findOneAndUpdate", async function (doc) {
    const fresh = (await this.model.findOne(this.getQuery()).lean()) || doc;
    if (!fresh) return;
    enqueue("video", `${fresh.userId}:${fresh.videoId}`, () => upsertVideo(fresh));
  });
  VaultVideo.schema.post("updateOne", async function () {
    const Model = this.model;
    const q = this.getQuery();
    const doc = await Model.findOne(q).lean();
    if (doc) {
      enqueue("video", `${doc.userId}:${doc.videoId}`, () => upsertVideo(doc));
    }
  });
  VaultVideo.schema.post(
    "deleteOne",
    { document: false, query: true },
    async function () {
      const q = this.getQuery() || {};
      const userId = queryUserId(q);
      const videoId = queryVideoId(q);
      if (userId && videoId) {
        enqueue("delete-video", `${userId}:${videoId}`, () =>
          deleteVideo(userId, videoId)
        );
        return;
      }
      const remaining = await this.model.findOne(q).lean();
      if (!remaining && userId && q.videoId) {
        enqueue("delete-video", `${userId}:${q.videoId}`, () =>
          deleteVideo(userId, q.videoId)
        );
      }
    }
  );

  SharedCard.schema.post("save", function (doc) {
    enqueue("share", doc?.token || "unknown", () => upsertSharedCard(doc));
  });
  SharedCard.schema.post("findOneAndUpdate", function (doc) {
    if (doc) enqueue("share", doc.token, () => upsertSharedCard(doc));
  });
  SharedCard.schema.post("updateOne", async function () {
    const doc = await this.model.findOne(this.getQuery()).lean();
    if (doc) enqueue("share", doc.token, () => upsertSharedCard(doc));
  });
}
