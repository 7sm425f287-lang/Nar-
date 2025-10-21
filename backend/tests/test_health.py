from fastapi.testclient import TestClient

from backend.app import app


def test_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["provider"] in {"mock", "lmstudio", "openai"}
