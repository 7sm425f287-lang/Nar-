from pathlib import Path

import backend.services.knowledge_service as knowledge_module
from backend.services.knowledge_service import KnowledgeContext, KnowledgeHit, KnowledgeService
from backend.services.planner_worker import SourceNote, _build_posts


def test_knowledge_service_search_reads_authorized_docs(monkeypatch, tmp_path: Path) -> None:
    memory_root = tmp_path / "memory"
    source_docs = memory_root / "source_docs"
    source_docs.mkdir(parents=True)
    (source_docs / "flow-dna.txt").write_text(
        "# Sprach- & Flow-DNA\n"
        "3-6-9 Resonanz bleibt das rhythmische Prinzip.\n"
        "Die Hook muss Druck, Klarheit und Wiedererkennung tragen.\n",
        encoding="utf-8",
    )
    (source_docs / "seelenstruktur.txt").write_text(
        "# Seelenstruktur\n"
        "Frequenz und Bildsprache muessen dieselbe innere Richtung halten.\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(knowledge_module, "ROOT", tmp_path)
    monkeypatch.setattr(knowledge_module, "MEMORY_ROOT", memory_root)

    service = KnowledgeService(source_roots=[source_docs])
    context = service.search("kunzt flow dna 3-6-9 kampagne", limit=3)

    assert context.hits
    assert context.hits[0].title == "Sprach- & Flow-DNA"
    assert any("3-6-9" in value for value in context.frequencies)
    assert "resonanz" in context.themes


def test_build_posts_injects_knowledge_context() -> None:
    note = SourceNote(
        path="drafts/social/raw-note.md",
        title="Release-Orbit",
        highlights=("Der Hook soll sofort greifen.",),
        keywords=("release", "hook", "druck"),
        excerpt="Der Hook soll sofort greifen.",
    )
    context = KnowledgeContext(
        query="release orbit klar druckvoll",
        hits=(
            KnowledgeHit(
                source_path="memory/source_docs/flow-dna.txt",
                title="Sprach- & Flow-DNA",
                score=0.92,
                snippet="3-6-9 Resonanz bleibt das rhythmische Prinzip.",
                keywords=("resonanz", "rhythmus", "klarheit"),
                quotes=("3-6-9 Resonanz bleibt das rhythmische Prinzip.",),
                principles=("Die Hook muss Druck, Klarheit und Wiedererkennung tragen.",),
                frequencies=("3-6-9", "ϕ"),
            ),
        ),
        themes=("resonanz", "klarheit"),
        principles=("Die Hook muss Druck, Klarheit und Wiedererkennung tragen.",),
        frequencies=("3-6-9",),
    )

    posts = _build_posts(
        notes=[note],
        platforms=("instagram",),
        campaign_name="Release-Orbit",
        tone="klar, druckvoll, warm",
        max_posts=1,
        knowledge_context=context,
    )

    assert len(posts) == 1
    post = posts[0]
    assert "3-6-9 Resonanz" in post.hook
    assert "Sprach- & Flow-DNA" in post.caption
    assert "3-6-9" in post.caption
    assert "memory/source_docs/flow-dna.txt" in post.source_refs
