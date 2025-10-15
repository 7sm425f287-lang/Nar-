# Provider Abstraction — Kurzplan

Ziel: Einfache Registry für LLM-Provider, damit Adapter pluggable werden.

Steps:

- `backend/core/llm/` hat bereits `base.py`, `mock_provider.py`, `openai_provider.py`, `lmstudio_provider.py`.
- Ergänze `backend/core/llm/__init__.py` mit Registry (done).
- Erstelle Test `backend/tests/test_providers.py` das Registry nutzt, MockProvider registriert und aufruft.
- Commit: feat(explorer): Provider-Abstraction & Pluggable Chains
