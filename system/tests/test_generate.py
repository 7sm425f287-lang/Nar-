import datetime as dt
from pathlib import Path

import pytest

from system.research import generate


class FixedDate(dt.date):
    @classmethod
    def today(cls):
        return cls(2025, 10, 15)


def write_yaml(path: Path):
    path.write_text(
        """
topic: Test Analyse
scope: wissenschaft
time_focus: aktuell
must_include:
  - alpha
must_exclude: []
title: Test Analyse Kopfzeile
queries:
  - frage eins
  - frage zwei
""".strip(),
        encoding="utf-8",
    )


def test_generate_creates_file_with_sections(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(generate.dt, "date", FixedDate)
    input_yaml = tmp_path / "assignment.yaml"
    write_yaml(input_yaml)
    output_dir = tmp_path / "out"

    report_path = generate.generate_report(input_yaml, output_dir)

    assert report_path.exists()
    assert report_path.name == "test-analyse-kopfzeile-20251015.md"

    content = report_path.read_text(encoding="utf-8")
    assert "## Zusammenfassung" in content
    assert "## Stichpunkt-Muster" in content
    assert "## Details" in content
    assert "## Quellen" in content
    assert "created_at: \"2025-10-15\"" in content
