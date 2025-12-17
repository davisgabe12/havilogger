from __future__ import annotations

from app.db import find_knowledge_item, get_primary_child_id, get_primary_profile_id
from app.schemas import KnowledgeItemType, KnowledgeItemStatus
from .test_conversation_cases import DEFAULT_PROFILE, client, reset_state, seed_profile


def test_save_to_memory_confirms_pending_inferences() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    resp = client.post(
        "/api/v1/activities",
        json={"message": "We’re following Moms on Call for naps", "child_id": child_id},
    )
    assert resp.status_code == 200
    profile_id = get_primary_profile_id()
    assert find_knowledge_item(profile_id, "care_framework") is not None

    save_resp = client.post("/api/v1/activities", json={"message": "Save to memory", "child_id": child_id})
    assert save_resp.status_code == 200
    assert "confirm" in save_resp.json()["assistant_message"].lower()
    manual_item = find_knowledge_item(profile_id, "manual_memory")
    assert manual_item is None


def test_save_to_memory_creates_manual_memory_item_when_no_pending() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    message = "Remember this: we want to visit grandparents next weekend."
    response = client.post("/api/v1/activities", json={"message": message, "child_id": child_id})
    assert response.status_code == 200
    profile_id = get_primary_profile_id()
    item = find_knowledge_item(profile_id, "manual_memory")
    assert item is not None
    assert item.payload["text"] == message
    assert item.type == KnowledgeItemType.EXPLICIT
    assert item.status == KnowledgeItemStatus.ACTIVE


def test_save_to_memory_asks_for_clarification_if_no_context_to_save() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    response = client.post("/api/v1/activities", json={"message": "Save that", "child_id": child_id})
    assert response.status_code == 200
    assert "what would you like me to save" in response.json()["assistant_message"].lower()
    profile_id = get_primary_profile_id()
    assert find_knowledge_item(profile_id, "manual_memory") is None
