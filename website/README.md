# VideoSearch AI — Official product website

Premium marketing landing page for the **VideoSearch AI** Chrome extension.

## Preview locally

```bash
# from repo root
npx --yes serve website -p 5173
# open http://localhost:5173
```

Or open `website/index.html` directly in a browser.

## Deploy (GitHub Pages)

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` · Folder: `/website`  
   (or use `/docs` if you move this folder to `docs/`)

Custom domain optional. After deploy, the site is typically:

`https://<user>.github.io/VideoSearch/`

If using project Pages, asset paths already use relative `./` links so they work under a subpath.

## Contents

| File | Role |
|------|------|
| `index.html` | Full landing page |
| `styles.css` | Brand system (mint glass, Sora / IBM Plex Mono) |
| `assets/` | Icons + product imagery |

## Brand

- Background: ink `#06080b`
- Accent: mint `#2dd4a8` / cyan `#22b8cf`
- Product UI mock mirrors the floating extension pill
