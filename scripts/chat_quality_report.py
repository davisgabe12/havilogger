#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "apps" / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from app.telemetry_rollup import PRODUCTION_THRESHOLDS as ROLLUP_PRODUCTION_THRESHOLDS
from app.telemetry_rollup import build_telemetry_rollup

PHASE1_THRESHOLDS = {
    "guidance_contract_pass_rate": 0.95,
    "average_guidance_score": 6.0,
    "min_guidance_score": 5.0,
    "known_age_reask_violation_rate": 0.0,
}

PRODUCTION_THRESHOLDS = {
    "route_disagreement_rate": float(ROLLUP_PRODUCTION_THRESHOLDS["route_disagreement_rate"]),
    "fallback_or_skip_rate": float(ROLLUP_PRODUCTION_THRESHOLDS["fallback_or_skip_rate"]),
    "telemetry_completeness_rate": float(ROLLUP_PRODUCTION_THRESHOLDS["telemetry_completeness_rate"]),
}


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


def _route_disagreement_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    comparable = [row for row in rows if str(row.get("expected_route_kind") or "").strip()]
    mismatches = [
        row
        for row in comparable
        if str(row.get("route_kind") or "").strip() != str(row.get("expected_route_kind") or "").strip()
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
            "override_rate": 0.0,
            "fallback_or_skipped_rate": 0.0,
        }
    override_count = 0
    fallback_or_skipped_count = 0
    for row in evaluated:
        reasons = [str(item) for item in (row.get("classifier_reasons") or [])]
        if any(reason.startswith("openai_classifier_override") for reason in reasons):
            override_count += 1
        if any(reason.startswith("model_fallback:") or reason.startswith("model_skipped:") for reason in reasons):
            fallback_or_skipped_count += 1
    return {
        "evaluated_count": len(evaluated),
        "override_count": override_count,
        "fallback_or_skipped_count": fallback_or_skipped_count,
        "override_rate": round(override_count / len(evaluated), 4),
        "fallback_or_skipped_rate": round(fallback_or_skipped_count / len(evaluated), 4),
    }


def _guidance_score_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    guidance_rows = [row for row in rows if isinstance(row.get("guidance_contract"), dict)]
    if not guidance_rows:
        return {
            "count": 0,
            "average_score": 0.0,
            "min_score": 0.0,
            "max_score": 0.0,
        }
    scores = [float((row.get("guidance_contract") or {}).get("score", 0.0)) for row in guidance_rows]
    return {
        "count": len(guidance_rows),
        "average_score": round(sum(scores) / len(scores), 2),
        "min_score": round(min(scores), 2),
        "max_score": round(max(scores), 2),
    }


def _verdict_geq(value: float, target: float) -> str:
    return "PASS" if value >= target else "BLOCK"


def _verdict_leq(value: float, target: float) -> str:
    return "PASS" if value <= target else "BLOCK"


def _segment_pass_rates(rows: List[Dict[str, Any]], key: str) -> Dict[str, Dict[str, Any]]:
    grouped: Dict[str, List[bool]] = defaultdict(list)
    for row in rows:
        contract = row.get("guidance_contract") or {}
        passed = bool(contract.get("pass"))
        segment = str(row.get(key) if row.get(key) is not None else "unknown").strip() or "unknown"
        grouped[segment].append(passed)
    output: Dict[str, Dict[str, Any]] = {}
    for segment, results in grouped.items():
        output[segment] = {
            "count": len(results),
            "pass_rate": round(sum(1 for item in results if item) / len(results), 4),
        }
    return output


def _phase0_section(payload: Dict[str, Any]) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = list(payload.get("results") or [])
    return {
        "version": payload.get("version", "unknown"),
        "total_cases": len(rows),
        "route_distribution": _route_distribution(rows),
        "scenario_class_distribution": _distribution_by(rows, "scenario_class"),
        "age_band_distribution": _distribution_by(rows, "age_band"),
        "family_size_distribution": _distribution_by(rows, "family_size"),
        "route_disagreement": _route_disagreement_summary(rows),
        "classifier": _classifier_summary(rows),
        "guidance": _guidance_score_summary(rows),
    }


