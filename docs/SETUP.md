# Local setup (Chrome + vault)

For a private tester pack with filled keys, use a local `tester/` folder (gitignored). This page is the public path.

## Requirements

- Node 18+ (18 / 22 both fine)
- npm
- Chrome
- MongoDB on `127.0.0.1:27017` (Community Server or Atlas URI)

## Install

```bash
git clone https://github.com/Kadiwalhussain/VideoSearch.git
cd VideoSearch
npm install
cp server/.env.example server/.env
# edit server/.env: MONGODB_URI, JWT_SECRET
npm install --prefix server
npm run build
```

## Start the vault

```bash
cd server
npm run start:always
```

Confirm:

```bash
curl -sf http://127.0.0.1:8787/health
```

You want `"ok": true` and `"mongo": "connected"`.

Studio UI: [http://127.0.0.1:8787/app/](http://127.0.0.1:8787/app/)

On macOS you can keep it alive with LaunchAgents using `server/scripts/vault-launchd.sh` (uses `$HOME` and `server/.env`).

## Load the extension

1. `chrome://extensions` → Developer mode
2. **Load unpacked** → the repo’s `dist/` folder (not `src/`)
3. After `npm run build`, click **Reload** on the card
4. If Chrome asks for **Local network access**, allow it
5. Open a captioned YouTube **watch** URL

Toolbar icon on YouTube opens the in-page panel. Off YouTube it opens the welcome/account page.

## First account

Register from the welcome page or the panel:

- Email + password (10+ characters, letters and a number)
- No API key required for search or for the vault login itself

Forgot password: the one-time code is printed in the **vault terminal**, not emailed.

## Phone on the same Wi‑Fi

Set the vault URL to `http://<LAN-IP>:8787` (vault `HOST=0.0.0.0`). Example: `http://192.168.0.103:8787`.

## Optional copies

| Env | Purpose |
|-----|---------|
| `VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | Clerk widgets + `/api/auth/clerk` |
| `LLM_API_KEY` | Server Chat / Ask / topics |
| `R2_*` / `FIL_*` | Extra JPEG copies |
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Mirror Mongo into Postgres (`server/sql/vault_supabase.sql`) |
| `SUPABASE_S3_*` | JPEG copies in Supabase Storage |
| `GOOGLE_CLIENT_ID` / `SECRET` | Continue with Google |

Schema SQL: `server/sql/vault_supabase.sql`  
One-shot copy: `cd server && npm run sync:supabase`

## Data promise

Sign-in **uploads and merges**. It does not wipe marks or shots on the device or in Mongo. See [AUTH_AND_DATA.md](./AUTH_AND_DATA.md).
