import { defineConfig, type Plugin } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

/**
 * CRXJS still emits Vite's modulepreload helper into content-script chunks
 * even with build.modulePreload = false. On YouTube that helper injects
 * <link rel="modulepreload">, the page CSP rejects it, and the import throws
 * (the giant cloudSettings.js dump in DevTools).
 */
function stripViteModulePreload(): Plugin {
  return {
    name: "strip-vite-module-preload",
    apply: "build",
    enforce: "post",
    generateBundle(_opts, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || typeof chunk.code !== "string") continue;
        if (
          !chunk.code.includes("vite:preloadError") &&
          !chunk.code.includes("modulepreload")
        ) {
          continue;
        }
        chunk.code = chunk.code.replace(
          /if\((\w+)&&\1\.length>0\)\{const \w+=document\.getElementsByTagName\("link"\)/g,
          'if(false){const _viteLinks=document.getElementsByTagName("link")'
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [crx({ manifest }), stripViteModulePreload()],
  // Relative asset URLs — content scripts run on youtube.com, so absolute
  // "/assets/…" paths resolve to youtube.com (404) instead of the extension.
  base: "./",
  build: {
    target: "esnext",
    // transformers.js is large; don't fail the build on chunk size
    chunkSizeWarningLimit: 2000,
    modulePreload: {
      polyfill: false,
    },
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
