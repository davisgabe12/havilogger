from __future__ import annotations

import asyncio
import os
from uuid import uuid4

from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from app.main import app, _maybe_autotitle_session  # noqa: E402
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


def _auth_with_supabase(supabase: FakeSupabase, family_id: str | None = None) -> AuthContext:
    return AuthContext(
        user_id=str(uuid4()),
        user_email="test@example.com",
        family_id=family_id or str(uuid4()),
        access_token="test-token",
        supabase=supabase,
        memberships=[],
    )


def _with_auth_override(auth: AuthContext) -> TestClient:
    app.dependency_overrides[get_auth_context] = lambda: auth
    return TestClient(app)


def _conversation_row(*, session_id: str, child_id: str, user_id: str, title: str) -> dict:
    now = "2026-03-04T12:00:00Z"
    return {
        "id": session_id,
        "user_id": user_id,
        "child_id": child_id,
        "title": title,
        "last_message_at": now,
        "created_at": now,
        "updated_at": now,
        "catch_up_mode": False,
        "catch_up_started_at": None,
        "catch_up_last_message_at": None,
    }


def test_conversation_creation_defaults_to_new_chat() -> None:
    child_id = str(uuid4())
    session_id = str(uuid4())
    user_id = str(uuid4())
    fake = FakeSupabase(
        insert_queue={
            "conversation_sessions": [
                [
                    _conversation_row(
                        session_id=session_id,
                        child_id=child_id,
                        user_id=user_id,
                        title="New chat",
                    )
                ]
            ]
        }
    )
    auth = _auth_with_supabase(fake)
    auth.user_id = user_id
    client = _with_auth_override(auth)
    try:
        response = client.post("/api/v1/conversations", params={"child_id": child_id})
        assert response.status_code == 200
        payload = response.json()
        assert payload["title"] == "New chat"
    finally:
        app.dependency_overrides.clear()


def test_rename_conversation_requires_non_empty_title() -> None:
    fake = FakeSupabase()
    auth = _auth_with_supabase(fake)
    client = _with_auth_override(auth)
    try:
        response = client.patch(
            f"/api/v1/conversations/{uuid4()}",
            json={"title": "   "},
        )
        assert response.status_code == 400
        assert response.json()["detail"] == "title cannot be empty"
    finally:
        app.dependency_overrides.clear()


def test_rename_conversation_updates_title() -> None:
    session_id = str(uuid4())
    child_id = str(uuid4())
    user_id = str(uuid4())
    updated_title = "Night wake notes"
    fake = FakeSupabase(
        update_queue={
            "conversation_sessions": [
                [
                    _conversation_row(
                        session_id=session_id,
                        child_id=child_id,
                        user_id=user_id,
                        title=updated_title,
                    )
                ]
            ]
        }
    )
    auth = _auth_with_supabase(fake)
    client = _with_auth_override(auth)
    try:
        response = client.patch(
            f"/api/v1/conversations/{session_id}",
            json={"title": updated_title},
        )
        assert response.status_code == 200
        assert response.json()["title"] == updated_title
    finally:
        app.dependency_overrides.clear()


def test_manual_rename_is_not_overwritten_by_autotitle() -> None:
    session_id = str(uuid4())
    child_id = str(uuid4())
    user_id = str(uuid4())
    manual_title = "Night wake notes"
    fake = FakeSupabase(
        update_queue={
            "conversation_sessions": [
                [
                    _conversation_row(
                        session_id=session_id,
                        child_id=child_id,
                        user_id=user_id,
                        title=manual_title,
                    )
                ]
            ]
        },
        select_queue={
            "conversation_sessions": [[{"id": session_id, "title": manual_title}]],
        },
    )
    auth = _auth_with_supabase(fake)
    client = _with_auth_override(auth)
    try:
        rename_response = client.patch(
            f"/api/v1/conversations/{session_id}",
            json={"title": manual_title},
        )
        assert rename_response.status_code == 200

        asyncio.run(
            _maybe_autotitle_session(
                auth,
                session_id=session_id,
                child_id=child_id,
                message="Baby pooped at 3pm",
                timezone_name="UTC",
                has_prior_messages=False,
            )
        )

        update_calls = [call for call in fake.calls if call[0] == "update"]
        # Only rename endpoint should update.
        assert len(update_calls) == 1
    finally:
        app.dependency_overrides.clear()

