"""Resonance probe generation for manifestation modules.

ResonanceSonar is the first autonomous content-probe layer for ϕ-PULSAR. It
turns public-signal cadences from ϕ-KINETIK into A/B-ready shortform hooks,
captions, and test variants without relying on platform APIs.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from .kinetik import TrackSignal


@dataclass(frozen=True)
class ProbeVariant:
    variant_id: str
    platform: str
    hook: str
    caption: str
    call_to_action: str
    pattern_basis: tuple[str, ...]
    source_title: str
    source_artist: str


class ResonanceSonar:
    """Generate micro-content probes grounded in collected public signals."""

    def __init__(self, *, variants_per_signal: int = 2) -> None:
        self.variants_per_signal = max(1, variants_per_signal)

    async def generate_probe_set(
        self,
        *,
        campaign_name: str,
        signals: Sequence[TrackSignal],
        target_platforms: Sequence[str] = ("instagram", "tiktok", "youtube-shorts"),
    ) -> list[ProbeVariant]:
        """Create a compact A/B probe set for social-media testing."""

        variants: list[ProbeVariant] = []
        normalized_campaign = campaign_name.strip() or "kunzt.freiheit"
        for signal in signals:
            for platform in target_platforms:
                variants.extend(self._build_variants_for_signal(normalized_campaign, signal, platform))
        return variants

    async def generate_scripts_from_batch(
        self,
        *,
        campaign_name: str,
        chroma_like_metadatas: Iterable[dict[str, object]],
        target_platforms: Sequence[str] = ("instagram", "tiktok", "youtube-shorts"),
    ) -> list[ProbeVariant]:
        """Rehydrate Chroma-like metadata and emit ready-to-test micro scripts."""

        signals = [self._signal_from_metadata(metadata) for metadata in chroma_like_metadatas]
        return await self.generate_probe_set(
            campaign_name=campaign_name,
            signals=signals,
            target_platforms=target_platforms,
        )

    def _build_variants_for_signal(
        self,
        campaign_name: str,
        signal: TrackSignal,
        platform: str,
    ) -> list[ProbeVariant]:
        phrase = self._focus_phrase(signal)
        cadence = signal.cadence_tokens[:4] or ("resonance",)
        chart = f"#{signal.chart_position}" if signal.chart_position else "off-grid"
        artist = signal.artist or "Unknown Artist"
        title = signal.title or "Unknown Signal"

        variants: list[ProbeVariant] = []
        for index in range(self.variants_per_signal):
            variant_letter = chr(ord("A") + index)
            hook = (
                f"{campaign_name} // {variant_letter}: {phrase}"
                if index == 0
                else f"{chart} pressure -> {phrase}"
            )
            caption = (
                f"{artist} / {title} becomes a {platform} probe for {campaign_name}. "
                f"Cadence markers: {', '.join(cadence)}."
            )
            cta = self._call_to_action(platform, index)
            variants.append(
                ProbeVariant(
                    variant_id=f"{self._slug(platform)}-{self._slug(title)}-{variant_letter.lower()}",
                    platform=platform,
                    hook=hook[:160],
                    caption=caption[:280],
                    call_to_action=cta,
                    pattern_basis=tuple(cadence),
                    source_title=title,
                    source_artist=artist,
                )
            )
        return variants

    def _signal_from_metadata(self, metadata: dict[str, object]) -> TrackSignal:
        cadence = metadata.get("cadence_tokens") or ()
        if isinstance(cadence, list):
            cadence_tokens = tuple(str(item) for item in cadence)
        elif isinstance(cadence, tuple):
            cadence_tokens = tuple(str(item) for item in cadence)
        else:
            cadence_tokens = ()

        chart_position = metadata.get("chart_position")
        return TrackSignal(
            source_url=str(metadata.get("source_url") or ""),
            platform=str(metadata.get("platform") or "web-public"),
            title=str(metadata.get("title") or "Unknown Signal"),
            artist=str(metadata.get("artist") or ""),
            chart_position=int(chart_position) if isinstance(chart_position, int) else None,
            cadence_tokens=cadence_tokens,
            raw_excerpt=str(metadata.get("raw_excerpt") or ""),
            observed_at=str(metadata.get("observed_at") or ""),
        )

    def _focus_phrase(self, signal: TrackSignal) -> str:
        base = signal.title or signal.artist or "frequency shift"
        tokens = list(signal.cadence_tokens[:3])
        if tokens:
            return f"{base} // {' · '.join(tokens)}"
        return base

    def _call_to_action(self, platform: str, index: int) -> str:
        if platform == "instagram":
            return "Save this pulse and send it to the one mind that will recognize it."
        if platform == "tiktok":
            return (
                "Comment the first word that broke the scroll."
                if index == 0
                else "Stitch the moment where the cadence hit."
            )
        if platform == "youtube-shorts":
            return "Carry the phrase into the next short and follow the arc."
        return "Hold attention for the next resonance pulse."

    def _slug(self, value: str) -> str:
        lowered = value.lower()
        chars = [ch if ch.isalnum() else "-" for ch in lowered]
        slug = "".join(chars).strip("-")
        while "--" in slug:
            slug = slug.replace("--", "-")
        return slug or "signal"


__all__ = ["ProbeVariant", "ResonanceSonar"]
