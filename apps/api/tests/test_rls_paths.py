import asyncio
import os
from uuid import uuid4

import pytest
from fastapi import HTTPException

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from app.main import _build_context_bundle, _insert_conversation_message  # noqa: E402
from app.routes.knowledge import list_knowledge  # noqa: E402
from app.routes.tasks import CreateTaskPayload, create_task_endpoint, list_tasks_endpoint  # noqa: E402
from app.supabase import AuthContext  # noqa: E402


class FakeSupabase:
    def __init__(self, *, select_queue=None, insert_queue=None):
        self.select_queue = {
            table: list(items) for table, items in (select_queue or {}).items()
        }
        self.insert_queue = {
            table: list(items) for table, items in (insert_queue or {}).items()
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
        return []


def _auth_with_supabase(supabase) -> AuthContext:
    return AuthContext(
        user_id=str(uuid4()),
        user_email="test@example.com",
        family_id=str(uuid4()),
        access_token="test-token",
        supabase=supabase,
        memberships=[],
    )


def test_insert_conversation_message_uses_rls_fields_only():
    message_id = str(uuid4())
    fake = FakeSupabase(
        insert_queue={
            "conversation_messages": [
                [
                    {
                        "id": message_id,
                        "session_id": "session-1",
                        "user_id": "user-1",
                        "role": "user",
                        "content": "hello",
                        "intent": "log",
                        "created_at": "2025-01-01T00:00:00Z",
                    }
                ]
            ]
        }
    )
    auth = _auth_with_supabase(fake)

    msg = asyncio.run(
        _insert_conversation_message(
            auth,
            session_id="session-1",
            role="user",
            content="hello",
            user_id="user-1",
            intent="log",
        )
    )

    assert msg.id == message_id
    insert_calls = [call for call in fake.calls if call[0] == "insert"]
    assert insert_calls
    _, table, payload, _ = insert_calls[0]
    assert table == "conversation_messages"
    assert "family_id" not in payload
    assert payload["session_id"] == "session-1"


def test_context_bundle_rejects_mismatched_child():
    session_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "conversation_sessions": [
                [
                    {
                        "id": session_id,
                        "user_id": "user-1",
                        "child_id": "child-a",
                        "title": "New chat",
                        "last_message_at": "2025-01-01T00:00:00Z",
                        "created_at": "2025-01-01T00:00:00Z",
                        "updated_at": "2025-01-01T00:00:00Z",
                        "catch_up_mode": False,
                        "catch_up_started_at": None,
                        "catch_up_last_message_at": None,
                    }
                ]
            ],
            "conversation_messages": [[]],
        }
    )
    auth = _auth_with_supabase(fake)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            _build_context_bundle(
                auth,
                child_id="child-b",
                session_id=session_id,
            )
        )

    assert exc.value.status_code == 404


def test_list_knowledge_empty_returns_list():
    child_id = str(uuid4())
    fake = FakeSupabase(
        select_queue={
            "children": [[{"id": child_id}]],
            "knowledge_items": [[]],
        }
    )
    auth = _auth_with_supabase(fake)

    result = asyncio.run(
        list_knowledge(
            status=None,
            child_id=child_id,
            auth=auth,
            child_id_header=None,
        )
    )

    assert result == []


def test_task_create_and_list_scope_family_child():
    child_id = str(uuid4())
    created_id = str(uuid4())
    created_at = "2025-01-01T00:00:00Z"
    fake = FakeSupabase(
        insert_queue={
            "tasks": [
                [
                    {
                        "id": created_id,
                        "child_id": child_id,
                        "title": "Call pediatrician",
                        "status": "open",
                        "due_at": None,
                        "remind_at": None,
                        "completed_at": None,
                        "reminder_channel": None,
                        "last_reminded_at": None,
                        "snooze_count": None,
                        "is_recurring": None,
                        "recurrence_rule": None,
                        "created_at": created_at,
                        "created_by_user_id": "user-1",
                        "assigned_to_user_id": "user-1",
                    }
                ]
            ]
        },
        select_queue={"tasks": [[]]},
    )
    auth = _auth_with_supabase(fake)

    payload = CreateTaskPayload(title="Call pediatrician", child_id=child_id)
    task = asyncio.run(
        create_task_endpoint(payload, auth=auth, child_id_header=None)
    )
    assert task.id == created_id

    asyncio.run(
        list_tasks_endpoint(
            view="open",
            child_id=child_id,
            auth=auth,
            child_id_header=None,
        )
    )

    insert_calls = [call for call in fake.calls if call[0] == "insert"]
    assert insert_calls
    _, _, insert_payload, _ = insert_calls[0]
    assert insert_payload["family_id"] == auth.family_id
    assert insert_payload["child_id"] == child_id

    select_calls = [call for call in fake.calls if call[0] == "select" and call[1] == "tasks"]
    assert select_calls
    _, _, select_params = select_calls[-1]
    assert select_params["family_id"] == f"eq.{auth.family_id}"
    assert select_params["child_id"] == f"eq.{child_id}"
