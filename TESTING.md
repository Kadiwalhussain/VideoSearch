# VideoSearch AI — Testing Guide

How to build, load, and manually verify the extension at every Phase 1 build step.

**Tagline:** Search what was said, not just what was titled.

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [One-time project setup](#2-one-time-project-setup)
3. [Where to go in Chrome (map)](#3-where-to-go-in-chrome-map)
4. [Load / reload the extension](#4-load--reload-the-extension)
5. [Open DevTools the right way](#5-open-devtools-the-right-way)
6. [Recommended test videos](#6-recommended-test-videos)
7. [Build sequence — verify each step](#7-build-sequence--verify-each-step)
8. [Phase 1 success criteria (final pass)](#8-phase-1-success-criteria-final-pass)
9. [Troubleshooting](#9-troubleshooting)
10. [What not to test yet](#10-what-not-to-test-yet)

---

## 1. Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Chrome** (or Chromium-based browser) | Manifest V3. Prefer latest stable Chrome. |
| **Node.js** | v18+ recommended (`node -v`) |
| **npm** | Comes with Node (`npm -v`) |
| **This repo** | Project root: `videosearch` (package name: `videosearch-ai`) |
| **YouTube account** | Optional; captions work for most public educational videos without login |

No API keys. No paid services. Everything under test must stay local in the browser.

---

## 2. One-time project setup

In a terminal, from the project root:

```bash
cd /path/to/videosearch
npm install
npm run build
```

| Command | What it does |
|---------|----------------|
| `npm install` | Installs Vite, `@crxjs/vite-plugin`, TypeScript, types |
| `npm run build` | Typechecks + production build → **`dist/`** |
| `npm run dev` | Dev server with HMR (use when iterating; still load the extension from the path Vite/CRX prints, usually `dist/`) |

**You always load the extension from the built output folder: `dist/`** — not from the repo root and not from `src/`.

After code changes:

```bash
npm run build
```

Then **reload** the extension (see [§4](#4-load--reload-the-extension)).

---

## 3. Where to go in Chrome (map)

Use these exact places while testing:

| Where | URL / place | Why you’re there |
|-------|-------------|------------------|
| **Extensions page** | `chrome://extensions` | Load unpacked, enable Developer mode, reload, check errors |
| **Extension details** | Extensions page → **VideoSearch AI** → **Details** | Permissions, inspect views (later: service worker) |
| **Service worker** | Extensions page → VideoSearch AI → **“service worker”** / **Inspect views** | Background logs (when orchestrator exists) |
| **YouTube watch** | `https://www.youtube.com/watch?v=VIDEO_ID` | Only place the UI should inject in Phase 1 |
| **YouTube home** | `https://www.youtube.com/` | Negative test: button must **not** appear |
| **YouTube search** | `https://www.youtube.com/results?search_query=...` | Negative test: no injection |
| **Page DevTools** | On the YouTube tab: `Cmd+Option+I` (Mac) / `F12` | Content script logs, DOM, Network |
| **Console filter** | DevTools → **Console** | Filter: `VideoSearch` or `[VideoSearch AI]` |
| **Network tab** | DevTools → **Network** | Confirm no paid APIs; later: cache hits mean no re-embed traffic |
| **Application tab** | DevTools → **Application** → **IndexedDB** | Later steps: inspect video index cache |
| **Elements tab** | DevTools → **Elements** | Find `#videosearch-ai-root` / `#videosearch-ai-btn` |

### Mental model

```
chrome://extensions     →  install / reload / red error banners
youtube.com/watch?...   →  actual product surface
DevTools (page)         →  content script console + DOM + Network + IndexedDB
DevTools (service worker) → background orchestration logs (future steps)
```

---

## 4. Load / reload the extension

### First load

1. Open **`chrome://extensions`**
2. Toggle **Developer mode** ON (top-right)
3. Click **Load unpacked**
4. Select the project’s **`dist`** folder  
   Example path:  
   `/Users/you/videosearch/dist`
5. Confirm **VideoSearch AI** appears in the list, status **Enabled**, no red errors

### After every code change

1. Run `npm run build` (or keep `npm run dev` running)
2. Go to **`chrome://extensions`**
3. Click the **reload** ⟳ icon on the VideoSearch AI card
4. **Hard-refresh** the YouTube tab (`Cmd+Shift+R` / `Ctrl+Shift+R`)  
   Content scripts only re-inject after navigation/reload of the page (or SPA navigate handlers we installed)

### If the extension vanishes or breaks

- Remove it from `chrome://extensions` → Load unpacked again → choose `dist/`
- Confirm `dist/manifest.json` exists after build
- Check the red **Errors** button on the extension card

---

## 5. Open DevTools the right way

### Content script logs (most of Phase 1)

1. Open a YouTube **watch** page
2. Open DevTools on **that tab** (`Cmd+Option+I` / `F12`)
3. Go to **Console**
4. Optional filter: `VideoSearch`

You should see messages like:

```text
[VideoSearch AI] Placeholder button injected for video: dQw4w9WgXcQ
```

**Do not** look only at the service worker console for content-script logs — those appear on the **page**.

### Background / service worker logs (later steps)

1. `chrome://extensions`
2. Find VideoSearch AI
3. Click **service worker** / **Inspect views: service worker** (when registered)
4. Use that console for indexing orchestration messages

### IndexedDB (from Step 5 onward)

1. YouTube watch tab → DevTools → **Application**
2. Left sidebar: **Storage** → **IndexedDB**
3. Look for the VideoSearch AI database / object store
4. Confirm a record exists for the current `videoId` after indexing

### Network (privacy / offline-first checks)

1. DevTools → **Network**
2. Filter out normal YouTube traffic if needed; look for unexpected third-party embedding/API hosts
3. On a **cache hit**, there should be **no** model download / re-embed work (confirm via console logs + Network)

---

## 6. Recommended test videos

Pick **public** videos with **captions** (auto or manual). Prefer educational long-form.

### Good candidates (examples — substitute any lecture you know)

| Use case | What to look for |
|----------|------------------|
| Long lecture (1–3h) | ML, systems, history, law — clear spoken structure |
| Medium (20–40 min) | Conference talk with good auto-captions |
| Short (~10 min) | Faster indexing smoke test |
| Manual captions | Creator-uploaded track preferred by our fetcher |
| Auto-only captions | Still in scope; quality may be noisier |
| **No captions** | Negative test for graceful “no captions” UI (Step 8) |

### How to confirm a video has captions (before blaming the extension)

1. Open the video on YouTube
2. Click the player **CC** / captions button  
   — or Settings (⚙) → **Subtitles/CC**
3. If only “Off” exists, that video is a **no-captions** test case

### Getting a stable `videoId`

From the URL:

```text
https://www.youtube.com/watch?v=VIDEO_ID
                              ^^^^^^^^
```

Example: `v=dQw4w9WgXcQ` → video id `dQw4w9WgXcQ`

Keep a short personal list of 10–15 educational videos for the final success pass (Section 8).

---

## 7. Build sequence — verify each step

Do **not** skip ahead. Each step has a human checklist. Only continue after the current step passes.

Current implementation status is tracked in `README.md`.

---

### Step 1 — Extension skeleton + placeholder button

**Status target:** Implemented first. This is the first thing you should fully verify.

#### Where to go

1. Build + load extension ([§2](#2-one-time-project-setup), [§4](#4-load--reload-the-extension))
2. Open any watch URL:  
   `https://www.youtube.com/watch?v=ANY_ID_WITH_A_REAL_VIDEO`
3. Open page DevTools → Console

#### What you should see

- A pill button near the video title area labeled **VideoSearch AI**
- Blue → purple gradient, white text, magnifying-glass icon
- Console:  
  `[VideoSearch AI] Placeholder button injected for video: <id>`

#### Click test

1. Click the button
2. Console should log:  
   `[VideoSearch AI] Placeholder button clicked. videoId = <id> ...`
3. Button may briefly pulse (scale animation)

#### Checklist

- [ ] Extension loads on `chrome://extensions` with no errors
- [ ] Button appears on a `/watch` page
- [ ] Button does **not** appear on YouTube Home
- [ ] Button does **not** appear on Search results
- [ ] Click logs the correct `videoId`
- [ ] Navigate to another video in the **same tab** → button remounts for the new id
- [ ] In Elements, you can find `#videosearch-ai-btn` and `#videosearch-ai-root`

#### DOM quick check (Elements → Ctrl/Cmd+F)

```text
#videosearch-ai-root
#videosearch-ai-btn
```

---

### Step 2 — Transcript acquisition

**Status:** Implemented. Auto-fetches shortly after the button injects; click re-logs from cache (or retries on error).

#### Where to go

1. Rebuild + reload extension ([§2](#2-one-time-project-setup), [§4](#4-load--reload-the-extension))
2. Watch page of a video **with captions**
3. DevTools → **Console** (filter: `VideoSearch`)
4. Optionally DevTools → **Network** → filter `timedtext`

#### What you should see

- Button briefly shows **Fetching captions…**, then **Captions · N** (green)
- Console group: `[VideoSearch AI] Transcript for <videoId> (N segments)`
- Logged fields: `track`, `captionTrackHash`, `first 5 segments`, `last segment`, full `RawCaptionSegment[]`
- Each segment shaped like:

```ts
{ startTime: number, endTime: number, text: string }
```

- On **no captions**: button amber **No captions**, console `warn` — page does not crash
- On failure: button red **Fetch failed**, console `error`

#### Checklist

- [ ] Segments log for a known video with captions
- [ ] `startTime` / `endTime` look like real seconds (not all zeros)
- [ ] `text` is readable speech content (not raw XML garbage)
- [ ] Expand `RawCaptionSegment[]` in console — length matches “Captions · N”
- [ ] Video **without** captions → amber button + warn, no crash (no STT)
- [ ] Click button after success → re-logs cached segments without a full re-fetch panic
- [ ] SPA navigate to another captioned video → new fetch for new `videoId`
- [ ] Prefer manual captions over auto when both exist (`track.isAutoGenerated: false` when manual available)

#### Suggested console mental check

- First segment near `0` (or small offset)
- Last segment near video duration
- Dozens to thousands of segments depending on length

---

### Step 3 — Chunking

**Status:** Implemented. Runs automatically after caption fetch.

#### Where to go

1. Rebuild + reload extension
2. Same watch page → Console (filter `VideoSearch`)
3. Button should show green **`Chunks · N`** (N ≪ segment count)

#### What you should see

- Console: `Pipeline for <id> — S segments → C chunks`
- `chunk stats` with avg/min/max duration (avg near **~25s**, target `CHUNK_TARGET_SECONDS`)
- `TranscriptChunk[]` logged — each has `chunkId`, `startTime`, `endTime`, merged `text`
- Chunks prefer sentence boundaries when possible

#### Checklist

- [ ] Button green: **Chunks · N** (e.g. 769 segments → far fewer chunks)
- [ ] Chunk count much smaller than raw segment count
- [ ] Avg duration roughly 15–40s (target 25s)
- [ ] Spot-check 3–5 chunks: readable multi-sentence text, not mid-word junk
- [ ] `startTime` is a seekable second offset
- [ ] No empty `text` chunks on normal captioned videos

---

### Step 4 — Embedding model (single chunk smoke test)

#### Where to go

1. Watch page (or whatever surface triggers model load)
2. Console for shape/length of one embedding
3. Network (first load may download the **local** model files once — still client-side, not a paid API)

#### What you should see

- Model loads without console errors
- One hardcoded/test chunk produces a vector
- Dimension matches the model (e.g. **384** for `all-MiniLM-L6-v2`)

#### Checklist

- [ ] No red errors during model load
- [ ] Logged vector length is correct (e.g. 384)
- [ ] Values are finite numbers (not all `NaN`)
- [ ] No API keys / remote embedding endpoints in Network (only model asset fetch if any)

---

### Step 5 — Full indexing pipeline + IndexedDB cache

#### Where to go

1. First open of a captioned video → Console progress logs
2. DevTools → **Application** → **IndexedDB**
3. Reload the **same** video
4. Network + Console to confirm **cache hit**

#### First visit (cache miss)

- [ ] Pipeline runs: fetch → chunk → embed → save
- [ ] Progress / stage logs appear
- [ ] IndexedDB contains an entry for this `videoId`
- [ ] Stored record includes `captionTrackHash`, `chunks`, `indexedAt`

#### Second visit (cache hit)

- [ ] Console indicates cache hit / skip re-embed
- [ ] No full re-embedding work
- [ ] Search-ready much faster than first visit
- [ ] Network: no repeat model re-download / re-embed traffic for that video (beyond normal YouTube)

#### Cache invalidation (when implemented)

- [ ] If caption track hash changes, index is treated as stale and rebuilt

---

### Step 6 — Search + ranking (console)

#### Where to go

Watch page of an **already indexed** video → Console (hardcoded or temporary query path).

#### What you should see

```ts
// SearchResult[]
{ chunkId, startTime, text, score } // score = cosine similarity 0–1
```

#### Checklist

- [ ] Top result is semantically sensible for a known query (not random)
- [ ] Results sorted by `score` descending
- [ ] `topK` respected (e.g. 5)
- [ ] Irrelevant query under threshold → empty / “no strong matches” path
- [ ] Query → results feels fast after indexing (**target &lt; 2s**)

#### Example query ideas (match the video domain)

| If the video is about… | Try querying… |
|------------------------|----------------|
| ML lecture | `backpropagation`, `gradient descent` |
| Web security | `how does he explain OAuth?` |
| Systems | `what is a page fault` |

---

### Step 7 — UI: search bar + results + click-to-seek

#### Where to go

Watch page → injected **search UI** (replaces pure console workflow).

#### Checklist

- [ ] Search input visible and usable in/near the player UI
- [ ] Typing triggers search after debounce (~300ms)
- [ ] Results show **MM:SS** + snippet + relevance indicator
- [ ] Clicking a result seeks the video (`video.currentTime` ≈ result `startTime`)
- [ ] You hear/see the relevant moment after seek
- [ ] UI feels embedded in YouTube, not a random floating popup elsewhere

#### Seek sanity check

DevTools → Console after a result click:

```js
document.querySelector('video')?.currentTime
```

Should be close to the clicked result’s `startTime`.

---

### Step 8 — Polish (states)

#### Where to go

Exercise each edge case on purpose.

| State | How to trigger | Expected |
|-------|----------------|----------|
| **Indexing** | First open of uncached video | “Indexing this video…” (or stage progress), not a frozen blank UI |
| **No captions** | Video with subtitles disabled / unavailable | Clear message; no crash; no STT attempt |
| **No results** | Nonsense query on indexed video | “No strong matches” (or equivalent), not junk low scores |
| **Ready** | Cache hit or finished index | Search works immediately |
| **Error** | Force a failure if possible | Readable error, recoverable (reload / other video) |

#### Checklist

- [ ] No-captions case is polite and obvious
- [ ] No-results case is polite and obvious
- [ ] First-time indexing shows progress
- [ ] No uncaught exceptions in Console during these paths

---

## 8. Phase 1 success criteria (final pass)

Run this only when Steps 1–8 are implemented.

| # | Criterion | How to verify |
|---|-----------|----------------|
| 1 | Search → results **&lt; 2 seconds** post-index | Time with a stopwatch or `performance.now()` around search |
| 2 | **10–15** educational videos; relevant top-3 for **≥ 90%** of test queries | Keep a simple spreadsheet or notes table |
| 3 | Re-open indexed video → **zero** re-embed / no unnecessary work | Console cache-hit log + Network/Application |
| 4 | **No paid APIs** | Grep repo for keys; Network has no billed embedding endpoints |
| 5 | UI feels **native** to YouTube player | Subjective but deliberate: placement, styling, not a disconnected popup-only UX |
| 6 | Graceful **no captions / no results / indexing** | Step 8 matrix above |

### Suggested scoring sheet

```text
Video | Query | Top-1 OK? | Top-3 OK? | Notes
------|-------|-----------|-----------|------
...   | ...   | Y/N       | Y/N       | ...
```

**Top-3 OK** = the moment you wanted appears in the first three results.

---

## 9. Troubleshooting

| Symptom | Where to look | What to try |
|---------|---------------|-------------|
| Extension missing | `chrome://extensions` | Developer mode on; Load unpacked → `dist/` |
| “Manifest file is missing or unreadable” | File picker path | Select **`dist`**, not repo root |
| Button never appears | Console + Elements | Confirm URL is `/watch?v=...`; reload extension + hard refresh page |
| Button on Home | Elements | Should not happen; file a bug if it does |
| Old code after edit | Extensions page | `npm run build` → reload extension → hard refresh YouTube |
| Console empty | Wrong DevTools | Use **page** DevTools, not only service worker |
| YouTube layout moved button | Elements | Title/player DOM changed; remount logic may need a new mount selector |
| Captions empty (Step 2+) | Network + Console | Confirm CC available in player; try another video |
| IndexedDB empty (Step 5+) | Application tab | Confirm indexing finished; check errors mid-pipeline |
| Seek doesn’t work (Step 7+) | Console | Ensure `document.querySelector('video')` exists; check `startTime` units (seconds) |

### Useful Console snippets (page context)

```js
// Is our UI mounted?
document.getElementById('videosearch-ai-root')
document.getElementById('videosearch-ai-btn')

// Current video id
new URLSearchParams(location.search).get('v')

// Player clock
document.querySelector('video')?.currentTime
```

---

## 10. What not to test yet

Phase 1 **does not** include:

- Speech-to-text when captions are missing  
- Cross-video / playlist search  
- Coursera, Udemy, LMS, etc.  
- Chat / RAG / summaries / flashcards  
- Accounts, sync, or any backend  
- Search history beyond the per-video local cache  

If a test plan requires any of the above, it is **out of scope** — flag it instead of treating it as a product bug.

---

## Quick start card (print / pin)

```text
1. cd videosearch && npm install && npm run build
2. chrome://extensions → Developer mode → Load unpacked → dist/
3. Open https://www.youtube.com/watch?v=...
4. Look for “VideoSearch AI” near the title
5. DevTools (page) → Console → filter “VideoSearch”
6. After code changes: npm run build → reload extension → hard refresh YouTube
```

---

## Document history

| Version | Notes |
|---------|--------|
| Phase 1 / Step 1 | Full process doc; Step 1 checklist is live; Steps 2–8 are the verification path as each lands |

When a new build step ships, re-run **only that step’s checklist** before moving on.
