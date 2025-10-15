from __future__ import annotations

import asyncio
import logging
import time
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    system: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    provider: str
    request_id: str


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
            "chat_completed provider=%s duration_ms=%.2f tokens=%s",
            provider_name,
            duration_ms,
            total_tokens,
        )

    return ChatResponse(reply=reply, provider=provider_name, request_id=request_id)

