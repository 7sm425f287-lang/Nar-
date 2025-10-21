import importlib
import os
from pathlib import Path

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


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_fs_read_ok(client: TestClient) -> None:
    target = _repo_root() / "drafts" / "test-editor-read.md"
    target.write_text("hello editor", encoding="utf-8")
    try:
        response = client.get("/api/fs/read", params={"path": "drafts/test-editor-read.md"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["content"] == "hello editor"
        assert payload["path"] == "drafts/test-editor-read.md"
    finally:
        if target.exists():
            target.unlink()


def test_fs_write_ok(client: TestClient) -> None:
    target = _repo_root() / "drafts" / "test-editor-write.md"
    if target.exists():
        target.unlink()
    try:
        response = client.post(
            "/api/fs/write",
            json={"path": "drafts/test-editor-write.md", "content": "new content"},
        )
        assert response.status_code == 200
        assert target.read_text(encoding="utf-8") == "new content"
        # roundtrip
        read_back = client.get("/api/fs/read", params={"path": "drafts/test-editor-write.md"})
        assert read_back.status_code == 200
        assert read_back.json()["content"] == "new content"
    finally:
        if target.exists():
            target.unlink()
    # TODO: Add high-frequency write scenario once backend enforces rate limits.


def test_fs_write_blocks_memory(client: TestClient) -> None:
    response = client.post(
        "/api/fs/write",
        json={"path": "memory/secret.txt", "content": "nope"},
    )
    assert response.status_code == 403
    assert "not allowed" in response.json()["detail"]


def test_fs_read_rejects_traversal(client: TestClient) -> None:
    response = client.get("/api/fs/read", params={"path": '../backend/app.py'})
    assert response.status_code == 403


def test_fs_list_recent(client: TestClient) -> None:
    target = _repo_root() / "drafts" / "test-editor-list.md"
    target.write_text("list me", encoding="utf-8")
    try:
        response = client.get("/api/fs/list", params={"limit": 5})
        assert response.status_code == 200
        payload = response.json()
        assert "items" in payload
        assert any(item["path"] == "drafts/test-editor-list.md" for item in payload["items"])
        for item in payload["items"]:
            assert "updated_at" in item and "size" in item
    finally:
        if target.exists():
            target.unlink()
