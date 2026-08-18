# VideoSearch Mobile

Cross-platform Flutter client (**Android · iOS**) for the VideoSearch vault.  
Same account as Chrome and Studio. Marks, shots, bio, and sources (from the description **and** from captions) show here. The in-app player is YouTube’s official IFrame — tap a mark or shot to seek; you stay in the app.

Full product docs: [../README.md](../README.md) · sources: [../docs/SOURCES.md](../docs/SOURCES.md).

## Folder structure

```
mobile/
├── lib/
│   ├── main.dart                 # App entry, theme + Provider
│   ├── app_router.dart           # go_router (auth redirect, shell tabs)
│   ├── core/
│   │   ├── config.dart           # API base defaults per platform
│   │   ├── format.dart           # time, source filter helpers
│   │   ├── theme.dart            # Material 3 light/dark
│   │   └── validators.dart       # email / password / URL validation
│   ├── models/
│   │   └── models.dart           # Session, VaultRow, highlights, …
│   ├── services/
│   │   ├── api.dart              # HTTP pipeline → vault REST API
│   │   └── session_store.dart    # JWT in secure storage (Keychain/Keystore)
│   ├── providers/
│   │   └── app_state.dart        # Account-scoped vault state
│   ├── screens/                  # UI pages
│   └── widgets/                  # Glass cards, responsive grid, tiles
├── android/  ios/  web/
└── pubspec.yaml
```

## API pipeline (account-scoped)

| Client method | HTTP | Auth | Purpose |
|---------------|------|------|---------|
| `login` / `register` | `POST /api/auth/*` | — | JWT + user |
| `me` | `GET /api/auth/me` | Bearer | Validate session on launch |
| `fetchVault` | `GET /api/vault` | Bearer | **Only this user’s videos** |
| `libraryAction` | `POST /api/vault/library` | Bearer | Save / watch later / playlist |
| `deleteVideo` / mark / shot | `DELETE /api/vault/…` | Bearer | Mutations |
| `saveBio` | `POST /api/vault/sync` | Bearer | Bio (merge-safe) |
| `createShare` | `POST /api/vault/:id/share` | Bearer | Public share link |
| `aiSearch` | `POST /api/vault/ai-search` | Bearer | AI over **your** vault |
| `health` | `GET /health` | — | Connectivity |

Server uses JWT `sub` / `userId` for every vault query — data never crosses accounts.

### Auth security

- JWT stored in **FlutterSecureStorage** (Android EncryptedSharedPreferences / iOS Keychain)
- Session validated with `/api/auth/me` on cold start
- **401/403 → automatic logout** and secure wipe
- Legacy plaintext prefs migrated once then deleted
- Client-side validation for email, password, vault URL
- Passwords never logged; Authorization header not printed

## Run

```bash
# Terminal 1 — vault
cd server && npm run start:always

# Terminal 2 — mobile
cd mobile
flutter pub get
# iOS only: patch share_plus keyWindow deprecation (also runs in pod install)
bash tool/patch_share_plus_ios.sh
cd ios && pod install && cd ..
flutter run
```

### iOS `keyWindow` deprecation (share_plus)

Xcode may show:

`FPPSharePlusPlugin` · `'keyWindow' is deprecated: first deprecated in iOS 13.0`

This comes from the **share_plus** plugin, not our app code. We fix it by:

1. `tool/patch_share_plus_ios.sh` — rewrites the plugin to use `UIWindowScene` only  
2. `ios/Podfile` `post_install` — re-applies the patch after every `pod install`  
3. `ShareHelper` — always passes `sharePositionOrigin` (required on iPad / modern iOS)

If you run `flutter pub get` again and the warning returns, re-run:

```bash
bash tool/patch_share_plus_ios.sh
cd ios && pod install
```

### Vault URL

| Device | Default |
|--------|---------|
| Android emulator | `http://10.0.2.2:8787` |
| iOS simulator | `http://127.0.0.1:8787` |
| Physical phone | `http://<LAN-IP>:8787` (set in **More**) |

Use the **same email/password** as Studio.

## UI

- Material 3 glass cards, accent emerald
- Responsive grid: 1 col phone · 2 tablet · 3 desktop/web
- Pull-to-refresh, animated tiles, cinematic video detail
- Bottom nav: Home · Library · Lists · Search · More

## Release

```bash
flutter build apk
flutter build ios
flutter build web
```
