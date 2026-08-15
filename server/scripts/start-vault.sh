#!/usr/bin/env bash
# VideoSearch Vault — always-on network host
# Binds 0.0.0.0:PORT so LAN devices can reach the API + /app/ dashboard.
# Restarts automatically if the process exits.
# Only one keepalive instance is allowed (mkdir lock — works on macOS).

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

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/vault.log"
PID_FILE="$LOG_DIR/vault.pid"
LOCK_DIR="$LOG_DIR/vault.lock.d"
NODE_PID_FILE="$LOG_DIR/vault-node.pid"

# ── Single-instance lock via mkdir (atomic on macOS + Linux) ──
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" > "$PID_FILE"
    return 0
  fi
  # Stale lock? Check if recorded pid is still alive
  OTHER="$(cat "$PID_FILE" 2>/dev/null || echo "")"
  if [[ -n "$OTHER" ]] && kill -0 "$OTHER" 2>/dev/null; then
    echo "[vault-keepalive] already running (pid $OTHER)."
    if curl -sf --max-time 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      echo "[vault-keepalive] health OK — leave it alone."
      exit 0
    fi
    echo "[vault-keepalive] process alive but health failed. stop: kill $OTHER"
    exit 1
  fi
  # Stale — take over
  echo "[vault-keepalive] clearing stale lock (old pid ${OTHER:-unknown})"
  rm -rf "$LOCK_DIR"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "$$" > "$PID_FILE"
    return 0
  fi
  echo "[vault-keepalive] could not acquire lock"
  exit 1
}

release_lock() {
  if [[ -f "$NODE_PID_FILE" ]]; then
    NP="$(cat "$NODE_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${NP:-}" ]]; then
      kill "$NP" 2>/dev/null || true
      sleep 0.3
      kill -9 "$NP" 2>/dev/null || true
    fi
    rm -f "$NODE_PID_FILE"
  fi
  rm -f "$PID_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || rm -rf "$LOCK_DIR"
}

acquire_lock
trap release_lock EXIT INT TERM

echo "[vault-keepalive] $(date -Iseconds) starting on ${HOST}:${PORT}" | tee -a "$LOG_FILE"
echo "[vault-keepalive] log: $LOG_FILE" | tee -a "$LOG_FILE"
echo "[vault-keepalive] stop: kill \$(cat $PID_FILE)" | tee -a "$LOG_FILE"

while true; do
  # Free port if something else is holding it
  if command -v lsof >/dev/null 2>&1; then
    OLD_PIDS="$(lsof -ti ":$PORT" 2>/dev/null || true)"
    if [[ -n "${OLD_PIDS:-}" ]]; then
      echo "[vault-keepalive] freeing port $PORT (pids: $OLD_PIDS)" | tee -a "$LOG_FILE"
      # shellcheck disable=SC2086
      kill $OLD_PIDS 2>/dev/null || true
      sleep 1
      STILL="$(lsof -ti ":$PORT" 2>/dev/null || true)"
      if [[ -n "${STILL:-}" ]]; then
        # shellcheck disable=SC2086
        kill -9 $STILL 2>/dev/null || true
        sleep 0.5
      fi
    fi
  fi

  echo "[vault-keepalive] $(date -Iseconds) node src/index.js" | tee -a "$LOG_FILE"
  set +e
  node src/index.js >>"$LOG_FILE" 2>&1 &
  NODE_PID=$!
  echo "$NODE_PID" > "$NODE_PID_FILE"

  # Wait until healthy or process dies (max ~15s for Mongo)
  HEALTHY=0
  for _ in $(seq 1 20); do
    if ! kill -0 "$NODE_PID" 2>/dev/null; then
      break
    fi
    if curl -sf --max-time 1 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      HEALTHY=1
      echo "[vault-keepalive] healthy (pid $NODE_PID)" | tee -a "$LOG_FILE"
      break
    fi
    sleep 0.5
  done

  if [[ "$HEALTHY" -eq 1 ]]; then
    # Stay attached until node exits
    wait "$NODE_PID"
    CODE=$?
  else
    if kill -0 "$NODE_PID" 2>/dev/null; then
      echo "[vault-keepalive] not healthy after wait — killing $NODE_PID" | tee -a "$LOG_FILE"
      kill "$NODE_PID" 2>/dev/null || true
      wait "$NODE_PID" 2>/dev/null
      CODE=1
    else
      wait "$NODE_PID" 2>/dev/null
      CODE=$?
    fi
  fi
  set -e
  rm -f "$NODE_PID_FILE"
  echo "[vault-keepalive] $(date -Iseconds) exited code=${CODE:-?} — restart in 2s" | tee -a "$LOG_FILE"
  sleep 2
done
