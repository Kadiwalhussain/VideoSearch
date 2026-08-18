#!/usr/bin/env bash
# Force share_plus iOS to use UIWindowScene instead of deprecated UIApplication.keyWindow.
# Safe to re-run. Called from ios/Podfile post_install.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

patch_file() {
  local f="$1"
  [[ -f "$f" ]] || return 0

  python3 - "$f" <<'PY'
import re, sys
path = sys.argv[1]
src = open(path, encoding="utf-8").read()
original = src

# Modern scene-based root VC lookup (no UIApplication.keyWindow).
modern = '''static UIViewController *RootViewController(void) {
  // UIScene path only — UIApplication.keyWindow is deprecated (iOS 13+) / broken on iOS 26.
  NSSet *scenes = [[UIApplication sharedApplication] connectedScenes];
  for (UIScene *scene in scenes) {
    if (scene.activationState != UISceneActivationStateForegroundActive) continue;
    if (![scene isKindOfClass:[UIWindowScene class]]) continue;
    UIWindowScene *windowScene = (UIWindowScene *)scene;
    if (@available(iOS 15.0, *)) {
      if (windowScene.keyWindow != nil) {
        return windowScene.keyWindow.rootViewController;
      }
    }
    for (UIWindow *window in windowScene.windows) {
      if (window.isKeyWindow) return window.rootViewController;
    }
    if (windowScene.windows.count > 0) {
      return windowScene.windows.firstObject.rootViewController;
    }
  }
  for (UIScene *scene in scenes) {
    if (![scene isKindOfClass:[UIWindowScene class]]) continue;
    UIWindowScene *windowScene = (UIWindowScene *)scene;
    if (@available(iOS 15.0, *)) {
      if (windowScene.keyWindow != nil) {
        return windowScene.keyWindow.rootViewController;
      }
    }
    for (UIWindow *window in windowScene.windows) {
      if (window.isKeyWindow) return window.rootViewController;
    }
    if (windowScene.windows.count > 0) {
      return windowScene.windows.firstObject.rootViewController;
    }
  }
  return nil;
}'''

# Replace entire RootViewController function if present
pat = re.compile(
    r"static UIViewController \*RootViewController\(void\)\s*\{.*?\n\}",
    re.S,
)
if pat.search(src):
    src = pat.sub(modern.rstrip(), src, count=1)

# Nuke any leftover UIApplication.keyWindow usages
src = re.sub(
    r"\[UIApplication sharedApplication\]\.keyWindow",
    "nil /* removed deprecated UIApplication.keyWindow */",
    src,
)
src = re.sub(
    r"UIApplication\.shared\.keyWindow",
    "nil /* removed deprecated UIApplication.keyWindow */",
    src,
)

if src != original:
    open(path, "w", encoding="utf-8").write(src)
    print(f"patched: {path}")
else:
    print(f"ok: {path}")
PY
}

echo "==> Patching share_plus (no UIApplication.keyWindow)"
while IFS= read -r f; do
  patch_file "$f"
done < <(find "${PUB_CACHE:-$HOME/.pub-cache}/hosted" -path '*/share_plus-*/ios/**/FPPSharePlusPlugin.m' 2>/dev/null || true)

while IFS= read -r f; do
  patch_file "$f"
done < <(find "$ROOT" -path '*/share_plus*/**/FPPSharePlusPlugin.m' 2>/dev/null || true)

if [[ -d "$ROOT/ios/Pods" ]]; then
  while IFS= read -r f; do
    patch_file "$f"
  done < <(find "$ROOT/ios/Pods" -name 'FPPSharePlusPlugin.m' 2>/dev/null || true)
fi

echo "share_plus patch done."
