"""Background job runner for dev-mode commands."""

from __future__ import annotations

import json
import os
import queue
import re
import subprocess
import selectors
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional
import sys

ROOT = Path(__file__).resolve().parents[2]
LOG_DIR = ROOT / "logs" / "jobs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

SAFE_ENV_KEYS = {"PATH", "PYTHONPATH", "VIRTUAL_ENV", "DEV_MODE"}
_env_cmds = {token.strip() for token in os.getenv("DEV_CMD_WHITELIST", "").split(":") if token.strip()}
if not _env_cmds:
    CMD_WHITELIST = {"pytest", "npm", "node", "python", "eslint", "tsc", "mypy"}
else:
    CMD_WHITELIST = _env_cmds
ARG_TOKEN_RE = re.compile(r"^[\w\-./:+@=]+$")
TERMINAL_STATES = {"ok", "fail", "timeout", "killed"}
DEFAULT_TIMEOUT = 60
MAX_TIMEOUT = 300


def _load_fs_whitelist() -> list[Path]:
    tokens = [token.strip() for token in os.getenv("EDITOR_FS_WHITELIST", "").split(":") if token.strip()]
    if not tokens:
        tokens = ["drafts"]

    whitelist: list[Path] = []
    for token in tokens:
        candidate = (ROOT / token).resolve()
        if not str(candidate).startswith(str(ROOT)):
            continue
        whitelist.append(candidate)
    return whitelist


FS_WHITELIST = _load_fs_whitelist()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


@dataclass
class DevJob:
    job_id: str
    cmd: str
    args: tuple[str, ...]
    cwd: Path
    timeout_sec: int
    dry_run: bool = False
    meta: dict = field(default_factory=dict)
    status: str = "queued"
    exit_code: Optional[int] = None
    created_at: datetime = field(default_factory=_now)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    log_path: Path = field(default_factory=lambda: LOG_DIR / f"job-{uuid.uuid4().hex}.log")
    _abort: bool = False

    def to_public_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "cmd": self.cmd,
            "args": list(self.args),
            "cwd": str(self.cwd.relative_to(ROOT)),
            "status": self.status,
            "exit_code": self.exit_code,
            "dry_run": self.dry_run,
            "created_at": _to_iso(self.created_at),
            "started_at": _to_iso(self.started_at),
            "ended_at": _to_iso(self.ended_at),
            "timeout_sec": self.timeout_sec,
        }


