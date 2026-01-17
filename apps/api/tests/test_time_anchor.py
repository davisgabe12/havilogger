from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from zoneinfo import ZoneInfo

from app.main import app
from app.db import ensure_default_profiles, get_connection, get_primary_child_id, update_child_profile
from .conversation_helpers import create_conversation, with_conversation

client = TestClient(app)


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        base = datetime(2025, 12, 11, 12, 0, tzinfo=timezone.utc)
        return base if tz is None else base.astimezone(tz)


def reset_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        for table in [
            "activity_logs",
            "conversation_messages",
            "conversation_sessions",
            "timeline_events",
        ]:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()


def test_time_only_messages_anchor_to_today(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_state()
    child_id = get_primary_child_id()
    conversation_id = create_conversation(client, child_id=child_id)
    update_child_profile({"timezone": "America/Los_Angeles"})
    monkeypatch.setattr("app.main.datetime", FrozenDateTime)

    resp = client.post(
        "/api/v1/activities",
        json=with_conversation({"message": "woke at 3am", "child_id": child_id}, conversation_id=conversation_id),
    )
    assert resp.status_code == 200

    with get_connection() as conn:
        row = conn.execute(
            "SELECT start FROM timeline_events WHERE child_id = ? ORDER BY created_at DESC LIMIT 1",
            (child_id,),
        ).fetchone()
    assert row is not None
    start_iso = row[0]
    expected = datetime(2025, 12, 11, 3, 0, tzinfo=ZoneInfo("America/Los_Angeles")).astimezone(timezone.utc)
    assert datetime.fromisoformat(start_iso) == expected
