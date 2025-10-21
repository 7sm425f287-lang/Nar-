# Repository Guidelines

## Project Structure & Module Organization
The backend FastAPI package lives under `app/`: `main.py` wires middleware and routers, `routes/` holds endpoint modules, `services/` wraps LM Studio and OpenAI calls, and `schemas.py` defines shared Pydantic models. Place reusable integrations under `adapters/` and persistable assets such as seed data or migrations under `db/`. Keep runtime-only artifacts out of version control -- local environments belong in `.venv/` or `venv/`, which the helper script already ignores.

## Build, Test, and Development Commands
- `python -m venv .venv && source .venv/bin/activate`: create and activate a local virtual environment before installing dependencies.
- `pip install -r requirements.txt`: sync the backend runtime requirements.
- `./dev.sh .env.local start`: boot the auto-reloading Uvicorn server after loading configuration from `.env.local` (omit the argument to default to `.env`).
- `./dev.sh stop|status|logs`: manage or inspect the development server lifecycle.
- `uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload`: direct invocation when running inside alternative tooling (Docker, Procfile, etc.).

## Coding Style & Naming Conventions
Follow PEP 8 with four-space indentation and descriptive lower_snake_case module and function names. Keep Pydantic models (`ChatIn`, `ChatOut`) co-located with their routes unless a module grows large, then promote them to a sibling `schemas/`. Prefer explicit type hints and structured logging via the shared `logger`. When formatting, run `black` and `isort` (88-column default) before committing.

## Testing Guidelines
Adopt `pytest` with `pytest-asyncio` for exercising FastAPI endpoints. Store tests in `tests/` mirroring the runtime package layout (`tests/routes/test_chat.py` for `app/routes/chat.py`). Name async fixtures clearly (`client_async`) and favor HTTPX AsyncClient. Aim for meaningful scenario coverage -- chat happy-path, validation failures, and upstream outage handling. Run `make test` (or `pytest -q`) locally; capture coverage using `pytest --cov=app`.

## Commit & Pull Request Guidelines
Use conventional commits (`feat:`, `fix:`, `chore:`) with concise imperative subjects and optional scope (`feat(chat): add streaming support`). Each pull request should include: purpose summary, key implementation notes, testing evidence (commands, screenshots of manual calls), and linked issue references. Bundle related changes together and update documentation or configuration when behavior shifts.

## Security & Configuration Tips
Configuration is environment-driven; never hard-code API credentials. Maintain `.env` variants per environment and reference them via the `dev.sh` loader. Before deploying, validate that `NIRO_LLM`, OpenAI keys, and LM Studio endpoints are set, and rotate secrets promptly when collaborating.
