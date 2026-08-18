#!/usr/bin/env bash
# Reliable phone install. USE A USB CABLE — wireless debug is broken on iOS 26.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -z "${IP:-}" ]]; then
  echo "ERROR: No Wi‑Fi IP (en0). Connect Mac to Wi‑Fi first."
  exit 1
fi

echo "════════════════════════════════════════"
echo " VideoSearch → iPhone"
echo " Mac LAN IP: $IP"
echo "════════════════════════════════════════"
echo ""
echo " BEFORE CONTINUING:"
echo "  1. Plug iPhone into Mac with USB cable"
echo "  2. Unlock iPhone, tap Trust"
echo "  3. Settings → Privacy & Security → Developer Mode = ON"
echo "  4. Same Wi‑Fi as Mac (for vault API)"
echo "  5. Vault running:  cd server && npm run start"
echo ""
read -r -p "Press ENTER when phone is plugged in & unlocked… " _

echo "==> Devices"
flutter devices

DEVICE_ID="$(flutter devices 2>/dev/null | grep -i 'iphone' | grep -vi simulator | head -1 | awk -F'•' '{print $2}' | xargs || true)"
if [[ -z "${DEVICE_ID:-}" ]]; then
  echo ""
  echo "ERROR: No physical iPhone detected."
  echo "  • Use a USB cable (wireless fails often on iOS 26)"
  echo "  • Unlock phone + Trust this computer"
  echo "  • Xcode → Window → Devices and Simulators → check phone appears"
  exit 1
fi

echo "Using device: $DEVICE_ID"
echo "==> Building signed release (no debugger — Xcode wireless attach is broken on iOS 26)"
flutter build ios --release \
  --dart-define=VAULT_API_BASE="http://${IP}:8787"

APP="$ROOT/build/ios/iphoneos/Runner.app"
if [[ ! -d "$APP" ]]; then
  echo "ERROR: $APP missing. Build failed."
  exit 1
fi

CORE_ID="$(xcrun devicectl list devices 2>/dev/null | awk '/connected/ {print $3; exit}')"
if [[ -z "${CORE_ID:-}" ]]; then
  echo "ERROR: No unlocked/connected iPhone via devicectl."
  echo "Unlock the phone, tap Trust, then re-run this script."
  exit 1
fi

echo "==> Installing on $CORE_ID"
xcrun devicectl device install app --device "$CORE_ID" "$APP"
echo "==> Launching (unlock the phone if this fails)"
if xcrun devicectl device process launch --device "$CORE_ID" com.videosearch.videosearchMobile; then
  echo "Launched VideoSearch. Vault URL: http://$IP:8787"
else
  echo "Installed. Unlock the iPhone and tap the VideoSearch icon."
fi
echo ""
echo " Do NOT press Play in Xcode over Wi‑Fi — that is the attach-to-pid crash."
echo " Use this script, or plug in USB if you need a debug session."
