import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "./models.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret";
const JWT_DAYS = 30;
const VSA_API_KEY = process.env.VSA_API_KEY || "";

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.userId,
      email: user.email,
      name: user.displayName || user.email,
    },
    JWT_SECRET,
    { expiresIn: `${JWT_DAYS}d` }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function registerUser({ email, password, displayName }) {
  const clean = String(email || "")
    .trim()
    .toLowerCase();
  if (!clean || !clean.includes("@")) {
    const e = new Error("Valid email required");
    e.status = 400;
    throw e;
  }
  if (!password || String(password).length < 6) {
    const e = new Error("Password must be at least 6 characters");
    e.status = 400;
    throw e;
  }

  const existing = await User.findOne({ email: clean });
  if (existing) {
    const e = new Error("Email already registered");
    e.status = 409;
    throw e;
  }

  const userId = `u_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const passwordHash = await bcrypt.hash(String(password), 10);
  const user = await User.create({
    userId,
    email: clean,
    passwordHash,
    displayName: (displayName || clean.split("@")[0]).trim(),
    lastSeenAt: new Date(),
  });

  const token = signToken(user);
  return { user: publicUser(user), token };
}

export async function loginUser({ email, password }) {
  const clean = String(email || "")
    .trim()
    .toLowerCase();
  const user = await User.findOne({ email: clean });
  if (!user) {
    const e = new Error("Invalid email or password");
    e.status = 401;
    throw e;
  }
  const ok = await bcrypt.compare(String(password || ""), user.passwordHash);
  if (!ok) {
    const e = new Error("Invalid email or password");
    e.status = 401;
    throw e;
  }
  user.lastSeenAt = new Date();
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
 * Accept either:
 *  - Authorization: Bearer <JWT>  → req.user from account
 *  - Authorization: Bearer <VSA_API_KEY> + body/query userId  → service mode
 */
export function authMiddleware(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ")
    ? h.slice(7)
    : req.headers["x-api-key"] || "";

  if (!token) {
    return res.status(401).json({ ok: false, message: "Login required" });
  }

  // Shared service key (optional automation)
  if (VSA_API_KEY && token === VSA_API_KEY) {
    req.authMode = "service";
    req.user = {
      userId: String(req.body?.userId || req.query?.userId || "default"),
      email: "",
      service: true,
    };
    return next();
  }

  try {
    const payload = verifyToken(token);
    req.authMode = "user";
    req.user = {
      userId: payload.sub,
      email: payload.email,
      displayName: payload.name,
    };
    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Invalid or expired token" });
  }
}
