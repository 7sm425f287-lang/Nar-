from __future__ import annotations

import os
from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel

router = APIRouter(prefix="/api/fs", tags=["fs"])

# Workspace root — prefer explicit env var
WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_ROOT") or Path(__file__).resolve().parents[3]).resolve()

# Whitelisted writable directories (relative to WORKSPACE_ROOT)
WHITELIST_DIRS: List[Path] = [
    (WORKSPACE_ROOT / "drafts").resolve(),
    (WORKSPACE_ROOT / "system").resolve(),
]

MEMORY_DIR = (WORKSPACE_ROOT / "memory").resolve()

# Simple token auth for local dev
def require_token(request: Request):
    expected = os.environ.get("EDITOR_API_TOKEN")
    if not expected:
        # No token configured — allow local dev but warn
        return True
    token = request.headers.get("x-api-token")
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid API token")
    return True


def resolve_within_whitelist(rel_path: str) -> Path:
    # disallow absolute paths
    if os.path.isabs(rel_path):
        raise HTTPException(status_code=400, detail="Absolute paths not allowed")

    # simple traversal protection
    if ".." in Path(rel_path).parts:
        raise HTTPException(status_code=400, detail="Path traversal forbidden")

    # normalize
    normalized = Path(rel_path)

    for base in WHITELIST_DIRS:
        candidate = (base / normalized).resolve()
        try:
            candidate.relative_to(base)
            # forbid memory
            if MEMORY_DIR in candidate.parents or candidate == MEMORY_DIR:
                raise HTTPException(status_code=403, detail="Access to memory is forbidden")
            return candidate
        except Exception:
            continue
    raise HTTPException(status_code=403, detail="Path not within allowed directories")


@router.get("/read")
def fs_read(path: str):
    target = resolve_within_whitelist(path)
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if target.is_dir():
        raise HTTPException(status_code=400, detail="Path is a directory")
    try:
        return target.read_text(encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class WritePayload(BaseModel):
    path: str
    content: str


@router.post("/write", dependencies=[Depends(require_token)])
def fs_write(payload: WritePayload):
    target = resolve_within_whitelist(payload.path)
    # size limit: 1MB
    if len(payload.content.encode("utf-8")) > 1_000_000:
        raise HTTPException(status_code=413, detail="File too large")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_text(payload.content, encoding="utf-8")
        tmp.replace(target)
        return {"ok": True, "path": str(target)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
