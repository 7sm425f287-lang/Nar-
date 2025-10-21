from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .core.config import get_settings
from .core.llm import ConfigurationError, UpstreamError, format_messages, get_provider
from .core.observability import (
    generate_request_id,
    get_request_id,
    increment,
    record_timing,
    scoped_request,
)
from .routes import dev as dev_routes


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id() or "-"
        return True


root_logger = logging.getLogger()
root_logger.addFilter(RequestIdFilter())
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s] %(message)s",
)

logger = logging.getLogger("narphi.backend.api")

settings = get_settings()

app = FastAPI(title="Nar φ Backend", version="0.2.0")

REPO_ROOT = Path(__file__).resolve().parent.parent
MEMORY_DIR = (REPO_ROOT / "memory").resolve()
FORBIDDEN_TOP_LEVEL = {"memory"}

SERVER_LOG_PATH = REPO_ROOT / "logs" / "server-app.log"
SERVER_LOG_PATH.parent.mkdir(exist_ok=True)
if not any(
    isinstance(handler, logging.FileHandler) and getattr(handler, "baseFilename", "") == str(SERVER_LOG_PATH)
    for handler in logger.handlers
):
    file_handler = logging.FileHandler(SERVER_LOG_PATH)
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s] %(message)s")
    )
    logger.addHandler(file_handler)


def _load_whitelist() -> list[Path]:
    raw = os.getenv("EDITOR_FS_WHITELIST", "")
    tokens = [token.strip() for token in raw.split(":") if token.strip()]
    if not tokens:
        tokens = ["drafts"]

    whitelist: list[Path] = []
    for token in tokens:
        candidate = Path(token)
        if not candidate.is_absolute():
            candidate = (REPO_ROOT / candidate).resolve()
        else:
            candidate = candidate.resolve()

        try:
            candidate.relative_to(REPO_ROOT)
        except ValueError:
            logger.warning("Ignoring whitelist entry outside repository: %s", candidate)
            continue

        if MEMORY_DIR == candidate or MEMORY_DIR in candidate.parents:
            logger.warning("Ignoring whitelist entry under forbidden directory: %s", candidate)
            continue

        if candidate in whitelist:
            continue
        whitelist.append(candidate)

    if not whitelist:
        whitelist = [(REPO_ROOT / "drafts").resolve()]
    return whitelist


FS_WHITELIST = _load_whitelist()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dev_routes.router)


class ChatRequest(BaseModel):
    message: str
    system: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    provider: str
    request_id: str


class FileReadResponse(BaseModel):
    path: str
    content: str


class FileWriteRequest(BaseModel):
    path: str
    content: str


class FileWriteResponse(BaseModel):
    path: str
    bytes_written: int


class FileListEntry(BaseModel):
    path: str
    updated_at: datetime
    size: int


class FileListResponse(BaseModel):
    items: list[FileListEntry]


def _resolve_fs_path(raw_path: str) -> Path:
    if not raw_path or not raw_path.strip():
        raise HTTPException(status_code=400, detail="path is required")
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = (REPO_ROOT / candidate).resolve()
    else:
        candidate = candidate.resolve()

    try:
        relative = candidate.relative_to(REPO_ROOT)
    except ValueError as exc:  # outside workspace
        raise HTTPException(status_code=403, detail="path outside workspace") from exc

    if not relative.parts:
        raise HTTPException(status_code=403, detail="path points to repository root")

    if relative.parts[0] in FORBIDDEN_TOP_LEVEL:
        raise HTTPException(status_code=403, detail="path not allowed")

    allowed = any(root == candidate or root in candidate.parents for root in FS_WHITELIST)
    if not allowed:
        raise HTTPException(status_code=403, detail="path not whitelisted")

    return candidate


