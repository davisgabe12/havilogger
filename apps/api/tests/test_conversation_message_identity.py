from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.supabase import AuthContext, get_auth_context


class FakeSupabase:
    def __init__(self, tables: dict[str, list[dict]]) -> None:
        self.tables = tables
        self.calls: list[tuple[str, dict]] = []

    async def select(self, table: str, params: dict):
        self.calls.append((table, params))
        return list(self.tables.get(table, []))


def test_fetch_messages_includes_sender_identity_from_family_members() -> None:
    now_iso = datetime.now(tz=timezone.utc).isoformat()
    family_id = str(uuid4())
    session_id = str(uuid4())
    owner_user_id = str(uuid4())
    caregiver_user_id = str(uuid4())

    supabase = FakeSupabase(
        {
            "conversation_sessions": [
                {
                    "id": session_id,
                    "user_id": caregiver_user_id,
                    "child_id": str(uuid4()),
                    "family_id": family_id,
                    "title": "Shared chat",
                    "last_message_at": now_iso,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
            ],
            "conversation_messages": [
                {
                    "id": str(uuid4()),
                    "session_id": session_id,
                    "user_id": caregiver_user_id,
                    "role": "user",
                    "content": "caregiver note",
                    "intent": "log",
                    "created_at": now_iso,
                },
                {
                    "id": str(uuid4()),
                    "session_id": session_id,
                    "user_id": owner_user_id,
                    "role": "user",
                    "content": "owner note",
                    "intent": "log",
                    "created_at": now_iso,
                },
                {
                    "id": str(uuid4()),
                    "session_id": session_id,
                    "user_id": owner_user_id,
                    "role": "assistant",
                    "content": "assistant reply",
                    "intent": "log",
                    "created_at": now_iso,
                },
            ],
            "family_members": [
                {
                    "user_id": caregiver_user_id,
                    "family_id": family_id,
                    "first_name": "Manual",
                    "last_name": "Invitee",
                    "email": "manual.invitee@example.com",
                },
                {
                    "user_id": owner_user_id,
                    "family_id": family_id,
                    "first_name": "Gabe",
                    "last_name": "Davis",
                    "email": "gabe@example.com",
                },
            ],
        }
    )

    auth_ctx = AuthContext(
        user_id=caregiver_user_id,
        user_email="manual.invitee@example.com",
        family_id=family_id,
        access_token="test-token",
        supabase=supabase,
        memberships=[
            {
                "family_id": family_id,
                "user_id": caregiver_user_id,
                "first_name": "Manual",
                "last_name": "Invitee",
                "email": "manual.invitee@example.com",
            }
        ],
    )

    app.dependency_overrides[get_auth_context] = lambda: auth_ctx
    client = TestClient(app)
    try:
        response = client.get(f"/api/v1/conversations/{session_id}/messages")
        assert response.status_code == 200
        payload = response.json()
        assert len(payload) == 3

        caregiver_message = next(
            item for item in payload if item["role"] == "user" and item["user_id"] == caregiver_user_id
        )
        owner_message = next(
            item for item in payload if item["role"] == "user" and item["user_id"] == owner_user_id
        )
        assistant_message = next(item for item in payload if item["role"] == "assistant")

        assert caregiver_message["sender_first_name"] == "Manual"
        assert caregiver_message["sender_last_name"] == "Invitee"
        assert caregiver_message["sender_email"] == "manual.invitee@example.com"
        assert owner_message["sender_first_name"] == "Gabe"
        assert owner_message["sender_last_name"] == "Davis"
        assert owner_message["sender_email"] == "gabe@example.com"
        assert assistant_message["sender_first_name"] is None
        assert assistant_message["sender_last_name"] is None
        assert assistant_message["sender_email"] is None
    finally:
        app.dependency_overrides.clear()
