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
        self.calls = []

    async def select(self, table, params):
        self.calls.append(("select", table, params))
        queue = self.select_queue.get(table)
        if queue:
            return queue.pop(0)
        return []

    async def insert(self, table, payload, *, params=None):
        self.calls.append(("insert", table, payload, params))
        queue = self.insert_queue.get(table)
        if queue:
            return queue.pop(0)
        return []

    async def update(self, table, payload, params):
        self.calls.append(("update", table, payload, params))
        queue = self.update_queue.get(table)
        if queue:
            return queue.pop(0)
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
                "is_primary": True,
                "first_name": "",
                "last_name": "",
                "email": "",
                "phone": "",
                "relationship": "",
            }
        ],
    )


def _client_with_auth(auth: AuthContext) -> TestClient:
    app.dependency_overrides[get_auth_context] = lambda: auth
    return TestClient(app)


def test_onboarding_profile_success_creates_required_profile() -> None:
    child_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "children": [
                [],
                [],
                [
                    {
                        "id": child_id,
                        "name": "River Davis",
                        "first_name": "River",
                        "last_name": "Davis",
                        "birth_date": "2025-01-10",
                        "due_date": "",
                        "gender": "",
                        "birth_weight": 7.4,
                        "birth_weight_unit": "lb",
                        "latest_weight": 12.1,
                        "latest_weight_date": "",
                        "timezone": "America/Los_Angeles",
                        "routine_eligible": False,
                    }
                ],
            ]
        },
        insert_queue={
            "children": [
                [
                    {
                        "id": child_id,
                    }
                ]
            ]
        },
        update_queue={"family_members": [[{"ok": True}]]},
    )
    auth = _build_auth(fake)
    client = _client_with_auth(auth)

    try:
        response = client.post(
            "/api/v1/onboarding/profile",
            json={
                "caregiver": {
                    "first_name": "Gabe",
                    "last_name": "Davis",
                    "email": "gabe@example.com",
                    "phone": "555-123-4567",
                },
                "child": {
                    "name": "River",
                    "birth_date": "2025-01-10",
                    "birth_weight": 7.4,
                    "latest_weight": 12.1,
                    "timezone": "America/Los_Angeles",
                },
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["caregiver"]["first_name"] == "Gabe"
        assert payload["caregiver"]["last_name"] == "Davis"
        assert payload["caregiver"]["email"] == "gabe@example.com"
        assert payload["caregiver"]["phone"] == "555-123-4567"
        assert payload["child"]["id"] == child_id
        assert payload["child"]["first_name"] == "River"
        assert payload["child"]["last_name"] == "Davis"

        update_calls = [call for call in fake.calls if call[0] == "update"]
        assert update_calls
        _, table, update_payload, _ = update_calls[0]
        assert table == "family_members"
        assert update_payload["first_name"] == "Gabe"
    finally:
        app.dependency_overrides.clear()


def test_onboarding_profile_rejects_missing_caregiver_phone() -> None:
    fake = FakeSupabase()
    auth = _build_auth(fake)
    client = _client_with_auth(auth)
    try:
        response = client.post(
            "/api/v1/onboarding/profile",
            json={
                "caregiver": {
                    "first_name": "Gabe",
                    "last_name": "Davis",
                    "email": "gabe@example.com",
                    "phone": "",
                },
                "child": {
                    "name": "Unknown",
                    "due_date": "2026-10-01",
                    "birth_weight": 1.0,
                    "latest_weight": 1.0,
                },
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Caregiver phone is required."
    finally:
        app.dependency_overrides.clear()


def test_onboarding_profile_requires_child_birth_or_due_date() -> None:
    fake = FakeSupabase()
    auth = _build_auth(fake)
    client = _client_with_auth(auth)
    try:
        response = client.post(
            "/api/v1/onboarding/profile",
            json={
                "caregiver": {
                    "first_name": "Gabe",
                    "last_name": "Davis",
                    "email": "gabe@example.com",
                    "phone": "555-123-4567",
                },
                "child": {
                    "name": "Unknown",
                    "birth_weight": 7.0,
                    "latest_weight": 9.0,
                },
            },
        )
        assert response.status_code == 400
        assert (
            response.json()["detail"]
            == "Child date of birth or due date is required."
        )
    finally:
        app.dependency_overrides.clear()


def test_onboarding_profile_defaults_invalid_timezone_to_pacific() -> None:
    child_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "children": [
                [],
                [],
                [
                    {
                        "id": child_id,
                        "name": "Unknown Davis",
                        "first_name": "Unknown",
                        "last_name": "Davis",
                        "birth_date": "",
                        "due_date": "2026-10-01",
                        "gender": "",
                        "birth_weight": 1.0,
                        "birth_weight_unit": "lb",
                        "latest_weight": 1.0,
                        "latest_weight_date": "",
                        "timezone": "America/Los_Angeles",
                        "routine_eligible": False,
                    }
                ],
            ]
        },
        insert_queue={"children": [[{"id": child_id}]]},
        update_queue={"family_members": [[{"ok": True}]]},
    )
    auth = _build_auth(fake)
    client = _client_with_auth(auth)

    try:
        response = client.post(
            "/api/v1/onboarding/profile",
            json={
                "caregiver": {
                    "first_name": "Gabe",
                    "last_name": "Davis",
                    "email": "gabe@example.com",
                    "phone": "555-123-4567",
                },
                "child": {
                    "name": "Unknown",
                    "due_date": "2026-10-01",
                    "birth_weight": 1.0,
                    "latest_weight": 1.0,
                    "timezone": "Moon/Base",
                },
            },
        )
        assert response.status_code == 200

        insert_calls = [call for call in fake.calls if call[0] == "insert"]
        assert insert_calls
        _, table, insert_payload, _ = insert_calls[0]
        assert table == "children"
        assert insert_payload["timezone"] == "America/Los_Angeles"
    finally:
        app.dependency_overrides.clear()
