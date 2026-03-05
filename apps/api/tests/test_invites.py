from __future__ import annotations

import os
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from app.main import app  # noqa: E402
from app.supabase import UserContext, get_user_context  # noqa: E402


class FakeSupabase:
    def __init__(self, *, select_queue=None):
        self.select_queue = {
            table: list(items) for table, items in (select_queue or {}).items()
        }
        self.calls = []
        self.upsert_calls = []
        self.update_calls = []

    async def select(self, table, params):
        self.calls.append(("select", table, params))
        queue = self.select_queue.get(table)
        if queue:
            item = queue.pop(0)
            if isinstance(item, Exception):
                raise item
            return item
        return []

    async def upsert(self, table, payload, *, on_conflict):
        self.upsert_calls.append((table, payload, on_conflict))
        return [payload]

    async def update(self, table, payload, params):
        self.update_calls.append((table, payload, params))
        return [payload]


def _build_user_ctx(fake: FakeSupabase) -> UserContext:
    user_id = str(uuid4())
    return UserContext(
        user_id=user_id,
        user_email="invitee@example.com",
        access_token="test-token",
        supabase=fake,
        memberships=[],
    )


def _client_with_user_ctx(user_ctx: UserContext) -> TestClient:
    app.dependency_overrides[get_user_context] = lambda: user_ctx
    return TestClient(app)


def test_accept_invite_falls_back_when_accepted_at_column_missing() -> None:
    token = uuid4().hex
    family_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
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
                        "id": str(uuid4()),
                        "family_id": family_id,
                        "email": "invitee@example.com",
                        "role": "member",
                    }
                ],
            ]
        }
    )
    user_ctx = _build_user_ctx(fake)
    client = _client_with_user_ctx(user_ctx)
    try:
        response = client.post("/api/v1/invites/accept", json={"token": token})
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "accepted"
        assert payload["family_id"] == family_id
        assert len(fake.upsert_calls) == 1
        assert len(fake.update_calls) == 0
        select_calls = [call for call in fake.calls if call[0] == "select"]
        assert len(select_calls) == 2
        assert "accepted_at" in select_calls[0][2]["select"]
        assert "accepted_at" not in select_calls[1][2]["select"]
    finally:
        app.dependency_overrides.clear()


def test_accept_invite_returns_already_accepted_without_mutation() -> None:
    token = uuid4().hex
    family_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "family_invites": [
                [
                    {
                        "id": str(uuid4()),
                        "family_id": family_id,
                        "email": "invitee@example.com",
                        "role": "member",
                        "accepted_at": "2026-03-01T00:00:00Z",
                    }
                ]
            ]
        }
    )
    user_ctx = _build_user_ctx(fake)
    client = _client_with_user_ctx(user_ctx)
    try:
        response = client.post("/api/v1/invites/accept", json={"token": token})
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "already_accepted"
        assert payload["family_id"] == family_id
        assert fake.upsert_calls == []
        assert fake.update_calls == []
    finally:
        app.dependency_overrides.clear()
