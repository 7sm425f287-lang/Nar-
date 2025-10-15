from __future__ import annotations

from typing import Sequence

from .base import LLMProvider


class MockProvider(LLMProvider):
    async def generate(self, messages: Sequence[dict[str, str]], **opts) -> str:
        user_message = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_message = msg.get("content", "")
                break
        self.last_usage = {"prompt_tokens": len(user_message.split()), "completion_tokens": 3, "total_tokens": len(user_message.split()) + 3}
        return f"(mock reply) {user_message}"

