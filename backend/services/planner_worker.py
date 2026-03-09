"""Isolated worker for social-media planning drafts."""

from __future__ import annotations

import json
import os
import queue
import re
import threading
import time
import uuid
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

from .knowledge_service import KNOWLEDGE_SERVICE, KnowledgeContext, KnowledgeHit

ROOT = Path(__file__).resolve().parents[2]
MEMORY_DIR = (ROOT / "memory").resolve()
LOG_DIR = ROOT / "logs" / "jobs" / "planner"
LOG_DIR.mkdir(parents=True, exist_ok=True)

SAFE_ENV_KEYS = {"PATH", "PYTHONPATH", "VIRTUAL_ENV", "DEV_MODE"}
ALLOWED_SOURCE_SUFFIXES = {".md", ".txt", ".yaml", ".yml", ".json"}
TERMINAL_STATES = {"ok", "fail", "timeout", "killed"}
DEFAULT_TIMEOUT = 60
MAX_TIMEOUT = 300
MAX_SOURCES = 12
MAX_POSTS = 6
MAX_TEXT_CHARS = 16000
PLATFORM_ORDER = ("instagram", "tiktok", "youtube-shorts")
PLATFORM_LABELS = {
    "instagram": "Instagram Reel",
    "tiktok": "TikTok Clip",
    "youtube-shorts": "YouTube Short",
}
WORD_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{2,}")
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
    "einer",
    "eines",
    "einfach",
    "für",
    "hat",
    "hier",
    "ich",
    "ihre",
    "ihren",
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


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _normalize_text(value: str) -> str:
    return SPACE_RE.sub(" ", value.strip())


def _slugify(value: str) -> str:
    lowered = value.lower()
    safe = re.sub(r"[^a-z0-9]+", "-", lowered)
    slug = safe.strip("-")
    return slug or "social-plan"


def _load_fs_whitelist() -> list[Path]:
    raw = os.getenv("EDITOR_FS_WHITELIST", "")
    tokens = [token.strip() for token in raw.split(":") if token.strip()]
    if not tokens:
        tokens = ["drafts"]

    whitelist: list[Path] = []
    for token in tokens:
        candidate = Path(token)
        if not candidate.is_absolute():
            candidate = (ROOT / candidate).resolve()
        else:
            candidate = candidate.resolve()

        try:
            candidate.relative_to(ROOT)
        except ValueError:
            continue

        if candidate == MEMORY_DIR or MEMORY_DIR in candidate.parents:
            continue
        if candidate in whitelist:
            continue
        whitelist.append(candidate)

    if not whitelist:
        whitelist = [(ROOT / "drafts").resolve()]
    return whitelist


FS_WHITELIST = _load_fs_whitelist()


def _is_whitelisted(path: Path) -> bool:
    return any(root == path or root in path.parents for root in FS_WHITELIST)


def _resolve_repo_path(raw_path: str) -> Path:
    if not raw_path or not raw_path.strip():
        raise ValueError("path is required")

    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = (ROOT / candidate).resolve()
    else:
        candidate = candidate.resolve()

    try:
        relative = candidate.relative_to(ROOT)
    except ValueError as exc:
        raise ValueError("path outside workspace") from exc

    if not relative.parts:
        raise ValueError("path points to repository root")
    if relative.parts[0] == "memory":
        raise ValueError("path not allowed")
    if not _is_whitelisted(candidate):
        raise ValueError("path not whitelisted")

    return candidate


def _resolve_output_dir(raw_path: Optional[str]) -> Path:
    if raw_path:
        candidate = _resolve_repo_path(raw_path)
        if candidate.exists() and not candidate.is_dir():
            raise ValueError("output_dir must be a directory path")
        return candidate

    preferred = (ROOT / "drafts" / "social").resolve()
    if _is_whitelisted(preferred) and preferred != MEMORY_DIR and MEMORY_DIR not in preferred.parents:
        return preferred

    for root in FS_WHITELIST:
        candidate = (root / "social").resolve()
        if candidate != MEMORY_DIR and MEMORY_DIR not in candidate.parents and _is_whitelisted(candidate):
            return candidate

    raise ValueError("no writable planner output directory inside whitelist")


