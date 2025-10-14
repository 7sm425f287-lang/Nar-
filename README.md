# Nar φ — Local dev

This repository was reorganized for a local dev experience (DOER charter). Key points:

Assumptions
- You are running locally on macOS with zsh.
- Python 3.11+ and Node 18+ are available.
- LM Studio (local) is available at LMSTUDIO_URL in `backend/.env.local` if using NIRO_LLM=lmstudio.
- OpenAI keys go into `backend/.env.cloud` when NIRO_LLM=openai. Never commit secrets.

Setup
1. Backend: create a virtualenv and install requirements

   python -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt

2. Frontend: install node deps

   cd frontend
   npm install

Start (development)
- Start backend: cd backend && ./dev.sh start
- Start frontend: cd frontend && npm run dev

Stop
- Backend: cd backend && ./dev.sh stop

Switching modes
- To use OpenAI: set NIRO_LLM=openai and add OPENAI_API_KEY to `backend/.env.cloud`.
- To use LM Studio (local): set NIRO_LLM=lmstudio in `backend/.env.local` and ensure LMSTUDIO_URL is reachable.

Troubleshooting
- Ports: backend runs on 8001, frontend on 5173. Ensure nothing else uses them.
- CORS: backend allows origin http://localhost:5173. Change in `backend/app.py` if needed.
- Proxy: frontend vite proxies /api to the backend. If CORS issues persist, open devtools to inspect.

Running tests (local)
- Backend tests (pytest):
   1. Create and activate Python venv in repo root: `python -m venv .venv && source .venv/bin/activate`
   2. Install requirements: `pip install -r backend/requirements.txt pytest pytest-asyncio httpx`
   3. Run: `pytest backend/tests -q`

- Frontend smoke tests (node):
   1. Start backend (`cd backend && ./dev.sh start`)
   2. In another terminal: `cd frontend && npm install` then `npm run test:smoke`

Logs
- Backend uvicorn stdout/stderr: `backend/.uvicorn.out` (created by `backend/dev.sh start`).
- If the backend refuses to start, inspect the .uvicorn.out file.

If test runner tools here report missing packages, install dependencies locally as above — this environment doesn't run installs automatically.

Safety
- memory/ is read-only and must not be written by any process.
- .gitignore excludes env files, node_modules, .venv, and dist.
