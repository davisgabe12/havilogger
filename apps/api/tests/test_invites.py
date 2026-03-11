from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from app.main import app  # noqa: E402
from app.supabase import (  # noqa: E402
    AuthContext,
    UserContext,
    get_auth_context,
    get_user_context,
)


class FakeSupabase:
    def __init__(self, *, select_queue=None):
        self.select_queue = {
            table: list(items) for table, items in (select_queue or {}).items()
        }
        self.calls = []
        self.insert_calls = []
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

    async def insert(self, table, payload, *, params=None):
        self.insert_calls.append((table, payload, params))
        queue = self.select_queue.get("__insert__")
        if queue:
            item = queue.pop(0)
            if isinstance(item, Exception):
                raise item
            return item
        return [payload]

    async def upsert(self, table, payload, *, on_conflict):
        self.upsert_calls.append((table, payload, on_conflict))
        return [payload]

    async def update(self, table, payload, params):
        self.update_calls.append((table, payload, params))
        return [payload]


def _build_auth_ctx(fake: FakeSupabase) -> AuthContext:
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
                "first_name": "Owner",
                "last_name": "Caregiver",
            }
        ],
    )


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


def _client_with_auth_ctx(auth_ctx: AuthContext) -> TestClient:
    app.dependency_overrides[get_auth_context] = lambda: auth_ctx
    return TestClient(app)


def test_create_invite_falls_back_when_status_column_missing(monkeypatch) -> None:
    fake = FakeSupabase(
        select_queue={
            "__insert__": [
                HTTPException(
                    status_code=400,
                    detail=(
                        'Supabase insert failed (table=family_invites): status=400, '
                        'body={"code":"42703","message":"column family_invites.status does not exist"}'
                    ),
                ),
                [{"id": str(uuid4())}],
            ]
        }
    )
    auth_ctx = _build_auth_ctx(fake)
    client = _client_with_auth_ctx(auth_ctx)

    async def fake_send_invite_email(**kwargs):
        return "sent", None

    monkeypatch.setattr("app.main._send_invite_email", fake_send_invite_email)

    try:
        response = client.post(
            "/api/v1/invites",
            json={"email": "Invitee@Example.com", "role": "parent"},
            headers={"origin": "https://gethavi.com"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["email"] == "invitee@example.com"
        assert payload["email_status"] == "sent"
        assert payload["email_enabled"] is False
        assert payload["invite_url"].startswith("https://gethavi.com/app/invite?token=")
        assert "email=invitee%40example.com" in payload["invite_url"]

        assert len(fake.insert_calls) == 2
        first_payload = fake.insert_calls[0][1]
        second_payload = fake.insert_calls[1][1]
        assert first_payload["status"] == "pending"
        assert "status" not in second_payload
    finally:
        app.dependency_overrides.clear()


def test_create_invite_reports_email_enabled_when_smtp_configured(monkeypatch) -> None:
    fake = FakeSupabase()
    auth_ctx = _build_auth_ctx(fake)
    client = _client_with_auth_ctx(auth_ctx)
    monkeypatch.setenv("HAVI_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("HAVI_SMTP_FROM_EMAIL", "noreply@gethavi.com")

    async def fake_send_invite_email(**kwargs):
        return "sent", None

    monkeypatch.setattr("app.main._send_invite_email", fake_send_invite_email)

    try:
        response = client.post(
            "/api/v1/invites",
            json={"email": "invitee@example.com", "role": "parent"},
            headers={"origin": "https://gethavi.com"},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["email_enabled"] is True
        assert payload["email_status"] == "sent"
    finally:
        app.dependency_overrides.clear()


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


def test_accept_invite_marks_expired_invites() -> None:
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
                        "status": "pending",
                        "expires_at": (
                            datetime.now(tz=timezone.utc) - timedelta(minutes=5)
                        ).isoformat(),
                    }
                ]
            ]
        }
    )
    user_ctx = _build_user_ctx(fake)
    client = _client_with_user_ctx(user_ctx)
    try:
        response = client.post("/api/v1/invites/accept", json={"token": token})
        assert response.status_code == 410
        assert response.json()["detail"] == "Invite has expired."
        assert len(fake.update_calls) == 1
        update_table, update_payload, update_params = fake.update_calls[0]
        assert update_table == "family_invites"
        assert update_payload["status"] == "expired"
        assert update_params["id"].startswith("eq.")
    finally:
        app.dependency_overrides.clear()


def test_complete_invite_signup_creates_membership_and_accepts_invite(monkeypatch) -> None:
    token = uuid4().hex
    family_id = str(uuid4())
    invite_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "family_invites": [
                [
                    {
                        "id": invite_id,
                        "family_id": family_id,
                        "email": "invitee@example.com",
                        "role": "parent",
                        "status": "pending",
                    }
                ]
            ]
        }
    )

    async def fake_provision(**kwargs):
        return "user-123"

    monkeypatch.setattr("app.main.get_admin_client", lambda: fake)
    monkeypatch.setattr("app.main._provision_invited_auth_user", fake_provision)

    response = TestClient(app).post(
        "/api/v1/invites/complete-signup",
        json={
            "token": token,
            "email": "invitee@example.com",
            "password": "Lev2025!",
            "first_name": "Alex",
            "last_name": "Rivers",
            "phone": "5551234567",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "accepted"
    assert payload["family_id"] == family_id
    assert payload["user_id"] == "user-123"

    assert len(fake.upsert_calls) == 1
    upsert_table, upsert_payload, on_conflict = fake.upsert_calls[0]
    assert upsert_table == "family_members"
    assert on_conflict == "family_id,user_id"
    assert upsert_payload["family_id"] == family_id
    assert upsert_payload["user_id"] == "user-123"
    assert upsert_payload["first_name"] == "Alex"
    assert upsert_payload["last_name"] == "Rivers"
    assert upsert_payload["phone"] == "5551234567"
    assert upsert_payload["email"] == "invitee@example.com"

    assert len(fake.update_calls) == 1
    update_table, update_payload, update_params = fake.update_calls[0]
    assert update_table == "family_invites"
    assert update_params == {"id": f"eq.{invite_id}"}
    assert update_payload["accepted_by_user_id"] == "user-123"
    assert update_payload["status"] == "accepted"


def test_complete_invite_signup_rejects_email_mismatch(monkeypatch) -> None:
    token = uuid4().hex
    fake = FakeSupabase(
        select_queue={
            "family_invites": [
                [
                    {
                        "id": str(uuid4()),
                        "family_id": str(uuid4()),
                        "email": "expected@example.com",
                        "role": "member",
                        "status": "pending",
                    }
                ]
            ]
        }
    )

    async def fake_provision(**kwargs):
        return "user-123"

    monkeypatch.setattr("app.main.get_admin_client", lambda: fake)
    monkeypatch.setattr("app.main._provision_invited_auth_user", fake_provision)

    response = TestClient(app).post(
        "/api/v1/invites/complete-signup",
        json={
            "token": token,
            "email": "other@example.com",
            "password": "Lev2025!",
            "first_name": "Alex",
            "last_name": "Rivers",
            "phone": "5551234567",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Invite does not match this account."
    assert fake.upsert_calls == []
