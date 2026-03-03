from __future__ import annotations

from app.main import _is_question, classify_question_category


def test_is_question_detects_implicit_guidance_prompt() -> None:
    assert _is_question("what should i do if he is waking at night")


def test_is_question_keeps_plain_log_as_non_question() -> None:
    assert not _is_question("baby pooped at 3pm")


def test_classify_question_category_treats_waking_as_sleep() -> None:
    assert (
        classify_question_category("what should i do if he is waking at night", symptom_tags=[])
        == "sleep"
    )
