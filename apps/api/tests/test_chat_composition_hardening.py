from __future__ import annotations

from app.main import (
    ContextPack,
    _action_from_segment,
    _compose_assistant_reply_for_route,
    _extract_logging_segments_for_mixed,
    _split_message_into_events,
    build_assistant_message,
    describe_action,
)
from app.router import classify_intent
from app.schemas import CoreActionType


def _empty_context_pack() -> ContextPack:
    return ContextPack(
        family_id="family-test",
        child_id="child-test",
        session_id="session-test",
        messages=[],
        has_prior_messages=False,
        child_profile={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        age_weeks=18,
        active_knowledge=[],
        pending_knowledge=[],
    )


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
    assert "4am" in lower or "sleep time" in lower
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
    composed = _compose_assistant_reply_for_route(
        route_kind="mixed",
        classifier_intent="logging",
        actions=actions,
        message=message,
        child_row={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        context_pack=_empty_context_pack(),
        symptom_tags=[],
        question_category="sleep",
    )
    assert composed.intent == "mixed"
    assert composed.assistant_text.startswith("Logged:")


def test_compose_assistant_reply_for_route_uses_openai_guidance_for_ask(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_OPENAI_GUIDANCE_COMPOSER", "1")

    def fake_compose_guidance(*args, **kwargs):
        return (
            "That sounds hard, and you're not alone.\n\n"
            "Assumptions: based on what you shared, I'm assuming this is a recurring pattern.\n\n"
            "1. Step one.\n"
            "2. Step two.\n\n"
            "3. Step three.\n\n"
            "What not to do: avoid long lectures.\n\n"
            "Script: I won't let you hit.\n\n"
            "Tell me one trigger and I can tailor this plan."
        )

    monkeypatch.setattr("app.main.compose_guidance_with_openai", fake_compose_guidance)
    composed = _compose_assistant_reply_for_route(
        route_kind="ask",
        classifier_intent="general_parenting_advice",
        actions=[],
        message="my child is hitting, what should i do?",
        child_row={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        context_pack=_empty_context_pack(),
        symptom_tags=["hitting"],
        question_category="behavior",
    )
    assert composed.composer_source == "model"
    assert "What not to do" in composed.assistant_text
    assert composed.intent == "question"


def test_compose_assistant_reply_for_route_falls_back_when_openai_guidance_disabled(monkeypatch) -> None:
    monkeypatch.setattr("app.main.compose_guidance_with_openai", lambda *args, **kwargs: None)
    composed = _compose_assistant_reply_for_route(
        route_kind="ask",
        classifier_intent="general_parenting_advice",
        actions=[],
        message="my child is hitting, what should i do?",
        child_row={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        context_pack=_empty_context_pack(),
        symptom_tags=["hitting"],
        question_category="behavior",
    )
    assert composed.assistant_text
    assert "model guidance" not in composed.assistant_text.lower()
    assert composed.intent == "question"
    assert composed.composer_source == "rule"
    assert composed.composer_fallback_reason is not None


def test_compose_assistant_reply_for_route_uses_openai_guidance_for_mixed(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_OPENAI_GUIDANCE_COMPOSER", "1")
    monkeypatch.setattr(
        "app.main.compose_guidance_with_openai",
        lambda *args, **kwargs: (
            "That sounds hard, and you're not alone.\n\n"
            "Assumptions: based on what you shared, I'm assuming this is a recurring pattern.\n\n"
            "1. Step one.\n"
            "2. Step two.\n\n"
            "3. Step three.\n\n"
            "What not to do: avoid overreacting.\n\n"
            "Script: I won't let you hit.\n\n"
            "Tell me one trigger and I can tailor this plan."
        ),
    )
    actions = [_action_from_segment("baby pooped at 3pm", timezone_value="America/Los_Angeles")]
    composed = _compose_assistant_reply_for_route(
        route_kind="mixed",
        classifier_intent="logging",
        actions=actions,
        message="baby pooped at 3pm, what should i do if he keeps waking at night?",
        child_row={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        context_pack=_empty_context_pack(),
        symptom_tags=[],
        question_category="sleep",
    )
    assert composed.intent == "mixed"
    assert composed.assistant_text.startswith("Logged:")
    assert "What not to do" in composed.assistant_text
    assert composed.composer_source == "model"
