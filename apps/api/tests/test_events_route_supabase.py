from __future__ import annotations

import os
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from app.main import app  # noqa: E402
from app.supabase import AuthContext, get_auth_context  # noqa: E402


class FakeSupabase:
    def __init__(self, *, select_queue=None):
        self.select_queue = {
            table: list(items) for table, items in (select_queue or {}).items()
        }
        self.select_calls = []

    async def select(self, table, params):
        self.select_calls.append((table, params))
        queue = self.select_queue.get(table)
        if queue:
            item = queue.pop(0)
            if isinstance(item, Exception):
                raise item
            return item
        return []


def _build_auth(fake: FakeSupabase) -> AuthContext:
    user_id = str(uuid4())
    family_id = str(uuid4())
    return AuthContext(
        user_id=user_id,
        user_email="owner@example.com",
        family_id=family_id,
        access_token="test-token",
        supabase=fake,
        memberships=[
            {
                "family_id": family_id,
                "user_id": user_id,
                "role": "parent",
                "is_primary": True,
            }
        ],
    )


def _client_with_auth(auth: AuthContext) -> TestClient:
    app.dependency_overrides[get_auth_context] = lambda: auth
    return TestClient(app)


def test_list_events_enriches_recorder_name(monkeypatch) -> None:
    child_id = str(uuid4())
    recorder_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "timeline_events": [
                [
                    {
                        "id": str(uuid4()),
                        "child_id": child_id,
                        "type": "diaper",
                        "title": "Dirty diaper",
                        "detail": "Quick change",
                        "amount_label": None,
                        "start": "2026-03-05T22:00:00+00:00",
                        "end": None,
                        "has_note": True,
                        "is_custom": False,
                        "source": "chat",
                        "origin_message_id": str(uuid4()),
                        "recorded_by_user_id": recorder_id,
                    }
                ]
            ],
            "family_members": [
                [
                    {
                        "user_id": recorder_id,
                        "first_name": "Jamie",
                        "last_name": "Lee",
                    }
                ]
            ],
        }
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.events.get_admin_client", lambda: fake)
    client = _client_with_auth(auth)
    try:
        response = client.get(
            "/api/v1/events",
            params={
                "child_id": child_id,
                "start": "2026-03-05T00:00:00+00:00",
                "end": "2026-03-06T00:00:00+00:00",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 1
        event = payload[0]
        assert event["recorded_by_user_id"] == recorder_id
        assert event["recorded_by_first_name"] == "Jamie"
        assert event["recorded_by_last_name"] == "Lee"
    finally:
        app.dependency_overrides.clear()


def test_list_events_falls_back_when_recorder_column_missing(monkeypatch) -> None:
    child_id = str(uuid4())
    message_id = str(uuid4())
    recorder_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "timeline_events": [
                HTTPException(
                    status_code=400,
                    detail=(
                        'Supabase select failed (table=timeline_events): status=400, '
                        'body={"code":"42703","message":"column timeline_events.recorded_by_user_id does not exist"}'
                    ),
                ),
                [
                    {
                        "id": str(uuid4()),
                        "child_id": child_id,
                        "type": "sleep",
                        "title": "Nap",
                        "detail": None,
                        "amount_label": None,
                        "start": "2026-03-05T20:00:00+00:00",
                        "end": "2026-03-05T21:00:00+00:00",
                        "has_note": False,
                        "is_custom": False,
                        "source": "chat",
                        "origin_message_id": message_id,
                    }
                ],
            ],
            "conversation_messages": [[{"id": message_id, "user_id": recorder_id}]],
            "family_members": [[{"user_id": recorder_id, "first_name": "Green", "last_name": "Invitee"}]],
        }
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.events.get_admin_client", lambda: fake)
    client = _client_with_auth(auth)
    try:
        response = client.get(
            "/api/v1/events",
            params={
                "child_id": child_id,
                "start": "2026-03-05T00:00:00+00:00",
                "end": "2026-03-06T00:00:00+00:00",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 1
        assert payload[0]["recorded_by_user_id"] == recorder_id
        assert payload[0]["recorded_by_first_name"] == "Green"
        assert payload[0]["recorded_by_last_name"] == "Invitee"

        event_calls = [call for call in fake.select_calls if call[0] == "timeline_events"]
        assert len(event_calls) == 2
        assert "recorded_by_user_id" in event_calls[0][1]["select"]
        assert "recorded_by_user_id" not in event_calls[1][1]["select"]
        conversation_calls = [call for call in fake.select_calls if call[0] == "conversation_messages"]
        assert len(conversation_calls) == 1
    finally:
        app.dependency_overrides.clear()


def test_list_events_handles_missing_recorder_member_row(monkeypatch) -> None:
    child_id = str(uuid4())
    recorder_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "timeline_events": [
                [
                    {
                        "id": str(uuid4()),
                        "child_id": child_id,
                        "type": "activity",
                        "title": "Activity",
                        "detail": "Playtime",
                        "amount_label": None,
                        "start": "2026-03-05T20:00:00+00:00",
                        "end": None,
                        "has_note": False,
                        "is_custom": False,
                        "source": "chat",
                        "origin_message_id": str(uuid4()),
                        "recorded_by_user_id": recorder_id,
                    }
                ]
            ],
            "family_members": [[]],
        }
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.events.get_admin_client", lambda: fake)
    client = _client_with_auth(auth)
    try:
        response = client.get(
            "/api/v1/events",
            params={
                "child_id": child_id,
                "start": "2026-03-05T00:00:00+00:00",
                "end": "2026-03-06T00:00:00+00:00",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 1
        assert payload[0]["recorded_by_user_id"] == recorder_id
        assert payload[0]["recorded_by_first_name"] is None
        assert payload[0]["recorded_by_last_name"] is None
    finally:
        app.dependency_overrides.clear()
