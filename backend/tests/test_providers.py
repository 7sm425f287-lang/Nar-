import asyncio

import pytest

from backend.core.llm import registry, Provider


@pytest.mark.asyncio
async def test_register_and_call_mock():
    from backend.core.llm.mock_provider import MockProvider

    provider = MockProvider()

    async def wrapper(messages, settings=None):
        # MockProvider exposes generate(messages, **opts)
        return await provider.generate(messages)

    p_obj = Provider(name="mock", call=wrapper)
    registry.register(p_obj)

    p = registry.get("mock")
    assert p is not None
    reply = await p.call([{"role": "user", "content": "Hello"}], None)
    assert "Hello" in reply
