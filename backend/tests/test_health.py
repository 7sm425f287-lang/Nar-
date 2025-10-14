from fastapi.testclient import TestClient
from app import app


def test_health():
    client = TestClient(app)
    r = client.get('/health')
    assert r.status_code == 200
    j = r.json()
    assert 'ok' in j and j['ok'] is True
