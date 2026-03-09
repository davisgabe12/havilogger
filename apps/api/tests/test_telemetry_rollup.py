from __future__ import annotations

from app.telemetry_rollup import build_telemetry_rollup, normalize_telemetry_row


def test_normalize_telemetry_row_supports_nested_route_metadata() -> None:
    row = {
        "response_metadata": {
            "route_metadata": {
                "route_kind": "ask",
                "expected_route_kind": "ask",
                "decision_source": "rule",
                "classifier_intent": "general_parenting_advice",
                "confidence": 0.55,
                "classifier_fallback_reason": "",
                "composer_fallback_reason": "",
            }
        }
    }

    normalized = normalize_telemetry_row(row)
    assert normalized["route_kind"] == "ask"
    assert normalized["expected_route_kind"] == "ask"
    assert normalized["decision_source"] == "rule"
    assert normalized["classifier_intent"] == "general_parenting_advice"
    assert normalized["confidence"] == 0.55
    assert normalized["complete"] is True


def test_build_telemetry_rollup_passes_thresholds() -> None:
    rows = [
        {
            "route_kind": "log",
            "expected_route_kind": "log",
            "decision_source": "rule",
            "classifier_intent": "logging",
            "confidence": 0.82,
            "ambiguous_eligible": False,
        },
        {
            "route_kind": "ask",
            "expected_route_kind": "ask",
            "decision_source": "rule",
            "classifier_intent": "general_parenting_advice",
            "confidence": 0.55,
            "ambiguous_eligible": False,
        },
    ]

    summary = build_telemetry_rollup(rows, min_sample_size=1)
    assert summary["overall_status"] == "PASS"
    assert summary["route_disagreement_rate"] == 0.0
    assert summary["fallback_or_skip_rate"] == 0.0
    assert summary["telemetry_completeness_rate"] == 1.0
    assert summary["alarms"] == []


def test_build_telemetry_rollup_blocks_on_threshold_regressions() -> None:
    rows = [
        {
            "route_kind": "log",
            "expected_route_kind": "ask",
            "decision_source": "model",
            "classifier_intent": "logging",
            "confidence": 0.74,
            "ambiguous_eligible": True,
            "classifier_fallback_reason": "below_threshold",
        },
        {
            "route_kind": "",
            "expected_route_kind": "ask",
            "decision_source": "",
            "classifier_intent": "",
            "confidence": None,
            "ambiguous_eligible": True,
            "classifier_fallback_reason": "",
            "composer_fallback_reason": "composer_disabled",
        },
    ]

    summary = build_telemetry_rollup(rows, min_sample_size=1)
    assert summary["overall_status"] == "BLOCK"
    metrics = {alarm["metric"] for alarm in summary["alarms"]}
    assert "route_disagreement_rate" in metrics
    assert "fallback_or_skip_rate" in metrics
    assert "telemetry_completeness_rate" in metrics
