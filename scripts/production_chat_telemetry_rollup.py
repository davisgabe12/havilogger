#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import sys
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))
load_dotenv(API_DIR / ".env.local")
load_dotenv(ROOT_DIR / "apps" / "web" / ".env.local")

from app.supabase import get_admin_client
from app.telemetry_rollup import (
    DEFAULT_MIN_SAMPLE_SIZE,
    PRODUCTION_THRESHOLDS,
    build_telemetry_rollup,
)


def _iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


async def _fetch_from_chat_route_telemetry(
    *,
    since_iso: str,
    max_rows: int,
    page_size: int,
) -> List[Dict[str, Any]]:
    client = get_admin_client()
    rows: List[Dict[str, Any]] = []
    offset = 0
    while len(rows) < max_rows:
        remaining = max_rows - len(rows)
        limit = min(page_size, remaining)
        batch = await client.select(
            "chat_route_telemetry",
            params={
                "select": (
                    "created_at,route_kind,expected_route_kind,decision_source,"
                    "classifier_intent,confidence,classifier_fallback_reason,"
                    "composer_fallback_reason,ambiguous_eligible"
                ),
                "created_at": f"gte.{since_iso}",
                "order": "created_at.desc",
                "limit": str(limit),
                "offset": str(offset),
            },
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return rows


async def _fetch_from_message_feedback(
    *,
    since_iso: str,
    max_rows: int,
    page_size: int,
) -> List[Dict[str, Any]]:
    client = get_admin_client()
    rows: List[Dict[str, Any]] = []
    offset = 0
    while len(rows) < max_rows:
        remaining = max_rows - len(rows)
        limit = min(page_size, remaining)
        batch = await client.select(
            "message_feedback",
            params={
                "select": "created_at,response_metadata",
                "created_at": f"gte.{since_iso}",
                "response_metadata": "not.is.null",
                "order": "created_at.desc",
                "limit": str(limit),
                "offset": str(offset),
            },
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < limit:
            break
        offset += limit

    converted: List[Dict[str, Any]] = []
    for row in rows:
        response_metadata = row.get("response_metadata")
        if not isinstance(response_metadata, dict):
            continue
        route_metadata = response_metadata.get("route_metadata")
        if not isinstance(route_metadata, dict):
            continue
        converted.append({"created_at": row.get("created_at"), "route_metadata": route_metadata})
    return converted


async def load_production_rows(
    *,
    since_iso: str,
    max_rows: int,
    page_size: int,
) -> Tuple[str, List[Dict[str, Any]], List[str]]:
    notes: List[str] = []
    try:
        direct_rows = await _fetch_from_chat_route_telemetry(
            since_iso=since_iso,
            max_rows=max_rows,
            page_size=page_size,
        )
        if direct_rows:
            return "chat_route_telemetry", direct_rows, notes
        notes.append("chat_route_telemetry returned 0 rows; falling back to message_feedback metadata.")
    except Exception as exc:
        notes.append(f"chat_route_telemetry unavailable: {exc}")

    try:
        feedback_rows = await _fetch_from_message_feedback(
            since_iso=since_iso,
            max_rows=max_rows,
            page_size=page_size,
        )
        if feedback_rows:
            return "message_feedback.route_metadata", feedback_rows, notes
        notes.append("message_feedback fallback returned 0 rows.")
    except Exception as exc:
        notes.append(f"message_feedback fallback unavailable: {exc}")

    return "none", [], notes


def _iter_turn_rows_from_report(payload: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    flows = payload.get("flows")
    if isinstance(flows, list):
        for flow in flows:
            if not isinstance(flow, dict):
                continue
            turn_rows = flow.get("turn_telemetry")
            if isinstance(turn_rows, list):
                for row in turn_rows:
                    if isinstance(row, dict):
                        yield row

    for key in ("turns", "rows", "results"):
        items = payload.get(key)
        if isinstance(items, list):
            for row in items:
                if isinstance(row, dict):
                    yield row


def _render_markdown(payload: Dict[str, Any]) -> str:
    rollup = payload.get("rollup") or {}
    thresholds = rollup.get("thresholds") or PRODUCTION_THRESHOLDS
    alarms: List[Dict[str, Any]] = list(rollup.get("alarms") or [])

    lines = [
        "# Production Chat Telemetry Rollup",
        "",
        f"- Generated at: `{payload.get('generated_at')}`",
        f"- Window: last `{payload.get('window_hours')}` hours",
        f"- Source: `{payload.get('source')}`",
        f"- Rows analyzed: `{payload.get('row_count')}`",
        f"- Overall status: `{rollup.get('overall_status', 'unknown')}`",
        "",
        "## Metrics",
        "",
        f"- `route_disagreement_rate`: `{rollup.get('route_disagreement_rate')}` (threshold <= `{thresholds.get('route_disagreement_rate')}`)",
        f"- `fallback_or_skip_rate`: `{rollup.get('fallback_or_skip_rate')}` (threshold <= `{thresholds.get('fallback_or_skip_rate')}`)",
        f"- `telemetry_completeness_rate`: `{rollup.get('telemetry_completeness_rate')}` (threshold >= `{thresholds.get('telemetry_completeness_rate')}`)",
        "",
        "## Alarms",
        "",
    ]

    if not alarms:
        lines.append("- none")
    else:
        for alarm in alarms:
            lines.append(
                "- "
                f"[{alarm.get('status')}/{alarm.get('severity')}] "
                f"{alarm.get('metric')}: {alarm.get('message')}"
            )

    notes: List[str] = list(payload.get("notes") or [])
    if notes:
        lines.extend(["", "## Notes", ""])
        for note in notes:
            lines.append(f"- {note}")

    lines.append("")
    return "\n".join(lines)


async def main() -> int:
    parser = argparse.ArgumentParser(description="Build a production chat telemetry rollup and alarm report.")
    parser.add_argument("--window-hours", type=int, default=24)
    parser.add_argument("--max-rows", type=int, default=5000)
    parser.add_argument("--page-size", type=int, default=1000)
    parser.add_argument("--min-sample-size", type=int, default=DEFAULT_MIN_SAMPLE_SIZE)
    parser.add_argument(
        "--output-json",
        default="docs/active/plan/chat-production-telemetry-rollup-latest.json",
        help="Path to write JSON rollup artifact.",
    )
    parser.add_argument(
        "--output-md",
        default="docs/active/plan/chat-production-telemetry-rollup-latest.md",
        help="Path to write Markdown rollup summary.",
    )
    parser.add_argument(
        "--fallback-production-report",
        default="",
        help=(
            "Optional local report path (e.g. prod core smoke JSON) used only when live telemetry rows are unavailable."
        ),
    )
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=max(1, args.window_hours))
    since_iso = _iso_utc(since)

    source, rows, notes = await load_production_rows(
        since_iso=since_iso,
        max_rows=max(1, args.max_rows),
        page_size=max(1, args.page_size),
    )

    if not rows and args.fallback_production_report:
        fallback_payload = _load_json(Path(args.fallback_production_report).resolve())
        if fallback_payload:
            rows = list(_iter_turn_rows_from_report(fallback_payload))
            source = f"fallback:{args.fallback_production_report}"
            notes.append("Live telemetry unavailable; used fallback local production report.")

    rollup = build_telemetry_rollup(
        rows,
        min_sample_size=max(1, args.min_sample_size),
    )

    output_payload = {
        "generated_at": _iso_utc(now),
        "window_hours": max(1, args.window_hours),
        "window_start": since_iso,
        "window_end": _iso_utc(now),
        "source": source,
        "row_count": len(rows),
        "notes": notes,
        "rollup": rollup,
    }

    output_json = Path(args.output_json).resolve()
    output_md = Path(args.output_md).resolve()
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)

    output_json.write_text(json.dumps(output_payload, indent=2), encoding="utf-8")
    output_md.write_text(_render_markdown(output_payload), encoding="utf-8")

    print(str(output_json))
    print(str(output_md))
    return 0


if __name__ == "__main__":
    raise SystemExit(__import__("asyncio").run(main()))
