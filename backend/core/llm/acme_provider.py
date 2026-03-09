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
