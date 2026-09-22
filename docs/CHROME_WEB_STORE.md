# Publish VideoSearch AI on the Chrome Web Store

This is the full process, in order. Do each box before the next.

**Privacy policy (Google requires a live HTTPS page):**  
https://videosearchai.netlify.app/privacy.html

**Developer dashboard:**  
https://chrome.google.com/webstore/devconsole

**Official Google steps:**  
https://developer.chrome.com/docs/webstore/publish

---

## What you are doing

You upload a **zip of `dist/`** (the built extension), fill a listing, answer a privacy form, and click **Submit for review**. Google reviews it (often 1–3 days, first item can take longer). Then anyone can install from:

`https://chromewebstore.google.com/detail/videosearch-ai/<ID>`

You do **not** upload the GitHub repo, `src/`, or `node_modules/`.

Pricing on the store listing is **Free**. Plus / Pro (see [PRICING.md](./PRICING.md)) can come later **inside the app** with Stripe/Clerk. Do not mark the item as a paid CWS listing until that is built.

---

## Step 0 — You need these

- [ ] This repo on your Mac, Node 18+
- [ ] A Google account that will **own** the listing (use one you will keep)
- [ ] **USD $5** one-time developer fee (Google, not refundable)
- [ ] Privacy page live (already: `videosearchai.netlify.app/privacy.html`)
- [ ] A captioned YouTube video to test (any lecture with CC)

---

## Step 1 — Developer account (once)

1. Open https://chrome.google.com/webstore/devconsole
2. Sign in
3. Pay the **$5** registration if Google asks
4. Complete **identity verification** if Google asks (name, ID — common now)
5. On **Account**, turn on email notifications so you see “published” / “rejected”

New publishers can only publish **2 items** until Google raises the limit. One item is enough.

---

## Step 2 — Test unpacked (do this before the zip)

```bash
cd /path/to/videosearch
npm install
npm run build
```

1. Chrome → `chrome://extensions`
2. Developer mode **ON**
3. **Load unpacked** → the `dist/` folder (not the repo root)
4. Open a **watch** URL with captions
5. Confirm: VideoSearch chip, search a spoken word, Mark, Shot
6. If Chrome asks for **Local network access**, Allow it (vault on this PC)

If this is broken, do not upload. Reviewers will reject it.

---

## Step 3 — Build the store zip

```bash
npm run store:zip
```

That command builds the extension and writes:

| File | What it is |
|------|------------|
| `store/videosearch-ai-1.1.0.zip` | **Upload this** |
| `store/listing/icon-128.png` | Store icon |
| `store/listing/promo-small.png` | 440×280 small tile |
| `store/listing/screenshot-1.png` | 1280×800 (replace with a real YouTube shot) |
| `store/listing/screenshot-2.png` | 1280×800 |
| `store/listing/screenshot-3.png` | 1280×800 |

The zip is the **contents of `dist/`** (it must contain `manifest.json` at the top of the zip).

**Replace the generated screenshots** with real captures of the extension on YouTube. Reviewers reject marketing mockups.

Take them at **1280×800**:

1. Watch page: VideoSearch chip + search results  
2. A mark on the timeline + notes  
3. Welcome / create account (email + password)

On macOS: Screenshot → Options → capture a window, or crop in Preview.

---

## Step 4 — Create the item and upload the zip

1. Dashboard → **New item** (or **Add new item**)
2. Choose `store/videosearch-ai-1.1.0.zip`
3. **Upload**
4. If Google says the zip is invalid, you zipped the wrong folder. Run `npm run store:zip` again; do not zip the whole repo.

The item now exists as a **draft**. Fill the tabs on the left.

---

## Step 5 — Store listing tab (copy-paste)

### Name (max 45 characters)

```
VideoSearch AI
```

### Short description (max 132 characters)

```
Search what was said on YouTube. Jump to the second. Mark, shoot, and keep notes — no API key for search.
```

### Category

**Productivity**  
(Secondary if asked: Education)

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

### Graphics (this tab)

| Dashboard field | Size | File to upload |
|-----------------|------|----------------|
| Icon | 128×128 | `store/listing/icon-128.png` |
| Small promo tile | 440×280 | `store/listing/promo-small.png` |
| Screenshots (min 1, up to 5) | 1280×800 | your real YouTube PNGs |
| Marquee | 1400×560 | skip unless you have a real banner |

### Full description (paste)

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

## Step 6 — Privacy tab (checkboxes)

Answer **only what the code does**. Wrong answers get the item pulled later.

