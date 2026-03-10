from __future__ import annotations

import os
from uuid import uuid4

from fastapi.testclient import TestClient

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from app.main import app  # noqa: E402
from app.supabase import AuthContext, get_auth_context  # noqa: E402


class FakeSupabase:
    def __init__(self, *, select_queue: list[list[dict]] | None = None) -> None:
        self.select_queue = list(select_queue or [])
        self.select_calls: list[tuple[str, dict]] = []
        self.insert_calls: list[tuple[str, dict]] = []
        self.update_calls: list[tuple[str, dict, dict]] = []
        self.upsert_calls: list[tuple[str, dict, str]] = []

    async def select(self, table: str, params: dict) -> list[dict]:
        self.select_calls.append((table, params))
        if self.select_queue:
            return self.select_queue.pop(0)
        return []

    async def insert(self, table: str, payload: dict, *, params: dict | None = None) -> list[dict]:
        self.insert_calls.append((table, payload))
        return [{"id": str(uuid4()), **payload}]

    async def update(self, table: str, payload: dict, params: dict) -> list[dict]:
        self.update_calls.append((table, payload, params))
        row_id = str(params.get("id", "")).replace("eq.", "", 1) or str(uuid4())
        return [{"id": row_id, **payload}]

    async def upsert(self, table: str, payload: dict, *, on_conflict: str) -> list[dict]:
        self.upsert_calls.append((table, payload, on_conflict))
        return [{"id": str(uuid4()), **payload}]


def _build_auth_ctx(fake: FakeSupabase) -> AuthContext:
    return AuthContext(
        user_id=str(uuid4()),
        user_email="green@example.com",
        family_id=str(uuid4()),
        access_token="test-token",
        supabase=fake,
        memberships=[],
    )


def test_feedback_create_inserts_when_no_existing_row() -> None:
    conversation_id = str(uuid4())
    message_id = str(uuid4())
    fake = FakeSupabase(
        select_queue=[
            [
                {
                    "id": message_id,
                    "session_id": conversation_id,
                    "intent": "question",
                    "created_at": "2026-03-05T00:00:00+00:00",
                }
            ]
        ]
    )
    auth_ctx = _build_auth_ctx(fake)
    app.dependency_overrides[get_auth_context] = lambda: auth_ctx
    client = TestClient(app)
    payload = {
        "conversation_id": conversation_id,
        "message_id": message_id,
        "rating": "up",
        "feedback_text": "Helpful",
    }
    try:
        response = client.post("/api/v1/messages/feedback", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["rating"] == "up"
        assert len(fake.select_calls) == 1
        assert len(fake.upsert_calls) == 1
        assert len(fake.insert_calls) == 0
        assert len(fake.update_calls) == 0
        assert fake.upsert_calls[0][2] == "conversation_id,message_id,user_id"
        inserted_payload = fake.upsert_calls[0][1]
        assert inserted_payload.get("session_id") is None
        assert inserted_payload.get("model_version") == "havi-local"
        metadata = inserted_payload.get("response_metadata") or {}
        assert metadata.get("conversation_id") == payload["conversation_id"]
        assert metadata.get("assistant_message_id") == payload["message_id"]
        assert metadata.get("assistant_intent") == "question"
        assert metadata.get("assistant_route_kind") == "ask"
        assert metadata.get("model_version") == "havi-local"
    finally:
        app.dependency_overrides.clear()


def test_feedback_create_updates_when_existing_row_found() -> None:
    conversation_id = str(uuid4())
    message_id = str(uuid4())
    fake = FakeSupabase(
        select_queue=[
            [
                {
                    "id": message_id,
                    "session_id": conversation_id,
                    "intent": "logging",
                    "created_at": "2026-03-05T00:00:00+00:00",
                }
            ]
        ]
    )
    auth_ctx = _build_auth_ctx(fake)
    app.dependency_overrides[get_auth_context] = lambda: auth_ctx
    client = TestClient(app)
    payload = {
        "conversation_id": conversation_id,
        "message_id": message_id,
        "rating": "down",
        "feedback_text": "Needs work",
    }
    try:
        response = client.post("/api/v1/messages/feedback", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert body["id"]
        assert body["rating"] == "down"
        assert len(fake.select_calls) == 1
        assert len(fake.upsert_calls) == 1
        assert fake.upsert_calls[0][2] == "conversation_id,message_id,user_id"
        assert len(fake.insert_calls) == 0
        assert len(fake.update_calls) == 0
        updated_payload = fake.upsert_calls[0][1]
        assert updated_payload.get("model_version") == "havi-local"
        assert updated_payload.get("session_id") is None
        metadata = updated_payload.get("response_metadata") or {}
        assert metadata.get("assistant_intent") == "logging"
        assert metadata.get("assistant_route_kind") == "log"
    finally:
        app.dependency_overrides.clear()


def test_feedback_list_scopes_to_authenticated_user() -> None:
    conversation_id = str(uuid4())
    message_id = str(uuid4())
    fake = FakeSupabase(
        select_queue=[
            [
                {
                    "conversation_id": conversation_id,
                    "message_id": message_id,
                    "user_id": "someone-else",
                    "rating": "down",
                    "feedback_text": "ignored",
                }
            ]
        ]
    )
    auth_ctx = _build_auth_ctx(fake)
    app.dependency_overrides[get_auth_context] = lambda: auth_ctx
    client = TestClient(app)
    try:
        response = client.get(
            "/api/v1/messages/feedback",
            params={
                "conversation_id": conversation_id,
                "message_ids": message_id,
            },
        )
        assert response.status_code == 200
        assert response.json()[0]["message_id"] == message_id
        assert len(fake.select_calls) == 1
        table, params = fake.select_calls[0]
        assert table == "message_feedback"
        assert params["conversation_id"] == f"eq.{conversation_id}"
        assert params["message_id"] == f"in.({message_id})"
        assert params["user_id"] == f"eq.{auth_ctx.user_id}"
    finally:
        app.dependency_overrides.clear()
