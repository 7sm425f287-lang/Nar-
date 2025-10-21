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
EDITOR_FS_WHITELIST=logs:drafts:atlas
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
# EDITOR_FS_WHITELIST=logs:drafts:atlas
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

## Research-Modus
- Generator: `python3 system/research/generate.py --in system/research/examples/example.yaml --out drafts/research/`
- Vorlagen: `system/research/templates/report.md.j2`
- Output: `drafts/research/<slug>-<YYYYMMDD>.md` mit vorbereiteten Sektionen (Zusammenfassung, Muster, Unsicherheiten, Quellen).
- Tests: `backend/.venv/bin/python -m pytest system/tests`

## Wissensarchitektur & Editor
- Schreib-Trichter: Neue Inhalte entstehen in `logs/` (Chroniken, Status) und `drafts/` (Modelle, Muster, Social/Music Notes); kuratierte Wahrheiten wandern nach Review nach `atlas/`.  
- `memory/` bleibt read-only; der Editor hat über `EDITOR_FS_WHITELIST=logs:drafts:atlas` Zugriff auf alle bearbeitbaren Pfade.  
- `logs/indexes/insights.yaml` hält aktuelle Chronik- und Draft-Verweise für zyklische Reviews.  
- Autosave im Editor (Debounce ~1.5 s) schreibt über `/api/fs/write`; Status wird unten im Editor angezeigt („Gespeichert um …“).
- Chronik-Wizard (`/chronik`): erzeugt Einträge via Vorlage (Fallback integriert), legt Dateien unter `logs/chronik/YYYY-MM-DD-<slug>.md` an und verlinkt zurück in den Editor.

### Chronik-Wizard (Schritt für Schritt)
1. `/chronik` öffnen, Titel eingeben (Slug wird automatisch abgeleitet, kann überschrieben werden).
2. Template wählen – Standard (Mikro + Makro), Mikro (Kurzimpuls) oder Makro-Longform.
3. Zeitfenster, Ort, Stimmung sowie Notizen/Links ergänzen.
4. „Chronik erstellen“ klick – speichert via `/api/fs/write` nach `logs/chronik/<datum>-<slug>.md`.
5. Snackbar-Button nutzen („Im Editor öffnen“), um direkt weiterzuschreiben.

## Dev-Modus (ϕ schreibt & testet)
- Befehls-Whitelist: `DEV_CMD_WHITELIST`
- Dateisystem-Zugriff: `EDITOR_FS_WHITELIST`
- Endpoints / Verträge: `backend/core/dev/contracts.md`
- Logs: `logs/jobs/` (Job-Output) sowie `logs/status-YYYY-MM-DD.md`
- Dev-Konsole: `/dev` (Run/Lint/History – aktuell Placeholder)

## Chat Robustness
- Jeder Prompt läuft mit 30 s Timeout und Exponential Backoff (300/900/1500 ms) – Request-Abbruch über den „Stop“-Button.  
- Netzfehler liefern eine klare Meldung inkl. Request-ID; Server-Logs landen in `logs/server-app.log`.  
- Streaming-Simulation zeigt eingehende Antworten Schritt für Schritt und blendet die gemessene Latenz ein.


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

## VS Code Konsole (Niro)

1) Workspace öffnen:
   `code niro.code-workspace`

2) Entwicklungsstart:
   - Dev: Frontend + Backend (local) → CMD+ALT+F (Frontend) + CMD+ALT+B (Backend)
   - Desktop-App (Electron) → CMD+ALT+D (startet Backend+Frontend+Electron)

3) Online/Offline:
   - Offline (LM Studio): VS Code Task „Backend: start (local LM Studio)“
   - Online (OpenAI): VS Code Task „Backend: start (cloud OpenAI)“
   Keys liegen in `backend/.env.*` (nicht ins Frontend packen).

4) Stoppen/Logs:
   - Stop: CMD+ALT+S → `./dev.sh stop`
   - Logs: CMD+ALT+L → `./dev.sh logs`
