# VideoSearch Vault (web)

Account login UI for your private vault (same JWT as the Chrome extension).

## Run

1. Start the API: `cd server && npm run dev`
2. Open `webapp/index.html` (static file — any static server or open in browser)
3. **Create account** or **Log in** with the same email as the extension
4. Browse highlights and R2-backed screenshots

Data never mixes between users — each JWT only loads that account’s Mongo rows and R2 keys under `users/<userId>/`.