def _collect_recent_files(limit: int) -> list[FileListEntry]:
    limit = max(1, min(limit, 200))
    results: list[tuple[float, int, Path]] = []

    for base in FS_WHITELIST:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if MEMORY_DIR in path.parents:
                continue
            try:
                path.relative_to(REPO_ROOT)
            except ValueError:
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            results.append((stat.st_mtime, stat.st_size, path))

    results.sort(key=lambda item: item[0], reverse=True)

    items: list[FileListEntry] = []
    seen: set[str] = set()
    for mtime, size, path in results:
        relative = str(path.relative_to(REPO_ROOT))
        if relative in seen:
            continue
        seen.add(relative)
        items.append(
            FileListEntry(
                path=relative,
                updated_at=datetime.fromtimestamp(mtime, tz=timezone.utc),
                size=size,
            )
        )
        if len(items) >= limit:
            break
    return items


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = generate_request_id()
    with scoped_request(request_id):
        logger.debug("request_started path=%s method=%s", request.url.path, request.method)
        with record_timing("http.request", path=request.url.path, method=request.method):
            try:
                response: Response = await call_next(request)
            except Exception as exc:
                increment("http.request.error", path=request.url.path, method=request.method)
                logger.exception("request_failed path=%s method=%s error=%s", request.url.path, request.method, exc)
                raise
        response.headers["X-Request-ID"] = request_id
        logger.debug("request_completed path=%s method=%s status=%s", request.url.path, request.method, response.status_code)
        return response


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.env, "provider": settings.llm}


@app.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    message = (payload.message or "").strip()
    if not message:
        increment("chat.rejected", reason="empty")
        raise HTTPException(status_code=400, detail="message must not be empty")

    provider_name = settings.llm
    provider = get_provider(provider_name, settings)

    messages = format_messages(message, payload.system)
    request_id = get_request_id() or generate_request_id()
    prompt_chars = len(message)
    logger.info(
        "chat_request request_id=%s provider=%s prompt_chars=%s",
        request_id,
        provider_name,
        prompt_chars,
    )

    start = time.perf_counter()
    try:
        with record_timing("chat.latency", provider=provider_name):
            reply = await provider.generate(messages)
        increment("chat.success", provider=provider_name)
    except ConfigurationError as exc:
        increment("chat.error", provider=provider_name, reason="configuration")
        logger.error("configuration-error provider=%s detail=%s", provider_name, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except UpstreamError as exc:
        increment("chat.error", provider=provider_name, reason="upstream")
        logger.warning(
            "upstream-error provider=%s error=%s", provider_name, exc
        )
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except asyncio.TimeoutError as exc:
        increment("chat.error", provider=provider_name, reason="timeout")
        logger.warning("timeout provider=%s", provider_name)
        raise HTTPException(status_code=502, detail="Upstream timeout") from exc
    except Exception as exc:  # pragma: no cover
        increment("chat.error", provider=provider_name, reason="unexpected")
        logger.exception("unexpected-error provider=%s", provider_name)
        raise HTTPException(status_code=500, detail="internal server error") from exc
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        usage = getattr(provider, "last_usage", None) or {}
        total_tokens = usage.get("total_tokens")
        logger.info(
            "chat_completed request_id=%s provider=%s duration_ms=%.2f tokens=%s",
            request_id,
            provider_name,
            duration_ms,
            total_tokens,
        )

    return ChatResponse(reply=reply, provider=provider_name, request_id=request_id)


@app.get("/api/fs/read", response_model=FileReadResponse)
async def fs_read(path: str) -> FileReadResponse:
    file_path = _resolve_fs_path(path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    try:
        content = file_path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=415, detail="file is not UTF-8 text") from exc

    relative_path = str(file_path.relative_to(REPO_ROOT))
    return FileReadResponse(path=relative_path, content=content)


@app.post("/api/fs/write", response_model=FileWriteResponse)
async def fs_write(payload: FileWriteRequest) -> FileWriteResponse:
    file_path = _resolve_fs_path(payload.path)
    if file_path.is_dir():
        raise HTTPException(status_code=400, detail="path points to a directory")

    file_path.parent.mkdir(parents=True, exist_ok=True)
    bytes_written = file_path.write_text(payload.content, encoding="utf-8")
    relative_path = str(file_path.relative_to(REPO_ROOT))
    logger.info("fs_write path=%s bytes=%s", relative_path, bytes_written)
    return FileWriteResponse(path=relative_path, bytes_written=bytes_written)


@app.get("/api/fs/list", response_model=FileListResponse)
async def fs_list(limit: int = 20) -> FileListResponse:
    items = _collect_recent_files(limit)
    return FileListResponse(items=items)
