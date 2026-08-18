#!/usr/bin/env bash
# Clears Xcode "Stale file … outside of the allowed root paths" warnings.
# Those are NOT compile errors — they are leftover build-graph paths.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "==> Closing Xcode (if open)"
killall Xcode 2>/dev/null || true
sleep 1

echo "==> Deleting Flutter iOS build outputs (source of stale paths)"
rm -rf build
rm -rf ios/build
rm -rf ios/Pods/build 2>/dev/null || true

echo "==> Deleting Xcode DerivedData for this app"
rm -rf ~/Library/Developer/Xcode/DerivedData/*Runner* 2>/dev/null || true
rm -rf ~/Library/Developer/Xcode/DerivedData/*videosearch* 2>/dev/null || true
rm -rf ~/Library/Developer/Xcode/DerivedData/*VideoSearch* 2>/dev/null || true
# Module / package caches that retain stale graphs
rm -rf ~/Library/Developer/Xcode/DerivedData/ModuleCache.noindex 2>/dev/null || true
rm -rf ~/Library/Developer/Xcode/DerivedData/SDKStatCaches.noindex 2>/dev/null || true

echo "==> Reinstall pods with sandboxing disabled"
flutter pub get
cd ios
pod install
cd ..

echo "==> Fresh Flutter iOS build (populates build/ cleanly once)"
flutter build ios --debug --no-codesign

echo ""
echo "✓ Done. Stale-path list should be gone after:"
echo "  1) open ios/Runner.xcworkspace"
echo "  2) Product → Clean Build Folder"
echo "  3) Product → Build  (⌘B)"
echo ""
echo " Prefer day-to-day:  flutter run -d <iphone>"
echo " (Avoid mixing many flutter builds + Xcode builds without cleaning.)"