def _canonical_sources(raw_sources: Iterable[str]) -> tuple[str, ...]:
    items: list[str] = []
    seen: set[str] = set()
    for raw in raw_sources:
        resolved = _resolve_repo_path(raw)
        if not resolved.exists() or not resolved.is_file():
            raise ValueError(f"source not found: {raw}")
        if resolved.suffix.lower() not in ALLOWED_SOURCE_SUFFIXES:
            raise ValueError(f"source type not supported: {raw}")
        relative = str(resolved.relative_to(ROOT))
        if relative in seen:
            continue
        seen.add(relative)
        items.append(relative)
        if len(items) >= MAX_SOURCES:
            break
    return tuple(items)


def _default_sources(limit: int = MAX_SOURCES) -> tuple[str, ...]:
    candidates: list[tuple[int, float, str]] = []
    for base in FS_WHITELIST:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if MEMORY_DIR in path.parents:
                continue
            if path.suffix.lower() not in ALLOWED_SOURCE_SUFFIXES:
                continue
            try:
                relative = str(path.relative_to(ROOT))
            except ValueError:
                continue
            if relative.startswith("logs/jobs/"):
                continue
            score = 0
            lowered = relative.lower()
            if "/social/" in lowered:
                score += 5
            if "/music/" in lowered:
                score += 4
            if "/research/" in lowered:
                score += 4
            if "/chronik/" in lowered:
                score += 3
            if "note" in lowered or "ideen" in lowered or "idea" in lowered:
                score += 2
            try:
                stat = path.stat()
            except OSError:
                continue
            candidates.append((score, stat.st_mtime, relative))

    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    selected: list[str] = []
    seen: set[str] = set()
    for _, _, relative in candidates:
        if relative in seen:
            continue
        seen.add(relative)
        selected.append(relative)
        if len(selected) >= limit:
            break
    return tuple(selected)


def _sanitize_env() -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if key in SAFE_ENV_KEYS}
    env.setdefault("DEV_MODE", "true")
    env.setdefault("PATH", os.environ.get("PATH", ""))
    env.setdefault("PYTHONPATH", os.environ.get("PYTHONPATH", ""))
    return env


def _safe_read_text(path: Path) -> str:
    content = path.read_text(encoding="utf-8")
    return content[:MAX_TEXT_CHARS]


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


def _extract_highlights(text: str, limit: int = 5) -> tuple[str, ...]:
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
        if len(candidate) < 8:
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
    for match in WORD_RE.finditer(text.lower()):
        token = match.group(0).strip("-_")
        if len(token) < 3 or token in STOPWORDS:
            continue
        counter[token] += 1
    return tuple(word for word, _ in counter.most_common(limit))


@dataclass(frozen=True)
class SourceNote:
    path: str
    title: str
    highlights: tuple[str, ...]
    keywords: tuple[str, ...]
    excerpt: str


def _build_source_note(relative_path: str) -> SourceNote:
    path = (ROOT / relative_path).resolve()
    text = _safe_read_text(path)
    title = _extract_title(text, path)
    highlights = _extract_highlights(text)
    keywords = _extract_keywords(text)

    excerpt = ""
    for raw_line in text.splitlines():
        line = _normalize_text(raw_line)
        if line:
            excerpt = line[:180]
            break

    return SourceNote(
        path=relative_path,
        title=title,
        highlights=highlights,
        keywords=keywords,
        excerpt=excerpt or title,
    )


def _normalize_platforms(platforms: Iterable[str]) -> tuple[str, ...]:
    items: list[str] = []
    seen: set[str] = set()
    raw_items = list(platforms) or list(PLATFORM_ORDER)
    for raw in raw_items:
        value = raw.strip().lower()
        if value not in PLATFORM_LABELS:
            raise ValueError(f"unsupported platform: {raw}")
        if value in seen:
            continue
        seen.add(value)
        items.append(value)
    return tuple(items[:MAX_POSTS])


def clamp_timeout(timeout_sec: Optional[int]) -> int:
    if timeout_sec is None:
        return DEFAULT_TIMEOUT
    return max(1, min(timeout_sec, MAX_TIMEOUT))


