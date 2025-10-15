from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .core.config import get_settings
from .core.llm import ConfigurationError, UpstreamError, format_messages, get_provider


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
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


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.env, "provider": settings.llm}


@app.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message must not be empty")

    provider_name = settings.llm
    provider = get_provider(provider_name, settings)
    messages = format_messages(message, payload.system)

    try:
        reply = await provider.generate(messages)
    except ConfigurationError as exc:
        logger.error("configuration error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except UpstreamError as exc:
        logger.warning("upstream error: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except asyncio.TimeoutError as exc:
        logger.warning("upstream timeout")
        raise HTTPException(status_code=502, detail="Upstream timeout") from exc
    except Exception as exc:  # pragma: no cover
        logger.exception("unexpected backend error")
        raise HTTPException(status_code=500, detail="internal server error") from exc

    return ChatResponse(reply=reply, provider=provider_name)
