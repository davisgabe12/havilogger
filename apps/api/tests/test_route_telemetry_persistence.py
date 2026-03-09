from __future__ import annotations

import asyncio
import os
from uuid import uuid4

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")

from app.main import _persist_route_telemetry_row  # noqa: E402
from app.schemas import ChatRouteMetadata  # noqa: E402
from app.supabase import AuthContext  # noqa: E402


class FakeSupabase:
    def __init__(self, *, fail_insert: bool = False) -> None:
        self.fail_insert = fail_insert
        self.insert_calls: list[tuple[str, dict]] = []

    async def insert(self, table: str, payload: dict, *, params: dict | None = None) -> list[dict]:
        self.insert_calls.append((table, payload))
        if self.fail_insert:
            raise RuntimeError("table missing")
        return [payload]


def _build_auth(fake: FakeSupabase) -> AuthContext:
    return AuthContext(
        user_id=str(uuid4()),
        user_email="telemetry@example.com",
        family_id=str(uuid4()),
        access_token="test-token",
        supabase=fake,
        memberships=[],
    )


def _route_metadata() -> ChatRouteMetadata:
    return ChatRouteMetadata(
        route_kind="ask",
        expected_route_kind="ask",
        user_intent="question",
        classifier_intent="general_parenting_advice",
        decision_source="rule",
        confidence=0.71,
        classifier_fallback_reason=None,
        composer_source="deterministic",
        composer_fallback_reason=None,
    )


def test_persist_route_telemetry_row_writes_expected_payload(monkeypatch) -> None:
    monkeypatch.delenv("ENABLE_ROUTE_TELEMETRY_PERSISTENCE", raising=False)
    fake = FakeSupabase()
    auth = _build_auth(fake)

    asyncio.run(
        _persist_route_telemetry_row(
            auth=auth,
            child_id=str(uuid4()),
            conversation_id=str(uuid4()),
            user_message_id=str(uuid4()),
            assistant_message_id=str(uuid4()),
            route_metadata=_route_metadata(),
            classifier_reasons=["model_skipped:traffic"],
            ambiguous_eligible=True,
        )
    )

    assert len(fake.insert_calls) == 1
    table, payload = fake.insert_calls[0]
    assert table == "chat_route_telemetry"
    assert payload["family_id"] == auth.family_id
    assert payload["expected_route_kind"] == "ask"
    assert payload["route_kind"] == "ask"
    assert payload["decision_source"] == "rule"
    assert payload["ambiguous_eligible"] is True
    assert payload["classifier_reasons"] == ["model_skipped:traffic"]
    assert isinstance(payload["route_metadata"], dict)


def test_persist_route_telemetry_row_is_noop_when_disabled(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_ROUTE_TELEMETRY_PERSISTENCE", "0")
    fake = FakeSupabase()
    auth = _build_auth(fake)

    asyncio.run(
        _persist_route_telemetry_row(
            auth=auth,
            child_id=None,
            conversation_id=str(uuid4()),
            user_message_id=str(uuid4()),
            assistant_message_id=str(uuid4()),
            route_metadata=_route_metadata(),
            classifier_reasons=[],
            ambiguous_eligible=False,
        )
    )

    assert fake.insert_calls == []


def test_persist_route_telemetry_row_swallow_insert_errors(monkeypatch) -> None:
    monkeypatch.setenv("ENABLE_ROUTE_TELEMETRY_PERSISTENCE", "1")
    fake = FakeSupabase(fail_insert=True)
    auth = _build_auth(fake)

    asyncio.run(
        _persist_route_telemetry_row(
            auth=auth,
            child_id=None,
            conversation_id=str(uuid4()),
            user_message_id=str(uuid4()),
            assistant_message_id=str(uuid4()),
            route_metadata=_route_metadata(),
            classifier_reasons=[],
            ambiguous_eligible=False,
        )
    )

    assert len(fake.insert_calls) == 1
