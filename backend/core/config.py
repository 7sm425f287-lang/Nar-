from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv
import os


BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILES = (
    BASE_DIR / ".env",
    BASE_DIR / ".env.local",
    BASE_DIR / ".env.cloud",
)


def _load_env_files() -> None:
    for env_path in ENV_FILES:
        if env_path.exists():
            load_dotenv(env_path, override=False)


_load_env_files()


ProviderName = Literal["openai", "lmstudio", "mock"]


@dataclass(frozen=True)
class Settings:
    env: Literal["local", "cloud", "test"]
    llm: ProviderName
    model_name: Optional[str]
    openai_api_key: Optional[str]
    openai_org: Optional[str]
    openai_project: Optional[str]
    openai_base_url: str
    lmstudio_base_url: str
    timeout_seconds: float
    retry_attempts: int
    backoff_seconds: float


def _infer_env() -> Literal["local", "cloud", "test"]:
    value = os.getenv("NIRO_ENV", "local").strip().lower()
    if value in {"local", "cloud", "test"}:
        return value  # explicit override
    return "local"


def _infer_llm(default_env: str) -> ProviderName:
    value = os.getenv("NIRO_LLM", "").strip().lower()
    if value in {"openai", "lmstudio", "mock"}:
        return value
    if default_env == "cloud":
        return "openai"
    if default_env == "test":
        return "mock"
    return "lmstudio"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    env = _infer_env()
    llm = _infer_llm(env)

    model_name = os.getenv("MODEL_NAME")
    openai_api_key = os.getenv("OPENAI_API_KEY")
    openai_org = os.getenv("OPENAI_ORG")
    openai_project = os.getenv("OPENAI_PROJECT")
    openai_base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    lmstudio_base_url = os.getenv("LMSTUDIO_BASE_URL", "http://localhost:1234").rstrip("/")

    timeout_seconds = float(os.getenv("NIRO_TIMEOUT", "10"))
    retry_attempts = int(os.getenv("NIRO_RETRY_ATTEMPTS", "2"))
    backoff_seconds = float(os.getenv("NIRO_RETRY_BACKOFF", "0.75"))

    return Settings(
        env=env,
        llm=llm,
        model_name=model_name,
        openai_api_key=openai_api_key,
        openai_org=openai_org,
        openai_project=openai_project,
        openai_base_url=openai_base_url,
        lmstudio_base_url=lmstudio_base_url,
        timeout_seconds=timeout_seconds,
        retry_attempts=retry_attempts,
        backoff_seconds=backoff_seconds,
    )

