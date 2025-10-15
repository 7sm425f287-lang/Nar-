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

        timeout = httpx.Timeout(
            timeout=self.timeout_seconds,
            connect=self.timeout_seconds,
            read=self.timeout_seconds,
        )

        async with httpx.AsyncClient(timeout=timeout) as client:
            async def _post():
                return await client.post(
                    f"{base_url}/v1/chat/completions",
                    json=payload,
                )

            response = await self._send_with_retry(_post, provider="lmstudio")

        data = response.json()
        self.last_usage = data.get("usage")
        try:
            choice = data["choices"][0]
            message = choice["message"]["content"]
            return str(message).strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise UpstreamError("lmstudio response parsing failed") from exc