def _phase1_v2_section(payload: Dict[str, Any]) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = list(payload.get("results") or [])
    guidance_rows = [row for row in rows if isinstance(row.get("guidance_contract"), dict)]

    pass_count = sum(1 for row in guidance_rows if row["guidance_contract"].get("pass"))
    known_age_violations = sum(
        1
        for row in guidance_rows
        if row["guidance_contract"].get("known_age_reask_violation")
    )
    check_failures: Counter[str] = Counter()
    for row in guidance_rows:
        checks = (row.get("guidance_contract") or {}).get("checks") or {}
        for check_name, passed in checks.items():
            if not passed:
                check_failures[str(check_name)] += 1

    guidance_scores = _guidance_score_summary(rows)
    guidance_contract_pass_rate = round((pass_count / len(guidance_rows)) if guidance_rows else 0.0, 4)
    known_age_reask_violation_rate = round(
        (known_age_violations / len(guidance_rows)) if guidance_rows else 0.0,
        4,
    )

    ask_write_violations = [
        str(row.get("id") or "")
        for row in rows
        if str(row.get("route_kind") or "") == "ask" and int(row.get("action_count") or 0) > 0
    ]
    mixed_missing_confirmation = [
        str(row.get("id") or "")
        for row in rows
        if str(row.get("scenario_class") or "") == "mixed_log_plus_guidance"
        and not bool(((row.get("guidance_contract") or {}).get("checks") or {}).get("starts_with_logged_confirmation"))
    ]

    threshold_verdicts = {
        "guidance_contract_pass_rate": _verdict_geq(
            guidance_contract_pass_rate,
            PHASE1_THRESHOLDS["guidance_contract_pass_rate"],
        ),
        "average_guidance_score": _verdict_geq(
            float(guidance_scores.get("average_score") or 0.0),
            PHASE1_THRESHOLDS["average_guidance_score"],
        ),
        "min_guidance_score": _verdict_geq(
            float(guidance_scores.get("min_score") or 0.0),
            PHASE1_THRESHOLDS["min_guidance_score"],
        ),
        "known_age_reask_violation_rate": _verdict_leq(
            known_age_reask_violation_rate,
            PHASE1_THRESHOLDS["known_age_reask_violation_rate"],
        ),
        "ask_write_violations": "PASS" if not ask_write_violations else "BLOCK",
        "mixed_missing_logged_confirmation": "PASS" if not mixed_missing_confirmation else "BLOCK",
    }

    return {
        "version": payload.get("version", "phase1-v2"),
        "total_cases": len(rows),
        "route_distribution": _route_distribution(rows),
        "scenario_class_distribution": _distribution_by(rows, "scenario_class"),
        "age_band_distribution": _distribution_by(rows, "age_band"),
        "family_size_distribution": _distribution_by(rows, "family_size"),
        "route_disagreement": _route_disagreement_summary(rows),
        "classifier": _classifier_summary(rows),
        "guidance": {
            **guidance_scores,
            "contract_pass_count": pass_count,
            "contract_pass_rate": guidance_contract_pass_rate,
            "known_age_reask_violation_count": known_age_violations,
            "known_age_reask_violation_rate": known_age_reask_violation_rate,
            "per_check_failure_counts": dict(check_failures),
            "segment_pass_rates": {
                "scenario_class": _segment_pass_rates(guidance_rows, "scenario_class"),
                "age_band": _segment_pass_rates(guidance_rows, "age_band"),
                "family_size": _segment_pass_rates(guidance_rows, "family_size"),
            },
            "hard_fail_invariants": {
                "ask_write_violations_count": len(ask_write_violations),
                "ask_write_violations": ask_write_violations,
                "mixed_missing_logged_confirmation_count": len(mixed_missing_confirmation),
                "mixed_missing_logged_confirmation": mixed_missing_confirmation,
            },
        },
        "thresholds": {
            "phase1_v2": PHASE1_THRESHOLDS,
            "threshold_verdicts": threshold_verdicts,
        },
    }