@dataclass(frozen=True)
class PlannedPost:
    platform: str
    angle: str
    hook: str
    caption: str
    cta: str
    visual: str
    hashtags: tuple[str, ...]
    source_refs: tuple[str, ...]


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


def _pick_value(values: tuple[str, ...], index: int) -> Optional[str]:
    if not values:
        return None
    return values[index % len(values)]


def _pick_knowledge_hit(context: KnowledgeContext, index: int) -> Optional[KnowledgeHit]:
    if not context.hits:
        return None
    return context.hits[index % len(context.hits)]


def _hashtags_for(
    note: SourceNote,
    knowledge_hit: Optional[KnowledgeHit] = None,
    knowledge_context: Optional[KnowledgeContext] = None,
) -> tuple[str, ...]:
    tags = ["#kunztfreiheit"]
    for keyword in note.keywords[:4]:
        compact = re.sub(r"[^a-z0-9]+", "", keyword.lower())
        if compact:
            tags.append(f"#{compact}")
    if knowledge_hit:
        for keyword in knowledge_hit.keywords[:3]:
            compact = re.sub(r"[^a-z0-9]+", "", keyword.lower())
            if compact:
                tags.append(f"#{compact}")
    if knowledge_context:
        for theme in knowledge_context.themes[:2]:
            compact = re.sub(r"[^a-z0-9]+", "", theme.lower())
            if compact:
                tags.append(f"#{compact}")
    return tuple(dict.fromkeys(tags))[:8]


def _platform_cta(platform: str) -> str:
    if platform == "instagram":
        return "Save the post and share it with one person who should hear it."
    if platform == "tiktok":
        return "Use the comment to name the line that hits first."
    return "Carry the clip into the next short and follow the arc."


def _platform_visual(platform: str, note: SourceNote) -> str:
    if platform == "instagram":
        return f"Close-up performance cut with text overlays from '{note.title}'."
    if platform == "tiktok":
        return f"Fast vertical sequence anchored by the phrase '{note.title}'."
    return f"Compact narrative short with one strong scene from '{note.title}'."


def _build_posts(
    notes: list[SourceNote],
    platforms: tuple[str, ...],
    campaign_name: str,
    tone: str,
    max_posts: int,
    knowledge_context: Optional[KnowledgeContext] = None,
) -> list[PlannedPost]:
    posts: list[PlannedPost] = []
    context = knowledge_context or KnowledgeContext.empty(query="")
    for index in range(max_posts):
        platform = platforms[index % len(platforms)]
        note = notes[index % len(notes)]
        knowledge_hit = _pick_knowledge_hit(context, index)
        guiding_principle = _pick_value(
            knowledge_hit.principles if knowledge_hit and knowledge_hit.principles else context.principles,
            index,
        )
        guiding_quote = _pick_value(
            knowledge_hit.quotes if knowledge_hit and knowledge_hit.quotes else context.principles,
            index,
        )
        guiding_theme = _pick_value(
            knowledge_hit.keywords if knowledge_hit and knowledge_hit.keywords else context.themes,
            index,
        )
        guiding_frequency = _pick_value(
            knowledge_hit.frequencies if knowledge_hit and knowledge_hit.frequencies else context.frequencies,
            index,
        )
        highlight = note.highlights[0] if note.highlights else note.excerpt
        keyword_block = ", ".join(note.keywords[:3]) if note.keywords else "clarity, movement, release"
        hook = f"{note.title}: {highlight[:90]}"
        if guiding_quote:
            hook = f"{guiding_quote[:72]} // {note.title}: {highlight[:64]}"
        angle = f"{campaign_name} translates {note.title} into a {tone} social cut around {keyword_block}."
        if guiding_principle:
            angle += f" Lead with the archive principle '{guiding_principle[:100]}'."
        caption = (
            f"kunzt.freiheit frames '{note.title}' as a {tone} pulse. "
            f"{highlight[:140]} "
        )
        if guiding_theme:
            caption += f"Carry the motif of {guiding_theme}. "
        if knowledge_hit:
            caption += f"Let '{knowledge_hit.title}' shape the emotional contour. "
        if guiding_frequency:
            caption += f"Frequency marker: {guiding_frequency}. "
        caption += "Keep the copy direct, concrete and performance-led."

        visual = _platform_visual(platform, note)
        if knowledge_hit:
            visual += f" Borrow one visual symbol from '{knowledge_hit.title}'."
        if guiding_frequency:
            visual += f" Let {guiding_frequency} set the editing rhythm."

        source_refs = [note.path]
        if knowledge_hit:
            source_refs.append(knowledge_hit.source_path)

        posts.append(
            PlannedPost(
                platform=PLATFORM_LABELS[platform],
                angle=angle,
                hook=hook,
                caption=caption,
                cta=_platform_cta(platform),
                visual=visual,
                hashtags=_hashtags_for(note, knowledge_hit=knowledge_hit, knowledge_context=context),
                source_refs=_dedupe_strings(source_refs, limit=4),
            )
        )
    return posts


