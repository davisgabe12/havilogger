from __future__ import annotations

from fastapi.testclient import TestClient

from app.db import ensure_default_profiles, get_connection
from app.main import app

client = TestClient(app)


def reset_feedback_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        conn.execute("DELETE FROM message_feedback")
        conn.commit()


def test_message_feedback_upsert_by_user() -> None:
    reset_feedback_state()
    payload = {
        "conversation_id": "conv-123",
        "message_id": "msg-456",
        "user_id": "user-789",
        "rating": "up",
        "feedback_text": "Helpful response.",
        "model_version": "gpt-4",
        "response_metadata": {"latency_ms": 120},
    }

    create_resp = client.post("/api/v1/messages/feedback", json=payload)
    assert create_resp.status_code == 200
    created = create_resp.json()
    assert created["id"]
    assert created["rating"] == "up"
    assert created["feedback_text"] == "Helpful response."
    assert created["response_metadata"] == {"latency_ms": 120}

    update_payload = {**payload, "rating": "down", "feedback_text": "Not helpful."}
    update_resp = client.put("/api/v1/messages/feedback", json=update_payload)
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["id"] == created["id"]
    assert updated["rating"] == "down"
    assert updated["feedback_text"] == "Not helpful."

    with get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM message_feedback").fetchone()[0]
        assert count == 1


def test_message_feedback_upsert_by_session() -> None:
    reset_feedback_state()
    payload = {
        "conversation_id": "conv-abc",
        "message_id": "msg-def",
        "session_id": "session-123",
        "rating": "up",
    }

    create_resp = client.post("/api/v1/messages/feedback", json=payload)
    assert create_resp.status_code == 200
    created = create_resp.json()
    assert created["session_id"] == "session-123"
    assert created["rating"] == "up"

    update_resp = client.put(
        "/api/v1/messages/feedback",
        json={**payload, "rating": "down", "feedback_text": "Needs work."},
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["id"] == created["id"]
    assert updated["rating"] == "down"

    with get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM message_feedback").fetchone()[0]
        assert count == 1