| Question | Your answer |
|----------|-------------|
| Personally identifiable information | **Yes, optional** — email / name if they create an account |
| Health, financial, authentication secrets sold | **No** |
| User activity | **Yes, limited** — the YouTube **watch page they opened** (video they search/mark). Not their whole browsing history |
| Website content | **Yes** — captions + description of the **current** video, to search and find sources |
| Location | **No** |
| Web history | **No** |
| Sold to third parties | **No** |
| Used for credit / lending | **No** |
| Remote code | **No** — all extension JS is in the zip. The MiniLM model downloads once from Hugging Face / jsDelivr and stays in the browser |

### Single purpose (paste)

```
This extension searches spoken YouTube captions on the watch page, lets the user mark moments and capture frames, and optionally syncs those notes to the user’s own vault. It does not run on other sites except to paste a transcript when the user asks.
```

### Permission justifications (paste in each box)

**`https://www.youtube.com/*`**, **`https://youtube.com/*`**, **`https://m.youtube.com/*`**  
Inject the search panel and read captions for the current watch page.

**Hugging Face / jsDelivr**  
Download the on-device MiniLM model once so search does not need a server.

**`api.mistral.ai`, `api.x.ai`, Groq, OpenAI**  
Only if the user pastes their own Chat/Ask key. Search does not use these.

**ChatGPT / Claude / Gemini / Grok / Perplexity**  
Only to paste a transcript when the user taps Ask in an external chat.

**`http://127.0.0.1:8787/*`**, **`http://localhost:8787/*`**, LAN `:8787`  
Optional local vault on the user’s computer (Studio + phone). Not required for search.

**`storage`**  
Save the local caption index, marks, shots, and login session on this device.

**`clipboardWrite`**  
Copy a timestamp or source link when the user clicks copy.

**`cookies`**  
Used only if the user signs in with the optional account/Google flow.

---

## Step 7 — Distribution tab

| Field | Set to |
|-------|--------|
| Visibility | **Public** |
| Regions | All countries (unless you must restrict) |
| Pricing | **Free** |

---

## Step 8 — Test instructions tab (for the reviewer)

Paste this so Google can try the extension without emailing you:

```
1. Install the extension.
2. Open any YouTube watch page that has captions (CC on), for example a long lecture.
3. You should see a VideoSearch chip near the channel / Like row. Click it.
4. Type a word that is spoken in the video (not only in the title). Click a result — the player should jump to that second.
5. Search does not need an account or an API key.
6. Optional: create an account with any email. If the vault is not running, search still works; only cloud sync will say it cannot reach the vault.
7. Do not test on YouTube Home. The panel is for watch pages only.
```

You do **not** need to give the reviewer a password.

---

## Step 9 — Submit for review

1. Click **Submit for review**
2. Confirm the dialog  
   - Leave “publish automatically after review” **checked** if you want it live as soon as Google says yes  
   - Uncheck if you want to press Publish yourself later
3. Status becomes **Pending review**

Watch the Google account email. Rejections go there.

---

## Step 10 — After it is live

You get a URL like:

```
https://chromewebstore.google.com/detail/videosearch-ai/<ITEM_ID>
```

Put that link on:

- https://videosearchai.netlify.app/
- GitHub README
- Tester emails

**Every future upload must bump the version.** In `manifest.config.ts` change:

```ts
version: "1.1.0",
```

to `1.1.1`, then:

```bash
npm run store:zip
```

Upload the new zip on the same item → Submit for review again. Google refuses the same version twice.

---

## If they reject it

The email names a policy. Typical fixes:

| They say | You do |
|----------|--------|
| Privacy policy missing / 404 | Confirm https://videosearchai.netlify.app/privacy.html loads |
| Screenshots not 1280×800 or look fake | Replace with real watch-page captures |
| Single purpose / extra hosts | Shorten host_permissions or justify each one |
| Doesn’t work | You uploaded a bad zip — load `dist/` unpacked and re-zip |
| Remote code | Do not load JS from the network. Model weights only. |

Bump version, rebuild, upload, submit again.

---

## Do not write in the listing

These words get extensions banned:

- download YouTube videos  
- bypass ads  
- undetected / hidden from YouTube  

---

## Master checklist

- [ ] $5 developer account paid  
- [ ] Privacy URL opens in a private window  
- [ ] `npm run build` + Load unpacked `dist/` works on a captioned video  
- [ ] `npm run store:zip`  
- [ ] Zip is `store/videosearch-ai-1.1.0.zip` (manifest at the root of the zip)  
- [ ] 3 real 1280×800 screenshots  
- [ ] Listing name, short + full description pasted  
- [ ] Privacy checkboxes match the table above  
- [ ] Distribution = Public + Free  
- [ ] Test instructions pasted  
- [ ] Submit for review  
- [ ] Wait for email  

When the store URL is live, add it to the website **Install** section.
