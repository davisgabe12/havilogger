from __future__ import annotations

from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from app.context_pack import build_message_context
from app.conversations import CreateMessagePayload, append_message, create_session
from app.db import ensure_default_profiles, get_connection, get_primary_child_id
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        for table in [
            "conversation_messages",
            "conversation_sessions",
            "activity_logs",
            "inferences",
            "knowledge_items",
            "timeline_events",
        ]:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()


def test_build_message_context_respects_message_limit() -> None:
    session = create_session(user_id=None, child_id=get_primary_child_id())
    messages = [
        ("user", "First"),
        ("assistant", "Second"),
        ("user", "Third"),
    ]
    for role, content in messages:
        append_message(
            CreateMessagePayload(
                session_id=session.id,
                role=role,
                content=content,
                intent="log",
            )
        )

    context_pack = build_message_context(session.id, max_messages=2, budget_tokens=2000)

    assert len(context_pack["messages"]) == 2
    assert len(context_pack["omissions"]) == 1
    assert context_pack["omissions"][0]["reason"] == "budget"


def test_build_message_context_summarizes_last_assistant_over_budget() -> None:
    session = create_session(user_id=None, child_id=get_primary_child_id())
    long_message = "Sources:\n" + ("A" * 2000)
    append_message(
        CreateMessagePayload(
            session_id=session.id,
            role="assistant",
            content=long_message,
            intent="log",
        )
    )
    append_message(
        CreateMessagePayload(
            session_id=session.id,
            role="user",
            content="What are your sources?",
            intent="log",
        )
    )

    context_pack = build_message_context(session.id, max_messages=5, budget_tokens=50)

    assistant_messages = [msg for msg in context_pack["messages"] if msg["role"] == "assistant"]
    assert assistant_messages
    assert "truncated" in assistant_messages[0]["content"]
    assert any(
        omission["reason"] == "replaced_by_summary" for omission in context_pack["omissions"]
    )


def test_context_pack_includes_prior_assistant_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    child_id = get_primary_child_id()
    session = create_session(user_id=None, child_id=child_id)
    append_message(
        CreateMessagePayload(
            session_id=session.id,
            role="assistant",
            content="Here is a summary.\n\nSources:\n- AAP\n- CDC",
            intent="log",
        )
    )

    captured_context: List[Dict[str, Any]] = []

    def fake_generate_actions(message: str, **kwargs):
        captured_context.extend(kwargs.get("context_messages") or [])
        return []

    monkeypatch.setattr("app.main.generate_actions", fake_generate_actions)

    response = client.post(
        "/api/v1/activities",
        json={
            "message": "What are your sources?",
            "child_id": child_id,
            "conversation_id": session.id,
        },
    )
    assert response.status_code == 200
    assert any("Sources" in msg.get("content", "") for msg in captured_context)
