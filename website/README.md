# VideoSearch AI — product website

Static HTML/CSS/JS. No backend. No npm build.

## Local preview

```bash
npx --yes serve website -l 5180
# http://localhost:5180
```

## Host for free — Vercel or Netlify

The repo is already set up so **only `website/`** is published. Import the GitHub repo. Do not let the host build the Chrome extension or Studio app.

### Vercel

1. Open [vercel.com/new](https://vercel.com/new)
2. Import `Kadiwalhussain/VideoSearch`
3. Confirm it picked up `vercel.json`:
   - Framework: **Other**
   - Install / Build: skipped
   - Output: `website`
4. Deploy

You get a URL like `https://videosearch-….vercel.app`. Add a custom domain later in **Project → Settings → Domains**.

If the wizard still shows Vite, set **Root Directory** to `website`, Framework to **Other**, and clear Install + Build.

### Netlify

1. Open [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. Pick `Kadiwalhussain/VideoSearch`
3. `netlify.toml` already sets base to `website` (no install, no build)
4. Deploy

You get a URL like `https://….netlify.app`.

**No Git:** drag the `website` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).

### Cloudflare Pages (same idea)

Connect the repo → **Root directory** `website` → Framework **None** → deploy.

## What’s in this folder

| File | Role |
|------|------|
| `index.html` | Landing page + live YouTube demo |
| `styles.css` | Daylight studio theme |
| `main.js` | Reveals + demo player |
| `assets/` | Logo and product images |
