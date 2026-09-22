/**
 * End-to-end: Take a break / resume, Continue watching, Study mode and
 * shared playlists — extension + vault API + Studio in one browser.
 *
 * Run: npm run build && npm run studio:build && npm run test:e2e
 */

import { test, expect, type Page } from "@playwright/test";
import { Stack } from "./stack";

const S = new Stack();
const VID = "M7lc1UVf-VE";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await S.start();
});

test.afterAll(async () => {
  await S.stop();
});

/** Seek + play in the page's real <video> (native API, shared with the content script). */
function playFrom(p: Page, at: number) {
  return p.evaluate(async (at) => {
    const v = document.querySelector("video")!;
    v.currentTime = at;
    await v.play();
  }, at);
}

const now = (p: Page) => p.evaluate(() => document.querySelector("video")!.currentTime);

test("Break button sits after the time and saves the spot + video length", async () => {
  const yt = await S.watchPage(VID);
  const btn = yt.locator("#vsa-break-btn");
  await expect(btn).toBeVisible({ timeout: 20_000 });
  expect(
    await yt.evaluate(() => document.querySelector(".ytp-time-display")?.nextElementSibling?.id)
  ).toBe("vsa-break-btn");

  await playFrom(yt, 125);
  await yt.keyboard.press("b");
  await expect(yt.locator("#vsa-resume-toast")).toContainText("Break saved at 2:05");
  await expect(btn).toHaveClass(/is-saved/);
  await expect(btn).toContainText("2:05");
  expect(await yt.evaluate(() => document.querySelector("video")!.paused)).toBe(true);

  await expect
    .poll(async () => (await S.vaultRow(VID))?.progress?.kind)
    .toBe("break");
  const saved = (await S.vaultRow(VID))!;
  expect(saved.progress.position).toBeGreaterThanOrEqual(125);
  expect(saved.progress.position).toBeLessThan(126);
  expect(saved.progress.duration).toBe(600);
  expect(saved.durationSec).toBe(600);

  // Leaving right after the break (YouTube starts in-app navigation, which
  // saves the position) must keep it a break, locally and in the vault
  const breakAt = saved.progress.updatedAt;
  await yt.evaluate(() => window.dispatchEvent(new Event("yt-navigate-start")));
  await yt.waitForTimeout(1500);
  const after = (await S.vaultRow(VID))!.progress;
  expect(after.kind).toBe("break");
  expect(after.updatedAt).toBe(breakAt);
  await yt.close();
});

test("Coming back to the video starts from the break", async () => {
  const yt = await S.watchPage(VID);
  await expect(yt.locator("#vsa-resume-toast")).toContainText(
    "resumed from your break at 2:05",
    { timeout: 20_000 }
  );
  const t = await now(yt);
  expect(t).toBeGreaterThan(122.5);
  expect(t).toBeLessThan(125);
  await yt.close();
});

test("A break taken on another device wins, and pulls bring it down", async () => {
  // e.g. the phone app: break at 5:00, newer than this browser's point
  await S.call("/api/vault/progress", {
    body: { videoId: VID, position: 300, duration: 600, kind: "break", at: Date.now() },
  });
  const yt = await S.watchPage(VID);
  await expect(yt.locator("#vsa-resume-toast")).toContainText("at 5:00", { timeout: 20_000 });
  const t = await now(yt);
  expect(t).toBeGreaterThan(297.5);
  expect(t).toBeLessThan(300);
  await yt.close();
  expect(await S.ext<boolean>(`({ cs }) => cs.pullVaultIfStale(0)`)).toBe(true);
});

test("Watching past the break saves progress; old replays never win", async () => {
  const yt = await S.watchPage(VID);
  await expect(yt.locator("#vsa-resume-toast")).toBeVisible({ timeout: 20_000 });
  await playFrom(yt, 340);
  await yt.waitForTimeout(1200);
  await yt.evaluate(() => document.querySelector("video")!.pause());
  await expect
    .poll(async () => (await S.vaultRow(VID))?.progress?.kind)
    .toBe("auto");
  const pos = (await S.vaultRow(VID))!.progress.position;
  expect(pos).toBeGreaterThanOrEqual(340);
  expect(pos).toBeLessThan(345);
  await expect(yt.locator("#vsa-break-btn")).not.toHaveClass(/is-saved/);

  // A stale write (offline replay from yesterday) is ignored
  const stale = await S.call("/api/vault/progress", {
    body: { videoId: VID, position: 12, duration: 600, kind: "auto", at: Date.now() - 86400_000 },
  });
  expect(stale.json.skipped).toBe(true);
  expect((await S.vaultRow(VID))?.progress?.position).toBe(pos);
  await yt.close();
});

