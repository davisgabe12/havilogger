from __future__ import annotations

from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.db import create_task, ensure_default_profiles, get_connection, get_primary_child_id
from app.main import app

client = TestClient(app)


def reset_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        conn.execute("DELETE FROM tasks")
        conn.commit()


def test_due_reminders_and_ack() -> None:
    reset_state()
    child_id = get_primary_child_id()
    past = (datetime.utcnow() - timedelta(minutes=10)).isoformat()
    task = create_task(
        title="Call pediatrician",
        child_id=child_id,
        remind_at=past,
    )

    resp = client.get("/api/v1/reminders/due", params={"child_id": child_id})
    assert resp.status_code == 200
    payload = resp.json()
    assert len(payload) == 1
    assert payload[0]["id"] == task.id

    ack = client.post(f"/api/v1/reminders/{task.id}/ack", json={"snooze_minutes": 30})
    assert ack.status_code == 200
    acked = ack.json()
    assert acked["last_reminded_at"] is not None
    assert acked["snooze_count"] == 1
