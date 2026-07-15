# VideoSearch AI

> **Search what was said, not just what was titled.**

Chrome extension (Manifest V3) that indexes a YouTube video’s captions **locally**, finds moments with semantic search, and (optionally) answers questions about the video with your own API key.

**Release: v1.0.0**

## Features

| Feature | Description |
|--------|-------------|
| **Local captions** | Fetches YouTube timedtext (Innertube); no STT |
| **Semantic search** | In-browser MiniLM embeddings + cosine ranking |
| **Topics** | Main topics (local or optional AI labels) |
| **Live transcript** | Captions synced to the playhead; click to seek |
| **Ask mode** | Questions like “What happened in this episode?” → answer + jump links |
| **Clickable timestamps** | Green time pills in answers jump the player |
| **Tabbed UI** | Search · Topics · Transcript · Settings (compact) |
| **Cache** | IndexedDB so re-open skips re-embedding |

## Install (development)

```bash
npm install
npm run build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder
4. Open any `youtube.com/watch?v=…` page with captions

## Optional AI (topics + Ask)

1. Open the extension panel → **⚙ Settings**
2. Paste an OpenAI-compatible API key
3. Default endpoint/model target a common chat-completions API (configure as needed)
4. **Save & refresh topics**

Search embeddings always run **in the browser**. Only topic labeling / Q&A send short excerpts when a key is set.

**Never commit API keys.** Use Settings only.

## Scripts

```bash
npm run dev    # Vite + CRX HMR
npm run build  # production → dist/
```

## Project layout

```
src/
  content/          # YouTube content scripts + page bridge
  transcript/       # Caption fetch/parse
  chunking/         # Semantic-ish time windows
  embedding/        # transformers.js MiniLM
  storage/          # IndexedDB video index
  search/           # Cosine + hybrid ranking
  topics/           # Topic extraction + LLM topics
  qa/               # Ask / answer over retrieved clips
  ui/               # Search panel, live transcript
  player/           # Reliable YouTube seek
  background/       # Indexing orchestrator
  pipeline/         # Lazy-loaded heavy entry
  settings/         # API key storage (chrome.storage)
```

## Privacy

- Captions, embeddings, and keyword search stay on the machine by default.
- With an API key: short excerpts may be sent to **your** configured endpoint for topics/answers only.

## License

See repository license file if present.
