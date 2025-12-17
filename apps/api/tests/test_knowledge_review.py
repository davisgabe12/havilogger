from __future__ import annotations

from app.db import (
    create_knowledge_item,
    get_connection,
    get_primary_profile_id,
)
from app.schemas import KnowledgeItemStatus, KnowledgeItemType
from .test_conversation_cases import DEFAULT_PROFILE, client, reset_state, seed_profile


def _clear_knowledge_items() -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM knowledge_items")
        conn.commit()


def test_review_lists_pending_and_active_items_grouped() -> None:
    reset_state()
    _clear_knowledge_items()
    seed_profile(DEFAULT_PROFILE)
    profile_id = get_primary_profile_id()
    create_knowledge_item(
        profile_id=profile_id,
        key="care_framework",
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.PENDING,
        payload={"framework": "moms_on_call"},
    )
    create_knowledge_item(
        profile_id=profile_id,
        key="child_temperament",
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.ACTIVE,
        payload={"easygoing": True, "high_energy": True},
    )
    resp = client.get("/api/v1/knowledge/review")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert any(item["group"] == "Frameworks & Plans" for item in data)
    assert any(item["group"] == "Child Profile" for item in data)
    assert all("label" in item and "summary" in item for item in data)
    assert all("created_at" in item and item["created_at"] for item in data)
    assert all("relevant_date" in item for item in data)


def test_confirm_endpoint_activates_item() -> None:
    reset_state()
    _clear_knowledge_items()
    seed_profile(DEFAULT_PROFILE)
    profile_id = get_primary_profile_id()
    item = create_knowledge_item(
        profile_id=profile_id,
        key="pref_baby_gear_budget",
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.PENDING,
        payload={"max_usd": 250, "dismiss_count": 4},
    )
    resp = client.post(f"/api/v1/knowledge/{item.id}/confirm", json={"importance": "high"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "active"
    assert body["importance"] == "high"
    assert body["dismiss_count"] == 0


def test_reject_endpoint_rejects_item_and_increments_dismiss_count() -> None:
    reset_state()
    _clear_knowledge_items()
    seed_profile(DEFAULT_PROFILE)
    profile_id = get_primary_profile_id()
    item = create_knowledge_item(
        profile_id=profile_id,
        key="pref_bpa_free_products",
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.PENDING,
        payload={"scope": "bottles", "dismiss_count": 1},
    )
    resp = client.post(f"/api/v1/knowledge/{item.id}/reject")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "rejected"
    assert body["dismiss_count"] == 2


def test_edit_endpoint_converts_inferred_to_explicit_and_active() -> None:
    reset_state()
    _clear_knowledge_items()
    seed_profile(DEFAULT_PROFILE)
    profile_id = get_primary_profile_id()
    item = create_knowledge_item(
        profile_id=profile_id,
        key="child_milestone_profile",
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.PENDING,
        payload={"gross_motor": "crawling"},
    )
    resp = client.post(
        f"/api/v1/knowledge/{item.id}/edit",
        json={"payload": {"language": "babbling"}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "explicit"
    assert body["status"] == "active"
    assert "babbling" in body["payload"].get("language", "")


def test_prematurity_in_review_grouped_as_child_profile() -> None:
    reset_state()
    _clear_knowledge_items()
    seed_profile(DEFAULT_PROFILE)
    profile_id = get_primary_profile_id()
    create_knowledge_item(
        profile_id=profile_id,
        key="child_prematurity",
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.PENDING,
        payload={"is_premature": True, "source": "chat"},
    )
    resp = client.get("/api/v1/knowledge/review")
    data = resp.json()
    item = next((entry for entry in data if entry["key"] == "child_prematurity"), None)
    assert item is not None
    assert item["group"] == "Child Profile"


def test_places_of_interest_in_review_group() -> None:
    reset_state()
    _clear_knowledge_items()
    seed_profile(DEFAULT_PROFILE)
    profile_id = get_primary_profile_id()
    create_knowledge_item(
        profile_id=profile_id,
        key="places_of_interest",
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.PENDING,
        payload={"places": [{"name": "River Park", "type": "park"}], "source": "chat"},
    )
    resp = client.get("/api/v1/knowledge/review")
    data = resp.json()
    item = next((entry for entry in data if entry["key"] == "places_of_interest"), None)
    assert item and item["group"] == "Places & Routines"


def test_child_solids_in_review_grouped_as_food_and_feeding() -> None:
    reset_state()
    _clear_knowledge_items()
    seed_profile(DEFAULT_PROFILE)
    profile_id = get_primary_profile_id()
    create_knowledge_item(
        profile_id=profile_id,
        key="child_solids_profile",
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.PENDING,
        payload={"solids_started": True, "source": "chat"},
    )
    resp = client.get("/api/v1/knowledge/review")
    data = resp.json()
    item = next((entry for entry in data if entry["key"] == "child_solids_profile"), None)
    assert item and item["group"] == "Food & Feeding"
