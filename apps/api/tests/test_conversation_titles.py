from __future__ import annotations

from fastapi.testclient import TestClient

from app.conversations import ensure_unique_title, generate_conversation_title
from app.db import ensure_default_profiles, get_connection, get_primary_child_id
from app.main import app

client = TestClient(app)


def reset_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        for table in ["conversation_messages", "conversation_sessions"]:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()


def test_conversation_creation_defaults_to_new_chat() -> None:
    reset_state()
    child_id = get_primary_child_id()
    resp = client.post("/api/v1/conversations", params={"child_id": child_id})
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["title"] == "New chat"


def test_generate_title_rules_enforced() -> None:
    title = generate_conversation_title("how should i start swimming for my baby")
    words = title.split()
    assert 3 <= len(words) <= 6
    assert title[0].isupper()
    assert title[1:].lower() == title[1:]
    assert not any(char.isdigit() for char in title)

    emoji_title = generate_conversation_title("Baby naps 😴 at 2pm")
    assert "😴" not in emoji_title
    assert not any(char.isdigit() for char in emoji_title)


def test_title_collision_suffixes() -> None:
    reset_state()
    child_id = get_primary_child_id()
    first = client.post("/api/v1/conversations", params={"child_id": child_id})
    assert first.status_code == 200
    base_title = "Starting baby swimming"

    with get_connection() as conn:
        conn.execute(
            "UPDATE conversation_sessions SET title = ? WHERE id = ?",
            (base_title, first.json()["id"]),
        )
        conn.commit()

    second_title = ensure_unique_title(base_title=base_title, child_id=child_id)
    assert second_title == f"{base_title} · 2"
