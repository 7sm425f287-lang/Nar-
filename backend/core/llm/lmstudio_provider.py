from __future__ import annotations

from typing import Sequence

import httpx

from ..config import Settings
from .base import ConfigurationError, LLMProvider, UpstreamError


class LMStudioProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        super().__init__(timeout_seconds=settings.timeout_seconds)
        self._settings = settings

    async def generate(self, messages: Sequence[dict[str, str]], **opts) -> str:
        base_url = self._settings.lmstudio_base_url
        if not base_url:
            raise ConfigurationError("LMSTUDIO_BASE_URL not set")

        payload = {
            "model": self._settings.model_name or self._settings.llm,
            "messages": list(messages),
            "temperature": opts.get("temperature", 0.6),
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{base_url}/v1/chat/completions",
                json=payload,
            )

        if response.status_code >= 500:
            raise UpstreamError(f"lmstudio server error {response.status_code}")
        if response.status_code >= 400:
            raise UpstreamError(f"lmstudio error {response.status_code}")

        data = response.json()
        self.last_usage = data.get("usage")
        try:
            choice = data["choices"][0]
            message = choice["message"]["content"]
            return str(message).strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise UpstreamError("lmstudio response parsing failed") from exc
