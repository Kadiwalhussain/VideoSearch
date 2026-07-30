# VideoSearch Vault API

Account-based backend: **JWT auth**, **MongoDB** (users + notes/highlights), **Cloudflare R2** (screenshots).

## Setup

```bash
cd server
cp .env.example .env   # fill secrets — never commit .env
npm install
npm run dev
```

API: `http://localhost:8787`

## Auth (required for vault)

Users create an account and receive a JWT. The Chrome extension and webapp both use the same login.

| Method | Path | Body |
|--------|------|------|
| POST | `/api/auth/register` | `{ email, password, displayName? }` |
| POST | `/api/auth/login` | `{ email, password }` |
| GET | `/api/auth/me` | Bearer JWT |

Register/login response:

```json
{ "ok": true, "token": "<jwt>", "user": { "userId", "email", "displayName", ... } }
```

All vault routes need:

```
Authorization: Bearer <jwt>
```

Optional: `Authorization: Bearer <VSA_API_KEY>` + `userId` in body/query for service automation.

## Vault endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Mongo + R2 status |
| POST | `/api/vault/sync` | Upsert this user's video (notes + shots → R2) |
| GET | `/api/vault?images=1` | List **your** videos |
| GET | `/api/vault/:videoId` | One video |
| DELETE | `/api/vault/:videoId` | Delete |
| GET | `/api/media/<r2Key>?token=<jwt>` | Proxy screenshot from R2 |

Data is scoped by `userId` from the JWT — accounts cannot read each other.

## Cloudflare R2

1. R2 → create bucket `videosearch`
2. **Manage R2 API Tokens** → Object Read & Write → copy Access Key ID + Secret
3. `server/.env`:

```env
R2_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
R2_BUCKET=videosearch
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

On sync, screenshots upload to `users/<userId>/<videoId>/<shotId>.jpg`. Mongo stores `r2Key` / `imageUrl` (not huge base64 when R2 works).

## Extension + webapp

1. Start this server
2. Extension → **Settings → Account & cloud vault** → Create account / Log in
3. YouTube → **Notes** → mark/shot → **Sync to cloud**
4. Open `webapp/index.html` → same email/password → browse vault

## Security

- Keep `MONGODB_URI`, `JWT_SECRET`, R2 keys only in `server/.env` (gitignored)
- **Rotate** any credentials that were pasted in chat or committed
- Atlas: Network Access allowlist (your IP / `0.0.0.0/0` only for local test)
- Production: set `R2_PUBLIC_PROXY=0` and serve media with JWT or a public R2 domain
