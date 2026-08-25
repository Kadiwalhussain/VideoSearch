#!/bin/bash
# LaunchAgent entry — one Node process, launchd restarts it.
set -euo pipefail
export PATH="${HOME}/.nvm/versions/node/v22.18.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"
export NODE_ENV="${NODE_ENV:-development}"
exec node src/index.js
