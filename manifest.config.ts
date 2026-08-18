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
  permissions: ["storage", "clipboardWrite"],
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
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://grok.com/*",
    "https://www.perplexity.ai/*",
    // Cloud vault API (local Mongo backend + optional deployed host)
    "http://localhost:8787/*",
    "http://127.0.0.1:8787/*",
    "http://[::1]:8787/*",
    // Home LAN vault (any host on :8787 — Chrome match patterns need full host;
    // private IPs are also allow-listed in the background proxy)
    "http://192.168.0.105:8787/*",
    "https://*.supabase.co/*",
  ],
  background: {
    service_worker: "src/background/serviceWorker.ts",
    type: "module",
  },
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
    {
      matches: [
        "https://chatgpt.com/*",
        "https://chat.openai.com/*",
        "https://claude.ai/*",
        "https://gemini.google.com/*",
        "https://grok.com/*",
        "https://www.perplexity.ai/*",
      ],
      js: ["src/content/externalAskPaste.ts"],
      run_at: "document_idle",
    },
  ],
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
});
