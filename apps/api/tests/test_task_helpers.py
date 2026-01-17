from __future__ import annotations

from datetime import datetime, timezone

from zoneinfo import ZoneInfo

from app.main import extract_task_due_at, extract_task_remind_at, extract_task_title


def test_extract_task_due_at_basic() -> None:
  tz = "America/Los_Angeles"
  iso = extract_task_due_at("remind me to call the doctor at 6pm on 1/2/25", tz)
  assert iso is not None
  dt = datetime.fromisoformat(iso)
  assert dt.tzinfo is not None
  local = dt.astimezone(ZoneInfo(tz))
  assert (local.year, local.month, local.day, local.hour, local.minute) == (
    2025,
    1,
    2,
    18,
    0,
  )


def test_extract_task_due_at_alt_order() -> None:
  tz = "America/Los_Angeles"
  iso = extract_task_due_at("on 1/2/25 at 6pm", tz)
  assert iso is not None
  dt = datetime.fromisoformat(iso)
  local = dt.astimezone(ZoneInfo(tz))
  assert (local.year, local.month, local.day, local.hour, local.minute) == (
    2025,
    1,
    2,
    18,
    0,
  )


def test_extract_task_due_at_no_date() -> None:
  tz = "America/Los_Angeles"
  iso = extract_task_due_at("create a task for later", tz)
  assert iso is None


def test_extract_task_title_strips_datetime() -> None:
  title = extract_task_title("remind me to call the doctor at 6pm on 1/2/25")
  assert title == "call the doctor"


def test_extract_task_title_from_task_prefix() -> None:
  title = extract_task_title("task: pick up groceries on 1/2/25 at 6pm")
  assert title == "pick up groceries"


def test_extract_task_remind_at_relative() -> None:
  tz = "America/Los_Angeles"
  base = datetime(2025, 1, 1, 9, 0, tzinfo=timezone.utc)
  iso = extract_task_remind_at("remind me tomorrow morning to call the doctor", tz, base)
  assert iso is not None
  dt = datetime.fromisoformat(iso)
  local = dt.astimezone(ZoneInfo(tz))
  assert (local.year, local.month, local.day) == (2025, 1, 2)
