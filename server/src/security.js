/**
 * Shared vault security: headers, CORS, rate limits, validators.
 * No extra npm deps — keep the LAN vault easy to run.
 */

import crypto from "crypto";

export const IS_PROD = process.env.NODE_ENV === "production";

const WEAK_SECRETS = new Set([
  "",
  "change-me-to-a-long-random-string",
  "dev-insecure-secret",
  "secret",
  "jwt_secret",
]);

export function assertJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (secret.length >= 32 && !WEAK_SECRETS.has(secret)) return secret;
  if (IS_PROD) {
    console.error(
      "[vault-api] JWT_SECRET is missing or weak. Set a 32+ character secret in server/.env"
    );
    process.exit(1);
  }
  if (!assertJwtSecret._warned) {
    console.warn(
      "[vault-api] JWT_SECRET is weak — fine for local dev, never expose this host"
    );
    assertJwtSecret._warned = true;
  }
  return secret || "dev-insecure-secret";
}

export function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw) {
  const email = String(raw || "").trim().toLowerCase();
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function sanitizeDisplayName(raw) {
  return String(raw || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 80);
}

export function assertPassword(raw, { label = "Password" } = {}) {
  const password = String(raw || "");
  if (password.length < 10) {
    const e = new Error(`${label} must be at least 10 characters`);
    e.status = 400;
    throw e;
  }
  if (password.length > 128) {
    const e = new Error(`${label} is too long`);
    e.status = 400;
    throw e;
  }
  if (password.trim() !== password) {
    const e = new Error(`${label} cannot start or end with spaces`);
    e.status = 400;
    throw e;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    const e = new Error(`${label} needs letters and a number`);
    e.status = 400;
    throw e;
  }
  return password;
}

export function isVideoId(raw) {
  return /^[A-Za-z0-9_-]{6,20}$/.test(String(raw || "").trim());
}

export function requireVideoId(raw) {
  const id = String(raw || "").trim();
  if (!isVideoId(id)) {
    const e = new Error("Invalid video id");
    e.status = 400;
    throw e;
  }
  return id;
}

export function safeShotId(raw) {
  const id = String(raw || "").trim().slice(0, 80);
  if (!/^[A-Za-z0-9._:-]{4,80}$/.test(id)) return "";
  return id;
}

export function clientError(err, fallback = "Request failed") {
  if (err && typeof err.status === "number" && err.status < 500) {
    return {
      status: err.status,
      message: err.message || fallback,
    };
  }
  return { status: 500, message: fallback };
}

/** Express CORS: extension + localhost + LAN + CORS_ORIGINS */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin.startsWith("chrome-extension://")) return true;
  if (origin.startsWith("moz-extension://")) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (/^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(origin)) {
    return true;
  }
  const extra = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

export function corsOrigin(origin, cb) {
  if (isAllowedOrigin(origin)) return cb(null, origin || true);
  cb(null, false);
}

export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  res.setHeader("X-DNS-Prefetch-Control", "off");
  if (req.path.startsWith("/api/auth")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }
  next();
}

const buckets = new Map();

function pruneBuckets(now) {
  if (buckets.size < 4000) return;
  for (const [k, b] of buckets) {
    if (now > b.reset) buckets.delete(k);
  }
}

/**
 * In-memory rate limit. Fine for a single vault process.
 * keyFn(req) → bucket id
 */
export function rateLimit({ windowMs, max, keyFn, message }) {
  return (req, res, next) => {
    const now = Date.now();
    pruneBuckets(now);
    const id = keyFn(req);
    let b = buckets.get(id);
    if (!b || now > b.reset) {
      b = { n: 0, reset: now + windowMs };
    }
    b.n += 1;
    buckets.set(id, b);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - b.n)));
    if (b.n > max) {
      const retry = Math.ceil((b.reset - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(1, retry)));
      return res.status(429).json({
        ok: false,
        message: message || "Too many attempts. Try again later.",
      });
    }
    next();
  };
}

export function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export function authRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    keyFn: (req) =>
      `auth:${clientIp(req)}:${String(req.body?.email || "").toLowerCase()}`,
    message: "Too many sign-in attempts. Wait a few minutes.",
  });
}

export function apiRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    keyFn: (req) => `api:${clientIp(req)}`,
    message: "Too many requests. Slow down.",
  });
}

export function shareRateLimit() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyFn: (req) => `share:${req.user?.userId || clientIp(req)}`,
    message: "Too many share links. Try later.",
  });
}

export function aiRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyFn: (req) => `ai:${req.user?.userId || clientIp(req)}`,
    message: "AI rate limit reached. Try again in a minute.",
  });
}

export const MAX_SYNC_SHOTS = 40;
export const MAX_SHOT_BYTES = 8 * 1024 * 1024;

export function generateResetCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function newUserId() {
  return `u_${crypto.randomBytes(12).toString("hex")}`;
}
