from __future__ import annotations

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import chat_quality_report as quality_report  # noqa: E402


def test_production_telemetry_section_uses_embedded_rollup_payload() -> None:
    payload = {
        "source": "chat_route_telemetry",
        "row_count": 120,
        "notes": ["live rows"],
        "rollup": {
            "overall_status": "PASS",
            "total_turns": 120,
            "comparable_count": 100,
            "mismatch_count": 2,
            "route_disagreement_rate": 0.02,
            "ambiguous_eligible_count": 40,
            "fallback_or_skip_count": 4,
            "fallback_or_skip_rate": 0.1,
            "telemetry_complete_count": 120,
            "telemetry_completeness_rate": 1.0,
            "route_distribution": {"ask": 60, "log": 60},
            "decision_source_distribution": {"rule": 100, "model": 20},
            "thresholds": {
                "route_disagreement_rate": 0.03,
                "fallback_or_skip_rate": 0.20,
                "telemetry_completeness_rate": 0.99,
            },
            "alarms": [],
        },
    }

    section = quality_report._production_telemetry_section(payload)
    assert section["source"] == "chat_route_telemetry"
    assert section["row_count"] == 120
    assert section["overall_status"] == "PASS"
    assert section["route_disagreement_rate"] == 0.02
    assert section["fallback_or_skip_rate"] == 0.1
    assert section["telemetry_completeness_rate"] == 1.0
    verdicts = section["thresholds"]["threshold_verdicts"]
    assert verdicts["route_disagreement_rate"] == "PASS"
    assert verdicts["fallback_or_skip_rate"] == "PASS"
    assert verdicts["telemetry_completeness_rate"] == "PASS"


def test_production_telemetry_section_marks_reason_signaled_fallback() -> None:
    payload = {
        "flows": [
            {
                "label": "sample",
                "turn_telemetry": [
                    {
                        "route_kind": "ask",
                        "expected_route_kind": "ask",
                        "decision_source": "rule",
                        "classifier_intent": "general_parenting_advice",
                        "confidence": 0.73,
                        "classifier_reasons": ["model_skipped:traffic"],
                    }
                ],
            }
        ]
    }

    section = quality_report._production_telemetry_section(payload)
    assert section["total_turns"] == 1
    assert section["ambiguous_eligible_count"] == 1
    assert section["fallback_or_skip_count"] == 1
    assert section["fallback_or_skip_rate"] == 1.0
    assert section["thresholds"]["threshold_verdicts"]["fallback_or_skip_rate"] == "BLOCK"
