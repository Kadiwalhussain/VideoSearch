# Publish VideoSearch AI on the Chrome Web Store

Copy-paste listing, privacy answers, zip, and review notes. Last updated 25 August 2026.

**Privacy policy URL (required for the dashboard):**  
https://videosearchai.netlify.app/privacy.html

Deploy `website/` (including `privacy.html`) before you submit, or the reviewer will reject the listing.

---

## 1. One-time account

1. Open [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with the Google account that should own the listing
3. Pay the **one-time USD $5** developer registration
4. Complete identity verification if Google asks (common in 2026)

---

## 2. Build the zip Google wants

From the repo root:

```bash
npm install
npm run store:zip
```

That builds the extension and writes:

```text
store/videosearch-ai-1.1.0.zip     ← upload this
store/listing/screenshot-1.png     ← 1280×800
store/listing/screenshot-2.png
store/listing/screenshot-3.png
store/listing/promo-small.png      ← 440×280
store/listing/icon-128.png
```

Load `dist/` unpacked first and click through a captioned YouTube video so you can confirm the zip matches what you tested.

**Do not zip the repo root.** Google wants the folder that contains `manifest.json` (our `dist/`).

---

## 3. Create the item

Dashboard → **New item** → upload `store/videosearch-ai-1.1.0.zip`.

---

## 4. Store listing (paste these)

### Name
```
VideoSearch AI
```
(45-character limit. Keep it.)

### Short description (≤132 characters)
```
Search what was said on YouTube. Jump to the second. Mark, shoot, and keep notes — no API key for search.
```
(110 characters)

### Category
**Productivity** (secondary: Education if asked)

### Language
English

### Homepage
```
https://videosearchai.netlify.app/
```

### Support URL
```
https://github.com/Kadiwalhussain/VideoSearch/issues
```

### Privacy policy
```
https://videosearchai.netlify.app/privacy.html
```

### Full description

```
VideoSearch AI finds the moment something was spoken on a YouTube video — not just the title.

HOW IT WORKS
YouTube captions are indexed in your browser. Type a concept. Ranked timestamps appear. Click one and the player jumps there.

WHAT YOU GET
• Spoken search — on-device, no API key
• Topics from captions
• Marks (⌘M on Mac, Ctrl+M on Windows)
• Frame capture (⌘C on Mac, Ctrl+C on Windows — Copy still works if text is selected)
• Live transcript
• Sources from the description and from speech
• Optional account to sync notes, shots, and bio to Studio and phone

WHAT STAYS LOCAL
Caption text and search embeddings never leave Chrome. Search does not need a key, a login, or a server.

OPTIONAL ACCOUNT
Create an account if you want the same marks and shots on Studio, Android, and iPhone. Skip it and everything still works on this computer.

OPTIONAL CHAT
Settings can hold an AI key for Chat and Ask only. Leave it empty. Search still runs.

SHORTCUTS (YouTube watch page)
Mac: ⌘M mark · ⌘C capture the frame
Windows: Ctrl+M mark · Ctrl+C capture the frame
If those clash with the system, Chrome also registers ⌘⇧M / Ctrl+Shift+M (mark) and ⌘⇧K / Ctrl+Shift+K (capture). Change them in chrome://extensions/shortcuts.

This extension only runs on YouTube watch pages. It does not change ads or replace YouTube’s player.
```

---

## 5. Graphics

| Asset | Size | File |
|-------|------|------|
| Store icon | 128×128 PNG | `store/listing/icon-128.png` |
| Screenshots (at least 1, up to 5) | **1280×800** PNG | `store/listing/screenshot-1.png` … |
| Small promo (required) | **440×280** PNG | `store/listing/promo-small.png` |
| Marquee (optional) | 1400×560 | skip unless you have a real shot |

Screenshots must show the **real extension UI** on YouTube. After `npm run store:zip`, open a lecture, take 2–3 extra 1280×800 shots of:

1. The VideoSearch pill + search results  
2. A red mark on the progress bar  
3. The welcome / create-account tab  

Replace the generated files if they look like marketing art. Reviewers reject mockups.

---

## 6. Privacy practices tab (checkboxes)

Google will ask what you collect. Answer **only what the code does**.

| Question | Answer |
|----------|--------|
| Personally identifiable info | **Yes, optional** — email and name if the user creates an account |
| Health / financial / auth | **No** (password is sent only to the user’s vault to log in; we do not sell it) |
| User activity | **Yes, limited** — which YouTube video they mark/search **on the page they opened**; not browsing history across the web |
| Website content | **Yes** — YouTube captions and description for the current watch page, used to search and extract sources |
| Location | **No** |
| Web history | **No** |
| Sold to third parties | **No** |
| Used for credit / lending | **No** |
| Remote code | **No** — all extension JS ships in the zip. Model weights download from Hugging Face / jsDelivr for on-device search |

**Single purpose statement** (paste):

```
This extension searches spoken YouTube captions on the watch page, lets the user mark moments and capture frames, and optionally syncs those notes to the user’s own vault. It does not run on other sites except to paste a transcript when the user asks.
```

**Host permission justifications** (paste in the justification boxes):

- `https://www.youtube.com/*` — inject the search panel and fetch captions for the current video  
- `https://youtube.com/*`, `https://m.youtube.com/*` — same  
- Hugging Face / jsDelivr — download the MiniLM embedding model once so search stays on-device  
- Optional `api.x.ai`, Groq, OpenAI, Mistral — only if the user pastes a Chat/Ask key  
- ChatGPT / Claude / Gemini / Grok / Perplexity — only to paste a transcript when the user taps Ask  
- `http://127.0.0.1:8787/*` and LAN — optional local vault sync  

**clipboardWrite** — copy a timestamp or source URL when the user clicks copy.  
**storage** — local index, marks, shots, settings, optional session.

---

## 7. Distribution

- Visibility: **Public**
- Regions: All, unless you need to restrict
- Pricing: **Free**

---

## 8. After submit

1. Status → **Pending review** (often 1–3 days; first item can take longer)
2. If rejected, the email cites a policy. Fix the zip, bump `version` in `manifest.config.ts` (e.g. `1.1.1`), rebuild, upload again
3. When published, the URL looks like:  
   `https://chromewebstore.google.com/detail/videosearch-ai/<ID>`

**Updates:** bump `version` every upload. Google will not accept the same version twice.

---

## 9. Reviewer traps we already avoided

- Manifest V3  
- No remote extension JS  
- Search works without a key  
- Privacy policy is a real HTTPS page  
- Screenshots are 1280×800  
- `dist/` only in the zip — not `src/` or `node_modules/`

Do not mention “bypass ads”, “download YouTube videos”, or “undetected”. That gets the item banned.

---

## 10. Shortcuts (also in the listing)

On a YouTube **watch** page, with no text field focused:

| Action | Mac | Windows / Linux |
|--------|-----|-----------------|
| Mark this moment | ⌘M | Ctrl+M |
| Capture this frame | ⌘C | Ctrl+C |

⌘C / Ctrl+C still **copies** if you have text selected.  
Chrome also registers ⌘⇧M / Ctrl+Shift+M and ⌘⇧K / Ctrl+Shift+K. Edit at `chrome://extensions/shortcuts`.
