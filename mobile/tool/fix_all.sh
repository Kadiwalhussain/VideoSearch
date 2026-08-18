#!/usr/bin/env bash
# Nuclear fix for Xcode "stale file" / module noise + verify clean project.
# Usage: bash tool/fix_all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "════════════════════════════════════════════"
echo " VideoSearch mobile — full fix & verify"
echo "════════════════════════════════════════════"

echo ""
echo "==> 1) Quit Xcode if open (ignore error if not)"
killall Xcode 2>/dev/null || true
sleep 1

echo "==> 2) Wipe Flutter + iOS + Xcode DerivedData"
flutter clean || true
rm -rf build
rm -rf .dart_tool
rm -rf ios/Pods ios/Podfile.lock ios/.symlinks
rm -rf ios/Flutter/ephemeral
rm -rf ios/Flutter/Flutter.podspec
# Only this project's derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/*Runner* 2>/dev/null || true
rm -rf ~/Library/Developer/Xcode/DerivedData/*videosearch* 2>/dev/null || true
rm -rf ~/Library/Developer/Xcode/DerivedData/*VideoSearch* 2>/dev/null || true

echo "==> 3) Restore packages"
flutter pub get

echo "==> 4) CocoaPods reinstall"
cd ios
pod deintegrate 2>/dev/null || true
pod install --repo-update
cd ..

echo "==> 5) Static analysis"
flutter analyze
echo "    analyze OK"

echo "==> 6) Unit tests"
flutter test
echo "    tests OK"

echo "==> 7) iOS device build (no codesign)"
flutter build ios --debug --no-codesign
echo "    iOS build OK"

IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
echo ""
echo "════════════════════════════════════════════"
echo " ✓ ALL CHECKS PASSED — project is healthy"
echo "════════════════════════════════════════════"
echo ""
echo " IMPORTANT: yellow 'Stale file' lines in Xcode"
echo " are NOT code errors. Ignore them if build succeeds."
echo ""
echo " Run on your iPhone:"
if [[ -n "${IP:-}" ]]; then
  echo "   flutter run -d <device-id> \\"
  echo "     --dart-define=VAULT_API_BASE=http://${IP}:8787"
  echo ""
  echo " Vault URL on phone login:  http://${IP}:8787"
else
  echo "   flutter run -d <device-id>"
fi
echo ""
echo " Always open:  ios/Runner.xcworkspace"
echo " Never open:   ios/Runner.xcodeproj"
echo ""
