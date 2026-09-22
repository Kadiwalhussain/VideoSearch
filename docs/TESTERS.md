# Early testers

People who already paid for VideoSearch AI get a **private** `tester/` folder (keys + a CLI prompt). That folder is gitignored. It is not on GitHub.

## What you receive

A zip or AirDrop with `tester/` inside. Drop it on the repo root so you have:

```
VideoSearch/
  tester/
    README.md
    CLI_PROMPT.md
    link.sh
    env/server.env
    env/extension.env
```

## What you do

1. Clone the public repo if you do not have it:

   ```bash
   git clone https://github.com/Kadiwalhussain/VideoSearch.git
   cd VideoSearch
   ```

2. Copy the private `tester/` folder into that directory.

3. Paste this into Grok, Claude, or Cursor (same text as `tester/CLI_PROMPT.md`):

````
You are setting up VideoSearch AI for an early paying tester. Do the work. Do not ask them to copy env files by hand. Do not print secret values in chat.

Repo: https://github.com/Kadiwalhussain/VideoSearch.git
Work in the current workspace if it already is this repo; otherwise clone it.

GOAL
Link every API key so Chrome, Studio, login, marks, shots, and Chat work on this machine.

KEYS (source of truth, gitignored)
- tester/env/server.env  →  server/.env
- tester/env/extension.env  →  .env.local  (repo root)

If tester/env/server.env is missing, STOP and tell the human: drop the private tester/ folder into the repo root (emailed separately, never on GitHub). Do not invent keys.

STEPS (run them)
1. Confirm tester/env/server.env and tester/env/extension.env exist.
2. Run: bash tester/link.sh
   If the script is missing, do the same work yourself:
   - cp tester/env/server.env server/.env
   - cp tester/env/extension.env .env.local
   - npm install
   - npm install --prefix server
   - npm install --prefix webapp
   - npm run build
   - npm run studio:build
   - If Mongo is down, start it (local 127.0.0.1:27017 or use MONGODB_URI from server/.env).
   - If curl http://127.0.0.1:8787/health is not ok, start: cd server && npm run start:always
3. Prove health: curl -sf http://127.0.0.1:8787/health
   Need: ok true, mongo connected.
4. Tell the tester, in this order, what to click:
   - chrome://extensions → Developer mode → Load unpacked → <repo>/dist/
   - Allow Local network access if Chrome asks
   - Open http://127.0.0.1:8787/app/login
   - Register THEIR email (10+ chars, letter + number). Do not log into owner accounts.
   - Open a captioned YouTube watch URL and use the panel: search, Mark, Shot, Save.
5. git status must not show tester/, server/.env, or .env.local. Never commit those.

PRODUCT RULES
- Search is on-device. No key required.
- One account for extension + Studio. Login pulls that user's Mongo vault. It merges. It does not delete.
- Guest marks stay on this browser until they Save / Watch later / playlist, then they sync.
- Forgot-password code prints in the vault terminal.

WHEN YOU ARE DONE
Reply with: health JSON, whether dist/ exists, Studio URL, and the Chrome load path. No secrets.
````

The CLI copies the keys, installs Node packages, builds Chrome + Studio, and starts the vault.

Or run it yourself:

```bash
bash tester/link.sh
```

4. Chrome → `chrome://extensions` → Load unpacked → `dist/`
5. Open [http://127.0.0.1:8787/app/login](http://127.0.0.1:8787/app/login)
6. Register **your** email. Same account in the extension and Studio.

## What must work

| Check | Pass |
|-------|------|
| `curl -sf http://127.0.0.1:8787/health` | `"ok": true`, `"mongo": "connected"` |
| Welcome / Studio login | Email + password, one product look |
| Captioned YouTube video | Search, Mark, Shot, Save |
| Studio library | That account’s marks and shots |

Search does not need an API key. The keys in `tester/env` are for the vault, Clerk, Chat, and optional cloud copies of shots.

## Do not

- Commit `tester/`, `server/.env`, or `.env.local`
- Log into another tester’s email
- Paste env files into a public issue or Discord

Public setup without the private pack: [SETUP.md](./SETUP.md)
