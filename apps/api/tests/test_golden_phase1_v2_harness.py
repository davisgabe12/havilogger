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

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "golden_chat_cases_phase1_v2.json"
REPORT_PATH = Path("/tmp/havi_phase1_v2_golden_report.json")

REQUIRED_SCENARIO_CLASSES = {
    "answer_first_guidance",
    "long_open_ended_guidance_plan",
    "sleep_early_wake_plan",
    "behavior_hitting_plan",
    "mixed_log_plus_guidance",
    "known_age_no_age_question",
    "assumptions_and_followup",
}

_PHASE1_THRESHOLDS = {
    "guidance_contract_pass_rate": 0.95,
    "average_guidance_score": 6.0,
    "min_guidance_score": 5.0,
    "known_age_reask_violation_rate": 0.0,
}

_AGE_QUESTION_RE = re.compile(
    r"(how old|what age|weeks old|months old|old is (?:he|she|baby)|age\?)",
    re.IGNORECASE,
)


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


def _count_numbered_steps(reply: str) -> int:
    return len(re.findall(r"(^|\n)\s*\d+[\.)]\s+", reply, re.MULTILINE))


def _guidance_contract_signals(
    *,
    reply: str,
    scenario_class: str,
    known_age_context: bool,
    requires_assumptions: bool,
) -> Dict[str, Any]:
    text = (reply or "").strip()
    lower = text.lower()
    first_window = lower[:220]
    question_count = text.count("?")
    step_count = _count_numbered_steps(text)

    empathy_tokens = (
        "that sounds",
        "that's hard",
        "this is hard",
        "you are not alone",
        "you're not alone",
        "that is exhausting",
        "this is exhausting",
        "totally understandable",
    )
    assumption_tokens = (
        "assumption",
        "i'm assuming",
        "i am assuming",
        "based on what you shared",
        "if i'm off",
        "if i am off",
    )
    invite_tokens = (
        "tell me",
        "reply with",
        "want me to",
        "if you share",
        "send me",
    )

    asks_age_again = bool(_AGE_QUESTION_RE.search(text))

    checks = {
        "has_empathy_opening": any(token in first_window for token in empathy_tokens),
        "has_immediate_plan_steps": step_count >= 3,
        "asks_age_only_when_missing_context": not (known_age_context and asks_age_again),
        "has_assumptions_when_uncertain": (not requires_assumptions)
        or any(token in lower for token in assumption_tokens),
        "follow_up_question_limit_ok": question_count <= 2,
        "has_next_turn_invite": any(token in lower for token in invite_tokens),
        "starts_with_logged_confirmation": text.startswith("Logged:"),
    }

    required_checks = {
        "has_empathy_opening",
        "has_immediate_plan_steps",
        "asks_age_only_when_missing_context",
        "has_assumptions_when_uncertain",
        "follow_up_question_limit_ok",
        "has_next_turn_invite",
    }
    if scenario_class == "mixed_log_plus_guidance":
        required_checks.add("starts_with_logged_confirmation")

    passed = all(checks[name] for name in required_checks)
    score = sum(1 for value in checks.values() if value)
    return {
        "checks": checks,
        "required_checks": sorted(required_checks),
        "pass": passed,
        "score": score,
        "question_count": question_count,
        "step_count": step_count,
        "known_age_reask_violation": bool(known_age_context and asks_age_again),
    }


def _evaluate_case(case: Dict[str, Any]) -> Dict[str, Any]:
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

    guidance_contract = _guidance_contract_signals(
        reply=assistant_text,
        scenario_class=case["scenario_class"],
        known_age_context=bool(case.get("known_age_context")),
        requires_assumptions=bool(case.get("requires_assumptions")),
    )

    return {
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
        "assistant_preview": assistant_text[:320],
        "guidance_contract": guidance_contract,
    }


def _phase1_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    guidance_rows = [row for row in rows if isinstance(row.get("guidance_contract"), dict)]
    if not guidance_rows:
        return {
            "guidance_contract_pass_rate": 0.0,
            "average_guidance_score": 0.0,
            "min_guidance_score": 0.0,
            "known_age_reask_violation_rate": 0.0,
        }

    pass_count = sum(1 for row in guidance_rows if row["guidance_contract"].get("pass"))
    scores = [float(row["guidance_contract"].get("score", 0.0)) for row in guidance_rows]
    known_age_violations = sum(
        1
        for row in guidance_rows
        if row["guidance_contract"].get("known_age_reask_violation")
    )

    return {
        "guidance_contract_pass_rate": round(pass_count / len(guidance_rows), 4),
        "average_guidance_score": round(sum(scores) / len(scores), 2),
        "min_guidance_score": round(min(scores), 2),
        "known_age_reask_violation_rate": round(known_age_violations / len(guidance_rows), 4),
    }


def test_phase1_v2_dataset_coverage_requirements() -> None:
    cases = _load_cases()
    assert cases
    scenario_classes = {case["scenario_class"] for case in cases}
    assert REQUIRED_SCENARIO_CLASSES.issubset(scenario_classes)


def test_phase1_v2_behavior_contracts() -> None:
    rows: List[Dict[str, Any]] = []
    for case in _load_cases():
        result = _evaluate_case(case)
        rows.append(result)

        expected = case.get("expected_current") or {}
        assert result["route_kind"] == expected.get("route_kind")
        assert result["memory_target"] == expected.get("memory_target")
        assert result["memory_inference_signal"] == expected.get("memory_inference_signal")

        min_action_count = expected.get("min_action_count")
        if min_action_count is not None:
            assert result["action_count"] >= int(min_action_count)
        max_action_count = expected.get("max_action_count")
        if max_action_count is not None:
            assert result["action_count"] <= int(max_action_count)

        starts = expected.get("assistant_starts_with")
        if starts:
            assert result["assistant_preview"].startswith(starts)

    ask_write_violations = [
        row["id"]
        for row in rows
        if row["route_kind"] == "ask" and int(row.get("action_count") or 0) > 0
    ]
    assert not ask_write_violations

    mixed_prefix_violations = [
        row["id"]
        for row in rows
        if row["scenario_class"] == "mixed_log_plus_guidance"
        and not row["guidance_contract"]["checks"].get("starts_with_logged_confirmation")
    ]
    assert not mixed_prefix_violations

    age_reask_violations = [
        row["id"]
        for row in rows
        if row["guidance_contract"].get("known_age_reask_violation")
    ]
    assert not age_reask_violations

    phase1_summary = _phase1_summary(rows)
    assert phase1_summary["guidance_contract_pass_rate"] >= _PHASE1_THRESHOLDS["guidance_contract_pass_rate"]
    assert phase1_summary["average_guidance_score"] >= _PHASE1_THRESHOLDS["average_guidance_score"]
    assert phase1_summary["min_guidance_score"] >= _PHASE1_THRESHOLDS["min_guidance_score"]
    assert phase1_summary["known_age_reask_violation_rate"] <= _PHASE1_THRESHOLDS["known_age_reask_violation_rate"]


def test_phase1_v2_report_generation() -> None:
    report_rows = [_evaluate_case(case) for case in _load_cases()]
    payload = {
        "version": "phase1-v2",
        "thresholds": _PHASE1_THRESHOLDS,
        "summary": _phase1_summary(report_rows),
        "results": report_rows,
    }
    REPORT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    assert REPORT_PATH.exists()
