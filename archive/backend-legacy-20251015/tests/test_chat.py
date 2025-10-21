import pytest
from fastapi.testclient import TestClient
from backend.app import app


def test_chat_empty_message():
    client = TestClient(app)
    r = client.post('/chat', json={"message": ""})
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_chat_success(monkeypatch):
    # Monkeypatch httpx.AsyncClient.post to return a fake response
    class FakeResponse:
        def __init__(self, json_data, status_code=200):
            self._json = json_data
            self.status_code = status_code

        def raise_for_status(self):
            if not (200 <= self.status_code < 300):
                raise Exception('status')

        def json(self):
            return self._json

    async def fake_post(self, url, json=None, headers=None):
        return FakeResponse({"choices":[{"message":{"content":"Hello from mock"}}]})

    monkeypatch.setattr('httpx.AsyncClient.post', fake_post)

    client = TestClient(app)
    r = client.post('/chat', json={"message": "hello"})
    assert r.status_code == 200
    j = r.json()
    assert 'reply' in j and 'Hello from mock' in j['reply']
