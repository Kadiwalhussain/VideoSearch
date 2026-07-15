import { defineManifest } from "@crxjs/vite-plugin";

/**
 * Chrome Manifest V3 — VideoSearch AI
 * Full Phase 1: local captions → chunk → embed → search UI.
 */
export default defineManifest({
  manifest_version: 3,
  name: "VideoSearch AI",
  version: "1.0.0",
  description:
    "Search what was said, not just what was titled — local semantic search over YouTube transcripts.",
  icons: {
    "16": "public/icons/icon16.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png",
  },
  permissions: ["storage"],
  // YouTube + model weight CDN + optional LLM providers (user API key)
  host_permissions: [
    "https://www.youtube.com/*",
    "https://youtube.com/*",
    // Embedding model weights (downloaded once, then browser-cached)
    "https://huggingface.co/*",
    "https://cdn-lfs.huggingface.co/*",
    "https://cdn-lfs-us-1.huggingface.co/*",
    "https://*.hf.co/*",
    // ONNX Runtime WASM binaries used by transformers.js
    "https://cdn.jsdelivr.net/*",
    // Optional LLM chat completions (user key; OpenAI-compatible hosts)
    "https://api.mistral.ai/*",
    "https://api.x.ai/*",
    "https://api.openai.com/*",
    "https://api.groq.com/*",
  ],
  content_scripts: [
    {
      matches: ["https://www.youtube.com/*", "https://youtube.com/*"],
      js: ["src/content/pageBridge.ts"],
      run_at: "document_start",
      world: "MAIN",
    },
    {
      matches: ["https://www.youtube.com/*", "https://youtube.com/*"],
      js: ["src/content/injectSearchUI.ts"],
      run_at: "document_idle",
    },
  ],
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
});