def _render_plan(
    *,
    campaign_name: str,
    tone: str,
    notes: list[SourceNote],
    posts: list[PlannedPost],
    env: dict[str, str],
    knowledge_context: Optional[KnowledgeContext] = None,
) -> str:
    context = knowledge_context or KnowledgeContext.empty(query="")
    lines = [
        "---",
        "type: social_plan",
        "label: kunzt.freiheit",
        f"campaign: {campaign_name}",
        f"tone: {tone}",
        f"created_at: {_to_iso(_now())}",
        f"env_keys: {', '.join(sorted(env))}",
        "---",
        "",
        f"# Social Planner Draft - {campaign_name}",
        "",
        "## Planning Intent",
        f"- Label: kunzt.freiheit",
        f"- Tone: {tone}",
        f"- Source count: {len(notes)}",
        f"- Post count: {len(posts)}",
        f"- Knowledge hits: {len(context.hits)}",
        "",
        "## Source Notes",
    ]

    for note in notes:
        lines.append(f"- `{note.path}` - {note.title}")
        if note.highlights:
            lines.append(f"  Highlights: {' | '.join(note.highlights[:3])}")
        if note.keywords:
            lines.append(f"  Keywords: {', '.join(note.keywords[:4])}")

    lines.extend(["", "## Knowledge Research"])
    lines.append(f"- Query: {context.query or 'n/a'}")
    if context.themes:
        lines.append(f"- Themes: {', '.join(context.themes[:6])}")
    if context.principles:
        lines.append(f"- Principles: {' | '.join(context.principles[:4])}")
    if context.frequencies:
        lines.append(f"- Frequencies: {', '.join(context.frequencies[:4])}")
    if context.hits:
        for hit in context.hits:
            lines.append(f"- `{hit.source_path}` ({hit.score:.2f}) - {hit.title}")
            if hit.quotes:
                lines.append(f"  Quotes: {' | '.join(hit.quotes[:2])}")
            if hit.frequencies:
                lines.append(f"  Frequencies: {', '.join(hit.frequencies[:3])}")
    else:
        lines.append("- No relevant memory documents matched the campaign query.")

    lines.extend(["", "## Draft Posts"])
    for idx, post in enumerate(posts, start=1):
        lines.extend(
            [
                "",
                f"### Post {idx}",
                f"- Platform: {post.platform}",
                f"- Angle: {post.angle}",
                f"- Hook: {post.hook}",
                f"- Caption: {post.caption}",
                f"- Visual: {post.visual}",
                f"- CTA: {post.cta}",
                f"- Hashtags: {' '.join(post.hashtags)}",
                f"- Sources: {', '.join(post.source_refs)}",
            ]
        )

    lines.extend(
        [
            "",
            "## Production Notes",
            "- Keep all publishing manual in this stage.",
            "- No platform credentials are stored or used by this worker.",
            "- Move finished drafts through review before atlas promotion.",
            "",
        ]
    )
    return "\n".join(lines)


