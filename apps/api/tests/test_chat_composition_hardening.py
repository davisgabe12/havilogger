from __future__ import annotations

from app.main import (
    _action_from_segment,
    _split_message_into_events,
    build_assistant_message,
    describe_action,
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
    assert "wake windows" in lower
    assert "baby pooped at 3pm" not in lower
