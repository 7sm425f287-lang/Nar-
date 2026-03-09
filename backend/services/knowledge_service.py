"""Read-only knowledge retrieval service for memory-backed source documents."""

from __future__ import annotations

import re
import threading
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

ROOT = Path(__file__).resolve().parents[2]
MEMORY_ROOT = (ROOT / "memory").resolve()
SOURCE_ROOT_CANDIDATES = (
    (MEMORY_ROOT / "source_docs").resolve(),
    (MEMORY_ROOT / "Erkenntnisse" / "docs").resolve(),
)
ALLOWED_SUFFIXES = {".txt", ".md", ".pdf"}
CHUNK_SIZE = 1200
CHUNK_OVERLAP = 240
MAX_TEXT_CHARS = 250_000
WORD_RE = re.compile(r"[A-Za-z0-9ϕφλΛ][A-Za-z0-9ϕφλΛ_-]{2,}")
FREQUENCY_RE = re.compile(r"\b\d+(?:\s*[-/]\s*\d+)+\b|[ϕφλΛ]")
SPACE_RE = re.compile(r"\s+")
STOPWORDS = {
    "aber",
    "auch",
    "aus",
    "bei",
    "dass",
    "dein",
    "deine",
    "dem",
    "den",
    "der",
    "des",
    "die",
    "dieser",
    "dieses",
    "doch",
    "eine",
    "einer",
    "einem",
    "einen",
    "eines",
    "einfach",
    "für",
    "hat",
    "hier",
    "ich",
    "ihre",
    "ihren",
    "ihm",
    "ihn",
    "im",
    "in",
    "ist",
    "kein",
    "keine",
    "mehr",
    "mit",
    "nach",
    "nicht",
    "noch",
    "nur",
    "oder",
    "sein",
    "seine",
    "sich",
    "sie",
    "sind",
    "und",
    "vom",
    "von",
    "vor",
    "wie",
    "wir",
    "wird",
    "zu",
    "zum",
    "zur",
}

try:  # Optional PDF fallback; most memory docs already ship with sidecar txt files.
    from pypdf import PdfReader  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    PdfReader = None


def _normalize_text(value: str) -> str:
    return SPACE_RE.sub(" ", value.strip())


def _tokenize(value: str) -> list[str]:
    return [token.lower() for token in WORD_RE.findall(value)]


def _extract_title(text: str, path: Path) -> str:
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            return _normalize_text(line.lstrip("#"))
        if len(line) <= 100:
            return _normalize_text(line)
        break
    return path.stem.replace("-", " ").replace("_", " ").strip() or "Untitled"


def _extract_highlights(text: str, limit: int = 3) -> tuple[str, ...]:
    highlights: list[str] = []
    seen: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            candidate = _normalize_text(line.lstrip("#"))
        elif line.startswith(("-", "*", "+")):
            candidate = _normalize_text(line[1:])
        elif len(line) <= 180:
            candidate = _normalize_text(line)
        else:
            continue
        if len(candidate) < 10:
            continue
        key = candidate.lower()
        if key in seen:
            continue
        seen.add(key)
        highlights.append(candidate)
        if len(highlights) >= limit:
            break
    return tuple(highlights)


def _extract_keywords(text: str, limit: int = 6) -> tuple[str, ...]:
    counter: Counter[str] = Counter()
    for token in _tokenize(text):
        if len(token) < 3 or token in STOPWORDS:
            continue
        counter[token] += 1
    return tuple(word for word, _ in counter.most_common(limit))


def _extract_frequencies(text: str, limit: int = 5) -> tuple[str, ...]:
    values: list[str] = []
    seen: set[str] = set()
    for match in FREQUENCY_RE.finditer(text):
        token = _normalize_text(match.group(0))
        if not token:
            continue
        key = token.lower()
        if key in seen:
            continue
        seen.add(key)
        values.append(token)
        if len(values) >= limit:
            break
    return tuple(values)


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    compact = text.replace("\r", "")
    if len(compact) <= chunk_size:
        return [compact]

    step = max(1, chunk_size - overlap)
    chunks: list[str] = []
    for start in range(0, len(compact), step):
        chunk = compact[start : start + chunk_size].strip()
        if chunk:
            chunks.append(chunk)
        if start + chunk_size >= len(compact):
            break
    return chunks


