from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import (
    ensure_default_profiles,
    get_connection,
    get_primary_child_id,
    insert_timeline_event,
    update_child_profile,
)
from app.schemas import Action, ActionMetadata, CoreActionType

from .test_conversation_cases import DEFAULT_PROFILE, seed_profile

client = TestClient(app)


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


def test_chat_logging_creates_timeline_event(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()

    target_start = datetime(2024, 6, 2, 15, 0, 0)

    def fake_generate_actions(_: str, **kwargs):
        return [
            Action(
                action_type=CoreActionType.DIAPER_PEE,
                timestamp=target_start,
                note="Quick change",
                metadata=ActionMetadata(outcome="pee"),
                is_core_action=True,
            )
        ]

    monkeypatch.setattr("app.main.generate_actions", fake_generate_actions)

    response = client.post(
        "/api/v1/activities",
        json={
            "message": "Changed a diaper",
            "timezone": "America/Los_Angeles",
            "source": "chip",
            "child_id": child_id,
        },
    )
    assert response.status_code == 200

    events_response = client.get(
        "/events",
        params={
            "child_id": child_id,
            "start": "2024-06-02T00:00:00+00:00",
            "end": "2024-06-03T00:00:00+00:00",
        },
    )
    assert events_response.status_code == 200
    data = events_response.json()
    assert len(data) == 1

    event = data[0]
    assert event["type"] == "diaper"
    assert event["title"].lower().startswith("dirty diaper")
    assert event["detail"] == "Quick change"
    assert event["has_note"] is True
    assert event["source"] == "chip"
    assert event["origin_message_id"] is not None


def test_timeline_dev_mode_orphan_events(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.dev_config.ALLOW_ORPHAN_EVENTS", True)
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    target_start = datetime(2024, 6, 2, 15, 0, 0)

    def fake_generate_actions(_: str, **kwargs):
        return [
            Action(
                action_type=CoreActionType.DIAPER_PEE,
                timestamp=target_start,
                note="Solo change",
                metadata=ActionMetadata(outcome="pee"),
                is_core_action=True,
            )
        ]

    monkeypatch.setattr("app.main.generate_actions", fake_generate_actions)

    response = client.post(
        "/api/v1/activities",
        json={
            "message": "Changed a diaper",
            "timezone": "America/Los_Angeles",
            "source": "chip",
            "child_id": get_primary_child_id(),
        },
    )
    assert response.status_code == 200

    with get_connection() as conn:
        conn.execute("DELETE FROM children")
        conn.commit()

    events_response = client.get(
        "/events",
        params={
            "start": "2024-06-02T00:00:00+00:00",
            "end": "2024-06-03T00:00:00+00:00",
        },
    )
    assert events_response.status_code == 400


def test_timeline_prod_mode_requires_child(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.dev_config.ALLOW_ORPHAN_EVENTS", False)
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    with get_connection() as conn:
        conn.execute("DELETE FROM children")
        conn.commit()

    events_response = client.get(
        "/events",
        params={
            "start": "2024-06-02T00:00:00+00:00",
            "end": "2024-06-03T00:00:00+00:00",
        },
    )
    assert events_response.status_code == 400
    body = events_response.json()
    assert body.get("detail") == "child_id is required for timeline events."


def test_timeline_respects_explicit_child_id() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    primary_child_id = get_primary_child_id()
    now_iso = datetime.utcnow().isoformat()

    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO children (name, first_name, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            ("Second Child", "Second", now_iso, now_iso),
        )
        second_child_id = cursor.lastrowid
        conn.commit()

    insert_timeline_event(
        child_id=primary_child_id,
        event_type="diaper",
        title="Primary child diaper",
        start="2024-06-02T08:00:00+00:00",
    )
    insert_timeline_event(
        child_id=second_child_id,
        event_type="diaper",
        title="Second child diaper",
        start="2024-06-02T09:00:00+00:00",
    )

    events_response = client.get(
        "/events",
        params={
            "child_id": second_child_id,
            "start": "2024-06-02T00:00:00+00:00",
            "end": "2024-06-03T00:00:00+00:00",
        },
    )
    assert events_response.status_code == 200
    data = events_response.json()
    assert len(data) == 1
    event = data[0]
    assert event["title"] == "Second child diaper"
    assert event["child_id"] == second_child_id


def test_timeline_normalizes_to_child_timezone_pacific(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    update_child_profile({"timezone": "America/Los_Angeles"})

    target_start = datetime(2024, 6, 2, 15, 0, 0)

    def fake_generate_actions(_: str, **kwargs):
        return [
            Action(
                action_type=CoreActionType.DIAPER_PEE,
                timestamp=target_start,
                note="Pacific diaper",
                metadata=ActionMetadata(outcome="pee"),
                is_core_action=True,
            )
        ]

    monkeypatch.setattr("app.main.generate_actions", fake_generate_actions)

    response = client.post(
        "/api/v1/activities",
        json={
            "message": "3pm today 2oz bottle",
            "source": "chip",
            "child_id": child_id,
        },
    )
    assert response.status_code == 200

    with get_connection() as conn:
        start_value = conn.execute(
            "SELECT start FROM timeline_events WHERE child_id = ? ORDER BY created_at DESC LIMIT 1",
            (child_id,),
        ).fetchone()[0]
    stored_dt = datetime.fromisoformat(start_value)
    assert stored_dt == datetime(2024, 6, 2, 22, 0, 0, tzinfo=timezone.utc)


def test_timeline_normalizes_to_child_timezone_eastern(monkeypatch: pytest.MonkeyPatch) -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    update_child_profile({"timezone": "America/New_York"})

    target_start = datetime(2024, 6, 2, 15, 0, 0)

    def fake_generate_actions(_: str, **kwargs):
        return [
            Action(
                action_type=CoreActionType.DIAPER_PEE,
                timestamp=target_start,
                note="Eastern diaper",
                metadata=ActionMetadata(outcome="pee"),
                is_core_action=True,
            )
        ]

    monkeypatch.setattr("app.main.generate_actions", fake_generate_actions)

    response = client.post(
        "/api/v1/activities",
        json={
            "message": "3pm today 2oz bottle",
            "source": "chip",
            "child_id": child_id,
        },
    )
    assert response.status_code == 200

    with get_connection() as conn:
        start_value = conn.execute(
            "SELECT start FROM timeline_events WHERE child_id = ? ORDER BY created_at DESC LIMIT 1",
            (child_id,),
        ).fetchone()[0]
    stored_dt = datetime.fromisoformat(start_value)
    assert stored_dt == datetime(2024, 6, 2, 19, 0, 0, tzinfo=timezone.utc)
