"""Developer job endpoints."""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..services.job_runner import (
    RUNNER,
    TERMINAL_STATES as JOB_TERMINAL_STATES,
    clamp_timeout as clamp_job_timeout,
    resolve_cwd,
    validate_command,
)
from ..services.planner_worker import (
    PLANNER,
    TERMINAL_STATES as PLANNER_TERMINAL_STATES,
    clamp_timeout as clamp_planner_timeout,
)

router = APIRouter(prefix="/api/dev", tags=["dev"])

DEV_ENABLED = os.getenv("DEV_MODE", "").lower() in {"1", "true", "yes"}
IDEMPOTENCY_CACHE: dict[str, str] = {}
PLANNER_IDEMPOTENCY_CACHE: dict[str, str] = {}


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


class PlannerRequest(BaseModel):
    campaign_name: str = Field(..., min_length=1, max_length=120)
    tone: str = Field(default="clear, focused, urban", max_length=160)
    platforms: list[str] = Field(default_factory=lambda: ["instagram", "tiktok", "youtube-shorts"])
    sources: list[str] = Field(default_factory=list)
    output_dir: Optional[str] = None
    max_posts: int = Field(default=3, ge=1, le=6)
    timeout_sec: Optional[int] = None
    dry_run: bool = False
    idempotency_key: Optional[str] = None
    meta: dict[str, Any] = Field(default_factory=dict)


class PlannerJobResponse(BaseModel):
    job_id: str
    status: str


class PlannerJobDetail(BaseModel):
    job_id: str
    campaign_name: str
    tone: str
    platforms: list[str]
    sources: list[str]
    output_dir: str
    output_paths: list[str]
    status: str
    exit_code: Optional[int]
    dry_run: bool
    created_at: Optional[str]
    started_at: Optional[str]
    ended_at: Optional[str]
    timeout_sec: int
    max_posts: int


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
        "planner_queue_size": PLANNER.pending_count(),
    }


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _tail_log_lines(log_path: Path, tail: int) -> list[str]:
    if not log_path.exists():
        return []
    with log_path.open("r", encoding="utf-8") as fh:
        lines = fh.readlines()
    if tail > 0 and len(lines) > tail:
        lines = lines[-tail:]
    return [line.rstrip("\n") for line in lines]


def _stream_job_log(log_path: Path, resolve_job: Callable[[], Any], terminal_states: set[str]) -> StreamingResponse:
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
            job_state = resolve_job()
            if not job_state:
                break
            if job_state.status in terminal_states:
                current_size = len(log_path.read_text(encoding="utf-8")) if log_path.exists() else 0
                if position == current_size:
                    break
        job_state = resolve_job()
        payload = {
            "ts": _utc_iso(),
            "status": job_state.status if job_state else "unknown",
        }
        yield f"event: status\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")


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
    timeout_sec = clamp_job_timeout(payload.timeout_sec)
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
    return _stream_job_log(job.log_path, lambda: RUNNER.get(job_id), JOB_TERMINAL_STATES)


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
    return {"lines": _tail_log_lines(job.log_path, tail), "status": job.status}


@router.get("/planner")
async def planner_root() -> dict[str, Any]:
    _ensure_dev_mode()
    return {
        "enabled": True,
        "queue_size": PLANNER.pending_count(),
        "default_output_dir": PLANNER.default_output_dir(),
    }


@router.get("/planner/jobs")
async def list_planner_jobs(limit: int = 20) -> list[PlannerJobDetail]:
    _ensure_dev_mode()
    jobs = PLANNER.list_latest(limit)
    return [PlannerJobDetail(**job.to_public_dict()) for job in jobs]


@router.post("/planner/jobs", response_model=PlannerJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_planner_job(payload: PlannerRequest) -> PlannerJobResponse:
    _ensure_dev_mode()

    if payload.idempotency_key and payload.idempotency_key in PLANNER_IDEMPOTENCY_CACHE:
        job_id = PLANNER_IDEMPOTENCY_CACHE[payload.idempotency_key]
        job = PLANNER.get(job_id)
        if job:
            return PlannerJobResponse(job_id=job_id, status=job.status)

    if PLANNER.pending_count() >= 3:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Planner queue full")

    timeout_sec = clamp_planner_timeout(payload.timeout_sec)
    try:
        job = PLANNER.enqueue(
            campaign_name=payload.campaign_name,
            tone=payload.tone,
            platforms=payload.platforms,
            sources=payload.sources,
            output_dir=payload.output_dir,
            max_posts=payload.max_posts,
            timeout_sec=timeout_sec,
            dry_run=payload.dry_run,
            meta=payload.meta,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if payload.idempotency_key:
        PLANNER_IDEMPOTENCY_CACHE[payload.idempotency_key] = job.job_id
    return PlannerJobResponse(job_id=job.job_id, status=job.status)


@router.get("/planner/jobs/{job_id}")
async def get_planner_job(job_id: str) -> PlannerJobDetail:
    _ensure_dev_mode()
    job = PLANNER.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planner job not found")
    return PlannerJobDetail(**job.to_public_dict())


@router.post("/planner/jobs/{job_id}/abort", response_model=PlannerJobResponse)
async def abort_planner_job(job_id: str) -> PlannerJobResponse:
    _ensure_dev_mode()
    if not PLANNER.request_abort(job_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planner job not found")
    job = PLANNER.get(job_id)
    assert job is not None
    return PlannerJobResponse(job_id=job.job_id, status=job.status)


@router.get("/planner/jobs/{job_id}/stream")
async def stream_planner_job(job_id: str):
    _ensure_dev_mode()
    job = PLANNER.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planner job not found")
    return _stream_job_log(job.log_path, lambda: PLANNER.get(job_id), PLANNER_TERMINAL_STATES)


@router.get("/planner/jobs/{job_id}/log")
async def get_planner_job_log(job_id: str, tail: int = 400) -> dict[str, Any]:
    _ensure_dev_mode()
    job = PLANNER.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Planner job not found")
    return {"lines": _tail_log_lines(job.log_path, tail), "status": job.status}
