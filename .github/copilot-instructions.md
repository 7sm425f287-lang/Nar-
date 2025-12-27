# Copilot Instructions — Nar φ (Niro)

## Quick summary ✅
- Backend: FastAPI app at `backend/app.py` (uvicorn `backend.app:app`). Main responsibilities: LLM proxy (`/chat`), simple FS editor APIs (`/api/fs/*`), and developer job endpoints (`/api/dev/*`).
- Frontend: Vite React app (port 5173) with `frontend/src/lib/backend.ts` handling backend URL resolution and proxying to `/api`.
- LLM providers live under `backend/core/llm` — `lmstudio`, `openai`, and `mock`. Provider selection is via env var `NIRO_LLM` (defaults: local→`lmstudio`, cloud→`openai`, test→`mock`).

---

## Where to look (key files) 🔧
- Backend entry & middleware: `backend/app.py` (request IDs, logging, FS whitelist, /chat handler)
- LLM integration and retries: `backend/core/llm/*` (providers: `openai_provider.py`, `lmstudio_provider.py`, `mock_provider.py`, `base.py`)
- Runtime configuration: `backend/core/config.py` (env var defaults and inference rules)
- Developer job system: `backend/routes/dev.py`, `backend/services/job_runner.py` (DEV_MODE gating, command whitelist, logs)
- Frontend integration: `frontend/src/lib/backend.ts`, `frontend/vite.config.ts`, `frontend/src/pages/ChatPage.tsx` (example usage of `/chat` and retry/backoff)
- Dev tooling: `backend/dev.sh`, `.env.*` examples (see `backend/.env.cloud.example`)

---

## How to run & debug (developer workflows) ▶️
- Local dev (recommended):
  - Start backend (inside `/backend`): `./dev.sh .env.local start` (alternatively pass `.env.cloud` for cloud mode)
  - Start frontend (inside `/frontend`): `npm run dev` (or use workspace task `Dev: Frontend + Backend (local)`)
  - Frontend dev server proxies `/api` → `http://localhost:8001`
- Quick health check: `curl -s http://localhost:8001/health`
- Chat example (JSON request):
  - curl -X POST -H "Content-Type: application/json" -d '{"message":"Hello"}' http://localhost:8001/chat
- Logs:
  - Backend: `backend/logs/backend.log` and `logs/server-app.log`
  - Jobs: `logs/jobs/*.log` and `logs/jobs/*.jsonl`
- Tests:
  - Backend: run `pytest -q` from repo root or `backend` directory. Tests assume env and will select `mock` provider for `test` env.

---

## Important env vars & conventions 📋
- NIRO_ENV — `local` | `cloud` | `test` (affects defaults)
- NIRO_LLM — `openai` | `lmstudio` | `mock` (provider selection)
- OPENAI_API_KEY, OPENAI_ORG, OPENAI_PROJECT — for OpenAI provider
- LMSTUDIO_BASE_URL — base URL for local LM Studio (default `http://localhost:1234`)
- EDITOR_FS_WHITELIST — colon-separated paths (relative to repo root) which editors and job runner will allow. Default is `drafts`.
- DEV_MODE — when set (`true`/`1`) enables `/api/dev/*` endpoints. Keep off in production.
- DEV_CMD_WHITELIST — override default allowed dev commands (defaults include `pytest`, `npm`, `node`, `python`, `eslint`, `tsc`, `mypy`)
- NIRO_TIMEOUT, NIRO_RETRY_ATTEMPTS, NIRO_RETRY_BACKOFF — provider timeout & retry settings

Notes:
- FS access is strictly gated: `backend/app.py` resolves and enforces whitelist; `memory` top-level is forbidden.
- Dev jobs are restricted by both command whitelist and FS whitelist (see `job_runner.py`).

---

## Project-specific patterns & tips 💡
- Provider selection is deterministic in code: `get_settings()` in `backend/core/config.py` decides provider without needing to change code. Use `NIRO_LLM` and `.env.*` to flip.
- The frontend expects a single JSON reply (no streaming API in current providers). The UI simulates streaming by typing the reply client-side.
- The job runner writes logs to `logs/jobs` and appends metadata to daily `.jsonl` files — useful for debugging CI/dev tasks.
- Observability: request IDs are added to logs (`X-Request-ID` header). Use `logs/server-app.log` for correlating requests.

---

## When making changes, remember 🧭
- Feature toggles & developer routes are behind env flags — tests and CI rely on these defaults (`test` env → `mock` provider).
- Keep `EDITOR_FS_WHITELIST` safe and repository-local (non-absolute or must be under repo root)
- When adding commands to the job runner, update `DEV_CMD_WHITELIST` (env override supported) and include tests that assert validation (`validate_command`).

---

## Example tasks for an AI coding agent (concise) ✅
- Add an LLM provider stub: create provider under `backend/core/llm`, wire via `get_provider()` in `__init__.py`, add a small test in `backend/tests`
- Add a new dev command: ensure `validate_command` accepts tokens, add to `DEV_CMD_WHITELIST` in test env, and create integration tests hitting `/api/dev/jobs` with `DEV_MODE=true`
- Fix a backend test failure: run `pytest -q`, inspect `logs/server-app.log`, reproduce via `curl` to failing endpoint

---

If anything here is unclear or you'd like additional detail on a section (examples, commit conventions, or linking to PR templates), tell me which part to expand and I'll iterate. ✨