@dataclass
class PlannerJob:
    job_id: str
    campaign_name: str
    tone: str
    platforms: tuple[str, ...]
    sources: tuple[str, ...]
    output_dir: Path
    max_posts: int
    timeout_sec: int
    dry_run: bool = False
    meta: dict = field(default_factory=dict)
    status: str = "queued"
    exit_code: Optional[int] = None
    created_at: datetime = field(default_factory=_now)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    log_path: Path = field(default_factory=lambda: LOG_DIR / f"planner-{uuid.uuid4().hex}.log")
    output_paths: list[str] = field(default_factory=list)
    _abort: bool = False

    def to_public_dict(self) -> dict:
        return {
            "job_id": self.job_id,
            "campaign_name": self.campaign_name,
            "tone": self.tone,
            "platforms": list(self.platforms),
            "sources": list(self.sources),
            "output_dir": str(self.output_dir.relative_to(ROOT)),
            "output_paths": list(self.output_paths),
            "status": self.status,
            "exit_code": self.exit_code,
            "dry_run": self.dry_run,
            "created_at": _to_iso(self.created_at),
            "started_at": _to_iso(self.started_at),
            "ended_at": _to_iso(self.ended_at),
            "timeout_sec": self.timeout_sec,
            "max_posts": self.max_posts,
        }


