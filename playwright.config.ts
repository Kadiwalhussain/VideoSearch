import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // Each test may restart the vault server (a few seconds on a busy laptop)
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
});