class JobRunner:
    def __init__(self) -> None:
        self._jobs: dict[str, DevJob] = {}
        self._lock = threading.Lock()
        self._queue: "queue.Queue[DevJob]" = queue.Queue()
        self._worker = threading.Thread(target=self._run_loop, name="dev-job-runner", daemon=True)
        self._worker.start()

    def enqueue(
        self,
        cmd: str,
        args: Iterable[str],
        cwd: Path,
        timeout_sec: int,
        dry_run: bool,
        meta: dict,
    ) -> DevJob:
        job_id = uuid.uuid4().hex
        job = DevJob(
            job_id=job_id,
            cmd=cmd,
            args=tuple(args),
            cwd=cwd,
            timeout_sec=timeout_sec,
            dry_run=dry_run,
            meta=meta,
        )
        with self._lock:
            self._jobs[job_id] = job
        self._queue.put(job)
        return job

    def get(self, job_id: str) -> Optional[DevJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_latest(self, limit: int = 20) -> list[DevJob]:
        with self._lock:
            jobs = list(self._jobs.values())
        jobs.sort(key=lambda job: job.created_at, reverse=True)
        return jobs[:limit]

    def pending_count(self) -> int:
        return self._queue.qsize()

    def command_whitelist(self) -> list[str]:
        return sorted(CMD_WHITELIST)

    def request_abort(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            job._abort = True
            return True

    # ------------------------------------------------------------------
    def _run_loop(self) -> None:
        while True:
            job = self._queue.get()
            try:
                self._execute(job)
            finally:
                self._queue.task_done()

    def _execute(self, job: DevJob) -> None:
        job.started_at = _now()
        try:
            prefix = str(job.cwd.relative_to(ROOT))
        except ValueError:
            prefix = ""

        adjusted_args = []
        for arg in job.args:
            if prefix and arg.startswith(prefix + os.sep):
                trimmed = arg[len(prefix) + 1 :]
                adjusted_args.append(trimmed or ".")
            else:
                adjusted_args.append(arg)
        if job.dry_run:
            job.status = "ok"
            job.exit_code = 0
            job.ended_at = _now()
            job.log_path.parent.mkdir(parents=True, exist_ok=True)
            cmd_preview = " ".join([job.cmd, *adjusted_args]).strip()
            job.log_path.write_text(f"$ {cmd_preview or job.cmd}\n[dry-run] command skipped\n", encoding="utf-8")
            self._append_metadata(job)
            return

        job.status = "running"
        cmd_list = [job.cmd, *adjusted_args]
        env = {k: v for k, v in os.environ.items() if k in SAFE_ENV_KEYS}
        env.setdefault("DEV_MODE", "true")
        env.setdefault("PATH", os.environ.get("PATH", ""))
        exe_dir = Path(sys.executable).parent
        if env["PATH"]:
            path_parts = env["PATH"].split(os.pathsep)
            if str(exe_dir) not in path_parts:
                env["PATH"] = os.pathsep.join([str(exe_dir), *path_parts])
        else:
            env["PATH"] = str(exe_dir)

        deadline = time.monotonic() + job.timeout_sec
        job.log_path.parent.mkdir(parents=True, exist_ok=True)

        with job.log_path.open("w", encoding="utf-8") as log_file:
            log_file.write(f"$ {' '.join(cmd_list)}\n")
            log_file.flush()
            try:
                proc = subprocess.Popen(
                    cmd_list,
                    cwd=str(job.cwd),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=env,
                )
            except Exception as exc:  # pragma: no cover
                log_file.write(f"[runner] spawn failed: {exc}\n")
                job.status = "fail"
                job.exit_code = -1
                job.ended_at = _now()
                self._append_metadata(job)
                return

            assert proc.stdout is not None
            selector = selectors.DefaultSelector()
            selector.register(proc.stdout, selectors.EVENT_READ)
            try:
                while True:
                    if job._abort:
                        proc.terminate()
                        try:
                            proc.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                        job.status = "killed"
                        break

                    if proc.poll() is not None:
                        remainder = proc.stdout.read()
                        if remainder:
                            log_file.write(remainder)
                            log_file.flush()
                        break

                    now = time.monotonic()
                    if now >= deadline:
                        proc.terminate()
                        try:
                            proc.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            proc.kill()
                        job.status = "timeout"
                        break

                    timeout = min(0.25, max(0.0, deadline - now))
                    events = selector.select(timeout)
                    for key, _ in events:
                        chunk = key.fileobj.readline()
                        if chunk:
                            log_file.write(chunk)
                            log_file.flush()
            finally:
                try:
                    selector.unregister(proc.stdout)
                except Exception:
                    pass
                selector.close()
                if job.status not in TERMINAL_STATES:
                    exit_code = proc.wait()
                    job.exit_code = exit_code
                    job.status = "ok" if exit_code == 0 else "fail"
                else:
                    job.exit_code = proc.poll()

        job.ended_at = _now()
        self._append_metadata(job)

    def _append_metadata(self, job: DevJob) -> None:
        payload = {
            "job_id": job.job_id,
            "cmd": job.cmd,
            "args": list(job.args),
            "cwd": str(job.cwd.relative_to(ROOT)),
            "status": job.status,
            "exit_code": job.exit_code,
            "dry_run": job.dry_run,
            "created_at": _to_iso(job.created_at),
            "started_at": _to_iso(job.started_at),
            "ended_at": _to_iso(job.ended_at),
            "timeout_sec": job.timeout_sec,
            "meta": job.meta,
        }
        metadata_file = ROOT / "logs" / "jobs" / f"{job.created_at:%Y%m%d}.jsonl"
        metadata_file.parent.mkdir(parents=True, exist_ok=True)
        with metadata_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


RUNNER = JobRunner()


def resolve_cwd(cwd: Optional[str]) -> Path:
    target = (ROOT / cwd).resolve() if cwd else ROOT
    if not target.exists() or not target.is_dir():
        raise ValueError("cwd not found")
    if not str(target).startswith(str(ROOT)):
        raise ValueError("cwd outside workspace")
    if not any(target == allowed or str(target).startswith(str(allowed) + os.sep) for allowed in FS_WHITELIST):
        raise ValueError("cwd not whitelisted")
    return target


def validate_command(cmd: str, args: Iterable[str]) -> None:
    if cmd not in CMD_WHITELIST:
        raise ValueError(f"Command '{cmd}' ist nicht whitelistet")
    for arg in args:
        if not ARG_TOKEN_RE.match(arg):
            raise ValueError(f"Argument '{arg}' enthält unzulässige Zeichen")


def clamp_timeout(timeout_sec: Optional[int]) -> int:
    if timeout_sec is None:
        return DEFAULT_TIMEOUT
    return max(1, min(timeout_sec, MAX_TIMEOUT))
