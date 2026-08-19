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

test("ignores okay.so / year.so caption leftovers", () => {
  const links = extractSourcesFromCaptions([
    { startTime: 59, text: "okay. So that is the plan" },
    { startTime: 119, text: "lakhin 2026. So the year" },
    { startTime: 196, text: "in your music category. So" },
    { startTime: 316, text: "the same time period. So" },
    { startTime: 499, text: "in India have changed. So" },
    { startTime: 20, text: "Go to nordvpn.com/person and sign up" },
  ]);
  assert.ok(links.some((l) => /nordvpn\.com/i.test(l.url)), JSON.stringify(links));
  assert.ok(
    !links.some((l) => /\.so\b|okay\.|year\.|category\.|period\.|2026\./i.test(l.url)),
    JSON.stringify(links)
  );
});

test("does not treat sentence periods as domains", () => {
  const links = extractSourcesFromCaptions([
    {
      startTime: 8,
      text: "be better prepared next time. So let's start with Indian fund managers",
    },
    { startTime: 12, text: "IPO plans. Online delivery platform Zepto" },
    { startTime: 16, text: "it takes time. So that is the idea" },
  ]);
  const labels = links.map((l) => l.label).join(" | ");
  assert.ok(
    !links.some((l) => /nexttime\.so|time\.so|plans\.online|ipoplans/i.test(l.url + l.label)),
    labels
  );
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
