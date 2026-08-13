#!/usr/bin/env bash
# VideoSearch Vault — always-on network host
# Binds 0.0.0.0:PORT so LAN devices can reach the API + /app/ dashboard.
# Restarts automatically if the process exits.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"
export NODE_ENV="${NODE_ENV:-development}"

# Load .env without printing secrets
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

# Re-apply host defaults after sourcing .env (so script env wins if set)
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/vault.log"
PID_FILE="$LOG_DIR/vault.pid"

echo "$$" > "$PID_FILE"
echo "[vault-keepalive] $(date -Iseconds) starting on ${HOST}:${PORT}" | tee -a "$LOG_FILE"
echo "[vault-keepalive] log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "[vault-keepalive] stop: kill \$(cat $PID_FILE)  (or: pkill -f 'scripts/start-vault')" | tee -a "$LOG_FILE"

while true; do
  # Free port if a stale node is holding it
  if command -v lsof >/dev/null 2>&1; then
    OLD_PIDS="$(lsof -ti ":$PORT" 2>/dev/null || true)"
    if [[ -n "${OLD_PIDS:-}" ]]; then
      echo "[vault-keepalive] freeing port $PORT (pids: $OLD_PIDS)" | tee -a "$LOG_FILE"
      # shellcheck disable=SC2086
      kill $OLD_PIDS 2>/dev/null || true
      sleep 1
    fi
  fi

  echo "[vault-keepalive] $(date -Iseconds) node src/index.js" | tee -a "$LOG_FILE"
  set +e
  node src/index.js >>"$LOG_FILE" 2>&1
  CODE=$?
  set -e
  echo "[vault-keepalive] $(date -Iseconds) exited code=$CODE — restart in 2s" | tee -a "$LOG_FILE"
  sleep 2
done
