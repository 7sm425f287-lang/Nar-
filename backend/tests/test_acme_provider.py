from backend.core.llm.acme_provider import AcmeProvider


def test_acme_provider_generate():
    settings = {"api_key": "test"}
    p = AcmeProvider(settings)
    messages = [
        {"role": "system", "content": "Du bist hilfsbereit."},
        {"role": "user", "content": "Hallo"},
    ]
    reply = p.generate(messages)
    assert isinstance(reply, str)
    assert len(reply) > 0
import pytest
from backend.core.llm.acme_provider import AcmeProvider


@pytest.mark.asyncio
async def test_acme_provider_generate():
    settings = {"api_key": "test"}
    p = AcmeProvider(settings)
    messages = [{"role": "system", "content": "Du bist hilfsbereit."},
                {"role": "user", "content": "Hallo"}]
    reply = await p.generate(messages)
    assert isinstance(reply, str)
    assert len(reply) > 0
