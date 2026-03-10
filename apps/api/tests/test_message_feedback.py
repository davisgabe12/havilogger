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
        self.upsert_calls: list[tuple[str, dict, str]] = []

    async def select(self, table: str, params: dict) -> list[dict]:
        self.select_calls.append((table, params))
        if self.select_queue:
            return self.select_queue.pop(0)
        return []

    async def upsert(self, table: str, payload: dict, *, on_conflict: str) -> list[dict]:
        self.upsert_calls.append((table, payload, on_conflict))
        return [{"id": str(uuid4()), **payload}]


def _build_auth_ctx(fake: FakeSupabase) -> AuthContext:
    return AuthContext(
        user_id=str(uuid4()),
        user_email="feedback-user@example.com",
        family_id=str(uuid4()),
        access_token="test-token",
        supabase=fake,
        memberships=[],
    )


def test_message_feedback_upsert_by_authenticated_user() -> None:
    conversation_id = str(uuid4())
    message_id = str(uuid4())
    fake = FakeSupabase(
        select_queue=[
            [
                {
                    "id": message_id,
                    "session_id": conversation_id,
                    "intent": "mixed",
                    "created_at": "2026-03-10T00:00:00+00:00",
                }
            ],
            [
                {
                    "id": message_id,
                    "session_id": conversation_id,
                    "intent": "mixed",
                    "created_at": "2026-03-10T00:00:01+00:00",
                }
            ],
        ]
    )
    auth_ctx = _build_auth_ctx(fake)
    app.dependency_overrides[get_auth_context] = lambda: auth_ctx
    client = TestClient(app)
    try:
        payload = {
            "conversation_id": conversation_id,
            "message_id": message_id,
            "rating": "up",
            "feedback_text": "Helpful response.",
            "model_version": "gpt-4o-mini",
            "response_metadata": {"latency_ms": 120},
        }
        create_resp = client.post("/api/v1/messages/feedback", json=payload)
        assert create_resp.status_code == 200
        created = create_resp.json()
        assert created["rating"] == "up"
        assert created["feedback_text"] == "Helpful response."

        update_resp = client.put(
            "/api/v1/messages/feedback",
            json={
                **payload,
                "rating": "down",
                "feedback_text": "Not specific enough.",
            },
        )
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["rating"] == "down"
        assert updated["feedback_text"] == "Not specific enough."

        assert len(fake.upsert_calls) == 2
        assert fake.upsert_calls[0][2] == "conversation_id,message_id,user_id"
        assert fake.upsert_calls[1][2] == "conversation_id,message_id,user_id"
        assert fake.upsert_calls[0][1]["user_id"] == auth_ctx.user_id
        assert fake.upsert_calls[1][1]["user_id"] == auth_ctx.user_id
    finally:
        app.dependency_overrides.clear()


def test_message_feedback_list_filters_to_current_user() -> None:
    conversation_id = str(uuid4())
    message_id = str(uuid4())
    fake = FakeSupabase(
        select_queue=[
            [
                {
                    "conversation_id": conversation_id,
                    "message_id": message_id,
                    "user_id": "another-user-id",
                    "rating": "down",
                    "feedback_text": "server payload",
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
        assert len(fake.select_calls) == 1
        table, params = fake.select_calls[0]
        assert table == "message_feedback"
        assert params["conversation_id"] == f"eq.{conversation_id}"
        assert params["message_id"] == f"in.({message_id})"
        assert params["user_id"] == f"eq.{auth_ctx.user_id}"
    finally:
        app.dependency_overrides.clear()
