from __future__ import annotations

from fastapi.testclient import TestClient


def create_conversation(client: TestClient, *, child_id: int) -> int:
    resp = client.post("/api/v1/conversations", params={"child_id": child_id})
    assert resp.status_code == 200
    payload = resp.json()
    return int(payload["id"])


def with_conversation(payload: dict, *, conversation_id: int) -> dict:
    return {**payload, "conversation_id": conversation_id}
