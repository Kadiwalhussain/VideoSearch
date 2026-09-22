/**
 * White-label Google sign-in (no Clerk UI, no Clerk branding).
 * Optional Clerk secret only syncs the user server-side.
 */
import crypto from "crypto";
import { loginOrRegisterGoogle } from "./auth.js";
import { assertJwtSecret, isAllowedOrigin, IS_PROD } from "./security.js";

/** A signed state is only good for one browser, once, for ten minutes. */
const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_COOKIE = "vs_oauth_state";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function fromB64url(s) {
  return JSON.parse(Buffer.from(String(s || ""), "base64url").toString("utf8"));
}

function signState(payload) {
  const body = b64url(payload);
  const mac = crypto
    .createHmac("sha256", assertJwtSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${mac}`;
}

function readState(raw) {
  const [body, mac] = String(raw || "").split(".");
  if (!body || !mac) throw new Error("Bad state");
  const expect = crypto
    .createHmac("sha256", assertJwtSecret())
    .update(body)
    .digest("base64url");
  const got = Buffer.from(mac);
  const want = Buffer.from(expect);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    throw new Error("Bad state");
  }
  return fromB64url(body);
}

function httpsRequest(req) {
  return (
    IS_PROD ||
    req.secure ||
    String(req.get("x-forwarded-proto") || "").split(",")[0].trim() === "https"
  );
}

function stateCookie(req, value, maxAge) {
  return [
    `${STATE_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/api/auth/google",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    httpsRequest(req) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

function selfOrigin(req) {
  const base = (
    process.env.PUBLIC_API_BASE || `${req.protocol}://${req.get("host")}`
  ).replace(/\/$/, "");
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}

/**
 * The callback hands a freshly signed JWT to this destination, so an
 * unchecked `redirect` is a full account takeover: land the victim on
 * evil.com and the token rides along in the query string. Only origins this
 * vault already trusts are allowed; anything else falls back to the app.
 */
function redirectOriginAllowed(origin, mine) {
  if (!origin) return false;
  if (mine && origin === mine) return true;

  if (
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://")
  ) {
    const ids = String(process.env.EXTENSION_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) return !IS_PROD;
    return ids.some(
      (id) =>
        origin === `chrome-extension://${id}` ||
        origin === `moz-extension://${id}`
    );
  }

  const allowed = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return true;

  // Dev keeps the LAN/localhost convenience; production must be explicit.
  return IS_PROD ? false : isAllowedOrigin(origin);
}

export function safeRedirect(raw, req) {
  const want = String(raw || "").trim();
  if (!want) return "/app/";
  // Same-origin relative path — "//evil.com" is protocol-relative, not local.
  if (want.startsWith("/") && !want.startsWith("//")) return want;

  let url;
  try {
    url = new URL(want);
  } catch {
    return "/app/";
  }
  if (!/^(https?|chrome-extension|moz-extension):$/.test(url.protocol)) {
    return "/app/";
  }
  if (redirectOriginAllowed(url.origin, selfOrigin(req))) return want;

  console.warn(
    `[vault-api] Blocked Google sign-in redirect to untrusted origin: ${url.origin}`
  );
  return "/app/";
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
  return googleConfigured();
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
    // Validate at entry so a bad redirect never even reaches Google.
    const redirect = safeRedirect(req.query.redirect, req);
    const nonce = crypto.randomBytes(16).toString("hex");
    const state = signState({ redirect, n: nonce, t: Date.now() });
    res.setHeader("Set-Cookie", stateCookie(req, nonce, 600));
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

      if (!state.t || Date.now() - Number(state.t) > STATE_TTL_MS) {
        throw new Error("Sign-in link expired");
      }
      // Ties the callback to the browser that started the flow: without this
      // a signed state can be replayed, or fed to a victim to log them into
      // the attacker's account.
      const cookieNonce = Buffer.from(readCookie(req, STATE_COOKIE));
      const stateNonce = Buffer.from(String(state.n || ""));
      if (
        !cookieNonce.length ||
        cookieNonce.length !== stateNonce.length ||
        !crypto.timingSafeEqual(cookieNonce, stateNonce)
      ) {
        throw new Error("Sign-in session did not match this browser");
      }
      res.setHeader("Set-Cookie", stateCookie(req, "", 0));

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

      // Re-check at exit too — the state is signed, but this keeps the
      // token-bearing redirect honest even if state handling changes later.
      const dest = safeRedirect(state.redirect, req);
      const join = dest.includes("?") ? "&" : "?";
      const loc = `${dest}${join}token=${encodeURIComponent(out.token)}&email=${encodeURIComponent(out.user.email)}&name=${encodeURIComponent(out.user.displayName || "")}`;
      res.redirect(loc);
    } catch (err) {
      console.warn("[vault-api] Google callback", err);
      res.status(401).send("Google sign-in failed. Close this tab and try again.");
    }
  });
}
