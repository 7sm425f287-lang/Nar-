#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$APP_DIR/.uvicorn.pid"
ENV_FILE="${1:-}"

load_env() {
  if [[ -n "${ENV_FILE:-}" && -f "$APP_DIR/$ENV_FILE" ]]; then
    set -a; source "$APP_DIR/$ENV_FILE"; set +a
  elif [[ -f "$APP_DIR/.env" ]]; then
    set -a; source "$APP_DIR/.env"; set +a
  fi
}

start() {
  load_env
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Already running (pid $(cat "$PID_FILE"))"; exit 0
  fi
  cd "$APP_DIR"
  uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8001}" --reload &
  echo $! > "$PID_FILE"
  echo "Started (pid $(cat "$PID_FILE")), mode=${NIRO_LLM:-?}"
}

stop() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "Stopped"
  else
    echo "Not running"
  fi
}

status() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Running (pid $(cat "$PID_FILE"))"
  else
    echo "Stopped"
  fi
}

logs() { ps aux | grep -E "uvicorn app\\.main:app" | grep -v grep; }

case "${2:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) logs ;;
  *) echo "Usage: dev.sh [.env.cloud|.env.local] {start|stop|status|logs}"; exit 1 ;;
esac
