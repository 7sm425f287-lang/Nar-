import pytest

from backend.core.config import get_settings
from backend.core.llm import ConfigurationError, get_provider


@pytest.mark.asyncio
async def test_get_provider_mock():
    settings = get_settings()
    provider = get_provider("mock", settings)
    reply = await provider.generate([{"role": "user", "content": "Hello"}])
    assert "(mock reply)" in reply


def test_get_provider_invalid():
    settings = get_settings()
    with pytest.raises(ConfigurationError):
        get_provider("does-not-exist", settings)
