# VideoSearch AI — product website

Static site only. No backend, no build step.

**Live URL (after the one-time Pages setup below):**

https://kadiwalhussain.github.io/VideoSearch/

## Local preview

```bash
npx --yes serve website -l 5180
# http://localhost:5180
```

## Host for free — GitHub Pages

This repo already deploys `website/` with `.github/workflows/deploy-website.yml`.

Do this once in the GitHub repo:

1. Open **Settings → Pages**
2. **Build and deployment → Source** = **GitHub Actions**
3. Push `website/` (and the workflow) to `main`

The Action publishes only the UI folder. Every later push to `website/` updates the site.

Do **not** pick “Deploy from a branch” + folder `/website`. GitHub only allows `/` or `/docs` for branch deploys, so that path 404s.

## Other free hosts (same folder)

All of these work with the raw `website/` folder — no npm build:

| Host | How |
|------|-----|
| [Cloudflare Pages](https://pages.cloudflare.com) | Create project → connect this repo → **Root directory** `website` → deploy |
| [Netlify](https://app.netlify.com/drop) | Drag the `website` folder onto Netlify Drop, or set publish directory to `website` |
| [Vercel](https://vercel.com) | Import repo → **Root Directory** `website` → Framework: Other |

Custom domain is optional on all of them.

## What’s in this folder

| File | Role |
|------|------|
| `index.html` | Landing page + live YouTube demo |
| `styles.css` | Daylight studio theme |
| `main.js` | Reveals + demo player |
| `assets/` | Logo and product images |
