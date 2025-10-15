from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional


@dataclass
class Provider:
    """Simple provider interface for LLM adapters.

    call: async callable (message, settings) -> str
    """

    name: str
    call: Callable[[str, Any], Awaitable[str]]


class Registry:
    def __init__(self) -> None:
        self._providers: Dict[str, Provider] = {}

    def register(self, provider: Provider) -> None:
        self._providers[provider.name] = provider

    def get(self, name: str) -> Optional[Provider]:
        return self._providers.get(name)


# Note: adapters for different provider method names (generate vs call)
# can be provided by wrapping callables with small async wrappers where used.


registry = Registry()

