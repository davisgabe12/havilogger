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
    def __init__(self, *, select_queue=None, update_queue=None):
        self.select_queue = {
            table: list(items) for table, items in (select_queue or {}).items()
        }
        self.update_queue = {
            table: list(items) for table, items in (update_queue or {}).items()
        }
        self.select_calls = []
        self.update_calls = []

    async def select(self, table, params):
        self.select_calls.append((table, params))
        queue = self.select_queue.get(table)
        if queue:
            item = queue.pop(0)
            if isinstance(item, Exception):
                raise item
            return item
        return []

    async def update(self, table, payload, params):
        self.update_calls.append((table, payload, params))
        queue = self.update_queue.get(table)
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


def test_list_care_team_filters_accepted_invites(monkeypatch) -> None:
    member_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "family_members": [
                [
                    {
                        "user_id": member_id,
                        "role": "parent",
                        "is_primary": True,
                        "first_name": "Alex",
                        "last_name": "Davis",
                        "email": "alex@example.com",
                        "phone": "5551234567",
                        "relationship": "Parent",
                    }
                ]
            ],
            "family_invites": [
                [
                    {
                        "id": str(uuid4()),
                        "email": "pending@example.com",
                        "role": "Parent",
                        "status": "pending",
                    },
                    {
                        "id": str(uuid4()),
                        "email": "accepted@example.com",
                        "role": "Parent",
                        "status": "accepted",
                    },
                ]
            ],
        }
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.care_team.get_admin_client", lambda: fake)
    client = _client_with_auth(auth)
    try:
        response = client.get("/api/v1/care-team")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["members"]) == 1
        assert payload["members"][0]["display_name"] == "Alex Davis"
        assert payload["members"][0]["initials"] == "AD"
        assert len(payload["invites"]) == 1
        assert payload["invites"][0]["email"] == "pending@example.com"
    finally:
        app.dependency_overrides.clear()


def test_list_care_team_invites_legacy_fallback(monkeypatch) -> None:
    pending_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "family_members": [[]],
            "family_invites": [
                HTTPException(
                    status_code=400,
                    detail=(
                        'Supabase select failed (table=family_invites): status=400, '
                        'body={"code":"42703","message":"column family_invites.status does not exist"}'
                    ),
                ),
                [
                    {
                        "id": pending_id,
                        "email": "pending@example.com",
                        "role": "Parent",
                        "accepted_at": None,
                    },
                    {
                        "id": str(uuid4()),
                        "email": "done@example.com",
                        "role": "Parent",
                        "accepted_at": "2026-03-01T00:00:00Z",
                    },
                ],
            ],
        }
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.care_team.get_admin_client", lambda: fake)
    client = _client_with_auth(auth)
    try:
        response = client.get("/api/v1/care-team")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["invites"]) == 1
        assert payload["invites"][0]["id"] == pending_id
        assert payload["invites"][0]["status"] == "pending"

        family_invite_calls = [call for call in fake.select_calls if call[0] == "family_invites"]
        assert len(family_invite_calls) == 2
        assert "status" in family_invite_calls[0][1]["select"]
        assert "status" not in family_invite_calls[1][1]["select"]
    finally:
        app.dependency_overrides.clear()


def test_list_care_team_invites_handles_missing_accepted_at_column(monkeypatch) -> None:
    pending_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "family_members": [[]],
            "family_invites": [
                HTTPException(
                    status_code=400,
                    detail=(
                        'Supabase select failed (table=family_invites): status=400, '
                        'body={"code":"42703","message":"column family_invites.accepted_at does not exist"}'
                    ),
                ),
                [
                    {
                        "id": pending_id,
                        "email": "pending@example.com",
                        "role": "Parent",
                        "created_at": "2026-03-01T00:00:00Z",
                    }
                ],
            ],
        }
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.care_team.get_admin_client", lambda: fake)
    client = _client_with_auth(auth)
    try:
        response = client.get("/api/v1/care-team")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["invites"]) == 1
        assert payload["invites"][0]["id"] == pending_id
        assert payload["invites"][0]["status"] == "pending"
        assert payload["invites"][0]["accepted_at"] is None

        family_invite_calls = [call for call in fake.select_calls if call[0] == "family_invites"]
        assert len(family_invite_calls) == 2
        assert "accepted_at" in family_invite_calls[0][1]["select"]
        assert "accepted_at" not in family_invite_calls[1][1]["select"]
    finally:
        app.dependency_overrides.clear()


