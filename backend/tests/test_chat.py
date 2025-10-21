from fastapi.testclient import TestClient

from backend.app import app


def test_chat_empty_message():
    client = TestClient(app)
    r = client.post("/chat", json={"message": ""})
    assert r.status_code == 400


def test_chat_success():
    client = TestClient(app)
    r = client.post("/chat", json={"message": "hello"})
    assert r.status_code == 200
    data = r.json()
    assert data["provider"] == "mock"
    assert "(mock reply)" in data["reply"]
    assert data["request_id"]
