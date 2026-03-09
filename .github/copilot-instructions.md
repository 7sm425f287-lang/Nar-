# Copilot-Anleitung — Mφrlin

Zweck: Kurze, praktische Anleitung, damit ein KI-Coding-Agent schnell produktiv wird.

Kurzüberblick
- Backend: FastAPI in [backend/app.py](backend/app.py#L1) — Haupt-Routen: `/chat`, `/api/fs/*`, `/api/dev/*` (nur mit `DEV_MODE`).
- Frontend: Vite + React im Verzeichnis `frontend/` — Dev-Server auf Port 5173; Backend-URL-Logik in [frontend/src/lib/backend.ts](frontend/src/lib/backend.ts#L1).
- LLM-Provider: Implementierungen unter [backend/core/llm/](backend/core/llm/). Auswahl über `NIRO_LLM` und `get_provider()`.

Wichtige Dateien (zum Lesen)
- [backend/app.py](backend/app.py#L1): Request-ID Middleware, `FS_WHITELIST`, `_resolve_fs_path()` und die Top-Level-Routen.
- [backend/core/config.py](backend/core/config.py#L1): Reihenfolge des `.env`-Ladens, `NIRO_ENV`, `NIRO_LLM`, Timeouts.
- [backend/core/llm/](backend/core/llm/): `base.py`, konkrete Provider und `__init__.py` (Provider-Registry).
- [backend/services/job_runner.py](backend/services/job_runner.py#L1): `JobRunner`, `DevJob`, `DEV_CMD_WHITELIST`, `EDITOR_FS_WHITELIST`, Logs in `backend/logs/jobs/`.
- [frontend/src/lib/backend.ts](frontend/src/lib/backend.ts#L1): Wie das Frontend das Backend findet / anfragt.

Runbook — Wichtige Befehle
- Backend (lokal, LM Studio):
  - `cd backend && ./dev.sh .env.local start`
  - Stop/Status/Logs: `./dev.sh stop` | `./dev.sh status` | `./dev.sh logs`
- Frontend: `cd frontend && npm run dev`
- Health-Check: `curl -s http://localhost:8001/health`
- Schneller Chat-Call (Beispiel):
  - `curl -X POST -H "Content-Type: application/json" -d '{"message":"Hallo"}' http://localhost:8001/chat`
- Tests: `pytest -q` (Tests verwenden `NIRO_ENV=test` → `mock`-Provider)

Wichtige Umgebungsvariablen & Konventionen
- `NIRO_ENV`: `local` | `cloud` | `test` (steuert Provider-Defaults und Verhalten).
- `NIRO_LLM`: `openai` | `lmstudio` | `mock`.
- `DEV_MODE`: schaltet `/api/dev/*` und Job-Runner-Endpunkte ein.
- `EDITOR_FS_WHITELIST`: Doppelpunkt-getrennte, repo-relative Pfade (Standard: `drafts`). Der Pfad `memory/` ist verboten.
- `DEV_CMD_WHITELIST`: erlaubte Shell-Kommandos für Dev-Jobs (kann per Env überschrieben werden).

Projekt-spezifische Regeln (bitte genau befolgen)
- FS-Sicherheit: Immer `_resolve_fs_path()` aus `backend/app.py` verwenden, wenn Dateien verändert werden — diese Funktion stellt sicher, dass Pfade repo-relativ bleiben und `memory/` sowie Root-Änderungen abgelehnt werden.
- Single-reply-Contract: LLM-Provider müssen genau eine zusammengefasste `reply`-Zeichenkette zurückgeben. Das Frontend simuliert Streaming client-seitig; ändere die API nicht auf Streaming.
- Provider hinzufügen: Neue Datei `backend/core/llm/<name>_provider.py` mit Methode `.generate(messages)` anlegen; bei Fehlern bestehende `ConfigurationError`/`UpstreamError`-Typen verwenden und den Provider in `backend/core/llm/__init__.py` registrieren.
- Job-Runner: `JobRunner` und `validate_command()` in `backend/services/job_runner.py` nutzen; Logs landen in `backend/logs/jobs/*.log` und Metadaten in `backend/logs/jobs/YYYYMMDD.jsonl`.

Konkrete Beispiele
- Neuen Provider hinzufügen:
  1. `backend/core/llm/acme_provider.py` erstellen, `.generate(messages)` implementieren.
  2. In `backend/core/llm/__init__.py` registrieren und unter `backend/tests/` Tests ergänzen (setzen `NIRO_ENV=test`).
- Neuer Dev-Job (Integrationstest):
  1. `DEV_CMD_WHITELIST` erweitern (oder per Env für Tests überschreiben).
  2. POST an `/api/dev/jobs` mit `DEV_MODE=true` in Tests, dann prüfen, dass `backend/logs/jobs/*.log` entsteht und Metadaten angehängt werden.

Logs & Observability
- Request-Korrelation: `X-Request-ID` wird in `backend/app.py` gesetzt und in Job-Logs weitergereicht; nutze diese ID, um Server-Logs und Job-Runner-Logs zu korrelieren.

Was Agenten nicht ändern sollten
- Ändere nicht den Single-reply-Contract zwischen Backend und Frontend.
- Füge keine FS-Whitelist-Einträge hinzu, die außerhalb des Repos liegen oder auf `memory/` zeigen.

Nächste Schritte
- Wenn gewünscht, kann ich eine ausführlichere `AGENTS.md` mit Vorlagen (Provider-Skeleton, Job-Runner-Test) anlegen. Sag kurz, welches Beispiel du zuerst brauchst.
