import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPassword,
  generateResetCode,
  isAllowedOrigin,
  isVideoId,
  normalizeEmail,
  sanitizeDisplayName,
  safeShotId,
  timingSafeEqualString,
} from "./security.js";

test("normalizeEmail rejects junk", () => {
  assert.equal(normalizeEmail("  A@B.COM "), "a@b.com");
  assert.equal(normalizeEmail("nope"), null);
  assert.equal(normalizeEmail(""), null);
});

test("assertPassword requires length + letter + number", () => {
  assert.throws(() => assertPassword("short1"), /10/);
  assert.throws(() => assertPassword("lettersonly!!"), /number/);
  assert.equal(assertPassword("goodPass12"), "goodPass12");
});

test("isVideoId", () => {
  assert.equal(isVideoId("dQw4w9wgXcQ"), true);
  assert.equal(isVideoId("../etc/passwd"), false);
  assert.equal(isVideoId("x"), false);
});

test("safeShotId", () => {
  assert.ok(safeShotId("shot_abc-1"));
  assert.equal(safeShotId("../../x"), "");
});

test("sanitizeDisplayName strips tags", () => {
  assert.equal(sanitizeDisplayName("<b>Hi</b>"), "Hi");
});

test("timingSafeEqualString", () => {
  assert.equal(timingSafeEqualString("abc", "abc"), true);
  assert.equal(timingSafeEqualString("abc", "abd"), false);
  assert.equal(timingSafeEqualString("abc", "ab"), false);
});

test("isAllowedOrigin", () => {
  assert.equal(isAllowedOrigin("http://127.0.0.1:8787"), true);
  assert.equal(isAllowedOrigin("http://192.168.0.103:5173"), true);
  assert.equal(isAllowedOrigin("chrome-extension://abcdef"), true);
  assert.equal(isAllowedOrigin("https://evil.example"), false);
});

test("generateResetCode is 8 chars", () => {
  const a = generateResetCode();
  const b = generateResetCode();
  assert.equal(a.length, 8);
  assert.notEqual(a, b);
});
