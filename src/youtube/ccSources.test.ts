import assert from "node:assert/strict";
import test from "node:test";
import { extractSourcesFromCaptions } from "./ccSources.ts";

test("extracts spoken websites, coupons, and app-store mentions from CC", () => {
  const segs = [
    { startTime: 12, text: "Today's sponsor is brilliant.org slash three b one b" },
    { startTime: 18, text: "Go to nordvpn.com/person and sign up" },
    { startTime: 24, text: "Use code BRIGHT20 for twenty percent off" },
    { startTime: 40, text: "Download Notion on the App Store" },
    { startTime: 55, text: "The slides are at github.com/3b1b/videos" },
    { startTime: 70, text: "Please like and subscribe and check the description" },
  ];
  const links = extractSourcesFromCaptions(segs);
  const urls = links.map((l) => l.url).join("\n");
  assert.ok(
    links.some((l) => /brilliant\.org/i.test(l.url)),
    urls
  );
  assert.ok(
    links.some((l) => /nordvpn\.com/i.test(l.url)),
    urls
  );
  assert.ok(
    links.some((l) => l.kind === "coupon" && /BRIGHT20/i.test(l.label)),
    JSON.stringify(links)
  );
  assert.ok(
    links.some((l) => l.kind === "app" && /notion/i.test(l.label)),
    JSON.stringify(links)
  );
  assert.ok(links.some((l) => /github\.com\/3b1b/i.test(l.url)), urls);
  assert.ok(!links.some((l) => /youtube\.com/i.test(l.url)));
});

test("rebuilds 'dot com' speech into a URL", () => {
  const links = extractSourcesFromCaptions([
    { startTime: 8, text: "Visit three blue one brown" },
    { startTime: 9, text: "dot com for the lesson page" },
  ]);
  assert.ok(
    links.some((l) => /threeblueonebrown\.com|three-blue-one-brown\.com/i.test(l.url)),
    JSON.stringify(links)
  );
});
