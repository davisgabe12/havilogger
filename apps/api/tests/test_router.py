from app.router import classify_intent, has_logging_signals


def test_router_examples() -> None:
    cases = [
        ("3pm today 2oz bottle", "logging"),
        ("Remember Noah hates broccoli", "saving"),
        ("Save this: Lev likes the Snoo at level 3", "saving"),
        ("6oz bottle at 3pm", "logging"),
        ("Next week we travel", "general_parenting_advice"),
        ("What milestones should a 20 month old hit?", "milestone_expectations"),
        ("Ideas for rainy day activities", "activity_request"),
        ("11 week old won't settle after transfer", "health_sleep_question"),
        ("Should we sleep train?", "health_sleep_question"),
        ("lol thanks", "chit_chat"),
    ]
    for message, expected in cases:
        result = classify_intent(message)
        assert result.intent == expected, f"{message} -> {result.intent}, expected {expected}"
        assert result.confidence > 0


def test_router_fallback() -> None:
    result = classify_intent("Tell me more")
    assert result.intent == "general_parenting_advice"
    assert result.confidence > 0


def test_has_logging_signals_detects_tracking_language() -> None:
    assert has_logging_signals("baby pooped at 3pm")
    assert has_logging_signals("6oz bottle at 2:30pm")
    assert not has_logging_signals("what should i do if he wakes at night")
