#!/usr/bin/env python3
"""Summarise UI activity logs for review sessions."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


def parse_line(line: str) -> dict | None:
    line = line.strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None


def main() -> None:
    logs_dir = Path("logs")
    files = sorted(logs_dir.glob("ui-activity-*.jsonl"))
    if not files:
        print("No ui-activity logs found.")
        return

    total_events = 0
    timeline: list[tuple[str, dict]] = []
    event_counter = Counter()
    template_counter = Counter()
    status_counter = Counter()
    per_day = defaultdict(int)

    for file in files:
        for line in file.read_text(encoding="utf-8").splitlines():
            record = parse_line(line)
            if not record:
                continue
            ts = record.get("ts") or ""
            event = record.get("event", "unknown")
            template = record.get("template")
            status = record.get("status")

            timeline.append((ts, record))
            event_counter[event] += 1
            if template:
                template_counter[template] += 1
            if status:
                status_counter[status] += 1

            try:
                day = datetime.fromisoformat(ts.replace("Z", "+00:00")).date()
                per_day[str(day)] += 1
            except ValueError:
                continue

            total_events += 1

    print(f"Processed {total_events} events across {len(files)} files.\n")

    if per_day:
        print("Events per day:")
        for day, count in sorted(per_day.items()):
            print(f"  {day}: {count}")
        print()

    print("Event types:")
    for event, count in event_counter.most_common():
        print(f"  {event}: {count}")
    print()

    if template_counter:
        print("Templates used:")
        for template, count in template_counter.most_common():
            print(f"  {template}: {count}")
        print()

    if status_counter:
        print("Statuses:")
        for status, count in status_counter.most_common():
            print(f"  {status}: {count}")
        print()

    print("Timeline (latest 10 events):")
    for ts, record in sorted(timeline, key=lambda item: item[0], reverse=True)[:10]:
        print(json.dumps(record, ensure_ascii=False))


if __name__ == "__main__":
    main()
