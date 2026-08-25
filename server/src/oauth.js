/**
 * White-label Google sign-in (no Clerk UI, no Clerk branding).
 * Optional Clerk secret only syncs the user server-side.
 */
import crypto from "crypto";
import { loginOrRegisterGoogle } from "./auth.js";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function fromB64url(s) {
  return JSON.parse(Buffer.from(String(s || ""), "base64url").toString("utf8"));
}

function signState(payload) {
  const body = b64url(payload);
  const mac = crypto
    .createHmac("sha256", process.env.JWT_SECRET || "dev")
    .update(body)
    .digest("base64url");
  return `${body}.${mac}`;
}

function readState(raw) {
  const [body, mac] = String(raw || "").split(".");
  if (!body || !mac) throw new Error("Bad state");
  const expect = crypto
    .createHmac("sha256", process.env.JWT_SECRET || "dev")
    .update(body)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) {
    throw new Error("Bad state");
  }
  return fromB64url(body);
}

function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

function callbackUrl(req) {
  const base = (
    process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
  return `${base}/api/auth/google/callback`;
}

export function googleAuthEnabled() {
  return googleConfigured() || Boolean(process.env.CLERK_SECRET_KEY);
}

async function syncClerkQuietly({ email, displayName, googleId }) {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return;
  try {
    const list = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const data = await list.json().catch(() => ({}));
    if (Array.isArray(data) && data.length) return;
    if (Array.isArray(data?.data) && data.data.length) return;
    await fetch("https://api.clerk.com/v1/users", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: [email],
        first_name: String(displayName || email).split(" ")[0],
        external_id: googleId || undefined,
        skip_password_requirement: true,
      }),
    });
  } catch (err) {
    console.warn("[vault-api] Clerk sync skipped", err?.message || err);
  }
}

export function mountGoogleAuth(app) {
  app.get("/api/auth/google/status", (_req, res) => {
    res.json({ ok: true, enabled: googleAuthEnabled() });
  });

  app.get("/api/auth/google/start", (req, res) => {
    if (!googleConfigured()) {
      return res.status(501).send(
        "Google sign-in is not configured on this vault yet."
      );
    }
    const redirect = String(req.query.redirect || "").trim();
    const state = signState({
      redirect,
      n: crypto.randomBytes(8).toString("hex"),
      t: Date.now(),
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", callbackUrl(req));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      if (req.query.error) {
        throw new Error(String(req.query.error));
      }
      const state = readState(req.query.state);
      const code = String(req.query.code || "");
      if (!code) throw new Error("Missing code");

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: callbackUrl(req),
          grant_type: "authorization_code",
        }),
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok || !tokens.access_token) {
        throw new Error(tokens.error_description || "Google token failed");
      }

      const infoRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const info = await infoRes.json();
      const email = info.email;
      const displayName = info.name || "";
      const googleId = info.id || "";
      if (!email) throw new Error("Google did not share an email");

      const out = await loginOrRegisterGoogle({
        email,
        displayName,
        googleId,
      });
      void syncClerkQuietly({ email, displayName, googleId });

      const dest = state.redirect && /^https?:|^chrome-extension:|^moz-extension:/.test(state.redirect)
        ? state.redirect
        : "/app/";
      const join = dest.includes("?") ? "&" : "?";
      const loc = `${dest}${join}token=${encodeURIComponent(out.token)}&email=${encodeURIComponent(out.user.email)}&name=${encodeURIComponent(out.user.displayName || "")}`;
      res.redirect(loc);
    } catch (err) {
      console.warn("[vault-api] Google callback", err);
      res.status(401).send("Google sign-in failed. Close this tab and try again.");
    }
  });
}
