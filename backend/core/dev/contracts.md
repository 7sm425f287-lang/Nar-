# Dev API Contracts

## Job Execution
- **POST `/api/dev/jobs`**
  - Request body: `{ "cmd": string, "cwd": string, "args": string[]?, "timeout_sec"?: number, "idempotency_key"?: string }`
  - Response: `{ "job_id": string, "status": "queued" }`
  - Guards: `cmd` must be in `DEV_CMD_WHITELIST`; `cwd` must be subdirectory of `EDITOR_FS_WHITELIST` roots. Timeout default 180 s.
- **GET `/api/dev/jobs/{job_id}`**
  - Response: `{ "job_id": string, "status": "queued|running|ok|fail|killed", "started_at"?: iso8601, "ended_at"?: iso8601, "exit_code"?: number, "lines"?: number }`
- **GET `/api/dev/jobs/{job_id}/stream`**
  - Server-Sent Events stream. Events: `log` with payload `{ts,line}`; `status` when job completes.

## Logging
- Job logs: `logs/jobs/{job_id}.log`
- Metadata: `logs/jobs/{YYYYMMDD}.jsonl` (append-only, one record pro Job)
- Status rollup: `logs/status-YYYY-MM-DD.md`

## Constraints
- Kein Netzwerkzugriff; Subprozesse erhalten geschälte ENV ohne Secrets.
- Resource limits: CPU/Wall timeout, Memory-Softlimit (künftige Erweiterung).
- idempotency_key optional: mehrfaches POST mit gleichem Key soll vorhandenen Job zurückliefern.

## Phase 2 (optional)
- **POST `/api/dev/lint`** – führt ESLint/tsc/flake8 gegen gegebenen Pfad aus.
- **POST `/api/dev/ast`** – liefert einfache AST-/Funktionsliste zur Analyse.
