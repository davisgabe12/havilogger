from __future__ import annotations

from fastapi.testclient import TestClient

from app.db import ensure_default_profiles, get_connection, get_primary_child_id
from app.main import app
from .conversation_helpers import create_conversation, with_conversation
from .test_conversation_cases import seed_profile, DEFAULT_PROFILE

client = TestClient(app)


def reset_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        for table in [
            "activity_logs",
            "conversation_messages",
            "conversation_sessions",
            "share_links",
            "tasks",
            "knowledge_items",
        ]:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()


def test_conversation_continue_new_share_tasks_memory(monkeypatch) -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()

    monkeypatch.setattr("app.main.generate_actions", lambda message, knowledge_context=None: [])

    conversation_a = create_conversation(client, child_id=child_id)
    conversation_b = create_conversation(client, child_id=child_id)
    assert conversation_a != conversation_b

    first_message = {
        "message": "Log a diaper change at 2pm",
        "child_id": child_id,
    }
    resp = client.post(
        "/api/v1/activities",
        json=with_conversation(first_message, conversation_id=conversation_a),
    )
    assert resp.status_code == 200

    follow_up = client.post(
        "/api/v1/activities",
        json=with_conversation({"message": "And a bottle at 3pm", "child_id": child_id}, conversation_id=conversation_a),
    )
    assert follow_up.status_code == 200

    resp_b = client.post(
        "/api/v1/activities",
        json=with_conversation({"message": "Started a new chat", "child_id": child_id}, conversation_id=conversation_b),
    )
    assert resp_b.status_code == 200

    messages_resp = client.get(f"/api/v1/conversations/{conversation_a}/messages")
    assert messages_resp.status_code == 200
    assert len(messages_resp.json()) >= 2

    share_a = client.post("/api/v1/share/conversation", json={"session_id": conversation_a})
    assert share_a.status_code == 200
    token_a = share_a.json()["token"]

    share_b = client.post("/api/v1/share/conversation", json={"session_id": conversation_b})
    assert share_b.status_code == 200
    token_b = share_b.json()["token"]

    fetch_a = client.get(f"/api/v1/share/{token_a}")
    fetch_b = client.get(f"/api/v1/share/{token_b}")
    assert fetch_a.status_code == 200
    assert fetch_b.status_code == 200
    assert fetch_a.json()["session_id"] == conversation_a
    assert fetch_b.json()["session_id"] == conversation_b

    task_resp_a = client.post(
        "/api/v1/activities",
        json=with_conversation(
            {"message": "Remind me to call the pediatrician tomorrow", "child_id": child_id},
            conversation_id=conversation_a,
        ),
    )
    task_resp_b = client.post(
        "/api/v1/activities",
        json=with_conversation(
            {"message": "I need to book the swim class", "child_id": child_id},
            conversation_id=conversation_b,
        ),
    )
    assert task_resp_a.status_code == 200
    assert task_resp_b.status_code == 200

    tasks = client.get("/api/v1/tasks", params={"view": "open", "child_id": child_id})
    assert tasks.status_code == 200
    assert len(tasks.json()) >= 2

    memory_a = client.post(
        "/api/v1/activities",
        json=with_conversation(
            {"message": "Remember this: we want a bedtime routine at 7pm.", "child_id": child_id},
            conversation_id=conversation_a,
        ),
    )
    memory_b = client.post(
        "/api/v1/activities",
        json=with_conversation(
            {"message": "Remember this: only use fragrance-free lotion.", "child_id": child_id},
            conversation_id=conversation_b,
        ),
    )
    assert memory_a.status_code == 200
    assert memory_b.status_code == 200

    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*) FROM knowledge_items").fetchone()
    assert row is not None
    assert int(row[0]) >= 1