test("Studio: Continue watching shows the progress, length and a Resume link", async () => {
  await S.call("/api/vault/progress", {
    body: { videoId: VID, position: 300, duration: 600, kind: "break", at: Date.now() + 5000 },
  });
  const p = await S.studio("/");
  const section = p.locator("section", { hasText: "Continue watching" });
  await expect(section).toBeVisible();
  const card = section.locator(".video-card").first();
  await expect(card.locator(".v-break-badge")).toContainText("Break · 5:00");
  await expect(card.locator(".v-duration")).toHaveText("10:00");
  await expect(card.locator(".v-progress i")).toHaveAttribute("style", /width: 50%/);
  const watch = card.locator(".v-bar-watch");
  await expect(watch).toContainText("Resume 5:00");
  await expect(watch).toHaveAttribute("href", /[?&]t=298s/);
  await p.close();
});

test("Study: notes become cards, grading schedules the next review", async () => {
  const videoId = "aircAruvnKk";
  await S.call("/api/vault/sync", {
    body: {
      videoId,
      videoTitle: "Neural networks",
      highlights: [
        { id: "h_q1", startTime: 42, endTime: 45, note: "What is a neuron? :: A thing that holds a number", createdAt: 1, updatedAt: 1 },
        { id: "h_q2", startTime: 90, endTime: 93, note: "weights are the knobs", createdAt: 2, updatedAt: 2 },
        { id: "h_blank", startTime: 120, endTime: 123, note: "", createdAt: 3, updatedAt: 3 },
      ],
      screenshots: [],
    },
  });
  const q = await S.call("/api/study/queue");
  expect(q.json.counts.total).toBe(2); // blank note is not a card
  expect(q.json.cards.map((c: any) => c.front)).toEqual(["What is a neuron?", null]);

  const p = await S.studio("/study");
  await expect(p.locator(".study-front")).toHaveText("What is a neuron?");
  await expect(p.locator(".study-back")).toHaveCount(0);
  await p.keyboard.press("Space");
  await expect(p.locator(".study-back")).toHaveText("A thing that holds a number");
  await expect(p.locator(".study-grade.is-good small")).toContainText("1d");
  await p.keyboard.press("3");
  await expect(p.locator(".study-front")).toHaveText("What did you note at 1:30?");
  await p.keyboard.press("Space");
  await p.locator(".study-grade.is-easy").click();
  await expect(p.locator(".study-done")).toContainText("All done for today");
  await expect(p.locator(".study-done")).toContainText("You reviewed 2 cards");
  await p.close();

  const after = await S.call("/api/study/queue");
  expect(after.json.cards).toHaveLength(0);
  expect(after.json.counts.reviewedToday).toBe(2);
  const dayMs = 86400_000;
  expect(after.json.nextDueAt - Date.now()).toBeGreaterThan(dayMs - 60_000);
});

test("Shared playlist: owner shares a read-only link, a friend saves a copy", async () => {
  for (const [videoId, videoTitle] of [
    ["aircAruvnKk", "Neural networks"],
    ["IHZwWFHWa-w", "Gradient descent"],
  ]) {
    await S.call("/api/vault/library", {
      body: { videoId, videoTitle, action: "add_playlist", playlist: "Deep Learning" },
    });
  }

  const owner = await S.studio("/playlists/Deep%20Learning");
  await owner.getByRole("button", { name: "Share list" }).click();
  const link = owner.locator(".pl-share-box input");
  await expect(link).toHaveValue(/\/app\/share\/[0-9a-f]{48}$/);
  const shareUrl = await link.inputValue();
  await owner.close();

  // A friend with their own account opens the link
  const friend = await S.register("friend@example.com");
  const viewer = await S.studio("/", friend);
  await viewer.goto(shareUrl);
  await expect(viewer.locator(".shared-pl h1")).toHaveText("Deep Learning");
  await expect(viewer.locator(".shared-pl-item")).toHaveCount(2);
  await viewer.locator(".shared-pl-toggle").first().click();
  await expect(viewer.locator(".shared-pl-marks")).toContainText("What is a neuron?");
  await viewer.getByRole("button", { name: "Save a copy to my vault" }).click();
  await expect(viewer.getByRole("button", { name: "Saved to your vault" })).toBeDisabled();
  await viewer.close();

  const copy = await S.vaultRow("IHZwWFHWa-w", friend);
  expect(copy?.playlists).toEqual(["Deep Learning"]);
  // Read-only: the friend got the list, not the owner's notes
  expect(copy?.highlights || []).toHaveLength(0);
});
