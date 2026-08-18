# VideoSearch AI

Search what was **said**, keep the **frame**, play it **in-app**.

Chrome extension · Studio web app · Android & iPhone · one signed-in vault

<p align="center">
  <a href="./website/index.html"><strong>Product website</strong></a>
  · <code>npx serve website</code>
  · static host: Vercel / Netlify / Cloudflare Pages
</p>

---

## What it is

Long YouTube videos hide the sentence you need. VideoSearch indexes **captions on the machine**, lets you search by meaning, and keeps a vault of **your** marks, shots, bio, and sources across Chrome, Studio, and phone.

| Surface | Role |
|---------|------|
| **Chrome extension** | Lives on the YouTube page. Search, topics, marks, shots, sync bio, extract sources |
| **Studio** (`server` + `webapp`) | Library, playlists, bio editor, sources, share cards, analytics |
| **Flutter app** (`mobile/`) | Same account. In-app official YouTube player. Marks/shots seek here |
| **Website** (`website/`) | Static product site + live demo (no backend) |

---

## Features

| Feature | Who creates it | Where |
|---------|----------------|--------|
| Semantic search + topics | System (from CC) | Extension |
| Ask / Chat RAG | System (CC + optional LLM) | Extension, Studio AI search |
| **Marks** | **You** — notes at a timestamp | Extension → vault → phone |
| **Shots** | **You** — screenshots of the slide | Extension → vault → phone |
| **Sources from bio** | System (description + pinned comment) | Sync bio |
| **Sources from CC** | System (spoken sites, apps, coupons, promos) | After captions index |
| In-app player | Official YouTube IFrame | Android + iPhone |
| Playlists / share / analytics | You + Studio | Studio + phone |

Marks and shots are never auto-written. Sources **are** extracted: from the description **and** from what the instructor says. Details: [docs/SOURCES.md](./docs/SOURCES.md).

---

## Repo layout

```text
videosearch/
├── src/                 Chrome extension (TypeScript)
│   ├── youtube/         Bio + CC source extraction
│   ├── transcript/      Captions
│   ├── ui/              On-page panel
│   └── cloud/           Vault sync
├── webapp/              Studio (Vite + React) — served at /app
├── server/              Vault API (Express + MongoDB + R2 / Fil One)
├── mobile/              Flutter (Android + iOS)
├── website/             Static product site
├── docs/                Hosting + sources
└── dist/                Extension build output (not committed)
```

---

## Quick start

### 1. Chrome extension

```bash
git clone https://github.com/Kadiwalhussain/VideoSearch.git
cd VideoSearch
npm install
npm run build
```

1. `chrome://extensions` → Developer mode → **Load unpacked** → select **`dist/`**
2. Open a captioned `youtube.com/watch` page
3. Wait for **Ready**, then search or **Sync bio**

```bash
npm run dev    # CRX hot reload
```

### 2. Vault + Studio

```bash
cp server/.env.example server/.env   # set MONGODB_URI + JWT_SECRET
cd server && npm install && HOST=0.0.0.0 PORT=8787 node src/index.js
```

Studio: `http://127.0.0.1:8787/app/`  
Same email/password as the extension (sign in from the panel) and the phone.

### 3. Mobile

```bash
cd mobile && flutter pub get
# Physical phone: set vault URL to http://<LAN-IP>:8787 in More
flutter run
```

See [mobile/README.md](./mobile/README.md). Wireless Xcode **Play** on new iOS can fail to attach; install the app and tap the icon instead.

### 4. Product website

```bash
npx --yes serve website -l 5180
```

Host for free: [docs/HOSTING.md](./docs/HOSTING.md) (Vercel, Netlify, or Cloudflare **Pages** — not Workers).

---

## How search works

```text
YouTube captions → chunk → MiniLM (in browser) → IndexedDB
                         → semantic search / topics / Ask
                         → CC source extraction (sites, coupons, apps)
Description DOM      → bio text + bio sources
Your Mark / Shot     → vault (Mongo + optional R2 / Fil One)
```

Embeddings stay in the browser. The vault stores only what you sync: marks, shots, bio, sources, playlists.

---

## Optional AI

In the extension **Settings**, paste an OpenAI-compatible key (Groq / Mistral / xAI). Used for richer topics, Ask, and Chat. Search itself does not need a key.

Vault `server/.env` can set `LLM_*` for Studio AI search.

---

## Privacy

1. Caption index and search run locally in Chrome.
2. Vault is **opt-in** (sign in). It holds marks, shots, bio, sources — not the embedding index.
3. Shot images can go to R2 and/or Fil One if those keys are set; otherwise they stay on the API host.
4. LLM calls send short caption excerpts only when you enable a key.

---

## Tests

```bash
npx tsc --noEmit
node --test server/src/bioSources.test.js
node --experimental-strip-types --test src/youtube/ccSources.test.ts
cd mobile && flutter test
```

Manual extension checks: [TESTING.md](./TESTING.md).

---

## Tech

| Layer | Stack |
|-------|--------|
| Extension | Chrome MV3, TypeScript, Vite + CRXJS, MiniLM WASM |
| Studio | React, Vite |
| Vault | Node, Express, MongoDB, Cloudflare R2, Fil One S3 |
| Mobile | Flutter, official YouTube IFrame |
| Website | Static HTML/CSS/JS |

---

## License

See the repository.
