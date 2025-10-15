from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Sequence


class ProviderError(Exception):
    """Base class for provider-related errors."""


class ConfigurationError(ProviderError):
    """Raised when required configuration is missing."""


class UpstreamError(ProviderError):
    """Raised when an upstream provider responds with an error."""


class LLMProvider(ABC):
    """Interface for pluggable language model providers."""

    def __init__(self, timeout_seconds: float = 10.0) -> None:
        self.timeout_seconds = timeout_seconds
        self.last_usage: dict[str, Any] | None = None

    @abstractmethod
    async def generate(self, messages: Sequence[dict[str, str]], **opts: Any) -> str:
        """Generate a completion from the provided messages."""


def format_messages(message: str, system_prompt: str | None = None) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": message})
    return messages
