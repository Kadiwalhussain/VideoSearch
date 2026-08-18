import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLink,
  extractSourcesFromBio,
  isUsefulVaultSource,
  unwrapRedirect,
} from "./bioSources.js";

test("unwraps YouTube description redirects", () => {
  const raw =
    "https://www.youtube.com/redirect?event=video_description&q=https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2Fabc%2Fview";
  assert.equal(
    unwrapRedirect(raw),
    "https://drive.google.com/file/d/abc/view"
  );
});

test("extracts Drive, slides, github and markdown links from bio", () => {
  const bio = `
Lecture notes:
Slides: https://docs.google.com/presentation/d/xyz/edit
Notes: [OS notes](https://docs.google.com/document/d/abc/edit)
PDF https://example.edu/lectures/os-week1.pdf
Code: https://github.com/uni/os-labs
Also a YouTube self-link https://www.youtube.com/watch?v=dQw4w9wg
And a redirect https://www.youtube.com/redirect?q=https%3A%2F%2Fdrive.google.com%2Fdrive%2Ffolders%2Ffolder1
`;
  const links = extractSourcesFromBio(bio, bio);
  const kinds = links.map((l) => l.kind).sort();
  assert.ok(kinds.includes("drive"), kinds.join(","));
  assert.ok(kinds.includes("slides"), kinds.join(","));
  assert.ok(kinds.includes("docs"), kinds.join(","));
  assert.ok(kinds.includes("pdf"), kinds.join(","));
  assert.ok(kinds.includes("github"), kinds.join(","));
  assert.ok(!links.some((l) => /youtube\.com\/watch/.test(l.url)));
  assert.ok(
    links.some((l) => l.url.includes("drive.google.com/drive/folders")),
    "redirect unwrapped"
  );
  const notes = links.find((l) => l.kind === "docs");
  assert.equal(notes?.label, "OS notes");
});

test("skips Google/YouTube chrome", () => {
  assert.equal(isUsefulVaultSource("https://www.youtube.com/watch?v=x"), false);
  assert.equal(isUsefulVaultSource("https://accounts.google.com/"), false);
  assert.equal(
    isUsefulVaultSource("https://drive.google.com/file/d/1/view"),
    true
  );
  assert.equal(classifyLink("https://t.me/classgroup"), "telegram");
});

test("keeps CC promo, coupon, and app-store destinations", () => {
  assert.equal(
    isUsefulVaultSource("https://brilliant.org", "promo"),
    true
  );
  assert.equal(
    isUsefulVaultSource("https://redeem.coupon/BRIGHT20", "coupon"),
    true
  );
  assert.equal(
    isUsefulVaultSource(
      "https://play.google.com/store/search?q=Notion",
      "app"
    ),
    true
  );
  assert.equal(classifyLink("https://apps.apple.com/search?term=x"), "app");
});