class PlannerWorker:
    def __init__(self) -> None:
        self._jobs: dict[str, PlannerJob] = {}
        self._lock = threading.Lock()
        self._queue: "queue.Queue[PlannerJob]" = queue.Queue()
        self._worker = threading.Thread(target=self._run_loop, name="planner-worker", daemon=True)
        self._worker.start()

    def enqueue(
        self,
        *,
        campaign_name: str,
        tone: str,
        platforms: Iterable[str],
        sources: Iterable[str],
        output_dir: Optional[str],
        max_posts: int,
        timeout_sec: int,
        dry_run: bool,
        meta: dict,
    ) -> PlannerJob:
        cleaned_campaign = _normalize_text(campaign_name)
        if not cleaned_campaign:
            raise ValueError("campaign_name is required")

        cleaned_tone = _normalize_text(tone) or "clear, focused, urban"
        normalized_platforms = _normalize_platforms(platforms)
        resolved_output_dir = _resolve_output_dir(output_dir)
        raw_sources = tuple(sources)
        normalized_sources = _canonical_sources(raw_sources) if raw_sources else _default_sources()
        if not normalized_sources:
            raise ValueError("no planner sources available inside whitelist")

        bounded_posts = max(1, min(max_posts, MAX_POSTS))
        job = PlannerJob(
            job_id=uuid.uuid4().hex,
            campaign_name=cleaned_campaign,
            tone=cleaned_tone,
            platforms=normalized_platforms,
            sources=normalized_sources,
            output_dir=resolved_output_dir,
            max_posts=bounded_posts,
            timeout_sec=timeout_sec,
            dry_run=dry_run,
            meta=meta,
        )
        with self._lock:
            self._jobs[job.job_id] = job
        self._queue.put(job)
        return job

    def get(self, job_id: str) -> Optional[PlannerJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_latest(self, limit: int = 20) -> list[PlannerJob]:
        with self._lock:
            jobs = list(self._jobs.values())
        jobs.sort(key=lambda job: job.created_at, reverse=True)
        return jobs[:limit]

    def pending_count(self) -> int:
        return self._queue.qsize()

    def request_abort(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False
            job._abort = True
            return True

    def default_output_dir(self) -> str:
        return str(_resolve_output_dir(None).relative_to(ROOT))

    def _run_loop(self) -> None:
        while True:
            job = self._queue.get()
            try:
                self._execute(job)
            finally:
                self._queue.task_done()

    def _execute(self, job: PlannerJob) -> None:
        job.status = "running"
        job.started_at = _now()
        deadline = time.monotonic() + job.timeout_sec
        env = _sanitize_env()
        job.log_path.parent.mkdir(parents=True, exist_ok=True)

        with job.log_path.open("w", encoding="utf-8") as log_file:
            try:
                self._log(log_file, f"[planner] campaign={job.campaign_name}")
                self._log(log_file, f"[planner] output_dir={job.output_dir.relative_to(ROOT)}")
                self._log(log_file, f"[planner] env_keys={','.join(sorted(env))}")

                notes: list[SourceNote] = []
                for relative_path in job.sources:
                    if self._check_stop(job, deadline, log_file):
                        return
                    note = _build_source_note(relative_path)
                    notes.append(note)
                    self._log(log_file, f"[planner] loaded_source={relative_path}")

                research_query = _normalize_text(
                    f"{job.campaign_name} {job.tone} kunzt.freiheit social planner flow dna resonance"
                )
                research_context = KnowledgeContext.empty(query=research_query)
                try:
                    research_context = KNOWLEDGE_SERVICE.search(research_query, limit=4)
                    self._log(log_file, f"[planner] knowledge_query={research_query}")
                    self._log(log_file, f"[planner] knowledge_hits={len(research_context.hits)}")
                    for hit in research_context.hits:
                        self._log(
                            log_file,
                            f"[planner] knowledge_hit source={hit.source_path} score={hit.score:.3f} title={hit.title}",
                        )
                except Exception as exc:
                    self._log(log_file, f"[planner] knowledge_lookup_failed={exc}")

                posts = _build_posts(
                    notes=notes,
                    platforms=job.platforms,
                    campaign_name=job.campaign_name,
                    tone=job.tone,
                    max_posts=job.max_posts,
                    knowledge_context=research_context,
                )
                document = _render_plan(
                    campaign_name=job.campaign_name,
                    tone=job.tone,
                    notes=notes,
                    posts=posts,
                    env=env,
                    knowledge_context=research_context,
                )

                filename = f"{job.created_at:%Y%m%dT%H%M%SZ}-{_slugify(job.campaign_name)}.md"
                output_path = (job.output_dir / filename).resolve()
                if not _is_whitelisted(output_path) or output_path == MEMORY_DIR or MEMORY_DIR in output_path.parents:
                    raise ValueError("planner output path escaped whitelist")

                self._log(log_file, f"[planner] draft_target={output_path.relative_to(ROOT)}")
                if job.dry_run:
                    self._log(log_file, "[planner] dry_run=true, skipping write")
                    job.output_paths = [str(output_path.relative_to(ROOT))]
                    job.status = "ok"
                    job.exit_code = 0
                    return

                if self._check_stop(job, deadline, log_file):
                    return

                output_path.parent.mkdir(parents=True, exist_ok=True)
                temp_path = output_path.with_suffix(output_path.suffix + ".tmp")
                temp_path.write_text(document, encoding="utf-8")
                temp_path.replace(output_path)
                job.output_paths = [str(output_path.relative_to(ROOT))]
                self._log(log_file, f"[planner] wrote={job.output_paths[0]}")
                job.status = "ok"
                job.exit_code = 0
            except Exception as exc:
                self._log(log_file, f"[planner] failed={exc}")
                job.status = "fail"
                job.exit_code = -1
            finally:
                job.ended_at = _now()
                self._append_metadata(job, env)

    def _check_stop(self, job: PlannerJob, deadline: float, log_file) -> bool:
        if job._abort:
            self._log(log_file, "[planner] abort requested")
            job.status = "killed"
            job.exit_code = -1
            return True
        if time.monotonic() >= deadline:
            self._log(log_file, "[planner] timeout reached")
            job.status = "timeout"
            job.exit_code = -1
            return True
        return False

    def _append_metadata(self, job: PlannerJob, env: dict[str, str]) -> None:
        payload = {
            "job_id": job.job_id,
            "campaign_name": job.campaign_name,
            "tone": job.tone,
            "platforms": list(job.platforms),
            "sources": list(job.sources),
            "output_dir": str(job.output_dir.relative_to(ROOT)),
            "output_paths": list(job.output_paths),
            "status": job.status,
            "exit_code": job.exit_code,
            "dry_run": job.dry_run,
            "created_at": _to_iso(job.created_at),
            "started_at": _to_iso(job.started_at),
            "ended_at": _to_iso(job.ended_at),
            "timeout_sec": job.timeout_sec,
            "max_posts": job.max_posts,
            "env_keys": sorted(env),
            "meta": job.meta,
        }
        metadata_file = LOG_DIR / f"{job.created_at:%Y%m%d}.jsonl"
        metadata_file.parent.mkdir(parents=True, exist_ok=True)
        with metadata_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")

    @staticmethod
    def _log(log_file, line: str) -> None:
        log_file.write(f"{line}\n")
        log_file.flush()


PLANNER = PlannerWorker()
