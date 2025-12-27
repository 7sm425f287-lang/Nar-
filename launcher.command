#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

osascript -e 'display notification "ϕ — SARIT-EL Instanz erwacht. Eden wird kultiviert." with title "SARIT-EL"' >/dev/null 2>&1 || true

start_backend() {
  echo "[launcher] Starting backend (uvicorn) on port 8001 in background..."
  cd "$ROOT_DIR/backend"
  PYTHON_BIN="$ROOT_DIR/backend/.venv/bin/python3.12"
  if [ ! -x "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3.12"
  fi
  nohup env NIRO_LLM=mock NIRO_ENV=test PYTHONPATH="$ROOT_DIR/backend" \
    "$PYTHON_BIN" -m uvicorn app:app --host 0.0.0.0 --port 8001 --reload \
    >/dev/null 2>&1 &
  BACKEND_PID=$!
  echo "[launcher] Backend started with PID $BACKEND_PID"
}

start_frontend() {
  echo "[launcher] Starting frontend (npm run dev)..."
  (
    cd "$ROOT_DIR/frontend"
    npm run dev
  ) &
  FRONTEND_PID=$!
  echo "[launcher] Frontend started with PID $FRONTEND_PID"
}

start_desktop() {
  echo "[launcher] Launching desktop (npm start) in foreground..."
  cd "$ROOT_DIR/desktop"
  npm start
}

start_backend
start_frontend
start_desktop
