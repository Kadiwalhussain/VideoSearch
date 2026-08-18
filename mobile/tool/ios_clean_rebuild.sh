#!/usr/bin/env bash
# Wipe stale Xcode/Flutter iOS artifacts and rebuild cleanly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "==> Cleaning Flutter"
flutter clean

echo "==> Removing iOS pods / build junk"
rm -rf build/ios build/ios-framework
rm -rf ios/Pods ios/Podfile.lock ios/.symlinks
rm -rf ios/Flutter/ephemeral
rm -rf ~/Library/Developer/Xcode/DerivedData/*Runner* 2>/dev/null || true
rm -rf ~/Library/Developer/Xcode/DerivedData/*videosearch* 2>/dev/null || true

echo "==> flutter pub get"
flutter pub get

echo "==> pod install"
cd ios
pod install
cd ..

echo "==> Building iOS (debug, no codesign)"
flutter build ios --debug --no-codesign

echo ""
echo "✓ Clean rebuild OK"
echo "  Open: open ios/Runner.xcworkspace"
echo "  Or:   flutter run -d <device-id>"
