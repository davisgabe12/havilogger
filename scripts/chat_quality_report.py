#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _route_distribution(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    counter: Counter[str] = Counter()
    for row in rows:
        route = str(row.get("route_kind") or "unknown").strip() or "unknown"
        counter[route] += 1
    return dict(counter)


def _distribution_by(rows: List[Dict[str, Any]], key: str) -> Dict[str, int]:
    counter: Counter[str] = Counter()
    for row in rows:
        value = row.get(key)
        normalized = str(value).strip() if value is not None else "unknown"
        if not normalized:
            normalized = "unknown"
        counter[normalized] += 1
    return dict(counter)


def _guidance_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    guidance_rows = [row for row in rows if isinstance(row.get("guidance_contract"), dict)]
    if not guidance_rows:
        return {"count": 0, "average_score": 0.0}
    scores = [float(row["guidance_contract"].get("score", 0)) for row in guidance_rows]
    return {
        "count": len(guidance_rows),
        "average_score": round(sum(scores) / len(scores), 2),
        "min_score": round(min(scores), 2),
        "max_score": round(max(scores), 2),
    }


def _route_disagreement_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    comparable = [
        row for row in rows if str(row.get("expected_route_kind") or "").strip()
    ]
    mismatches = [
        row
        for row in comparable
        if str(row.get("route_kind") or "").strip()
        != str(row.get("expected_route_kind") or "").strip()
    ]
    mismatch_ids = [str(row.get("id") or "") for row in mismatches if row.get("id")]
    return {
        "comparable_count": len(comparable),
        "mismatch_count": len(mismatches),
        "mismatch_rate": round((len(mismatches) / len(comparable)) if comparable else 0.0, 4),
        "mismatch_ids": mismatch_ids,
    }


def _classifier_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    evaluated = [row for row in rows if isinstance(row.get("classifier_reasons"), list)]
    if not evaluated:
        return {
            "evaluated_count": 0,
            "override_count": 0,
            "fallback_or_skipped_count": 0,
        }
    override_count = 0
    fallback_or_skipped_count = 0
    for row in evaluated:
        reasons = [str(item) for item in (row.get("classifier_reasons") or [])]
        if any(reason.startswith("openai_classifier_override") for reason in reasons):
            override_count += 1
        if any(
            reason.startswith("model_fallback:") or reason.startswith("model_skipped:")
            for reason in reasons
        ):
            fallback_or_skipped_count += 1
    return {
        "evaluated_count": len(evaluated),
        "override_count": override_count,
        "fallback_or_skipped_count": fallback_or_skipped_count,
        "override_rate": round(override_count / len(evaluated), 4),
        "fallback_or_skipped_rate": round(fallback_or_skipped_count / len(evaluated), 4),
    }


def build_report(golden_payload: Dict[str, Any], green_pass: bool) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = list(golden_payload.get("results") or [])
    return {
        "golden": {
            "version": golden_payload.get("version", "unknown"),
            "total_cases": len(rows),
            "route_distribution": _route_distribution(rows),
            "scenario_class_distribution": _distribution_by(rows, "scenario_class"),
            "age_band_distribution": _distribution_by(rows, "age_band"),
            "family_size_distribution": _distribution_by(rows, "family_size"),
            "route_disagreement": _route_disagreement_summary(rows),
            "classifier": _classifier_summary(rows),
            "guidance": _guidance_summary(rows),
        },
        "green": {
            "pass": bool(green_pass),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build chat quality snapshot from golden + GREEN results.")
    parser.add_argument(
        "--golden-report",
        default="/tmp/havi_phase0_golden_report.json",
        help="Path to golden harness report JSON.",
    )
    parser.add_argument(
        "--output",
        default="docs/active/plan/chat-quality-report.json",
        help="Output JSON path for quality snapshot.",
    )
    parser.add_argument(
        "--green-pass",
        action="store_true",
        help="Mark GREEN smoke as passing in output report.",
    )
    args = parser.parse_args()

    golden_path = Path(args.golden_report).resolve()
    output_path = Path(args.output).resolve()
    payload = _load_json(golden_path)
    report = build_report(payload, green_pass=bool(args.green_pass))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(str(output_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
