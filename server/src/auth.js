import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "./models.js";
import {
  assertJwtSecret,
  assertPassword,
  generateResetCode,
  normalizeEmail,
  newUserId,
  sanitizeDisplayName,
  timingSafeEqualString,
} from "./security.js";

const JWT_DAYS = Number(process.env.JWT_DAYS || 14);
const JWT_ISS = "videosearch-vault";
const JWT_AUD = "videosearch";
const BCRYPT_ROUNDS = 12;
const RESET_TTL_MS = 15 * 60 * 1000;
const GENERIC_AUTH = "Invalid email or password";
const GENERIC_RESET =
  "If that email exists, a reset code was issued. On a self-hosted vault, check the server terminal.";

function jwtSecret() {
  return assertJwtSecret();
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.userId,
      email: user.email,
      name: user.displayName || user.email,
      tv: user.tokenVersion || 0,
    },
    jwtSecret(),
    {
      algorithm: "HS256",
      expiresIn: `${JWT_DAYS}d`,
      issuer: JWT_ISS,
      audience: JWT_AUD,
    }
  );
}

export function verifyToken(token) {
  return jwt.verify(String(token || ""), jwtSecret(), {
    algorithms: ["HS256"],
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });
}

const DUMMY_HASH = bcrypt.hashSync("timing-pad", 8);

async function dummyCompare() {
  await bcrypt.compare("timing-pad", DUMMY_HASH);
}

export async function registerUser({ email, password, displayName }) {
  const clean = normalizeEmail(email);
  if (!clean) {
    const e = new Error("Valid email required");
    e.status = 400;
    throw e;
  }
  const pass = assertPassword(password);

  const existing = await User.findOne({ email: clean });
  if (existing) {
    const e = new Error("Email already registered");
    e.status = 409;
    throw e;
  }

  const user = await User.create({
    userId: newUserId(),
    email: clean,
    passwordHash: await bcrypt.hash(pass, BCRYPT_ROUNDS),
    displayName: sanitizeDisplayName(displayName) || clean.split("@")[0],
    lastSeenAt: new Date(),
    tokenVersion: 0,
  });

  return { user: publicUser(user), token: signToken(user) };
}

export async function loginUser({ email, password }) {
  const clean = normalizeEmail(email);
  const pass = String(password || "");
  if (!clean || !pass) {
    const e = new Error(GENERIC_AUTH);
    e.status = 401;
    throw e;
  }

  const user = await User.findOne({ email: clean });
  if (!user) {
    await dummyCompare();
    const e = new Error(GENERIC_AUTH);
    e.status = 401;
    throw e;
  }

  const ok = await bcrypt.compare(pass, user.passwordHash);
  if (!ok) {
    const e = new Error(GENERIC_AUTH);
    e.status = 401;
    throw e;
  }

  user.lastSeenAt = new Date();
  await user.save();
  return { user: publicUser(user), token: signToken(user) };
}

/**
 * Self-hosted forgot-password: never confirms the email exists.
 * The one-time code is printed on the vault server console only.
 */
export async function requestPasswordReset({ email }) {
  const clean = normalizeEmail(email);
  if (!clean) return { ok: true, message: GENERIC_RESET };

  const user = await User.findOne({ email: clean });
  if (!user) return { ok: true, message: GENERIC_RESET };

  const code = generateResetCode();
  user.passwordReset = {
    hash: await bcrypt.hash(code, 8),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
    attempts: 0,
  };
  await user.save();

  console.info(
    `[vault-api] Password reset code for ${clean}: ${code} (valid 15 minutes)`
  );
  return { ok: true, message: GENERIC_RESET };
}

