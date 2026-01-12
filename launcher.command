#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure port 5173 is free at script start to avoid zombie/listener causing Vite to auto-increment
echo "[launcher] Initial cleanup: killing any process listening on port 5173..."
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

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
    echo "[launcher] Ensuring port 5173 is free (will kill any owner)..."
    # If something is listening on 5173, kill it to prevent Vite auto-incrementing to 5174
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true

    (
      cd "$ROOT_DIR/frontend"
      # Start Vite (config enforces port 5173/strictPort) in background
      npm run dev
    ) &
    FRONTEND_PID=$!
    echo "[launcher] Frontend started with PID $FRONTEND_PID"

    # Wait for frontend to respond on port 5173 before continuing (fast-fail curl)
    echo "[launcher] Waiting for frontend to become available at http://localhost:5173 ..."
    MAX_RETRIES=60
    RETRY=0
    until curl -sS --max-time 1 http://localhost:5173/ >/dev/null 2>&1; do
      RETRY=$((RETRY+1))
      if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
        echo "[launcher] Timeout waiting for frontend on port 5173"
        break
      fi
      sleep 1
    done
    echo "[launcher] Frontend responded or timeout reached (retries=$RETRY)"
}

wait_for_frontend() {
  echo "[launcher] Waiting for frontend on http://localhost:5173 ..."
  for i in $(seq 1 40); do
    if curl -fs --max-time 1 http://localhost:5173 >/dev/null 2>&1; then
      echo "[launcher] Frontend is reachable on port 5173."
      return 0
    fi
    sleep 0.5
  done
  echo "[launcher] Frontend did not become reachable on port 5173." >&2
  return 1
}

start_desktop() {
  echo "[launcher] Launching desktop (npm start) in foreground..."
  cd "$ROOT_DIR/desktop"
  npm start
}

start_backend
start_frontend
wait_for_frontend
start_desktop
