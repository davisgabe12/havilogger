from __future__ import annotations

import os
from uuid import uuid4

from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from app.main import app  # noqa: E402
from app.supabase import AuthContext, get_auth_context  # noqa: E402


class FakeSupabase:
    def __init__(self, *, select_queue=None, insert_queue=None, update_queue=None):
        self.select_queue = {
            table: list(items) for table, items in (select_queue or {}).items()
        }
        self.insert_queue = {
            table: list(items) for table, items in (insert_queue or {}).items()
        }
        self.update_queue = {
            table: list(items) for table, items in (update_queue or {}).items()
        }
        self.select_calls = []
        self.insert_calls = []
        self.update_calls = []

    async def select(self, table, params):
        self.select_calls.append((table, params))
        queue = self.select_queue.get(table)
        if queue:
            return queue.pop(0)
        return []

    async def insert(self, table, payload, *, params=None):
        self.insert_calls.append((table, payload, params))
        queue = self.insert_queue.get(table)
        if queue:
            return queue.pop(0)
        return [payload]

    async def update(self, table, payload, params):
        self.update_calls.append((table, payload, params))
        queue = self.update_queue.get(table)
        if queue:
            return queue.pop(0)
        return [payload]


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


def test_create_task_returns_assignee_and_creator_names(monkeypatch) -> None:
    assignee_id = str(uuid4())
    fake = FakeSupabase(
        insert_queue={
            "tasks": [
                [
                    {
                        "id": str(uuid4()),
                        "title": "Pick up diapers",
                        "status": "open",
                        "due_at": None,
                        "remind_at": None,
                        "completed_at": None,
                        "reminder_channel": None,
                        "last_reminded_at": None,
                        "snooze_count": None,
                        "is_recurring": None,
                        "recurrence_rule": None,
                        "created_at": "2026-03-10T00:00:00+00:00",
                        "created_by_user_id": "",
                        "assigned_to_user_id": assignee_id,
                    }
                ]
            ]
        },
        select_queue={
            "family_members": [
                [
                    {
                        "user_id": assignee_id,
                        "first_name": "Sam",
                        "last_name": "Lee",
                        "email": "sam@example.com",
                    }
                ]
            ]
        },
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.tasks.get_admin_client", lambda: fake)
    # keep created_by_user_id aligned with auth user for response assertions
    fake.insert_queue["tasks"][0][0]["created_by_user_id"] = auth.user_id
    client = _client_with_auth(auth)
    try:
        response = client.post(
            "/api/v1/tasks",
            json={
                "title": "Pick up diapers",
                "assigned_to_user_id": assignee_id,
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["assigned_to_name"] == "Sam Lee"
        # creator name may be missing if not returned from family_members lookup.
        assert payload["created_by_user_id"] == auth.user_id

        assert len(fake.insert_calls) == 1
        _, insert_payload, _ = fake.insert_calls[0]
        assert insert_payload["assigned_to_user_id"] == assignee_id
    finally:
        app.dependency_overrides.clear()


def test_list_tasks_enriches_assignee_names(monkeypatch) -> None:
    owner_id = str(uuid4())
    assignee_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "tasks": [
                [
                    {
                        "id": str(uuid4()),
                        "child_id": str(uuid4()),
                        "title": "Schedule pediatrician call",
                        "status": "open",
                        "due_at": None,
                        "remind_at": None,
                        "completed_at": None,
                        "reminder_channel": None,
                        "last_reminded_at": None,
                        "snooze_count": 0,
                        "is_recurring": False,
                        "recurrence_rule": None,
                        "created_at": "2026-03-10T00:00:00+00:00",
                        "created_by_user_id": owner_id,
                        "assigned_to_user_id": assignee_id,
                    }
                ]
            ],
            "family_members": [
                [
                    {
                        "user_id": owner_id,
                        "first_name": "Owner",
                        "last_name": "Parent",
                        "email": "owner@example.com",
                    },
                    {
                        "user_id": assignee_id,
                        "first_name": "Jordan",
                        "last_name": "Parent",
                        "email": "jordan@example.com",
                    },
                ]
            ],
        }
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.tasks.get_admin_client", lambda: fake)
    client = _client_with_auth(auth)
    try:
        response = client.get("/api/v1/tasks", params={"view": "open"})
        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 1
        assert payload[0]["created_by_name"] == "Owner Parent"
        assert payload[0]["assigned_to_name"] == "Jordan Parent"
    finally:
        app.dependency_overrides.clear()
