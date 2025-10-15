from __future__ import annotations

from functools import lru_cache

from ..config import Settings
from .base import ConfigurationError, LLMProvider, UpstreamError, format_messages
from .lmstudio_provider import LMStudioProvider
from .mock_provider import MockProvider
from .openai_provider import OpenAIProvider


__all__ = [
    "ConfigurationError",
    "LLMProvider",
    "UpstreamError",
    "format_messages",
    "get_provider",
]


@lru_cache(maxsize=16)
def get_provider(name: str, settings: Settings) -> LLMProvider:
    key = name.lower()
    if key == "openai":
        return OpenAIProvider(settings)
    if key == "lmstudio":
        return LMStudioProvider(settings)
    if key == "mock":
        return MockProvider()
    raise ConfigurationError(f"Unsupported LLM provider '{name}'")

