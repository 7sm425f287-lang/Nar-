from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path
from typing import Any, Dict

import yaml
from jinja2 import Environment, FileSystemLoader, select_autoescape


TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"


def slugify(value: str) -> str:
    value = (value or "").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-{2,}", "-", value)
    return value.strip("-") or "report"


def load_payload(path: Path) -> Dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("YAML root must be a mapping")
    for key in ("topic", "scope", "time_focus"):
        if not data.get(key):
            raise ValueError(f"Missing required field '{key}'")
    return data


def render_report(context: Dict[str, Any]) -> str:
    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        autoescape=select_autoescape(disabled_extensions=("md",)),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    template = env.get_template("report.md.j2")
    return template.render(**context)


def generate_report(input_yaml: Path, output_dir: Path) -> Path:
    payload = load_payload(input_yaml)
    created_at = dt.date.today().isoformat()
    title = payload.get("title") or payload["topic"]
    must_include = payload.get("must_include") or []
    must_exclude = payload.get("must_exclude") or []
    queries = payload.get("queries") or []

    context = {
        "topic": payload["topic"],
        "scope": payload["scope"],
        "time_focus": payload["time_focus"],
        "must_include": must_include,
        "must_exclude": must_exclude,
        "title": title,
        "queries": queries,
        "created_at": created_at,
    }

    rendered = render_report(context)

    slug = slugify(title)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{slug}-{created_at.replace('-', '')}.md"
    output_path.write_text(rendered, encoding="utf-8")
    return output_path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate research report draft from YAML assignment.")
    parser.add_argument("--in", dest="input_path", required=True, help="Path to YAML assignment file.")
    parser.add_argument(
        "--out",
        dest="output_dir",
        required=True,
        help="Directory where the markdown report should be written.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    input_yaml = Path(args.input_path).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()

    if not input_yaml.exists():
        raise SystemExit(f"Input file not found: {input_yaml}")

    report_path = generate_report(input_yaml, output_dir)
    print(f"Report generated: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

