/**
 * End-to-end: built extension ↔ vault API ↔ MongoDB — offline queue, deletes,
 * and Studio → extension pulls.
 *
 * Run: npm run build && npm run test:e2e
 */

import { test, expect } from "@playwright/test";
import { Stack } from "./stack";

const S = new Stack();

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Cold mongod + Chromium start can be slow on a busy machine
  test.setTimeout(180_000);
  await S.start();
});

test.afterAll(async () => {
  await S.stop();
});

test("Save while the vault is online lands in the vault", async () => {
  await S.ext(`({ cs }) => cs.updateLibraryOnCloud({ videoId: "dQw4w9WgXcQ", videoTitle: "Online save", action: "toggle_save" })`);
  expect((await S.vaultRow("dQw4w9WgXcQ"))?.saved).toBe(true);
  expect(await S.badge()).toBe("");
});

test("Vault closed: changes stay in the extension and the badge counts them", async () => {
  await S.stopServer();
  await S.ext(`async ({ cs }) => {
    await cs.updateLibraryOnCloud({ videoId: "9bZkp7q19f0", videoTitle: "Offline save", action: "toggle_save" });
    await cs.updateLibraryOnCloud({ videoId: "dQw4w9WgXcQ", action: "toggle_watch_later" });
    await cs.recordWatchToCloud({ videoId: "kJQP7kiw5Fk", videoTitle: "Watched offline" });
  }`);
  expect(await S.ext<number>(`({ off }) => off.getPendingSyncCount()`)).toBe(3);
  await expect.poll(() => S.badge()).toBe("3");
});

test("Vault reopened: the queue replays and History / Library show it", async () => {
  await S.startServer();
  const res = await S.ext<{ pending: number }>(`({ off }) => off.flushOfflineQueue({})`);
  expect(res.pending).toBe(0);
  expect((await S.vaultRow("9bZkp7q19f0"))?.saved).toBe(true);
  expect((await S.vaultRow("dQw4w9WgXcQ"))?.watchLater).toBe(true);
  expect((await S.vaultRow("kJQP7kiw5Fk"))?.lastViewedAt).toBeTruthy();
  await expect.poll(() => S.badge()).toBe("");
});

test("Deleting a mark in the extension removes it from the vault for good", async () => {
  const videoId = "dQw4w9WgXcQ";
  const [keep, gone] = await S.ext<string[]>(`async ({ cs, hs }) => {
    await hs.addHighlight("${videoId}", { startTime: 10 });
    await hs.addHighlight("${videoId}", { startTime: 20 });
    const list = await hs.loadHighlights("${videoId}");
    await cs.syncVideoToCloud({ videoId: "${videoId}", highlights: list, screenshots: [] });
    return [list[0].id, list[1].id];
  }`);
  expect((await S.vaultRow(videoId))?.highlights).toHaveLength(2);

  // Delete while offline, then an old copy syncs again: it must not come back
  await S.stopServer();
  await S.ext(`async ({ off, hs }) => {
    await hs.deleteHighlight("${videoId}", "${gone}");
    await off.runOrQueueOp({ kind: "delete_mark", videoId: "${videoId}", itemId: "${gone}" });
  }`);
  await S.startServer();
  await S.ext(`({ off }) => off.flushOfflineQueue({})`);
  const stale = { id: gone, videoId, startTime: 20, endTime: 22, note: "", color: "#ef4444", createdAt: 1, updatedAt: 1 };
  await S.call("/api/vault/sync", { body: { videoId, highlights: [stale], screenshots: [] } });
  const ids = ((await S.vaultRow(videoId))?.highlights || []).map((h: { id: string }) => h.id);
  expect(ids).toEqual([keep]);
});

test("Changes made in Studio reach the extension without signing in again", async () => {
  const videoId = "dQw4w9WgXcQ";
  const markId = await S.ext<string>(`async ({ cs, hs }) => {
    await hs.addHighlight("${videoId}", { startTime: 30 });
    const list = await hs.loadHighlights("${videoId}");
    await cs.syncVideoToCloud({ videoId: "${videoId}", highlights: list, screenshots: [] });
    return list.find((h) => h.startTime === 30).id;
  }`);
  // Studio: delete that mark and unsave the video
  await S.call(`/api/vault/${videoId}/highlights/${markId}`, { method: "DELETE" });
  await S.call("/api/vault/library", { body: { videoId: "9bZkp7q19f0", action: "unsave" } });

  expect(await S.ext<boolean>(`({ cs }) => cs.pullVaultIfStale(0)`)).toBe(true);
  const local = await S.ext<{ marks: string[]; saved: boolean }>(`async ({ lib, hs }) => ({
    marks: (await hs.loadHighlights("${videoId}")).map((h) => h.id),
    saved: Boolean((await lib.getLibraryEntry("9bZkp7q19f0"))?.saved),
  })`);
  expect(local.marks).not.toContain(markId);
  expect(local.saved).toBe(false);
});