def _dedupe_strings(values: Iterable[str], limit: int) -> tuple[str, ...]:
    items: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = _normalize_text(value)
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        items.append(normalized)
        if len(items) >= limit:
            break
    return tuple(items)


@dataclass(frozen=True)
class KnowledgeHit:
    source_path: str
    title: str
    score: float
    snippet: str
    keywords: tuple[str, ...]
    quotes: tuple[str, ...]
    principles: tuple[str, ...]
    frequencies: tuple[str, ...]


@dataclass(frozen=True)
class KnowledgeContext:
    query: str
    hits: tuple[KnowledgeHit, ...]
    themes: tuple[str, ...]
    principles: tuple[str, ...]
    frequencies: tuple[str, ...]

    @classmethod
    def empty(cls, query: str) -> "KnowledgeContext":
        return cls(query=query, hits=(), themes=(), principles=(), frequencies=())


@dataclass(frozen=True)
class _IndexedChunk:
    source_path: str
    title: str
    chunk_text: str
    chunk_index: int
    title_tokens: frozenset[str]
    chunk_tokens: frozenset[str]
    keywords: tuple[str, ...]
    quotes: tuple[str, ...]
    principles: tuple[str, ...]
    frequencies: tuple[str, ...]


class KnowledgeService:
    def __init__(self, source_roots: Optional[Iterable[Path | str]] = None) -> None:
        self._lock = threading.Lock()
        self._source_roots = self._resolve_source_roots(source_roots)
        self._fingerprint: tuple[tuple[str, int, int], ...] = ()
        self._chunks: tuple[_IndexedChunk, ...] = ()

    def source_roots(self) -> tuple[Path, ...]:
        return self._source_roots

    def search(self, query: str, limit: int = 4) -> KnowledgeContext:
        normalized_query = _normalize_text(query)
        if not normalized_query:
            return KnowledgeContext.empty(query="")

        self._ensure_index()
        if not self._chunks:
            return KnowledgeContext.empty(query=normalized_query)

        q_tokens = set(_tokenize(normalized_query))
        if not q_tokens:
            return KnowledgeContext.empty(query=normalized_query)

        by_source: dict[str, tuple[float, _IndexedChunk]] = {}
        for chunk in self._chunks:
            overlap = q_tokens.intersection(chunk.chunk_tokens)
            if not overlap:
                continue

            score = len(overlap) / max(1, len(q_tokens))
            title_overlap = q_tokens.intersection(chunk.title_tokens)
            if title_overlap:
                score += 0.25 * (len(title_overlap) / max(1, len(q_tokens)))

            keyword_overlap = q_tokens.intersection(set(chunk.keywords))
            if keyword_overlap:
                score += 0.15 * (len(keyword_overlap) / max(1, len(chunk.keywords)))

            bonus_terms = {"flow", "dna", "resonanz", "sprache", "frequenz", "kampagne", "label"}
            if bonus_terms.intersection(chunk.chunk_tokens):
                score += 0.05

            current = by_source.get(chunk.source_path)
            if current is None or score > current[0]:
                by_source[chunk.source_path] = (score, chunk)

        if not by_source:
            return KnowledgeContext.empty(query=normalized_query)

        top_hits = sorted(by_source.values(), key=lambda item: item[0], reverse=True)[: max(1, min(limit, 8))]
        hits = tuple(
            KnowledgeHit(
                source_path=chunk.source_path,
                title=chunk.title,
                score=round(score, 4),
                snippet=_normalize_text(chunk.chunk_text[:320]),
                keywords=chunk.keywords[:5],
                quotes=chunk.quotes[:2],
                principles=chunk.principles[:3],
                frequencies=chunk.frequencies[:4],
            )
            for score, chunk in top_hits
        )

        themes = _dedupe_strings(
            (
                keyword
                for hit in hits
                for keyword in hit.keywords
            ),
            8,
        )
        principles = _dedupe_strings(
            (
                value
                for hit in hits
                for value in (*hit.principles, *hit.quotes)
            ),
            8,
        )
        frequencies = _dedupe_strings(
            (
                value
                for hit in hits
                for value in hit.frequencies
            ),
            6,
        )

        return KnowledgeContext(
            query=normalized_query,
            hits=hits,
            themes=themes,
            principles=principles,
            frequencies=frequencies,
        )

    def _ensure_index(self) -> None:
        with self._lock:
            fingerprint = self._build_fingerprint()
            if fingerprint == self._fingerprint and self._chunks:
                return
            self._chunks = self._build_index()
            self._fingerprint = fingerprint

    def _resolve_source_roots(self, source_roots: Optional[Iterable[Path | str]]) -> tuple[Path, ...]:
        raw_roots = tuple(source_roots) if source_roots is not None else SOURCE_ROOT_CANDIDATES
        resolved: list[Path] = []
        seen: set[Path] = set()
        for raw_root in raw_roots:
            candidate = Path(raw_root).resolve()
            try:
                candidate.relative_to(MEMORY_ROOT)
            except ValueError:
                continue
            if not candidate.exists() or not candidate.is_dir():
                continue
            if candidate in seen:
                continue
            seen.add(candidate)
            resolved.append(candidate)
        return tuple(resolved)

    def _build_fingerprint(self) -> tuple[tuple[str, int, int], ...]:
        items: list[tuple[str, int, int]] = []
        for path in self._discover_documents():
            try:
                stat = path.stat()
            except OSError:
                continue
            items.append((str(path), stat.st_mtime_ns, stat.st_size))
        return tuple(sorted(items))

    def _discover_documents(self) -> list[Path]:
        docs: list[Path] = []
        seen: set[Path] = set()
        for root in self._source_roots:
            for path in sorted(root.rglob("*")):
                if not path.is_file() or path.name.startswith("."):
                    continue
                if path.suffix.lower() not in ALLOWED_SUFFIXES:
                    continue
                if path.suffix.lower() == ".pdf" and path.with_suffix(".txt").exists():
                    continue
                resolved = path.resolve()
                try:
                    resolved.relative_to(MEMORY_ROOT)
                except ValueError:
                    continue
                if resolved in seen:
                    continue
                seen.add(resolved)
                docs.append(resolved)
        return docs

    def _build_index(self) -> tuple[_IndexedChunk, ...]:
        chunks: list[_IndexedChunk] = []
        for doc_path in self._discover_documents():
            text = self._load_document_text(doc_path)
            if not text:
                continue

            try:
                relative_path = str(doc_path.relative_to(ROOT))
            except ValueError:
                continue

            title = _extract_title(text, doc_path)
            title_tokens = frozenset(_tokenize(title))
            for index, chunk in enumerate(_chunk_text(text)):
                normalized_chunk = chunk.strip()
                if not normalized_chunk:
                    continue
                chunk_tokens = frozenset(_tokenize(normalized_chunk))
                if not chunk_tokens:
                    continue
                chunks.append(
                    _IndexedChunk(
                        source_path=relative_path,
                        title=title,
                        chunk_text=normalized_chunk,
                        chunk_index=index,
                        title_tokens=title_tokens,
                        chunk_tokens=chunk_tokens,
                        keywords=_extract_keywords(normalized_chunk),
                        quotes=_extract_highlights(normalized_chunk, limit=2),
                        principles=_extract_highlights(normalized_chunk, limit=3),
                        frequencies=_extract_frequencies(normalized_chunk),
                    )
                )
        return tuple(chunks)

    def _load_document_text(self, doc_path: Path) -> str:
        suffix = doc_path.suffix.lower()
        if suffix in {".txt", ".md"}:
            try:
                return doc_path.read_text(encoding="utf-8", errors="ignore")[:MAX_TEXT_CHARS]
            except OSError:
                return ""

        if suffix == ".pdf":
            sidecar = doc_path.with_suffix(".txt")
            if sidecar.exists():
                try:
                    return sidecar.read_text(encoding="utf-8", errors="ignore")[:MAX_TEXT_CHARS]
                except OSError:
                    return ""

            if PdfReader is None:
                return ""

            try:  # pragma: no cover - depends on optional package and external PDFs
                reader = PdfReader(str(doc_path))
                text = "\n".join(page.extract_text() or "" for page in reader.pages)
                return text[:MAX_TEXT_CHARS]
            except Exception:
                return ""

        return ""


KNOWLEDGE_SERVICE = KnowledgeService()
