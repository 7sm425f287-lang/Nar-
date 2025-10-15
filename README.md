# Nar φ Local Dev Stack

End-to-end workspace for the Nar φ conversation stack (FastAPI backend + Vite/React frontend). The repo is organised for local work only; publishing is intentionally disabled.

## Quick Start

1. **Clone & prepare**
   ```bash
   cd ~/ϕ/Nar ϕ
   ```
2. **Backend (Python 3.12+)**
   ```bash
   python3.12 -m venv backend/.venv
   backend/.venv/bin/pip install -r backend/requirements.txt
   backend/dev.sh start
   ```
   - Logs stream to `backend/logs/backend.log`.
   - `backend/dev.sh stop|status|logs` manage the process.
3. **Frontend (Node 18+)**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   - Vite serves on http://localhost:5173 and proxies `/api/*` → `http://localhost:8001/*`.
4. Open the app at http://localhost:5173 and chat.

## Backend Overview
- Framework: FastAPI (`backend/app.py`).
- Endpoints:
  - `GET /health` → `{ "status": "ok", "env": "local|cloud", "provider": "lmstudio|openai" }`
  - `POST /chat` → `{ "reply": string, "provider": string }`
- Error handling:
  - 400 when the message body is empty.
  - 502 for upstream failures (OpenAI / LM Studio / timeout).
  - 500 for configuration issues or unexpected errors.
- Logging: structured INFO logs via `logging` module; runtime log file at `backend/logs/backend.log`.
- Tests: `backend/.venv/bin/python -m pytest` (runs API + research suites).

## Provider-Abstraktion
- Provider-Auswahl erfolgt über `NIRO_LLM` (`openai`, `lmstudio`, `mock`); kein Code-Change nötig.
- Requests laufen über modulare Provider (`backend/core/llm/*`) mit Timeouts (10 s connect/read) und bis zu zwei Retries bei 429/5xx.
- Pro `/chat` wird eine `request_id` vergeben (Header `X-Request-ID` & Response-Feld) und Laufzeit/Tokens werden geloggt.
- Standard-Metriken landen in `backend/core/observability.py` (`chat.success`, `chat.error`, `chat.latency`).

### `.env.local` Beispiel
```env
NIRO_ENV=local
NIRO_LLM=lmstudio
LMSTUDIO_BASE_URL=http://localhost:1234
MODEL_NAME=qwen2.5:7b-instruct
NIRO_TIMEOUT=10
NIRO_RETRY_ATTEMPTS=2
```

### `.env.cloud` Beispiel
```env
NIRO_ENV=cloud
NIRO_LLM=openai
OPENAI_API_KEY=sk-...
OPENAI_ORG=your-org
OPENAI_PROJECT=your-project
MODEL_NAME=gpt-4o-mini
NIRO_TIMEOUT=10
NIRO_RETRY_ATTEMPTS=2
```

## Frontend Overview
- Stack: Vite + React + TypeScript (`frontend/`).
- Health check runs on mount; connection status is shown in the header.
- Chat UI supports history, loading indicator (“Thinking…” bubble), and error banner feedback.
- Build/test:
  ```bash
  cd frontend
  npm run build     # type-check + production build
  ```

## Environment Modes
Two environment profiles live next to the backend code:

| Mode | File | Purpose | Key vars |
|------|------|---------|----------|
| Local (default) | `backend/.env.local` (create from `.env.local.example`) | LM Studio or mock replies | `NIRO_ENV=local`, `NIRO_LLM=lmstudio`, `LMSTUDIO_BASE_URL`, `MODEL_NAME` |
| Cloud | `backend/.env.cloud` (copy from `.env.cloud.example`) | OpenAI via REST | `NIRO_ENV=cloud`, `NIRO_LLM=openai`, `OPENAI_API_KEY`, `OPENAI_ORG`, `OPENAI_PROJECT`, `MODEL_NAME` |

Switching profile:
1. Duplicate the matching `*.example` file and remove the `.example` suffix.
2. Adjust secrets / URLs.
3. Restart the backend (`backend/dev.sh stop && backend/dev.sh start`).

The backend auto-loads the profile indicated by `NIRO_ENV` (defaults to `local` if unset). You can override provider choice with `NIRO_LLM` at runtime.
For offline smoke tests or CI you can set `NIRO_LLM=mock` to use the built-in echo provider.


## Troubleshooting
- **Python version**: Pydantic requires Python ≤3.13. Use `python3.12` (the dev script auto-detects it) to avoid build failures.
- **Ports busy**: backend uses 8001, frontend 5173. Free the ports or update `dev.sh` / `vite.config.ts`.
- **CORS / fetch errors**: ensure you access the UI from `http://localhost:5173`. CORS is limited to that origin.
- **502 errors**: check provider credentials (`LMSTUDIO_BASE_URL` or `OPENAI_API_KEY`). The backend logs the upstream detail before returning 502.
- **Health check fails**: `backend/dev.sh logs` tails the latest server output; verify env files exist and contain the expected keys.

## Assumptions
- Local machine provides Python 3.12+ and Node 18+ with npm.
- LM Studio (or compatible OpenAI API) is reachable from localhost when enabled.
- `.env.local` / `.env.cloud` will be created by the operator; example files are provided but not committed.
- Guardrails: `memory/`, `system/`, and `zettel/` remain read-only.
- Legacy snapshots are preserved in `archive/` (e.g. `archive/backend-legacy-20251015/`).

## Logs & Notes
Progress for this restructuring is recorded in:
- `logs/inventory-2025-10-15.md`
- `logs/backend-2025-10-15.md`
- `logs/frontend-2025-10-15.md`
- `logs/devcomfort-2025-10-15.md`

Smoke-test results will be captured in `logs/smoke-2025-10-15.md` once executed.
