#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
LOG_FILE="${BACKEND_DIR}/logs/backend.log"
TAIL_PID=""

cleanup() {
  if [[ -n "${TAIL_PID}" ]]; then
    kill "${TAIL_PID}" >/dev/null 2>&1 || true
  fi
  (cd "${BACKEND_DIR}" && ./dev.sh stop >/dev/null 2>&1) || true
}

trap cleanup EXIT
trap 'cleanup; exit 0' SIGINT SIGTERM

cd "${BACKEND_DIR}"
./dev.sh start

mkdir -p "$(dirname "${LOG_FILE}")"
touch "${LOG_FILE}"
tail -F "${LOG_FILE}" &
TAIL_PID=$!
wait "${TAIL_PID}"