def test_list_care_team_returns_members_when_invites_query_fails(monkeypatch) -> None:
    member_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "family_members": [
                [
                    {
                        "user_id": member_id,
                        "role": "parent",
                        "is_primary": True,
                        "first_name": "Alex",
                        "last_name": "Davis",
                        "email": "alex@example.com",
                        "phone": "5551234567",
                        "relationship": "Parent",
                    }
                ]
            ],
            "family_invites": [
                HTTPException(
                    status_code=500,
                    detail=(
                        "Supabase select failed (table=family_invites): status=500, "
                        "body={\"message\":\"unexpected backend failure\"}"
                    ),
                )
            ],
        }
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.care_team.get_admin_client", lambda: fake)
    client = _client_with_auth(auth)
    try:
        response = client.get("/api/v1/care-team")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["members"]) == 1
        assert payload["members"][0]["display_name"] == "Alex Davis"
        assert payload["invites"] == []
    finally:
        app.dependency_overrides.clear()


def test_list_care_team_deduplicates_member_rows_by_user_id(monkeypatch) -> None:
    member_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "family_members": [
                [
                    {
                        "user_id": member_id,
                        "role": "parent",
                        "is_primary": True,
                        "first_name": "Latest",
                        "last_name": "Name",
                        "email": "latest@example.com",
                        "phone": "5551234567",
                        "relationship": "Parent",
                    },
                    {
                        "user_id": member_id,
                        "role": "parent",
                        "is_primary": True,
                        "first_name": "Old",
                        "last_name": "Name",
                        "email": "old@example.com",
                        "phone": "5551230000",
                        "relationship": "Parent",
                    },
                ]
            ],
            "family_invites": [[]],
        }
    )
    auth = _build_auth(fake)
    monkeypatch.setattr("app.routes.care_team.get_admin_client", lambda: fake)
    client = _client_with_auth(auth)
    try:
        response = client.get("/api/v1/care-team")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload["members"]) == 1
        assert payload["members"][0]["display_name"] == "Latest Name"
        assert payload["members"][0]["email"] == "latest@example.com"
    finally:
        app.dependency_overrides.clear()


def test_update_care_team_profile_validates_phone() -> None:
    fake = FakeSupabase()
    auth = _build_auth(fake)
    client = _client_with_auth(auth)
    try:
        response = client.put(
            "/api/v1/care-team/me/profile",
            json={
                "first_name": "Jamie",
                "last_name": "Lee",
                "email": "jamie@example.com",
                "phone": "12",
            },
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "Phone is invalid."
    finally:
        app.dependency_overrides.clear()


def test_update_care_team_profile_success() -> None:
    fake = FakeSupabase(
        update_queue={
            "family_members": [
                [
                    {
                        "user_id": str(uuid4()),
                        "role": "parent",
                        "is_primary": False,
                        "first_name": "Jamie",
                        "last_name": "Lee",
                        "email": "jamie@example.com",
                        "phone": "5551234567",
                        "relationship": "Parent",
                    }
                ]
            ]
        }
    )
    auth = _build_auth(fake)
    client = _client_with_auth(auth)
    try:
        response = client.put(
            "/api/v1/care-team/me/profile",
            json={
                "first_name": "Jamie",
                "last_name": "Lee",
                "email": "jamie@example.com",
                "phone": "5551234567",
                "relationship": "Parent",
            },
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["display_name"] == "Jamie Lee"
        assert payload["initials"] == "JL"
        assert payload["relationship"] == "Parent"

        assert len(fake.update_calls) == 1
        _, update_payload, update_params = fake.update_calls[0]
        assert update_payload["first_name"] == "Jamie"
        assert update_payload["last_name"] == "Lee"
        assert update_params["family_id"].startswith("eq.")
        assert update_params["user_id"].startswith("eq.")
    finally:
        app.dependency_overrides.clear()