export async function resetPasswordWithCode({ email, code, password }) {
  const clean = normalizeEmail(email);
  const rawCode = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!clean || rawCode.length < 6) {
    const e = new Error("Email and reset code are required");
    e.status = 400;
    throw e;
  }
  const pass = assertPassword(password, { label: "New password" });

  const user = await User.findOne({ email: clean });
  const fail = () => {
    const e = new Error("Invalid or expired reset code");
    e.status = 401;
    throw e;
  };
  if (!user?.passwordReset?.hash || !user.passwordReset.expiresAt) {
    await dummyCompare();
    fail();
  }
  if (new Date(user.passwordReset.expiresAt).getTime() < Date.now()) {
    user.set("passwordReset", undefined);
    await user.save();
    fail();
  }
  if ((user.passwordReset.attempts || 0) >= 5) {
    user.set("passwordReset", undefined);
    await user.save();
    fail();
  }

  const ok = await bcrypt.compare(rawCode, user.passwordReset.hash);
  if (!ok) {
    user.passwordReset.attempts = (user.passwordReset.attempts || 0) + 1;
    await user.save();
    fail();
  }

  user.passwordHash = await bcrypt.hash(pass, BCRYPT_ROUNDS);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.set("passwordReset", undefined);
  user.lastSeenAt = new Date();
  await user.save();
  return { user: publicUser(user), token: signToken(user) };
}

export async function changePassword({ userId, currentPassword, newPassword }) {
  const user = await User.findOne({ userId });
  if (!user) {
    const e = new Error("Not signed in");
    e.status = 401;
    throw e;
  }
  const ok = await bcrypt.compare(String(currentPassword || ""), user.passwordHash);
  if (!ok) {
    const e = new Error("Current password is wrong");
    e.status = 401;
    throw e;
  }
  const pass = assertPassword(newPassword, { label: "New password" });
  user.passwordHash = await bcrypt.hash(pass, BCRYPT_ROUNDS);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.set("passwordReset", undefined);
  await user.save();
  return { user: publicUser(user), token: signToken(user) };
}

export function publicUser(user) {
  return {
    userId: user.userId,
    email: user.email,
    displayName: user.displayName,
    videoCount: user.videoCount,
    highlightCount: user.highlightCount,
    screenshotCount: user.screenshotCount,
    createdAt: user.createdAt,
  };
}

/**
 * Bearer JWT only. Shared VSA_API_KEY cannot impersonate a user
 * unless ALLOW_SERVICE_AUTH=1 (automation).
 */
export function authMiddleware(req, res, next) {
  authMiddlewareAsync(req, res, next).catch(next);
}

async function authMiddlewareAsync(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ")
    ? h.slice(7).trim()
    : String(req.headers["x-api-key"] || "").trim();

  if (!token) {
    return res.status(401).json({ ok: false, message: "Login required" });
  }

  const serviceKey = String(process.env.VSA_API_KEY || "");
  if (
    process.env.ALLOW_SERVICE_AUTH === "1" &&
    serviceKey.length >= 24 &&
    timingSafeEqualString(token, serviceKey)
  ) {
    return res.status(403).json({
      ok: false,
      message: "Service key cannot access user vault routes",
    });
  }

  try {
    const payload = verifyToken(token);
    const userId = payload.sub;
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Invalid token" });
    }
    const user = await User.findOne({ userId }).select("tokenVersion email displayName").lean();
    if (!user) {
      return res.status(401).json({ ok: false, message: "Invalid or expired token" });
    }
    const tv = user.tokenVersion || 0;
    if (typeof payload.tv === "number" && payload.tv !== tv) {
      return res.status(401).json({ ok: false, message: "Session expired — sign in again" });
    }
    req.authMode = "user";
    req.user = {
      userId,
      email: user.email || payload.email,
      displayName: user.displayName || payload.name,
    };
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Invalid or expired token" });
  }
}

/** JWT from header or query (image <img src>). Same user isolation as authMiddleware. */
export async function userIdFromToken(token) {
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    if (!payload?.sub) return null;
    const user = await User.findOne({ userId: payload.sub })
      .select("tokenVersion")
      .lean();
    if (!user) return null;
    const tv = user.tokenVersion || 0;
    if (typeof payload.tv === "number" && payload.tv !== tv) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