def _iter_turn_telemetry_rows(payload: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    flows = payload.get("flows")
    if isinstance(flows, list):
        for flow in flows:
            if not isinstance(flow, dict):
                continue
            turns = flow.get("turn_telemetry")
            if isinstance(turns, list):
                for turn in turns:
                    if isinstance(turn, dict):
                        normalized = dict(turn)
                        normalized.setdefault("flow_label", flow.get("label"))
                        yield normalized

    for key in ("turns", "results", "rows"):
        items = payload.get(key)
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    yield item


def _prepare_turn_for_rollup(row: Dict[str, Any]) -> Dict[str, Any]:
    metadata = row.get("route_metadata")
    if not isinstance(metadata, dict):
        response_metadata = row.get("response_metadata")
        if isinstance(response_metadata, dict):
            maybe_metadata = response_metadata.get("route_metadata")
            if isinstance(maybe_metadata, dict):
                metadata = maybe_metadata
    metadata = metadata or {}

    reasons = row.get("classifier_reasons")
    if not isinstance(reasons, list):
        maybe_reasons = metadata.get("classifier_reasons")
        reasons = maybe_reasons if isinstance(maybe_reasons, list) else []
    reason_values = [str(item) for item in reasons]

    route_kind = str(row.get("route_kind") or metadata.get("route_kind") or "").strip()
    expected_route_kind = str(row.get("expected_route_kind") or metadata.get("expected_route_kind") or "").strip()
    decision_source = str(row.get("decision_source") or metadata.get("decision_source") or "").strip()
    classifier_intent = str(row.get("classifier_intent") or metadata.get("classifier_intent") or "").strip()

    confidence = row.get("confidence")
    if confidence is None:
        confidence = metadata.get("confidence")
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = None

    classifier_fallback_reason = str(
        row.get("classifier_fallback_reason")
        or metadata.get("classifier_fallback_reason")
        or ""
    ).strip()
    composer_fallback_reason = str(
        row.get("composer_fallback_reason")
        or metadata.get("composer_fallback_reason")
        or ""
    ).strip()

    fallback_signal = bool(classifier_fallback_reason or composer_fallback_reason)
    if not fallback_signal:
        fallback_signal = any(
            reason.startswith("model_fallback:") or reason.startswith("model_skipped:")
            for reason in reason_values
        )
    if fallback_signal and not classifier_fallback_reason and not composer_fallback_reason:
        classifier_fallback_reason = "reason_signal"

    ambiguous_eligible = bool(row.get("ambiguous_eligible"))
    if not ambiguous_eligible:
        ambiguous_eligible = bool(reason_values) or decision_source == "model"

    return {
        "route_kind": route_kind,
        "expected_route_kind": expected_route_kind,
        "decision_source": decision_source,
        "classifier_intent": classifier_intent,
        "confidence": confidence_value,
        "classifier_fallback_reason": classifier_fallback_reason,
        "composer_fallback_reason": composer_fallback_reason,
        "ambiguous_eligible": ambiguous_eligible,
    }


def _production_telemetry_section(payload: Dict[str, Any]) -> Dict[str, Any]:
    source = str(payload.get("source") or "inline").strip() or "inline"
    notes: List[str] = list(payload.get("notes") or [])

    embedded_rollup = payload.get("rollup")
    if isinstance(embedded_rollup, dict):
        rollup = dict(embedded_rollup)
    else:
        turns = [_prepare_turn_for_rollup(row) for row in _iter_turn_telemetry_rows(payload)]
        rollup = build_telemetry_rollup(turns)

    total_turns = int(rollup.get("total_turns") or 0)
    disagreement_rate = float(rollup.get("route_disagreement_rate") or 0.0)
    fallback_rate = float(rollup.get("fallback_or_skip_rate") or 0.0)
    completeness_rate = float(rollup.get("telemetry_completeness_rate") or 0.0)

    thresholds = rollup.get("thresholds") if isinstance(rollup.get("thresholds"), dict) else PRODUCTION_THRESHOLDS
    has_data = total_turns > 0
    threshold_verdicts = {
        "route_disagreement_rate": _verdict_leq(disagreement_rate, float(thresholds["route_disagreement_rate"])) if has_data else "BLOCK",
        "fallback_or_skip_rate": _verdict_leq(fallback_rate, float(thresholds["fallback_or_skip_rate"])) if has_data else "BLOCK",
        "telemetry_completeness_rate": _verdict_geq(completeness_rate, float(thresholds["telemetry_completeness_rate"])) if has_data else "BLOCK",
    }

    return {
        "source": source,
        "row_count": int(payload.get("row_count") or total_turns),
        "overall_status": str(rollup.get("overall_status") or "unknown"),
        "notes": notes,
        "total_turns": total_turns,
        "comparable_count": int(rollup.get("comparable_count") or 0),
        "mismatch_count": int(rollup.get("mismatch_count") or 0),
        "route_disagreement_rate": round(disagreement_rate, 4),
        "ambiguous_eligible_count": int(rollup.get("ambiguous_eligible_count") or 0),
        "fallback_or_skip_count": int(rollup.get("fallback_or_skip_count") or 0),
        "fallback_or_skip_rate": round(fallback_rate, 4),
        "telemetry_complete_count": int(rollup.get("telemetry_complete_count") or 0),
        "telemetry_completeness_rate": round(completeness_rate, 4),
        "route_distribution": dict(rollup.get("route_distribution") or {}),
        "decision_source_distribution": dict(rollup.get("decision_source_distribution") or {}),
        "alarms": list(rollup.get("alarms") or []),
        "thresholds": {
            "production": {
                "route_disagreement_rate": float(thresholds["route_disagreement_rate"]),
                "fallback_or_skip_rate": float(thresholds["fallback_or_skip_rate"]),
                "telemetry_completeness_rate": float(thresholds["telemetry_completeness_rate"]),
            },
            "threshold_verdicts": threshold_verdicts,
        },
    }


def build_report(
    *,
    phase0_payload: Dict[str, Any],
    phase1_v2_payload: Dict[str, Any],
    production_payload: Dict[str, Any],
    green_pass: bool,
) -> Dict[str, Any]:
    phase0 = _phase0_section(phase0_payload)
    return {
        "golden": phase0,
        "phase0": phase0,
        "phase1_v2": _phase1_v2_section(phase1_v2_payload),
        "production_telemetry": _production_telemetry_section(production_payload),
        "green": {
            "pass": bool(green_pass),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build chat quality snapshot from golden + telemetry + GREEN results.")
    parser.add_argument(
        "--golden-report",
        default="/tmp/havi_phase0_golden_report.json",
        help="Path to Phase 0 golden harness report JSON.",
    )
    parser.add_argument(
        "--phase1-v2-report",
        default="/tmp/havi_phase1_v2_golden_report.json",
        help="Path to Phase 1-v2 harness report JSON.",
    )
    parser.add_argument(
        "--production-telemetry-report",
        default="",
        help="Optional path to production telemetry JSON (prod smoke report or telemetry export).",
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

    phase0_path = Path(args.golden_report).resolve()
    phase1_path = Path(args.phase1_v2_report).resolve()
    production_path = Path(args.production_telemetry_report).resolve() if args.production_telemetry_report else None
    output_path = Path(args.output).resolve()

    phase0_payload = _load_json(phase0_path)
    phase1_payload = _load_json(phase1_path)
    production_payload = _load_json(production_path) if production_path else {}

    report = build_report(
        phase0_payload=phase0_payload,
        phase1_v2_payload=phase1_payload,
        production_payload=production_payload,
        green_pass=bool(args.green_pass),
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(str(output_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
