import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  // Relative asset URLs — content scripts run on youtube.com, so absolute
  // "/assets/…" paths resolve to youtube.com (404) instead of the extension.
  base: "./",
  build: {
    target: "esnext",
    // transformers.js is large; don't fail the build on chunk size
    chunkSizeWarningLimit: 2000,
    // CRITICAL for MV3 content scripts: Vite's modulepreload polyfill injects
    // <link rel="modulepreload" href="/assets/…"> into the host page (YouTube).
    // Those URLs 404, and the polyfill then *throws* and never runs import().
    // That surfaces as: "Could not load embedding engine".
    modulePreload: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].js",
        // Keep dynamic-import chunks as separate files (lazy-loaded ML stack)
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  optimizeDeps: {
    exclude: ["@xenova/transformers"],
  },
});
