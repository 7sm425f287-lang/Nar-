from __future__ import annotations

import asyncio
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

import httpx


RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class ProviderError(Exception):
    """Base class for provider-related errors."""


class ConfigurationError(ProviderError):
    """Raised when required configuration is missing."""


class UpstreamError(ProviderError):
    """Raised when an upstream provider responds with an error."""


@dataclass
class RetryConfig:
    attempts: int = 2
    backoff_seconds: float = 0.75
    max_backoff_seconds: float = 4.0
    jitter_range: tuple[float, float] = field(default_factory=lambda: (0.1, 0.4))


class LLMProvider(ABC):
    """Interface for pluggable language model providers."""

    def __init__(self, retry: RetryConfig | None = None, timeout_seconds: float = 10.0) -> None:
        self.retry = retry or RetryConfig()
        self.timeout_seconds = timeout_seconds
        self.last_usage: dict[str, Any] | None = None

    @abstractmethod
    async def generate(self, messages: Sequence[dict[str, str]], **opts: Any) -> str:
        """Generate a completion from the provided messages."""

    async def _send_with_retry(self, func, *, provider: str) -> httpx.Response:
        attempt = 0
        delay = self.retry.backoff_seconds
        while True:
            try:
                response: httpx.Response = await func()
            except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.RemoteProtocolError) as exc:
                if attempt >= self.retry.attempts:
                    raise UpstreamError(f"{provider} timeout") from exc
                await self._sleep_with_jitter(delay)
                attempt += 1
                delay = min(delay * 2, self.retry.max_backoff_seconds)
                continue

            if response.status_code in RETRYABLE_STATUS and attempt < self.retry.attempts:
                await self._sleep_with_jitter(delay)
                attempt += 1
                delay = min(delay * 2, self.retry.max_backoff_seconds)
                continue

            if response.status_code >= 400:
                raise UpstreamError(f"{provider} error {response.status_code}: {response.text[:200]}")

            return response

    async def _sleep_with_jitter(self, delay: float) -> None:
        low, high = self.retry.jitter_range
        jitter = random.uniform(low, high)
        await asyncio.sleep(delay + jitter)


def format_messages(message: str, system_prompt: str | None = None) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": message})
    return messages

