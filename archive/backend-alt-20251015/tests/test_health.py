import asyncio

import httpx

from app.main import create_app


async def _health_response():
    app = create_app()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/health")
    return response


def test_health_endpoint_status_and_mode():
    response = asyncio.run(_health_response())
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "mode" in data and isinstance(data["mode"], str)
