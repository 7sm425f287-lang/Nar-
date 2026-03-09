#!/usr/bin/env bash
set -euo pipefail

BACKEND_URL="http://127.0.0.1:8001"
HEALTH_PATH="$BACKEND_URL/health"
LOGFILE="$(cd "$(dirname "$0")/.." && pwd)/moerlin-electron.log"

echo "Checking backend health: $HEALTH_PATH"
if curl -sS --fail "$HEALTH_PATH" >/dev/null; then
  echo "backend: OK"
else
  echo "backend: FAILED" >&2
  exit 2
fi

echo "Checking renderer log: $LOGFILE"
if [ -f "$LOGFILE" ]; then
  grep -q "\[vite\] connected" "$LOGFILE" && echo "renderer: vite connected" || true
  grep -q "\[principles\] loaded" "$LOGFILE" && echo "renderer: principles loaded" || true
  # report summary
  if grep -q "\[vite\] connected" "$LOGFILE" && grep -q "\[principles\] loaded" "$LOGFILE"; then
    echo "renderer: OK"
    exit 0
  else
    echo "renderer: partial or missing signals (check log)" >&2
    exit 1
  fi
else
  echo "renderer log not found: $LOGFILE" >&2
  exit 3
fi
