try:
    from backend.core.errors import ConfigurationError, UpstreamError
except Exception:
    class ConfigurationError(Exception):
        pass

    class UpstreamError(Exception):
        pass


class AcmeProvider:
    """Minimal example LLM provider used for tests and as a template.

    It follows the project's guidance: raises `ConfigurationError` on
    missing settings and `UpstreamError` on unexpected failures.
    """

    name = "acme"

    def __init__(self, settings: dict):
        if not settings:
            raise ConfigurationError("missing settings for acme provider")
        self.settings = settings

    def generate(self, messages):
        """Return a single summarized reply string for the given messages.

        messages: list[dict] with keys `role` and `content`.
        """
        try:
            prompt = "\n".join(m.get("content", "") for m in messages)
            reply = "Antwort von Acme: " + (prompt[:100] if prompt else "")
            return reply
        except Exception as e:
            raise UpstreamError(str(e))

# EOF
from .base import LLMProvider, ConfigurationError, UpstreamError


class AcmeProvider(LLMProvider):
    name = "acme"

    def __init__(self, settings: dict):
        if not settings:
            raise ConfigurationError("missing settings for acme provider")
        self.settings = settings

    async def generate(self, messages):
        """Erwarte `messages` als Liste von {role, content}.
        Liefere genau eine zusammengefasste Zeichenkette zurück (Single-reply).
        """
        try:
            prompt = "\n".join(m.get("content", "") for m in messages)
            # Einfacher Platzhalter-Reply — ersetzt reale API-Aufrufe
            reply = "AcmeProvider reply: " + (prompt[:400] if prompt else "(leer)")
            # Simuliere last_usage wie andere Provider
            self.last_usage = {"prompt_tokens": len(prompt.split()), "completion_tokens": 3, "total_tokens": len(prompt.split()) + 3}
            return reply
        except Exception as e:
            raise UpstreamError(str(e))
