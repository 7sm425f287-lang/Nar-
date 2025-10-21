from typing import Any, Sequence

import httpx


async def chat(
    client: httpx.AsyncClient,
    messages: Sequence[dict[str, Any]],
    base_url: str,
    model: str,
    timeout: float = 60,
) -> str:
    response = await client.post(
        f"{base_url}/v1/chat/completions",
        json={
            "model": model,
            "messages": list(messages),
            "temperature": 0.7,
        },
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    return payload["choices"][0]["message"]["content"]

