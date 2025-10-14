import logging
import time
from typing import Callable

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .logging_json import configure_logging
from .routes import chat, health


def create_app() -> FastAPI:
    configure_logging()
    logger = logging.getLogger("niro-chat-app")

    app = FastAPI(title="niro-chat-app", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next: Callable):
        start = time.perf_counter()
        client_host = request.client.host if request.client else None
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.error(
                "http_request_failed",
                extra={
                    "event": "http_request_failed",
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": 500,
                    "duration_ms": duration_ms,
                    "client_ip": client_host,
                },
            )
            raise
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "http_request_completed",
            extra={
                "event": "http_request_completed",
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "client_ip": client_host,
            },
        )
        return response

    @app.on_event("startup")
    async def startup():
        app.state.http_client = httpx.AsyncClient(timeout=60)

    @app.on_event("shutdown")
    async def shutdown():
        await app.state.http_client.aclose()

    app.include_router(health.router)
    app.include_router(chat.router)
    return app


app = create_app()

