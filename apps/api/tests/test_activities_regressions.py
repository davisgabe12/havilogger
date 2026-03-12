from __future__ import annotations

from app.main import (
    ContextPack,
    _action_from_segment,
    _compose_assistant_reply_for_route,
    _route_decision_for_message,
    classify_question_category,
    message_symptom_tags,
)
from app.router import classify_intent

BANNED_PHRASES = [
    "before we continue",
    "i captured what you shared",
    "to personalize expectations",
    "due date",
    "gender",
    "share them here",
    "remember",
]

BANNED_MEMORY_PHRASES = [
    "keep looking for patterns",
    "tiny details teach me",
    "helps me learn what works",
    "captured what you shared",
]

GUIDANCE_MARKERS = ["hitting", "gentle hands", "stay calm"]


def _context_pack() -> ContextPack:
    return ContextPack(
        family_id="family-test",
        child_id="child-test",
        session_id="session-test",
        messages=[],
        has_prior_messages=False,
        child_profile={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        age_weeks=40,
        active_knowledge=[],
        pending_knowledge=[],
    )


def _compose(message: str):
    intent_name = classify_intent(message).intent
    route_decision = _route_decision_for_message(message, intent_name)
    symptom_tags = message_symptom_tags(message)
    question_category = classify_question_category(message, symptom_tags)
    actions = []
    if route_decision.route_kind in {"log", "mixed"}:
        segments = route_decision.mixed_logging_segments or [message]
        actions = [_action_from_segment(segment, timezone_value="America/Los_Angeles") for segment in segments]
    composed = _compose_assistant_reply_for_route(
        route_kind=route_decision.route_kind,
        classifier_intent=intent_name,
        actions=actions,
        message=message,
        child_row={"first_name": "Lev", "timezone": "America/Los_Angeles"},
        context_pack=_context_pack(),
        symptom_tags=symptom_tags,
        question_category=question_category,
    )
    return route_decision, composed


def assert_no_gating(message: str) -> None:
    lower = message.lower()
    for phrase in BANNED_PHRASES:
        assert phrase not in lower
    for phrase in BANNED_MEMORY_PHRASES:
        assert phrase not in lower


def test_non_logging_advice_is_not_gated() -> None:
    route, composed = _compose("baby is hitting, is that normal")
    assert route.route_kind == "ask"
    assert composed.intent == "question"
    assert composed.assistant_text
    assert_no_gating(composed.assistant_text)
    assert "logged" not in composed.assistant_text.lower()


def test_aggression_synonyms_trigger_guidance() -> None:
    messages = [
        "my baby smacked me, is that normal",
        "my toddler hits sometimes",
    ]
    for text in messages:
        route, composed = _compose(text)
        assert route.route_kind == "ask"
        guidance_lower = composed.assistant_text.lower()
        assert any(marker in guidance_lower for marker in GUIDANCE_MARKERS)
        assert_no_gating(composed.assistant_text)
        assert "logged" not in guidance_lower


def test_logging_reply_stays_minimal() -> None:
    route, composed = _compose("woke at 3am")
    assert route.route_kind == "log"
    assert composed.intent == "logging"
    assert composed.assistant_text.startswith("Logged:")
    assert "\n" not in composed.assistant_text
    assert_no_gating(composed.assistant_text)
