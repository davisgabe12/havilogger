from __future__ import annotations

import app.router as router_module
from app.main import _resolve_route_contract
from app.router import classify_intent


def test_openai_classifier_overrides_low_confidence_ambiguous_intent(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_OPENAI_INTENT_CLASSIFIER", "1")

    called = {"count": 0}

    def fake_classifier(message: str, *, allowed_intents: list[str]):
        called["count"] += 1
        assert message == "not sure what to do tonight"
        assert "health_sleep_question" in allowed_intents
        return {
            "intent": "health_sleep_question",
            "confidence": 0.91,
            "reason": "model saw clear behavior-help framing",
        }

    monkeypatch.setattr(router_module, "classify_intent_with_openai", fake_classifier)
    result = classify_intent("not sure what to do tonight")

    assert called["count"] == 1
    assert result.intent == "health_sleep_question"
    assert result.confidence == 0.91
    assert any(
        reason.startswith("openai_classifier_override")
        for reason in result.reasons
    )


def test_openai_classifier_not_called_for_high_confidence_logging(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_OPENAI_INTENT_CLASSIFIER", "1")

    called = {"count": 0}

    def fake_classifier(message: str, *, allowed_intents: list[str]):
        called["count"] += 1
        return {
            "intent": "general_parenting_advice",
            "confidence": 0.95,
            "reason": "should never be used in this case",
        }

    monkeypatch.setattr(router_module, "classify_intent_with_openai", fake_classifier)
    result = classify_intent("baby pooped at 3pm")

    assert result.intent == "logging"
    assert called["count"] == 0


def test_route_contract_marks_model_decision_source_on_classifier_override(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_OPENAI_INTENT_CLASSIFIER", "1")

    def fake_classifier(message: str, *, allowed_intents: list[str]):
        return {
            "intent": "health_sleep_question",
            "confidence": 0.88,
            "reason": "behavior support request",
        }

    monkeypatch.setattr(router_module, "classify_intent_with_openai", fake_classifier)
    _, decision, route_metadata = _resolve_route_contract("not sure what to do tonight")

    assert decision.decision_source == "model"
    assert route_metadata.decision_source == "model"
