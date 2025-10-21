import os

import httpx
import pytest

from app.main import create_app


@pytest.fixture
async def client(monkeypatch):
    monkeypatch.setenv("NIRO_LLM", "lmstudio")

    async def fake_chat(client, messages, base_url, model, timeout=60):
        return "mock-reply"

    monkeypatch.setattr("app.routes.chat.lmstudio_chat", fake_chat)

    app = create_app()
    app.state.http_client = object()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        yield client


@pytest.mark.asyncio
async def test_chat_returns_mocked_reply(client):
    response = await client.post("/chat", json={"message": "ping"})
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "mock-reply"
    assert body["provider"] == "lmstudio"

