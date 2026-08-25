/**
 * Exchange a Clerk session JWT for a VideoSearch vault JWT.
 * Secret key stays on the server.
 */
import { verifyToken } from "@clerk/backend";
import { loginOrRegisterGoogle } from "./auth.js";

export function clerkEnabled() {
  return Boolean(process.env.CLERK_SECRET_KEY);
}

export function mountClerkAuth(app) {
  app.post("/api/auth/clerk", async (req, res) => {
    try {
      const token = String(req.body?.token || "");
      if (!token) {
        return res.status(400).json({ ok: false, message: "Missing session" });
      }
      if (!process.env.CLERK_SECRET_KEY) {
        return res.status(501).json({ ok: false, message: "Clerk is not configured on the vault" });
      }
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      const userId = payload.sub;
      const email =
        payload.email ||
        payload.email_address ||
        (Array.isArray(payload.email_addresses)
          ? payload.email_addresses[0]
          : "");

      let resolvedEmail = String(email || "");
      let displayName = String(payload.name || payload.full_name || "");

      if (!resolvedEmail && userId) {
        const ures = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
          headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
        });
        const u = await ures.json();
        resolvedEmail =
          u?.email_addresses?.[0]?.email_address || u?.primary_email_address || "";
        displayName =
          displayName ||
          [u?.first_name, u?.last_name].filter(Boolean).join(" ") ||
          "";
      }

      const out = await loginOrRegisterGoogle({
        email: resolvedEmail,
        displayName,
        googleId: userId,
      });
      res.json({ ok: true, ...out });
    } catch (err) {
      console.warn("[vault-api] Clerk verify failed", err?.message || err);
      res.status(401).json({ ok: false, message: "Could not verify account" });
    }
  });
}
