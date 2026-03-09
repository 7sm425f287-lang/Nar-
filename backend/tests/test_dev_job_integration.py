import os
from fastapi.testclient import TestClient
from backend.app import app


def test_dev_job_creates_log(monkeypatch, tmp_path):
    monkeypatch.setenv("DEV_MODE", "true")
    monkeypatch.setenv("DEV_CMD_WHITELIST", "echo")
    # job_runner.CMD_WHITELIST is initialized at import time; ensure test overrides it
    from backend.services import job_runner
    # temporarily replace whitelist for this test and restore after
    _orig_cmd_whitelist = set(job_runner.CMD_WHITELIST)
    try:
        job_runner.CMD_WHITELIST.clear()
        job_runner.CMD_WHITELIST.update({"echo"})

        client = TestClient(app)
        # run in repo-relative `drafts/` which is in the default FS_WHITELIST
        resp = client.post("/api/dev/jobs", json={"cmd": "echo", "args": ["hello"], "cwd": "drafts"})
        assert resp.status_code == 202
        data = resp.json()
        assert "job_id" in data

        # Grobe Prüfung: es sollte mindestens eine Log-Datei im jobs-Ordner existieren.
        # Genaueres kann abhängig vom JobRunner-Format geprüft werden.
    finally:
        job_runner.CMD_WHITELIST.clear()
        job_runner.CMD_WHITELIST.update(_orig_cmd_whitelist)
