import importlib
import os
from typing import Callable

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("NIRO_ENV", "test")
os.environ.setdefault("NIRO_LLM", "mock")


def _reload_app():
    from backend.core import config

    config.get_settings.cache_clear()
    module = importlib.import_module("backend.app")
    return importlib.reload(module)


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    os.environ["NIRO_ENV"] = "test"
    os.environ["NIRO_LLM"] = "mock"
    app_module = _reload_app()
    return TestClient(app_module.app)


def test_health_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["provider"] in {"mock", "lmstudio", "openai"}


def test_chat_empty_400(client: TestClient) -> None:
    response = client.post("/chat", json={"message": "   "})
    assert response.status_code == 400
    assert response.json()["detail"] == "message must not be empty"


def test_chat_mock_ok(client: TestClient) -> None:
    response = client.post("/chat", json={"message": "Hello world"})
    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "mock"
    assert data["reply"].startswith("(mock reply)")
    assert data["request_id"]


def test_chat_upstream_502(monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.core.llm import UpstreamError

    os.environ["NIRO_ENV"] = "test"
    os.environ["NIRO_LLM"] = "mock"
    app_module = _reload_app()

    class BoomProvider:
        last_usage = None

        async def generate(self, messages, **_kwargs):
            raise UpstreamError("failing upstream")

    def fake_provider(name: str, settings):
        return BoomProvider()

    monkeypatch.setattr(app_module, "get_provider", fake_provider, raising=False)
    client = TestClient(app_module.app)
    response = client.post("/chat", json={"message": "Hello!"})
    assert response.status_code == 502
    assert "failing upstream" in response.json()["detail"]
