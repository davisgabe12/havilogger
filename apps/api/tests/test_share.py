from __future__ import annotations

from fastapi.testclient import TestClient

from app.conversations import CreateMessagePayload, append_message, create_session
from app.db import ensure_default_profiles, get_connection
from app.main import app

client = TestClient(app)


def reset_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        for table in ["share_links", "conversation_messages", "conversation_sessions"]:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()


def seed_session_with_messages():
    session = create_session(user_id=None, child_id=None)
    append_message(
        CreateMessagePayload(
            session_id=session.id,
            role="user",
            content="Can you log a diaper change?",
            intent="log",
        )
    )
    append_message(
        CreateMessagePayload(
            session_id=session.id,
            role="assistant",
            content="Logged it.",
            intent="log",
        )
    )
    return session


def test_share_round_trip() -> None:
    reset_state()
    session = seed_session_with_messages()

    create_resp = client.post("/api/v1/share/conversation", json={"session_id": session.id})
    assert create_resp.status_code == 200
    body = create_resp.json()
    token = body["token"]
    assert token

    with get_connection() as conn:
        row = conn.execute("SELECT session_id FROM share_links WHERE token = ?", (token,)).fetchone()
        assert row is not None
        assert row[0] == session.id

    fetch_resp = client.get(f"/api/v1/share/{token}")
    assert fetch_resp.status_code == 200
    data = fetch_resp.json()
    assert data["session_id"] == session.id
    assert len(data["messages"]) == 2
    assert data["messages"][0]["text"]
