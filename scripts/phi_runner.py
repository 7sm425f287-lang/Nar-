#!/usr/bin/env python3
import os, sys, time, json, uuid, subprocess, shlex, pathlib, datetime
from typing import Any, Dict, List
try:
    import yaml  # PyYAML
except ModuleNotFoundError:
    print("PyYAML fehlt. Bitte in der venv: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

ROOT = pathlib.Path(__file__).resolve().parents[1]
QUEUE_FILE = ROOT / "drafts" / "queue.yaml"
DONE_FILE  = ROOT / "drafts" / "queue.done.yaml"
LOG_DIR    = ROOT / "logs" / "runner"
LOG_DIR.mkdir(parents=True, exist_ok=True)

SLEEP_SEC = int(os.getenv("PHI_RUNNER_INTERVAL", "30"))
DEFAULT_WHITELIST = "pytest:backend/.venv/bin/python:backend/.venv/bin/pytest:npm run build:npm run test:node --check:eslint:tsc:mypy"
CMD_WHITELIST = set((os.getenv("DEV_CMD_WHITELIST", DEFAULT_WHITELIST)).split(":"))

def now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

def slug_ts() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S")

def load_yaml(p: pathlib.Path) -> Any:
    if not p.exists():
        return {"tasks": []}
    with p.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {"tasks": []}

def save_yaml(p: pathlib.Path, data: Any) -> None:
    with p.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, allow_unicode=True)

def safe_cmd(cmd: str) -> bool:
    for allowed in CMD_WHITELIST:
        if cmd.startswith(allowed):
            return True
    return False

def run_task(task: Dict[str, Any]) -> Dict[str, Any]:
    task_id = task.get("id") or str(uuid.uuid4())
    slug = task.get("slug") or task_id[:8]
    cwd = task.get("cwd") or str(ROOT)
    commands: List[str] = task.get("commands", [])
    env_extra: Dict[str, str] = task.get("env", {})

    stamp = slug_ts()
    logfile = LOG_DIR / f"{stamp}_{slug}.log"
    jsonl   = LOG_DIR / f"{stamp}_{slug}.jsonl"

    status = "ok"
    start_ts = now_iso()
    with logfile.open("w", encoding="utf-8") as lf, jsonl.open("w", encoding="utf-8") as jf:
        jf.write(json.dumps({"ts": start_ts, "event": "start", "task_id": task_id, "slug": slug}) + "\n")
        for raw in commands:
            cmd = raw.strip()
            if not safe_cmd(cmd):
                status = "blocked"
                jf.write(json.dumps({"ts": now_iso(), "event": "blocked", "cmd": cmd}) + "\n")
                break
            jf.write(json.dumps({"ts": now_iso(), "event": "exec", "cmd": cmd, "cwd": cwd}) + "\n")
            proc = subprocess.Popen(shlex.split(cmd), cwd=cwd, env={**os.environ, **env_extra},
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in proc.stdout:  # type: ignore
                lf.write(line)
            rc = proc.wait()
            jf.write(json.dumps({"ts": now_iso(), "event": "rc", "cmd": cmd, "rc": rc}) + "\n")
            if rc != 0:
                status = "fail"
                break
        jf.write(json.dumps({"ts": now_iso(), "event": "end", "status": status}) + "\n")

    return {"id": task_id, "slug": slug, "status": status, "log": str(logfile), "jsonl": str(jsonl), "started": start_ts, "ended": now_iso()}

def main() -> None:
    print(f"[phi_runner] start @ {now_iso()} | root={ROOT}")
    while True:
        data = load_yaml(QUEUE_FILE)
        tasks: List[Dict[str, Any]] = data.get("tasks", [])
        if tasks:
            task = tasks.pop(0)
            result = run_task(task)
            done = load_yaml(DONE_FILE)
            (done.setdefault("done", [])).append({**task, "result": result})
            save_yaml(DONE_FILE, done)
            save_yaml(QUEUE_FILE, {"tasks": tasks})
            print(f"[phi_runner] {result['slug']} -> {result['status']}")
        time.sleep(SLEEP_SEC)

if __name__ == "__main__":
    main()
