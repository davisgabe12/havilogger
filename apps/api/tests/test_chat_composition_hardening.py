from __future__ import annotations

from app.main import (
    _action_from_segment,
    _compose_assistant_reply_for_route,
    _extract_logging_segments_for_mixed,
    _split_message_into_events,
    build_assistant_message,
    describe_action,
)
from app.router import classify_intent
from app.schemas import CoreActionType


def test_split_message_into_events_splits_sentence_boundaries() -> None:
    parts = _split_message_into_events("baby napped at 8:30am. bath at 8pm")
    assert len(parts) == 2
    assert parts[0] == "baby napped at 8:30am."
    assert parts[1] == "bath at 8pm"


def test_describe_action_avoids_raw_note_echo() -> None:
    segment = "baby pooped at 3pm"
    action = _action_from_segment(segment, timezone_value="America/Los_Angeles")
    described = describe_action(action, timezone_pref="America/Los_Angeles")
    assert described != segment
    assert "dirty diaper" in described.lower()


def test_mixed_intent_reply_keeps_logged_confirmation_and_guidance() -> None:
    message = "baby pooped at 3pm. what should i do if he is waking at night?"
    actions = [_action_from_segment("baby pooped at 3pm", timezone_value="America/Los_Angeles")]
    assistant_message, _ = build_assistant_message(
        actions,
        message,
        child_data={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        context={
            "intent": "mixed",
            "question_category": "sleep",
            "symptom_tags": [],
            "recent_actions": actions,
        },
    )
    lower = assistant_message.lower()
    assert assistant_message.startswith("Logged:")
    assert "wake windows" in lower
    assert "baby pooped at 3pm" not in lower


def test_extract_logging_segments_for_mixed_splits_question_clause() -> None:
    message = "baby pooped at 3pm, what should i do if he is waking at night?"
    assert _extract_logging_segments_for_mixed(message) == ["baby pooped at 3pm"]


def test_mixed_logging_segment_parses_diaper_not_question_sleep() -> None:
    message = "baby pooped at 3pm, what should i do if he is waking at night?"
    segments = _extract_logging_segments_for_mixed(message)
    action = _action_from_segment(segments[0], timezone_value="America/Los_Angeles")
    assert action.action_type == CoreActionType.DIAPER_POOP


def test_extract_logging_segments_for_mixed_ignores_pure_question() -> None:
    message = "what should i do if he pooped at 3pm and is still fussy?"
    assert _extract_logging_segments_for_mixed(message) == []


def test_ack_phrase_no_all_good_is_not_echoed_verbatim() -> None:
    message = "no, all good."
    intent = classify_intent(message).intent
    assistant_message, _ = build_assistant_message(
        [],
        message,
        child_data={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        context={
            "intent": intent,
            "question_category": "generic",
            "symptom_tags": [],
            "recent_actions": [],
        },
    )
    assert assistant_message.strip().lower() != message


def test_ack_phrase_okay_thanks_is_not_echoed_verbatim() -> None:
    message = "okay thanks"
    intent = classify_intent(message).intent
    assistant_message, _ = build_assistant_message(
        [],
        message,
        child_data={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        context={
            "intent": intent,
            "question_category": "generic",
            "symptom_tags": [],
            "recent_actions": [],
        },
    )
    assert assistant_message.strip().lower() != message


def test_compose_assistant_reply_for_route_returns_mixed_intent_and_logged_prefix() -> None:
    message = "baby pooped at 3pm. what should i do if he is waking at night?"
    actions = [_action_from_segment("baby pooped at 3pm", timezone_value="America/Los_Angeles")]
    assistant_message, _, intent = _compose_assistant_reply_for_route(
        route_kind="mixed",
        classifier_intent="logging",
        actions=actions,
        message=message,
        child_row={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        symptom_tags=[],
        question_category="sleep",
    )
    assert intent == "mixed"
    assert assistant_message.startswith("Logged:")


def test_compose_assistant_reply_for_route_uses_openai_guidance_for_ask(monkeypatch) -> None:
    def fake_compose_guidance(*args, **kwargs):
        return "## Model guidance\n\n1. Step one."

    monkeypatch.setattr("app.main.compose_guidance_with_openai", fake_compose_guidance)
    assistant_message, _, intent = _compose_assistant_reply_for_route(
        route_kind="ask",
        classifier_intent="general_parenting_advice",
        actions=[],
        message="my child is hitting, what should i do?",
        child_row={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        symptom_tags=["hitting"],
        question_category="behavior",
    )
    assert assistant_message.startswith("## Model guidance")
    assert intent == "question"


def test_compose_assistant_reply_for_route_falls_back_when_openai_guidance_disabled(monkeypatch) -> None:
    monkeypatch.setattr("app.main.compose_guidance_with_openai", lambda *args, **kwargs: None)
    assistant_message, _, intent = _compose_assistant_reply_for_route(
        route_kind="ask",
        classifier_intent="general_parenting_advice",
        actions=[],
        message="my child is hitting, what should i do?",
        child_row={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        symptom_tags=["hitting"],
        question_category="behavior",
    )
    assert assistant_message
    assert "model guidance" not in assistant_message.lower()
    assert intent == "question"
