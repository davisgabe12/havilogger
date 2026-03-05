from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List

from app.main import (
    _action_from_segment,
    _detect_memory_inference,
    _extract_logging_segments_for_mixed,
    _route_decision_for_message,
    _split_message_into_events,
    build_assistant_message,
    classify_question_category,
    detect_memory_save_target,
    message_symptom_tags,
)
from app.router import classify_intent
from app.routes.feedback import MessageFeedbackPayload

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "golden_chat_cases_phase0.json"
REPORT_PATH = Path("/tmp/havi_phase0_golden_report.json")

REQUIRED_FAMILY_SIZES = {1, 2, 3}
REQUIRED_AGE_BANDS = {"newborn", "young_infant", "older_infant", "toddler", "early_preschool"}
REQUIRED_SCENARIO_CLASSES = {
    "short_log",
    "short_ask",
    "mixed_intent",
    "long_open_ended_guidance",
    "multi_event_times",
    "explicit_memory_save",
    "inferred_memory",
    "task_request",
    "feedback_action",
    "guidance_format",
}


def _load_cases() -> List[Dict[str, Any]]:
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return payload["cases"]


def _child_data(case: Dict[str, Any]) -> Dict[str, Any]:
    weeks = int(case.get("child_age_weeks", 12))
    dob = (datetime.now(timezone.utc) - timedelta(days=weeks * 7)).date().isoformat()
    return {
        "first_name": case.get("child_name", "Child"),
        "birth_date": dob,
        "timezone": "America/Los_Angeles",
    }


def _guidance_contract_signals(reply: str, child_name: str) -> Dict[str, Any]:
    lower = reply.lower()
    question_count = reply.count("?")
    checks = {
        "has_evidence_framing": any(
            token in lower for token in ["common", "normal", "cdc", "aap", "huckleberry", "emily oster"]
        ),
        "has_context_filter": child_name.lower() in lower or "for around week" in lower,
        "has_action_steps": bool(re.search(r"\b1\)|\b1\.", reply)) and bool(
            re.search(r"\b2\)|\b2\.", reply)
        ),
        "has_avoidance_or_red_flags": any(token in lower for token in ["red flags", "avoid", "not to do"]),
        "has_reusable_script_signal": any(
            token in lower for token in ["i won't let you hit", "gentle hands", "script", "for example"]
        ),
        "follow_up_question_limit_ok": question_count <= 3,
        "scan_friendly_shape": len(reply) <= 1600,
    }
    score = sum(1 for value in checks.values() if value)
    return {"checks": checks, "score": score, "question_count": question_count}


def _evaluate_case(case: Dict[str, Any]) -> Dict[str, Any]:
    if case.get("scenario_class") == "feedback_action":
        payload = MessageFeedbackPayload(**case["feedback_payload"])
        return {
            "id": case["id"],
            "scenario_class": case["scenario_class"],
            "age_band": case.get("age_band"),
            "family_size": case.get("family_size"),
            "feedback_payload_valid": payload.rating in {"up", "down"},
        }

    message = case["message"]
    intent_result = classify_intent(message)
    decision = _route_decision_for_message(message, intent_result.intent)
    memory_target = detect_memory_save_target(message)
    memory_inference = _detect_memory_inference(message) is not None

    segments: List[str] = []
    if decision.route_kind == "mixed":
        segments = _extract_logging_segments_for_mixed(message)
    elif decision.route_kind == "log":
        segments = _split_message_into_events(message)

    actions = [_action_from_segment(segment, "America/Los_Angeles") for segment in segments if segment]
    symptoms = message_symptom_tags(message)
    question_category = classify_question_category(message, symptoms)

    if memory_target:
        assistant_text = "Got it - I'll remember that."
    elif decision.route_kind == "task":
        assistant_text = "Got it - I added that to tasks."
    else:
        context_intent = (
            "logging"
            if decision.route_kind == "log"
            else "mixed"
            if decision.route_kind == "mixed"
            else intent_result.intent
        )
        assistant_text, _ = build_assistant_message(
            actions,
            message,
            child_data=_child_data(case),
            context={
                "intent": context_intent,
                "symptom_tags": symptoms,
                "question_category": question_category,
                "recent_actions": actions,
            },
        )

    result = {
        "id": case["id"],
        "scenario_class": case["scenario_class"],
        "age_band": case.get("age_band"),
        "family_size": case.get("family_size"),
        "message": message,
        "expected_route_kind": (case.get("expected_current") or {}).get("route_kind"),
        "classifier_intent": intent_result.intent,
        "classifier_reasons": list(intent_result.reasons),
        "route_kind": decision.route_kind,
        "memory_target": memory_target,
        "memory_inference_signal": memory_inference,
        "logging_segments": segments,
        "action_count": len(actions),
        "assistant_preview": assistant_text[:220],
    }
    if case["scenario_class"] in {"guidance_format", "short_ask", "long_open_ended_guidance"}:
        result["guidance_contract"] = _guidance_contract_signals(
            assistant_text,
            case.get("child_name", "Child"),
        )
    return result


def test_phase0_dataset_coverage_requirements() -> None:
    cases = _load_cases()
    assert cases
    family_sizes = {int(case["family_size"]) for case in cases}
    age_bands = {case["age_band"] for case in cases}
    scenario_classes = {case["scenario_class"] for case in cases}
    assert REQUIRED_FAMILY_SIZES.issubset(family_sizes)
    assert REQUIRED_AGE_BANDS.issubset(age_bands)
    assert REQUIRED_SCENARIO_CLASSES.issubset(scenario_classes)


def test_phase0_current_behavior_baseline_contracts() -> None:
    for case in _load_cases():
        result = _evaluate_case(case)
        expected = case.get("expected_current")
        if expected is None:
            assert result.get("feedback_payload_valid") is True
            continue
        assert result["route_kind"] == expected["route_kind"]
        assert result["memory_target"] == expected.get("memory_target")
        assert result["memory_inference_signal"] == expected["memory_inference_signal"]
        min_action_count = expected.get("min_action_count")
        if min_action_count is not None:
            assert result["action_count"] >= int(min_action_count)
        max_action_count = expected.get("max_action_count")
        if max_action_count is not None:
            assert result["action_count"] <= int(max_action_count)
        starts = expected.get("assistant_starts_with")
        if starts:
            assert result["assistant_preview"].startswith(starts)


def test_phase0_report_generation_for_phase1_gates() -> None:
    report_rows = [_evaluate_case(case) for case in _load_cases()]
    guidance_rows = [
        row for row in report_rows if row.get("guidance_contract") is not None
    ]
    assert guidance_rows
    # Baseline only: this floor keeps the harness useful without enforcing final UX target yet.
    for row in guidance_rows:
        assert 0 <= row["guidance_contract"]["score"] <= 7
    REPORT_PATH.write_text(
        json.dumps({"version": "phase0-v1", "results": report_rows}, indent=2),
        encoding="utf-8",
    )
    assert REPORT_PATH.exists()
