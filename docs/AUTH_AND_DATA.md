# Auth and data — nothing is thrown away on sign-in

VideoSearch has two stores. They are designed to **merge**, not replace.

| Store | What lives there | Survives |
|-------|------------------|----------|
| **This browser** | Caption index, marks, shots, sources, guest work | Until Chrome data is cleared |
| **Vault (Mongo)** | Account, marks, shots, bio, sources, playlists | As long as Mongo/`server/.env` is intact |
| **Supabase (optional copy)** | Same vault rows + Storage for JPEGs | When `SUPABASE_SERVICE_ROLE_KEY` is set |

Search embeddings never leave the machine. The vault never stores the MiniLM index.

---

## Accounts

| Method | Path | Notes |
|--------|------|--------|
| Register | `POST /api/auth/register` | Email + password (10+ chars, letter and digit) |
| Login | `POST /api/auth/login` | Same JWT as Studio / mobile |
| Forgot / reset | `POST /api/auth/forgot-password` then `/reset-password` | Reset **code prints on the vault terminal** (no email SMTP in local mode) |
| Clerk | `POST /api/auth/clerk` | Session JWT from Clerk Native API → vault JWT |
| Google | `/api/auth/google/start` | Needs `GOOGLE_CLIENT_ID` / `SECRET`; otherwise 501 |

JWT: `Authorization: Bearer <token>`.  
Extension setting `projectUrl` defaults to `http://127.0.0.1:8787`.

Clerk (optional UI): set `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local` and `CLERK_SECRET_KEY` on the vault. Enable **Native API** in the Clerk dashboard for Chrome extensions.

---

## What happens on login

1. Guest notes stay in `chrome.storage` / IndexedDB until you sign in.
2. After login, only videos you **Saved**, put in **Watch later**, or added to a **playlist** upload to the vault.
3. Watching a video or making a mark does **not** create History by itself.
4. The vault **merges by id**. A new login cannot wipe another device’s marks.
5. Screenshots keep existing `dataUrl` / R2 / Supabase keys if the client sends a thinner copy.
6. If the vault is offline, pinned videos queue and **nothing is deleted**.
7. Sign-in never runs “delete local notes”.

## Save / Watch later / Playlists

| Action | Where it shows in Studio | Writes to vault |
|--------|--------------------------|-----------------|
| Watch only | nowhere | no |
| Mark / shot only | this browser | no |
| **Save** | Library | yes |
| **Watch later** | Watch later | yes |
| **Playlist** (name it) | Playlists | yes |
| **Save YT playlist** | Playlists | yes, that list only |
| **Sync bio** | Library + video bio | yes |

History is videos you actually watched that were already in the vault. It is not a dump of every YouTube playlist you opened.

Sign-out only clears the JWT in the extension. Marks on disk stay until you uninstall or clear site data.

---

## Vault write path

```
Mark / Shot in Chrome
    → chrome.storage + IndexedDB (always)
    → POST /api/vault/sync  (when signed in)
        → Mongo VaultVideo (merge)
        → local JPEG backup (server/data/shots)
        → R2 / Fil One / Supabase S3 when those keys work
        → Supabase tables when SUPABASE_SERVICE_ROLE_KEY is set
```

Studio (`/app/`) and mobile use the same JWT and the same Mongo rows.

---

## Env (no secrets in git)

Copy `server/.env.example` → `server/.env`. Required to persist accounts:

```
MONGODB_URI=mongodb://127.0.0.1:27017/videosearch
JWT_SECRET=<32+ random characters>
PORT=8787
HOST=0.0.0.0
```

Optional: Clerk, Mistral/`LLM_API_KEY`, R2, Fil One, `SUPABASE_*`, `GOOGLE_CLIENT_*`.

Never commit `.env`, `.env.local`, or a tester pack that contains live keys.

---

## Health

```bash
curl -sf http://127.0.0.1:8787/health
# {"ok":true,"mongo":"connected",...}
```

`ok: true` with `mongo: connected` means auth and vault writes will persist. Cloud copies (R2 / Supabase) can be down without losing Mongo data.
