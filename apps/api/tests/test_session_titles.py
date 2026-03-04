from __future__ import annotations

from app.session_titles import build_session_title_snippet, ensure_unique_session_title


def test_build_session_title_snippet_logging_message() -> None:
    assert build_session_title_snippet("Baby pooped at 3pm") == "Baby pooped 3pm"


def test_build_session_title_snippet_guidance_message() -> None:
    assert (
        build_session_title_snippet("What should I do if he is waking at night?")
        == "He waking night"
    )


def test_build_session_title_snippet_mixed_uses_first_clause() -> None:
    assert (
        build_session_title_snippet("Baby pooped at 3pm, what should I do tonight?")
        == "Baby pooped 3pm"
    )


def test_build_session_title_snippet_multi_event_message() -> None:
    assert (
        build_session_title_snippet("Baby pooped and had bottle at 3pm")
        == "Baby pooped had bottle 3pm"
    )


def test_build_session_title_snippet_weak_message_falls_back_to_chat() -> None:
    assert build_session_title_snippet("ok") == "Chat"


def test_build_session_title_snippet_removes_noise() -> None:
    assert build_session_title_snippet("😴😴 nap felt really rough!!!") == "Nap felt really rough"


def test_ensure_unique_session_title_suffixes_collisions() -> None:
    titles = [
        "Baby pooped 3pm · Mar 4, 2026",
        "Baby pooped 3pm · Mar 4, 2026 · 2",
    ]
    assert (
        ensure_unique_session_title("Baby pooped 3pm · Mar 4, 2026", titles)
        == "Baby pooped 3pm · Mar 4, 2026 · 3"
    )

