from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import ensure_default_profiles, get_connection, get_primary_child_id
from .conversation_helpers import create_conversation, with_conversation


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


def test_gibberish_message_uses_fallback_not_error(monkeypatch: pytest.MonkeyPatch) -> None:
    child_id = get_primary_child_id()
    conversation_id = create_conversation(client, child_id=child_id)

    # Avoid real OpenAI calls: no actions returned.
    monkeypatch.setattr("app.main.generate_actions", lambda message, knowledge_context=None: [])

    resp = client.post(
        "/api/v1/activities",
        json=with_conversation({"message": "asdf qwer zzzz", "child_id": child_id}, conversation_id=conversation_id),
    )
    assert resp.status_code == 200
    data = resp.json()
    assistant = data.get("assistant_message") or ""
    assert assistant  # we expect some message
    # Fallback copy should be present and not look like an error.
    assert "Error composing response [E_COMPOSE]:" not in assistant
    assert (
        "I’m not sure I caught that—tell me what happened and what you want (log it or get guidance), and I’ll take it from there."
        in assistant
    )


def test_stage_guidance_error_surfaces_as_error_message(monkeypatch: pytest.MonkeyPatch) -> None:
    child_id = get_primary_child_id()
    conversation_id = create_conversation(client, child_id=child_id)

    monkeypatch.setattr("app.main.generate_actions", lambda message, knowledge_context=None: [])
    monkeypatch.delenv("HAVI_SHOW_ERROR_DETAILS", raising=False)

    def boom(*_args, **_kwargs) -> str:
        raise RuntimeError("stage boom")

    monkeypatch.setattr("app.main.stage_guidance", boom)

    resp = client.post(
        "/api/v1/activities",
        json=with_conversation(
            {"message": "what should I expect", "child_id": child_id},
            conversation_id=conversation_id,
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assistant = data.get("assistant_message") or ""
    assert assistant.startswith("Error composing response [E_COMPOSE]:")
    assert "stage boom" in assistant


def test_error_detail_toggle_off_hides_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    child_id = get_primary_child_id()
    conversation_id = create_conversation(client, child_id=child_id)

    monkeypatch.setattr("app.main.generate_actions", lambda message, knowledge_context=None: [])
    monkeypatch.setenv("HAVI_SHOW_ERROR_DETAILS", "0")

    def boom(*_args, **_kwargs) -> str:
        raise RuntimeError("stage boom")

    monkeypatch.setattr("app.main.stage_guidance", boom)

    resp = client.post(
        "/api/v1/activities",
        json=with_conversation(
            {"message": "what should I expect", "child_id": child_id},
            conversation_id=conversation_id,
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assistant = data.get("assistant_message") or ""
    assert assistant.startswith("Error composing response [E_COMPOSE]:")
    assert "internal error" in assistant
    assert "stage boom" not in assistant


def test_logging_intent_does_not_use_fallback_or_error(monkeypatch: pytest.MonkeyPatch) -> None:
    child_id = get_primary_child_id()
    conversation_id = create_conversation(client, child_id=child_id)

    # No actions from the model; logging path should still produce a concise confirmation.
    monkeypatch.setattr("app.main.generate_actions", lambda message, knowledge_context=None: [])

    resp = client.post(
        "/api/v1/activities",
        json=with_conversation(
            {"message": "dirty diaper at 2pm", "child_id": child_id},
            conversation_id=conversation_id,
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assistant = data.get("assistant_message") or ""
    lower = assistant.lower()
    assert "logged" in lower
    assert not assistant.startswith("Error composing response [E_COMPOSE]:")
    assert (
        "I’m not sure I caught that—tell me what happened and what you want (log it or get guidance), and I’ll take it from there."
        not in assistant
    )


def test_symptom_guidance_generic_line_updated(monkeypatch: pytest.MonkeyPatch) -> None:
    child_id = get_primary_child_id()
    conversation_id = create_conversation(client, child_id=child_id)

    # Avoid real OpenAI calls: no actions returned.
    monkeypatch.setattr("app.main.generate_actions", lambda message, knowledge_context=None: [])

    resp = client.post(
        "/api/v1/activities",
        json=with_conversation(
            {"message": "Is our routine okay overall?", "child_id": child_id},
            conversation_id=conversation_id,
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assistant = data.get("assistant_message") or ""
    # New generic symptom follow-up should be present when there are no symptom tags.
    assert (
        "If you share what feels most different or what you’re hoping for help with, I can turn it into clear next steps."
        in assistant
    )
    # Old generic line should not appear anymore.
    assert "I’m here for follow-up questions—just say the word." not in assistant
