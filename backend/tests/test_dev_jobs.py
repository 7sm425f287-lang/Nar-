import os
import time

os.environ["DEV_MODE"] = "true"
os.environ["DEV_CMD_WHITELIST"] = "pytest:python:npm"

from fastapi.testclient import TestClient

from backend.app import app
from backend.services import job_runner as job_runner_module

job_runner_module.CMD_WHITELIST.update({'pytest', 'python', 'npm'})
client = TestClient(app)


def _wait_for_status(job_id: str, expected: set[str], timeout: float = 10.0) -> str:
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        res = client.get(f"/api/dev/jobs/{job_id}")
        assert res.status_code == 200
        data = res.json()
        last = data["status"]
        if last in expected:
            return last
        time.sleep(0.2)
    return last


def test_create_job_dry_run() -> None:
    payload = {"cmd": "pytest", "args": ["-q"], "dry_run": True, "cwd": "backend"}
    res = client.post("/api/dev/jobs", json=payload)
    assert res.status_code == 202
    job_id = res.json()["job_id"]

    status = _wait_for_status(job_id, {"ok"})
    assert status == "ok"

    res = client.get(f"/api/dev/jobs/{job_id}/log")
    assert res.status_code == 200
    lines = res.json()["lines"]
    assert any("pytest" in line for line in lines)


def test_job_timeout() -> None:
    payload = {"cmd": "python", "args": ["backend/tests/support/sleep_for.py", "2"], "timeout_sec": 1, "cwd": "backend"}
    res = client.post("/api/dev/jobs", json=payload)
    assert res.status_code == 202
    job_id = res.json()["job_id"]

    status = _wait_for_status(job_id, {"timeout", "fail"}, timeout=8)
    assert status == "timeout"


def test_job_abort() -> None:
    payload = {"cmd": "python", "args": ["backend/tests/support/sleep_for.py", "30"], "timeout_sec": 300, "cwd": "backend"}
    res = client.post("/api/dev/jobs", json=payload)
    assert res.status_code == 202
    job_id = res.json()["job_id"]

    time.sleep(0.5)
    abort_res = client.post(f"/api/dev/jobs/{job_id}/abort")
    assert abort_res.status_code == 200

    status = _wait_for_status(job_id, {"killed", "ok", "fail"}, timeout=8)
    assert status in {"killed", "fail"}
    # if process ended before abort reached, ensure we at least have terminal state
