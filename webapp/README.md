# VideoSearch Studio (React)

Cinematic SaaS dashboard for the vault API — **React 18 + React Router + shared vault store**.

## Develop

```bash
# Terminal 1 — API
cd server && npm run start:always

# Terminal 2 — Studio HMR
cd webapp && npm install && npm run dev
# → http://localhost:5173/app/  (proxies /api → :8787)
```

## Production build (served by Express at /app/)

```bash
cd webapp && npm run build
# output: webapp/dist
# open http://127.0.0.1:8787/app/
```

## Architecture

| Layer | Role |
|--------|------|
| `SessionContext` | JWT + API URL |
| `VaultContext` | Single vault dataset + library mutations |
| `StudioLayout` | Sidebar + topbar; `<Outlet />` for routes |
| `pages/*` | Route screens (Dashboard, Library, Notes, …) |
| `api/*` | Thin fetch wrappers for `/api/auth` and `/api/vault` |

All nav items are real URLs under basename `/app`.
