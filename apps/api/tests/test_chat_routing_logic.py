from __future__ import annotations

from app.main import (
    _action_from_segment,
    _is_question,
    _route_decision_for_message,
    _should_route_to_guidance,
    build_assistant_message,
    classify_question_category,
    message_symptom_tags,
)
from app.router import classify_intent


def test_hits_without_question_mark_routes_to_guidance() -> None:
    message = "my toddler hits sometimes"
    intent_result = classify_intent(message)
    should_route = _should_route_to_guidance(
        is_question=_is_question(message),
        intent_name=intent_result.intent,
    )

    assert should_route

    assistant_message, _ = build_assistant_message(
        [],
        message,
        child_data={"first_name": "Noah"},
        context={
            "intent": intent_result.intent,
            "question_category": classify_question_category(message, message_symptom_tags(message)),
            "symptom_tags": message_symptom_tags(message),
            "recent_actions": [],
        },
    )
    lower = assistant_message.lower()
    assert "stay calm" in lower
    assert "gentle hands" in lower


def test_gibberish_routes_to_guidance_fallback_not_logging() -> None:
    message = "asdf qwer zzzz"
    intent_result = classify_intent(message)
    should_route = _should_route_to_guidance(
        is_question=_is_question(message),
        intent_name=intent_result.intent,
    )

    assert should_route

    assistant_message, _ = build_assistant_message(
        [],
        message,
        child_data={"first_name": "Noah"},
        context={
            "intent": intent_result.intent,
            "question_category": "generic",
            "symptom_tags": [],
            "recent_actions": [],
        },
    )
    assert "I’m not sure I caught that" in assistant_message
    assert "logged" not in assistant_message.lower()


def test_plain_event_routes_to_logging_message_shape() -> None:
    message = "baby pooped at 3pm"
    intent_result = classify_intent(message)
    should_route = _should_route_to_guidance(
        is_question=_is_question(message),
        intent_name=intent_result.intent,
    )

    assert not should_route

    action = _action_from_segment(message, timezone_value="America/Los_Angeles")
    assistant_message, _ = build_assistant_message(
        [action],
        message,
        child_data={"first_name": "Noah", "timezone": "America/Los_Angeles"},
        context={
            "intent": "logging",
            "symptom_tags": [],
            "question_category": "generic",
            "recent_actions": [action],
        },
    )
    assert assistant_message.startswith("Logged:")


def test_route_decision_marks_mixed_when_log_clause_and_question_clause_coexist() -> None:
    message = "baby pooped at 3pm, what should i do if he is waking at night?"
    intent_result = classify_intent(message)

    decision = _route_decision_for_message(message, intent_result.intent)

    assert decision.route_kind == "mixed"
    assert decision.user_intent == "mixed"
    assert decision.mixed_logging_segments == ["baby pooped at 3pm"]


def test_route_decision_keeps_question_when_logging_signal_is_inside_question() -> None:
    message = "what should i do if he pooped at 3pm and is still fussy?"
    intent_result = classify_intent(message)

    decision = _route_decision_for_message(message, intent_result.intent)

    assert decision.route_kind == "ask"
    assert decision.user_intent == "question"
    assert decision.mixed_logging_segments == []


def test_route_decision_marks_task_before_mixed() -> None:
    message = "remind me to call the pediatrician after nap"
    intent_result = classify_intent(message)

    decision = _route_decision_for_message(message, intent_result.intent)

    assert decision.route_kind == "task"
    assert decision.user_intent == "task"
