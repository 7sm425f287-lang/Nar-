#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${APP_DIR}/.venv"
PID_FILE="${APP_DIR}/.uvicorn.pid"
LOG_DIR="${APP_DIR}/logs"
LOG_FILE="${LOG_DIR}/backend.log"
ENV_FILE=""

if [[ "${1:-}" == .env.* ]]; then
  ENV_FILE="${1}"
  shift
fi

if [ -z "${PYTHON_BIN:-}" ]; then
  if command -v python3.12 >/dev/null 2>&1; then
    PYTHON_BIN="python3.12"
  else
    PYTHON_BIN="python3"
  fi
fi
UVICORN_BIN="${UVICORN_BIN:-uvicorn}"

ensure_runtime() {
  mkdir -p "${LOG_DIR}"
  if [ ! -d "${VENV_DIR}" ]; then
    "${PYTHON_BIN}" -m venv "${VENV_DIR}"
  fi
  # shellcheck source=/dev/null
  source "${VENV_DIR}/bin/activate"
  pip install --upgrade pip >/dev/null
  pip install -r "${APP_DIR}/requirements.txt" >/dev/null
}

load_env() {
  local candidate
  if [[ -n "${ENV_FILE}" ]]; then
    candidate="${APP_DIR}/${ENV_FILE}"
    if [[ -f "${candidate}" ]]; then
      set -a
      # shellcheck source=/dev/null
      source "${candidate}"
      set +a
      return
    fi
  fi
  for candidate in "${APP_DIR}/.env.local" "${APP_DIR}/.env"; do
    if [[ -f "${candidate}" ]]; then
      set -a
      # shellcheck source=/dev/null
      source "${candidate}"
      set +a
      break
    fi
  done
}

is_running() {
  if [ -f "${PID_FILE}" ]; then
    local pid
    pid="$(cat "${PID_FILE}")"
    if ps -p "${pid}" >/dev/null 2>&1; then
      return 0
    fi
  fi
  return 1
}

start() {
  if is_running; then
    echo "Backend already running (PID $(cat "${PID_FILE}"))."
    exit 0
  fi
  load_env
  ensure_runtime
  # shellcheck source=/dev/null
  source "${VENV_DIR}/bin/activate"
  local port="${PORT:-8001}"
  echo "Starting backend on http://127.0.0.1:${port} ..."
  nohup "${VENV_DIR}/bin/${UVICORN_BIN}" --app-dir "${APP_DIR}/.." backend.app:app --host 0.0.0.0 --port "${port}" >"${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"
  sleep 1
  echo "Started (PID $(cat "${PID_FILE}")). Logs: ${LOG_FILE}"
}

stop() {
  if ! is_running; then
    echo "Backend not running."
    exit 0
  fi
  local pid
  pid="$(cat "${PID_FILE}")"
  echo "Stopping backend (PID ${pid})..."
  kill "${pid}" >/dev/null 2>&1 || true
  rm -f "${PID_FILE}"
  echo "Stopped."
}

status() {
  if is_running; then
    echo "Backend running (PID $(cat "${PID_FILE}"))."
  else
    echo "Backend not running."
  fi
}

logs() {
  mkdir -p "${LOG_DIR}"
  touch "${LOG_FILE}"
  tail -f "${LOG_FILE}"
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [env-file] <start|stop|status|logs>
EOF
}

command="${1:-}"
case "${command}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  logs) logs ;;
  *)
    usage
    exit 1
    ;;
esac
