"""Heuristic public-signal scanning for manifestation modules.

AlgorithmicShadowScanner is the first autonomous sensing layer for ϕ-KINETIK.
It reads public chart and playlist surfaces, extracts lightweight metadata, and
prepares deterministic Chroma-ready payloads without depending on official
platform APIs.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Iterable, Sequence

import httpx

try:
    from bs4 import BeautifulSoup
except Exception:  # pragma: no cover - optional import guard
    BeautifulSoup = None

try:
    from playwright.async_api import async_playwright
except Exception:  # pragma: no cover - optional import guard
    async_playwright = None


TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’:+&/-]{1,}")
POSITION_RE = re.compile(r"#?\d{1,3}")


@dataclass(frozen=True)
class TrackSignal:
    source_url: str
    platform: str
    title: str
    artist: str
    chart_position: int | None
    cadence_tokens: tuple[str, ...]
    raw_excerpt: str
    observed_at: str


@dataclass(frozen=True)
class ChromaBatch:
    ids: list[str]
    documents: list[str]
    metadatas: list[dict[str, object]]


class AlgorithmicShadowScanner:
    """Collect public chart cadences and package them for vector storage."""

    def __init__(self, *, timeout_seconds: float = 12.0, max_items_per_surface: int = 12) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_items_per_surface = max(1, max_items_per_surface)

    async def collect_public_signals(
        self,
        surfaces: Sequence[str],
        *,
        use_browser: bool = False,
    ) -> list[TrackSignal]:
        """Fetch a list of public surfaces and extract track-level heuristics."""

        signals: list[TrackSignal] = []
        for url in surfaces:
            html = await self._fetch_surface(url, use_browser=use_browser)
            signals.extend(self._parse_surface(url, html))
        return signals

    async def build_chroma_batch(
        self,
        surfaces: Sequence[str],
        *,
        use_browser: bool = False,
    ) -> ChromaBatch:
        """Run the dummy scan workflow end-to-end and emit a Chroma-ready batch."""

        signals = await self.collect_public_signals(surfaces, use_browser=use_browser)
        return self.prepare_chroma_batch(signals)

    def prepare_chroma_batch(self, signals: Iterable[TrackSignal]) -> ChromaBatch:
        """Convert collected signals into deterministic Chroma payload fields."""

        ids: list[str] = []
        documents: list[str] = []
        metadatas: list[dict[str, object]] = []

        for signal in signals:
            ids.append(self._build_signal_id(signal))
            documents.append(self._document_for_signal(signal))
            metadatas.append(asdict(signal))

        return ChromaBatch(ids=ids, documents=documents, metadatas=metadatas)

    async def _fetch_surface(self, url: str, *, use_browser: bool) -> str:
        if use_browser and async_playwright is not None:
            return await self._fetch_with_playwright(url)
        return await self._fetch_with_http(url)

    async def _fetch_with_http(self, url: str) -> str:
        async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
            response = await client.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/123.0 Safari/537.36"
                    )
                },
            )
            response.raise_for_status()
            return response.text

    async def _fetch_with_playwright(self, url: str) -> str:
        assert async_playwright is not None
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=int(self.timeout_seconds * 1000))
                return await page.content()
            finally:
                await page.close()
                await browser.close()

    def _parse_surface(self, url: str, html: str) -> list[TrackSignal]:
        platform = self._infer_platform(url)
        observed_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        excerpts = self._extract_candidate_excerpts(html)

        signals: list[TrackSignal] = []
        for excerpt in excerpts[: self.max_items_per_surface]:
            title, artist = self._split_artist_title(excerpt)
            cadence_tokens = self._extract_cadence_tokens(excerpt)
            chart_position = self._extract_chart_position(excerpt)
            signals.append(
                TrackSignal(
                    source_url=url,
                    platform=platform,
                    title=title,
                    artist=artist,
                    chart_position=chart_position,
                    cadence_tokens=cadence_tokens,
                    raw_excerpt=excerpt[:320],
                    observed_at=observed_at,
                )
            )

        if signals:
            return signals

        fallback_excerpt = self._normalize_text(self._strip_html(html))[:240] or "public signal unavailable"
        return [
            TrackSignal(
                source_url=url,
                platform=platform,
                title="Unknown Signal",
                artist="Unknown Artist",
                chart_position=None,
                cadence_tokens=self._extract_cadence_tokens(fallback_excerpt),
                raw_excerpt=fallback_excerpt,
                observed_at=observed_at,
            )
        ]

    def _extract_candidate_excerpts(self, html: str) -> list[str]:
        if BeautifulSoup is None:
            text = self._normalize_text(self._strip_html(html))
            return [line for line in text.split("  ") if len(line) >= 18]

        soup = BeautifulSoup(html, "html.parser")
        excerpts: list[str] = []
        selectors = ("li", "article", "tr", "div")
        for selector in selectors:
            for node in soup.select(selector):
                text = self._normalize_text(node.get_text(" ", strip=True))
                if len(text) < 18:
                    continue
                if text in excerpts:
                    continue
                excerpts.append(text)
        return excerpts

    def _split_artist_title(self, excerpt: str) -> tuple[str, str]:
        for separator in (" - ", " — ", " | ", " · "):
            if separator in excerpt:
                left, right = excerpt.split(separator, 1)
                left = self._normalize_text(left)
                right = self._normalize_text(right)
                if left and right:
                    return right[:120], left[:120]
        return excerpt[:120], ""

    def _extract_chart_position(self, excerpt: str) -> int | None:
        for match in POSITION_RE.finditer(excerpt):
            raw = match.group(0).lstrip("#")
            try:
                value = int(raw)
            except ValueError:
                continue
            if 1 <= value <= 500:
                return value
        return None

    def _extract_cadence_tokens(self, excerpt: str) -> tuple[str, ...]:
        tokens = [match.group(0).lower() for match in TOKEN_RE.finditer(excerpt)]
        seen: list[str] = []
        for token in tokens:
            if token in seen:
                continue
            seen.append(token)
            if len(seen) >= 8:
                break
        return tuple(seen)

    def _build_signal_id(self, signal: TrackSignal) -> str:
        payload = f"{signal.platform}|{signal.artist}|{signal.title}|{signal.chart_position}|{signal.source_url}"
        digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]
        return f"signal-{digest}"

    def _document_for_signal(self, signal: TrackSignal) -> str:
        cadence = ", ".join(signal.cadence_tokens) or "no cadence markers"
        position = f"chart position {signal.chart_position}" if signal.chart_position else "no clear chart position"
        artist = signal.artist or "unknown artist"
        return (
            f"{signal.platform} signal from {signal.source_url}. "
            f"{artist} — {signal.title}. "
            f"{position}. "
            f"Cadence tokens: {cadence}. "
            f"Excerpt: {signal.raw_excerpt}"
        )

    def _infer_platform(self, url: str) -> str:
        lowered = url.lower()
        if "spotify" in lowered:
            return "spotify-public"
        if "youtube" in lowered or "youtu.be" in lowered:
            return "youtube-public"
        if "tiktok" in lowered:
            return "tiktok-public"
        if "instagram" in lowered:
            return "instagram-public"
        return "web-public"

    def _strip_html(self, html: str) -> str:
        return re.sub(r"<[^>]+>", " ", html)

    def _normalize_text(self, text: str) -> str:
        return re.sub(r"\s+", " ", text).strip()


__all__ = ["AlgorithmicShadowScanner", "ChromaBatch", "TrackSignal"]
