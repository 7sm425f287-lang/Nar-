from __future__ import annotations

from typing import Sequence

import httpx

from ..config import Settings
from .base import ConfigurationError, LLMProvider, UpstreamError


class OpenAIProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        super().__init__(timeout_seconds=settings.timeout_seconds)
        self._settings = settings

    async def generate(self, messages: Sequence[dict[str, str]], **opts) -> str:
        if not self._settings.openai_api_key:
            raise ConfigurationError("OPENAI_API_KEY not set")

        payload = {
            "model": self._settings.model_name or "gpt-4o-mini",
            "messages": list(messages),
            "temperature": opts.get("temperature", 0.6),
        }
        headers = {
            "Authorization": f"Bearer {self._settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        if self._settings.openai_org:
            headers["OpenAI-Organization"] = self._settings.openai_org
        if self._settings.openai_project:
            headers["OpenAI-Project"] = self._settings.openai_project

        timeout = httpx.Timeout(
            timeout=self.timeout_seconds,
            connect=self.timeout_seconds,
            read=self.timeout_seconds,
        )

        async with httpx.AsyncClient(timeout=timeout) as client:
            async def _post():
                return await client.post(
                    f"{self._settings.openai_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )

            response = await self._send_with_retry(_post, provider="openai")

        data = response.json()
        self.last_usage = data.get("usage")
        try:
            choice = data["choices"][0]
            message = choice["message"]["content"]
            return str(message).strip()
        except (KeyError, IndexError, TypeError) as exc:
            raise UpstreamError("openai response parsing failed") from exc

