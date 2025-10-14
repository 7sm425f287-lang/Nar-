import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict[str, bool | str]:
    return {"ok": True, "mode": os.getenv("NIRO_LLM", "lmstudio").lower()}

