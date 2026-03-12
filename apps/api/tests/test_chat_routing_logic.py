from __future__ import annotations

from app.main import (
    ROUTE_KIND_ASK,
    ROUTE_KIND_LOG,
    ROUTE_KIND_MEMORY_EXPLICIT,
    ROUTE_KIND_MEMORY_INFERRED,
    ROUTE_KIND_MIXED,
    ROUTE_KIND_TASK,
    _action_from_segment,
    _build_route_execution_plan,
    _build_route_write_policy,
    _is_question,
    _resolve_route_contract,
    _route_decision_for_message,
    _should_persist_activity_actions,
    _should_route_to_guidance,
    build_assistant_message,
    classify_question_category,
    message_symptom_tags,
)
from app.router import classify_intent
from app.schemas import ChatResponse


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

    assert decision.route_kind == ROUTE_KIND_MIXED
    assert decision.user_intent == "mixed"
    assert decision.mixed_logging_segments == ["baby pooped at 3pm"]


def test_route_decision_keeps_question_when_logging_signal_is_inside_question() -> None:
    message = "what should i do if he pooped at 3pm and is still fussy?"
    intent_result = classify_intent(message)

    decision = _route_decision_for_message(message, intent_result.intent)

    assert decision.route_kind == ROUTE_KIND_ASK
    assert decision.user_intent == "question"
    assert decision.mixed_logging_segments == []


def test_route_decision_marks_task_before_mixed() -> None:
    message = "remind me to call the pediatrician after nap"
    intent_result = classify_intent(message)

    decision = _route_decision_for_message(message, intent_result.intent)

    assert decision.route_kind == ROUTE_KIND_TASK
    assert decision.user_intent == "task"


def test_route_decision_marks_explicit_memory_route_kind() -> None:
    message = "save this to memory: she loves the yellow swaddle"
    intent_result = classify_intent(message)

    decision = _route_decision_for_message(message, intent_result.intent)

    assert decision.route_kind == ROUTE_KIND_MEMORY_EXPLICIT
    assert decision.user_intent == "memory"
    assert decision.route_to_guidance is False


def test_route_decision_marks_inferred_memory_route_kind() -> None:
    message = "he likes white noise before naps"
    intent_result = classify_intent(message)

    decision = _route_decision_for_message(message, intent_result.intent)

    assert decision.route_kind == ROUTE_KIND_MEMORY_INFERRED
    assert decision.user_intent == "memory"
    assert decision.memory_candidate is not None


def test_resolve_route_contract_exposes_structured_metadata() -> None:
    intent_result, decision, route_metadata = _resolve_route_contract(
        "baby pooped at 3pm, what should i do if he is waking at night?"
    )
    assert decision.route_kind == ROUTE_KIND_MIXED
    assert route_metadata.route_kind == ROUTE_KIND_MIXED
    assert route_metadata.classifier_intent == intent_result.intent
    assert route_metadata.decision_source == "rule"
    assert route_metadata.confidence == intent_result.confidence
    assert route_metadata.mixed_logging_segment_count == 1


def test_chat_response_serializes_route_metadata_contract() -> None:
    payload = ChatResponse(
        actions=[],
        raw_message="test",
        model="havi-local",
        latency_ms=12,
        route_metadata={
            "route_kind": ROUTE_KIND_ASK,
            "user_intent": "question",
            "classifier_intent": "general_parenting_advice",
            "decision_source": "rule",
            "confidence": 0.6,
            "is_question": True,
            "mixed_logging_segment_count": 0,
        },
    )
    assert payload.route_metadata is not None
    assert payload.route_metadata.route_kind == ROUTE_KIND_ASK
    assert payload.route_metadata.decision_source == "rule"
    assert "ui_nudges" not in payload.model_dump(mode="json")


def test_should_persist_activity_actions_policy() -> None:
    assert _should_persist_activity_actions(ROUTE_KIND_LOG) is True
    assert _should_persist_activity_actions(ROUTE_KIND_MIXED) is True
    assert _should_persist_activity_actions(ROUTE_KIND_ASK) is False
    assert _should_persist_activity_actions(ROUTE_KIND_TASK) is False
    assert _should_persist_activity_actions(ROUTE_KIND_MEMORY_EXPLICIT) is False
    assert _should_persist_activity_actions(ROUTE_KIND_MEMORY_INFERRED) is False


def test_build_route_execution_plan_sets_consistent_contract_fields() -> None:
    plan = _build_route_execution_plan("woke at 3am, is that normal?")
    assert plan.route_decision.route_kind == ROUTE_KIND_MIXED
    assert plan.route_metadata.route_kind == ROUTE_KIND_MIXED
    assert plan.user_intent == "mixed"
    assert plan.mixed_route is True
    assert plan.allow_activity_writes is True


def test_build_route_write_policy_respects_memory_and_task_controls() -> None:
    policy_memory = _build_route_write_policy(
        route_kind=ROUTE_KIND_ASK,
        classifier_intent="general_parenting_advice",
        has_memory_target=True,
    )
    assert policy_memory.allow_explicit_memory_writes is False
    assert policy_memory.allow_task_writes is False
    assert policy_memory.allow_timeline_activity_writes is False
    assert policy_memory.allow_inference_memory_writes is False

    policy_explicit_memory = _build_route_write_policy(
        route_kind=ROUTE_KIND_MEMORY_EXPLICIT,
        classifier_intent="saving",
        has_memory_target=True,
    )
    assert policy_explicit_memory.allow_explicit_memory_writes is True
    assert policy_explicit_memory.allow_timeline_activity_writes is False
    assert policy_explicit_memory.allow_inference_memory_writes is False

    policy_task = _build_route_write_policy(
        route_kind=ROUTE_KIND_TASK,
        classifier_intent="task_request",
        has_memory_target=False,
    )
    assert policy_task.allow_task_writes is True
    assert policy_task.allow_explicit_memory_writes is False
    assert policy_task.allow_timeline_activity_writes is False

    policy_inferred_memory = _build_route_write_policy(
        route_kind=ROUTE_KIND_MEMORY_INFERRED,
        classifier_intent="logging",
        has_memory_target=False,
    )
    assert policy_inferred_memory.allow_inference_memory_writes is True
    assert policy_inferred_memory.allow_timeline_activity_writes is False
