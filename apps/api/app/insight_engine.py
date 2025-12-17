"""High-level insight helpers for compare/expected questions."""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .db import get_connection


STAGE_GUIDANCE = {
    "newborn_week_1": {
        "sleep_hours": (14, 18),
        "poop_per_day": (4, 8),
        "feed_per_day": (8, 12),
        "notes": "Newborn tummies are adjusting—expect frequent yellow seedy diapers and 2-3h feeds.",
    },
    "month_3": {
        "sleep_hours": (14, 17),
        "poop_per_day": (1, 3),
        "feed_per_day": (5, 7),
        "notes": "Three-month-olds often stretch nights but still wake 1-2 times; daytime poops may slow down.",
    },
}


def _fetch_actions(child_id: int, start: datetime, end: datetime) -> List[dict]:
    actions: List[dict] = []
    with get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT actions_json FROM activity_logs
            WHERE child_id = ? AND created_at BETWEEN ? AND ?
            """,
            (child_id, start.isoformat(), end.isoformat()),
        )
        for row in cursor.fetchall():
            payload = json.loads(row[0])
            actions.extend(payload.get("actions", []))
    return actions


def summaries_from_actions(actions: List[dict]) -> Dict[str, float]:
    totals = defaultdict(float)
    for action in actions:
        atype = action.get("action_type")
        metadata = action.get("metadata", {})
        totals[f"count_{atype}"] += 1
        if atype == "sleep" and metadata.get("duration_minutes"):
            totals["sleep_minutes"] += float(metadata.get("duration_minutes", 0))
        if atype == "activity" and metadata.get("amount_value"):
            totals["feed_oz"] += float(metadata.get("amount_value", 0))
    return totals


def compare_metrics(child_id: int, days: int = 1, baseline_days: int = 1) -> Dict[str, Dict]:
    now = datetime.now()
    window_start = now - timedelta(days=days)
    baseline_start = window_start - timedelta(days=baseline_days)

    current_actions = _fetch_actions(child_id, window_start, now)
    baseline_actions = _fetch_actions(child_id, baseline_start, window_start)

    current_summary = summaries_from_actions(current_actions)
    baseline_summary = summaries_from_actions(baseline_actions)

    deltas = {}
    for key in set(current_summary) | set(baseline_summary):
        current_value = current_summary.get(key, 0.0)
        baseline_value = baseline_summary.get(key, 0.0)
        diff = current_value - baseline_value
        deltas[key] = {
            "current": current_value,
            "baseline": baseline_value,
            "delta": diff,
        }

    return {
        "window_days": days,
        "baseline_days": baseline_days,
        "current": current_summary,
        "baseline": baseline_summary,
        "metrics": deltas,
    }


def expected_ranges(stage: str, observed: Dict[str, float] | None = None) -> Dict:
    stage_data = STAGE_GUIDANCE.get(stage, {})
    guidance = {
        "stage": stage,
        "ranges": stage_data,
        "notes": stage_data.get("notes", "") if stage_data else "",
        "observed": observed or {},
        "risks": [],
        "options": [],
    }

    if observed and stage_data:
        sleep_hours = observed.get("sleep_minutes", 0) / 60
        feed_count = observed.get("count_activity", 0)
        poop_count = observed.get("count_dirty_diaper_poop", 0) + observed.get("count_dirty_diaper_pee_and_poop", 0)

        if sleep_hours < stage_data.get("sleep_hours", (0, 0))[0]:
            guidance["risks"].append("Sleep trending short; watch wake windows and bedtime routine.")
        if feed_count < stage_data.get("feed_per_day", (0, 0))[0]:
            guidance["options"].append("Consider offering an extra daytime feed or earlier top-off.")
        if poop_count < stage_data.get("poop_per_day", (0, 0))[0]:
            guidance["options"].append("If stools slow down, offer tummy time or consult pediatrician if discomfort appears.")

    return guidance


def compare_and_expected(child_id: int, stage: str, days: int = 1, baseline_days: int = 1) -> Dict:
    compare = compare_metrics(child_id, days=days, baseline_days=baseline_days)
    expected = expected_ranges(stage, observed=compare.get("current"))
    return {
        "compare": compare,
        "expected": expected,
    }
