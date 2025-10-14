from typing import Any

DEFAULT_RESPONSES_URL = "https://api.openai.com/v1/responses"


async def responses_api(
    client: Any,
    input_payload: Any,
    model: str,
    headers: dict[str, str],
    url: str = DEFAULT_RESPONSES_URL,
    timeout: float = 60,
) -> dict[str, Any]:
    import httpx

    if not isinstance(client, httpx.AsyncClient):
        raise TypeError("client must be an instance of httpx.AsyncClient")

    response = await client.post(
        url,
        headers=headers,
        json={"model": model, "input": input_payload},
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()
