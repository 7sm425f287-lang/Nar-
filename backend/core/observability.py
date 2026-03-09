from __future__ import annotations

import logging
import time
import uuid
from collections import Counter
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator, Optional


logger = logging.getLogger("moerlin.backend.observability")


_request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
metrics: Counter = Counter()


def generate_request_id() -> str:
    return uuid.uuid4().hex


def get_request_id() -> Optional[str]:
    return _request_id_var.get()


@contextmanager
def scoped_request(request_id: str) -> Iterator[None]:
    token = _request_id_var.set(request_id)
    try:
        yield
    finally:
        _request_id_var.reset(token)


@contextmanager
def record_timing(metric: str, **dimensions):
    start = time.perf_counter()
    try:
        yield
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        metrics[f"{metric}.count"] += 1
        key = ".".join([f"{metric}.duration_ms"] + [f"{k}:{v}" for k, v in sorted(dimensions.items())])
        metrics[key] += duration_ms
        logger.debug("timing metric=%s duration_ms=%.2f dims=%s", metric, duration_ms, dimensions)


def increment(metric: str, **dimensions) -> None:
    key = ".".join([metric] + [f"{k}:{v}" for k, v in sorted(dimensions.items())])
    metrics[key] += 1
    logger.debug("metric metric=%s dims=%s", metric, dimensions)
