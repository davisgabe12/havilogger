from __future__ import annotations

from app.main import (
    _action_from_segment,
    _is_question,
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
