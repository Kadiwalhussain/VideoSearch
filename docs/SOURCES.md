# Sources — bio and captions

VideoSearch collects **resource links** so a lecture’s Drive folder, slides, sponsor site, coupon, or app is not lost in the description or in speech.

## What counts as a source

| Kind | Typical origin |
|------|----------------|
| Drive, Docs, Slides, PDF, GitHub, Notion | Description / bio |
| Course / promo sites (`brilliant.org`, Udemy, …) | Bio **or** spoken in CC |
| Coupon / promo code (`use code BRIGHT20`) | Spoken in CC |
| App Store / Play Store mention | Spoken in CC |
| Link hubs (Linktree, Discord, Telegram) | Bio |

Marks and shots are **not** sources. Those are notes and screenshots **you** take.

## Pipeline

```text
YouTube watch page
        │
        ├─ Description DOM + ytInitialPlayerResponse
        │     → src/youtube/descriptionLinks.ts
        │
        └─ Caption segments (after index)
              → src/youtube/ccSources.ts
                    │
                    ▼
           collectPageSources()
                    │
                    ▼
        Vault POST /api/vault/sync
                    │
        server/src/bioSources.js
          (re-mines bio text, merges, drops YT/Google chrome)
                    │
                    ▼
        Studio + Android + iPhone Sources tab
```

## Extension

After captions index, the content script:

1. Extracts spoken URLs, `dot com` speech, coupons, app-store lines
2. Merges them with description links
3. Sends the list on **Sync bio** and on regular vault sync

Reload the unpacked `dist/` extension after `npm run build`.

## Server

- `extractSourcesFromBio` — markdown + plain URLs in the saved bio
- `isUsefulVaultSource` — drops YouTube/Google chrome; keeps Drive, coupons, app-store search URLs, spoken sites
- `mergeSourceLinks` — bio + CC + existing vault rows, keyed by URL

Caption hits keep `source: "cc"` and `startTime` when the client sends them.

## Tests

```bash
node --test server/src/bioSources.test.js
node --experimental-strip-types --test src/youtube/ccSources.test.ts
```
