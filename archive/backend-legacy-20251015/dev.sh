#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$ROOT/.uvicorn.pid"

start() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
    echo "Already running with PID $(cat $PIDFILE)"
    return
  fi
  echo "Starting uvicorn on port 8001..."
  LOGFILE="$ROOT/.uvicorn.out"
  (cd "$ROOT" && nohup uvicorn app:app --host 0.0.0.0 --port 8001 --reload > "$LOGFILE" 2>&1 &) 
  sleep 1
  pgrep -f "uvicorn app:app" | head -n1 > "$PIDFILE" || true
  echo "Started: $(cat $PIDFILE)"
}

stop() {
  if [ -f "$PIDFILE" ]; then
    pid=$(cat "$PIDFILE")
    echo "Stopping $pid"
    kill "$pid" || true
    rm -f "$PIDFILE"
  else
    echo "Not running (no PID file)"
  fi
}

status() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
    echo "Running: $(cat $PIDFILE)"
  else
    echo "Not running"
  fi
}

logs() {
  echo "No centralized logs configured. See uvicorn output above when running in foreground."
}

case ${1-} in
  start) start ;; 
  stop) stop ;; 
  status) status ;; 
  logs) logs ;; 
  *) echo "Usage: $0 {start|stop|status|logs}" ;; 
esac
#!/usr/bin/env bash
set -euo pipefail

APP="app:app"
HOST="0.0.0.0"
PORT="${PORT:-8001}"
LOG_LEVEL="${LOG_LEVEL:-info}"
PIDFILE=".uvicorn.pid"

start() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Already running (PID $(cat "$PIDFILE"))"; exit 0
  fi
  echo "Starting uvicorn on :$PORT"
  nohup .venv/bin/uvicorn "$APP" --host "$HOST" --port "$PORT" --log-level "$LOG_LEVEL" --reload > .uvicorn.out 2>&1 &
  echo $! > "$PIDFILE"
  sleep 1
  status
}

stop() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "Stopped."
  else
    echo "Not running."
  fi
}

status() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Running (PID $(cat "$PIDFILE"))", port $PORT
  else
    echo "Not running."
  fi
}

logs() {
  tail -n 200 -f .uvicorn.out
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) logs ;;
  *) echo "Usage: $0 {start|stop|status|logs}"; exit 1 ;;
esac
