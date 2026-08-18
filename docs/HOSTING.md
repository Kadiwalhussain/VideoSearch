# Host the product website (static UI only)

**Official site:** [https://videosearchai.netlify.app/](https://videosearchai.netlify.app/)

The landing page lives in `website/`. HTML + CSS + JS. No vault, no npm build.

**Repo configs already point hosts at that folder:**

- `vercel.json` — output `website`, no install/build
- `netlify.toml` — base `website`
- `.github/workflows/deploy-website.yml` — GitHub Pages from `website/`

## Vercel

1. [vercel.com/new](https://vercel.com/new) → import `Kadiwalhussain/VideoSearch`
2. Framework **Other**, output `website`
3. Deploy → `https://….vercel.app`

If the wizard still detects Vite, set **Root Directory** to `website` and clear Install + Build.

## Netlify

1. Import the same repo
2. **Publish directory** `website` (or leave `netlify.toml` as-is)
3. **Build command** `true` or empty
4. Deploy → `https://….netlify.app`

Drag-and-drop: [app.netlify.com/drop](https://app.netlify.com/drop) the `website` folder.

## Cloudflare Pages (not Workers)

Do **not** use **Create a Worker** (`npx wrangler deploy`). Use **Pages**:

| Field | Value |
|--------|--------|
| Production branch | `main` |
| Framework | None |
| Build command | empty |
| Build output directory | `website` |

URL: `https://<project>.pages.dev`

## GitHub Pages

Settings → Pages → Source **GitHub Actions**.  
Do not use “Deploy from a branch” + folder `/website` (GitHub only allows `/` or `/docs`).

## Local

```bash
npx --yes serve website -l 5180
# http://localhost:5180
```
