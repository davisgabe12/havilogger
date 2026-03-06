from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.main import extract_event_start


def test_extract_event_start_parses_pm_with_minutes() -> None:
    base = datetime(2026, 3, 6, 13, 34, tzinfo=ZoneInfo("America/Los_Angeles"))
    start_iso = extract_event_start(
        "baby pooped at 3:15pm",
        "America/Los_Angeles",
        base,
    )
    expected = datetime(
        2026,
        3,
        6,
        15,
        15,
        tzinfo=ZoneInfo("America/Los_Angeles"),
    ).astimezone(timezone.utc)
    assert datetime.fromisoformat(start_iso) == expected


def test_extract_event_start_uses_first_time_in_segment() -> None:
    base = datetime(2026, 3, 6, 13, 34, tzinfo=ZoneInfo("America/Los_Angeles"))
    start_iso = extract_event_start(
        "slept from 1:00pm to 2:00pm and had a bottle 3 oz at 2:10pm",
        "America/Los_Angeles",
        base,
    )
    expected = datetime(
        2026,
        3,
        6,
        13,
        0,
        tzinfo=ZoneInfo("America/Los_Angeles"),
    ).astimezone(timezone.utc)
    assert datetime.fromisoformat(start_iso) == expected


def test_extract_event_start_parses_am_without_year_jump() -> None:
    base = datetime(2026, 3, 6, 13, 34, tzinfo=ZoneInfo("America/Los_Angeles"))
    start_iso = extract_event_start(
        "woke at 3am",
        "America/Los_Angeles",
        base,
    )
    expected = datetime(
        2026,
        3,
        6,
        3,
        0,
        tzinfo=ZoneInfo("America/Los_Angeles"),
    ).astimezone(timezone.utc)
    assert datetime.fromisoformat(start_iso) == expected
