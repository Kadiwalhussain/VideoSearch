import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "t".repeat(40);

const { safeRedirect } = await import("./oauth.js");

/**
 * The Google callback appends a freshly signed JWT to this destination, so an
 * unchecked redirect is account takeover. Keep these cases honest.
 */
const req = {
  protocol: "https",
  get: (h) => (h === "host" ? "vault.example.com" : ""),
};

test("blocks redirect to an attacker origin", () => {
  assert.equal(safeRedirect("https://evil.com/steal", req), "/app/");
  assert.equal(safeRedirect("https://vault.example.com.evil.com/x", req), "/app/");
  assert.equal(safeRedirect("http://evil.com", req), "/app/");
});

test("blocks protocol-relative and non-http schemes", () => {
  assert.equal(safeRedirect("//evil.com/x", req), "/app/");
  assert.equal(safeRedirect("javascript:alert(1)", req), "/app/");
  assert.equal(safeRedirect("data:text/html,<script>", req), "/app/");
});

test("allows same-origin absolute and relative destinations", () => {
  assert.equal(
    safeRedirect("https://vault.example.com/app/login", req),
    "https://vault.example.com/app/login"
  );
  assert.equal(safeRedirect("/app/login", req), "/app/login");
  assert.equal(safeRedirect("", req), "/app/");
});

test("allows origins the owner listed in CORS_ORIGINS", () => {
  const prev = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = "https://studio.videosearchai.com";
  assert.equal(
    safeRedirect("https://studio.videosearchai.com/app/login", req),
    "https://studio.videosearchai.com/app/login"
  );
  assert.equal(safeRedirect("https://studio.videosearchai.com.evil.com/", req), "/app/");
  process.env.CORS_ORIGINS = prev;
});
