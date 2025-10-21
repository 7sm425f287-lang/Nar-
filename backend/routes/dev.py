"""Developer job endpoints."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..services.job_runner import RUNNER, TERMINAL_STATES, clamp_timeout, resolve_cwd, validate_command

router = APIRouter(prefix="/api/dev", tags=["dev"])

DEV_ENABLED = os.getenv("DEV_MODE", "").lower() in {"1", "true", "yes"}
IDEMPOTENCY_CACHE: dict[str, str] = {}


class JobRequest(BaseModel):
    cmd: str
    args: list[str] = Field(default_factory=list)
    cwd: Optional[str] = None
    timeout_sec: Optional[int] = None
    dry_run: bool = False
    idempotency_key: Optional[str] = None
    meta: dict[str, Any] = Field(default_factory=dict)


class JobResponse(BaseModel):
    job_id: str
    status: str


class JobDetail(BaseModel):
    job_id: str
    cmd: str
    args: list[str]
    cwd: str
    status: str
    exit_code: Optional[int]
    dry_run: bool
    created_at: Optional[str]
    started_at: Optional[str]
    ended_at: Optional[str]
    timeout_sec: int


def _ensure_dev_mode() -> None:
    if not DEV_ENABLED:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="DEV_MODE disabled")


@router.get("/")
async def dev_root() -> dict[str, Any]:
    _ensure_dev_mode()
    return {
        "enabled": True,
        "commands": sorted(RUNNER.command_whitelist()),
        "queue_size": RUNNER.pending_count(),
    }


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@router.get("/jobs")
async def list_jobs(limit: int = 20) -> list[JobDetail]:
    _ensure_dev_mode()
    jobs = RUNNER.list_latest(limit)
    return [JobDetail(**job.to_public_dict()) for job in jobs]


@router.post("/jobs", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_job(payload: JobRequest) -> JobResponse:
    _ensure_dev_mode()

    if payload.idempotency_key and payload.idempotency_key in IDEMPOTENCY_CACHE:
        job_id = IDEMPOTENCY_CACHE[payload.idempotency_key]
        job = RUNNER.get(job_id)
        if job:
            return JobResponse(job_id=job_id, status=job.status)

    if RUNNER.pending_count() >= 3:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Job queue full")

    validate_command(payload.cmd, payload.args)
    cwd = resolve_cwd(payload.cwd)
    timeout_sec = clamp_timeout(payload.timeout_sec)
    job = RUNNER.enqueue(
        cmd=payload.cmd,
        args=payload.args,
        cwd=cwd,
        timeout_sec=timeout_sec,
        dry_run=payload.dry_run,
        meta=payload.meta,
    )
    if payload.idempotency_key:
        IDEMPOTENCY_CACHE[payload.idempotency_key] = job.job_id
    return JobResponse(job_id=job.job_id, status=job.status)


@router.get("/jobs/{job_id}")
async def get_job(job_id: str) -> JobDetail:
    _ensure_dev_mode()
    job = RUNNER.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return JobDetail(**job.to_public_dict())


@router.post("/jobs/{job_id}/abort", response_model=JobResponse)
async def abort_job(job_id: str) -> JobResponse:
    _ensure_dev_mode()
    if not RUNNER.request_abort(job_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    job = RUNNER.get(job_id)
    assert job is not None
    return JobResponse(job_id=job.job_id, status=job.status)


@router.get("/jobs/{job_id}/stream")
async def stream_job(job_id: str):
    _ensure_dev_mode()
    job = RUNNER.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    log_path = job.log_path

    async def event_source():
        position = 0
        while True:
            await asyncio.sleep(0.3)
            if log_path.exists():
                data = log_path.read_text(encoding="utf-8")
                if len(data) > position:
                    chunk = data[position:]
                    position = len(data)
                    for line in chunk.splitlines():
                        payload = {"ts": _utc_iso(), "line": line}
                        yield f"event: log\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
            job_state = RUNNER.get(job_id)
            if not job_state:
                break
            if job_state.status in TERMINAL_STATES and log_path.exists() and position == len(log_path.read_text(encoding="utf-8")):
                break
        job_state = RUNNER.get(job_id)
        payload = {
            "ts": _utc_iso(),
            "status": job_state.status if job_state else "unknown",
        }
        yield f"event: status\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")


class TelemetryEvent(BaseModel):
    event: str
    data: dict[str, Any] = Field(default_factory=dict)


@router.post("/telemetry", status_code=status.HTTP_204_NO_CONTENT)
async def log_telemetry(payload: TelemetryEvent) -> Response:
    _ensure_dev_mode()
    record = payload.dict()
    now = datetime.now(timezone.utc)
    record["ts"] = now.isoformat().replace("+00:00", "Z")
    outfile = Path("logs") / f"ui-activity-{now:%Y%m%d}.jsonl"
    outfile.parent.mkdir(parents=True, exist_ok=True)
    with outfile.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/jobs/{job_id}/log")
async def get_job_log(job_id: str, tail: int = 400) -> dict[str, Any]:
    _ensure_dev_mode()
    job = RUNNER.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if not job.log_path.exists():
        return {"lines": [], "status": job.status}
    with job.log_path.open("r", encoding="utf-8") as fh:
        lines = fh.readlines()
    if tail > 0 and len(lines) > tail:
        lines = lines[-tail:]
    return {"lines": [line.rstrip("\n") for line in lines], "status": job.status}
