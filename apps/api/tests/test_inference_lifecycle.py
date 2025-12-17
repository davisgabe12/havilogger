from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.db import ensure_default_profiles, get_connection, get_primary_child_id
from app.inferences import (
    CreateInferencePayload,
    InferenceStatus,
    create_inference,
    mark_inferences_prompted,
    update_inferences_status,
)
from app.knowledge_utils import filter_pending_for_prompt
from app.schemas import KnowledgeItem, KnowledgeItemStatus, KnowledgeItemType


def reset_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        for table in ["inferences", "knowledge_items"]:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()


def _pending_item(*, item_id: int, key: str, dedupe_key: str | None) -> KnowledgeItem:
    now = datetime.now(timezone.utc)
    payload = {"_dedupe_key": dedupe_key} if dedupe_key else {}
    return KnowledgeItem(
        id=item_id,
        profile_id=1,
        key=key,
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.PENDING,
        payload=payload,
        created_at=now,
        updated_at=now,
    )


def test_inference_dedupe_prevents_duplicates() -> None:
    reset_state()
    child_id = get_primary_child_id()
    payload = CreateInferencePayload(
        child_id=child_id,
        inference_type="care_framework",
        payload={"framework": "moms_on_call"},
    )
    first = create_inference(payload)
    second = create_inference(payload)
    assert first.id == second.id
    with get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM inferences").fetchone()[0]
    assert count == 1


def test_rejected_inference_is_suppressed() -> None:
    reset_state()
    child_id = get_primary_child_id()
    payload = CreateInferencePayload(
        child_id=child_id,
        inference_type="feeding_structure",
        payload={"structure": "combo"},
    )
    inf = create_inference(payload)
    update_inferences_status(
        child_id=child_id,
        inference_type="feeding_structure",
        dedupe_key=inf.dedupe_key,
        status=InferenceStatus.REJECTED,
    )
    duplicate = create_inference(payload)
    assert duplicate.status == InferenceStatus.REJECTED
    with get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM inferences").fetchone()[0]
    assert count == 1


def test_prompt_cooldown_and_cap() -> None:
    reset_state()
    now = datetime.now(timezone.utc)
    item_one = _pending_item(item_id=1, key="care_framework", dedupe_key="dedupe-1")
    item_two = _pending_item(item_id=2, key="feeding_structure", dedupe_key="dedupe-2")
    lookup = {
        "dedupe-1": {
            "status": "pending",
            "confidence": 0.9,
            "last_prompted_at": now,
            "related_to_message": True,
        },
        "dedupe-2": {
            "status": "pending",
            "confidence": 0.9,
            "last_prompted_at": now - timedelta(hours=13),
            "related_to_message": True,
        },
    }
    eligible = filter_pending_for_prompt(
        [item_one, item_two],
        session_id=1,
        inference_lookup=lookup,
        cooldown_hours=12,
        max_prompts=1,
    )
    # item_one is cooled down, so only item_two should be considered, capped at 1.
    assert len(eligible) == 1
    assert eligible[0].id == 2


def test_low_confidence_without_context_is_not_prompted() -> None:
    reset_state()
    item = _pending_item(item_id=3, key="care_framework", dedupe_key="dedupe-3")
    lookup = {
        "dedupe-3": {
            "status": "pending",
            "confidence": 0.2,
            "last_prompted_at": None,
            "related_to_message": False,
        }
    }
    eligible = filter_pending_for_prompt(
        [item],
        session_id=1,
        inference_lookup=lookup,
        cooldown_hours=12,
        max_prompts=1,
    )
    assert not eligible


def test_mark_prompt_updates_inference_timestamp() -> None:
    reset_state()
    child_id = get_primary_child_id()
    payload = CreateInferencePayload(
        child_id=child_id,
        inference_type="care_framework",
        payload={"framework": "moms_on_call"},
    )
    inf = create_inference(payload)
    assert inf.last_prompted_at is None
    mark_inferences_prompted([inf.dedupe_key])
    refreshed = create_inference(payload)
    assert refreshed.last_prompted_at is not None
