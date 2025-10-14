import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from ..schemas import ChatIn, ChatOut
from ..services.lmstudio import chat as lmstudio_chat
from ..services.openai import responses_api

router = APIRouter()
logger = logging.getLogger("niro-chat-app")


def _provider() -> str:
    return os.getenv("NIRO_LLM", "lmstudio").lower()


@router.post("/chat", response_model=ChatOut)
async def chat_endpoint(body: ChatIn, request: Request) -> ChatOut:
    message_length = len(body.message) if body.message else 0
    logger.info(
        "chat_request_received",
        extra={
            "event": "chat_request_received",
            "message_length": message_length,
            "has_system_prompt": bool(body.system),
        },
    )

    if not body.message or not body.message.strip():
        raise HTTPException(400, "empty message")

    client = getattr(request.app.state, "http_client", None)
    if client is None:
        raise HTTPException(500, "http client not initialized")
    provider = _provider()

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(500, "OPENAI_API_KEY missing")

        headers = {"Authorization": f"Bearer {api_key}"}
        org = os.getenv("OPENAI_ORG")
        if org:
            headers["OpenAI-Organization"] = org
        project = os.getenv("OPENAI_PROJECT")
        if project:
            headers["OpenAI-Project"] = project
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

        input_payload: Any = (
            body.message
            if not body.system
            else [
                {"role": "system", "content": body.system},
                {"role": "user", "content": body.message},
            ]
        )

        try:
            data = await responses_api(client, input_payload, model, headers)
        except Exception as exc:
            raise HTTPException(502, f"OpenAI error: {exc}")

        reply = data.get("output_text") or str(data)
        return ChatOut(reply=reply, provider="openai")

    base_url = os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234")
    model = os.getenv("LMSTUDIO_MODEL", "qwen2.5:7b-instruct")

    messages = []
    if body.system:
        messages.append({"role": "system", "content": body.system})
    messages.append({"role": "user", "content": body.message})

    try:
        reply = await lmstudio_chat(client, messages, base_url, model)
    except Exception as exc:
        raise HTTPException(502, f"LM Studio error: {exc}")

    return ChatOut(reply=reply, provider="lmstudio")
