# Copilot Instructions — Nar φ (Niro)

## TL;DR (What matters most) ✅
- Backend: FastAPI service at `backend/app.py` (uvicorn `backend.app:app`). Key responsibilities: `/chat` LLM proxy, simple FS editor APIs (`/api/fs/*`), and developer job endpoints (`/api/dev/*`).
- Frontend: Vite React app (port 5173). Backend URL resolution and `/api` proxying live in `frontend/src/lib/backend.ts` (UI expects a single JSON reply; streaming is client-simulated).
- LLM providers: add implementations under `backend/core/llm/` (`lmstudio`, `openai`, `mock`). Provider selection is via `NIRO_LLM` and `get_settings()`.

---

## Where to look (important files) 📁
- Entry & middleware: `backend/app.py` (request ID injection, `FS_WHITELIST`, system prompt `PRINCIPLES_PROMPT`).
- Config: `backend/core/config.py` (env inference, timeouts, provider defaults).
- Providers: `backend/core/llm/*` (`openai_provider.py`, `lmstudio_provider.py`, `mock_provider.py`, `base.py`). Use `get_provider()` to wire new providers.
- Dev jobs: `backend/routes/dev.py` and `backend/services/job_runner.py` (endpoints, queue, whitelist, job logs & metadata).
- Observability: `backend/core/observability.py` (request IDs, in-memory metrics).
- Policies & rules: `backend/policy/rules.yaml`.
- Frontend examples: `frontend/src/pages/ChatPage.tsx`, `frontend/src/components/ChatFrame.tsx`.
- Tests: `backend/tests/*` (see `test_providers.py`, `test_dev_jobs.py`).

---

## Quick runbook 🔧
- Start backend (local LM Studio):
  - cd `backend` → `./dev.sh .env.local start` (use `.env.cloud` for OpenAI)
  - stop/status/logs: `./dev.sh stop` / `./dev.sh status` / `./dev.sh logs`
- Start frontend: cd `frontend` → `npm run dev` (or use workspace task `Dev: Frontend + Backend (local)`). Desktop: `desktop` → `npm run dev`.
- Health check: `curl -s http://localhost:8001/health`
- Chat example:
  - curl -X POST -H "Content-Type: application/json" -d '{"message":"Hello"}' http://localhost:8001/chat
- Useful workspace tasks: `Dev: Frontend + Backend (local)`, `Dev: Desktop (App-Fenster)`, `LM Studio: ping`.
- Logs: server `logs/server-app.log`, backend `backend/logs/backend.log`, dev jobs `logs/jobs/*.log` and `logs/jobs/*.jsonl`.
- Tests: `pytest -q` (tests use `mock` provider under `NIRO_ENV=test` and some tests set `DEV_MODE` in-process).

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

## Project-specific patterns & conventions 🧭
- Environment-driven behavior: `NIRO_ENV` selects `local|cloud|test`. Defaults: local→`lmstudio`, cloud→`openai`, test→`mock`.
- FS access: `EDITOR_FS_WHITELIST` (relative to repo root; default `drafts`). `memory/` top-level is **forbidden** and per-file checks are enforced in `_resolve_fs_path`.
- Dev job runner: gated by `DEV_MODE`; commands restricted by `DEV_CMD_WHITELIST` and arguments validated by a strict regex (`ARG_TOKEN_RE`). Job logs and metadata are written under `logs/jobs`.
- Observability: request ID (`X-Request-ID`) injected per request; check `logs/server-app.log` and `backend/core/observability.py` for metric collection.
- Response shape: providers return a single text reply—frontend simulates streaming. Don’t rely on backend-side streaming.


---

## When making changes, remember 🧭
- Feature toggles & developer routes are behind env flags — tests and CI rely on these defaults (`test` env → `mock` provider).
- Keep `EDITOR_FS_WHITELIST` safe and repository-local (non-absolute or must be under repo root)
- When adding commands to the job runner, update `DEV_CMD_WHITELIST` (env override supported) and include tests that assert validation (`validate_command`).

---

## Common tasks for an AI coding agent (copy-paste examples) ✅
- Add an LLM provider
  - Create `backend/core/llm/<provider>_provider.py` implementing `.generate(messages)` and raise `ConfigurationError`/`UpstreamError` appropriately.
  - Wire it in `backend/core/llm/__init__.py` via `get_provider()` and add tests in `backend/tests/test_providers.py`.
- Add a dev command
  - Update `DEV_CMD_WHITELIST` (env or test setup). Add an integration test that POSTs to `/api/dev/jobs` with `DEV_MODE=true` and checks job lifecycle and logs (`logs/jobs`).
- Debugging tests
  - Run `pytest -q`. For failing endpoints, reproduce with `curl` and correlate using `X-Request-ID` in `logs/server-app.log`. For job-related failures inspect `logs/jobs/*.log` and `logs/jobs/YYYYMMDD.jsonl`.
- File edits & safety
  - Use `backend/app.py` FS helpers: `_resolve_fs_path()` enforces whitelist; avoid editing `memory/` and only add whitelist entries relative to repo root.

---

If you'd like, I can: 1) keep this concise version and replace the existing doc, or 2) move longer examples and checklists into a separate `AGENTS.md`/`DEV-AGENTS.md` and leave a short pointer here. Which do you prefer, or what would you like me to add next? ✨
