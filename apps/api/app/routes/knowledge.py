from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

from ..db import (
    fetch_primary_profiles,
    get_knowledge_item,
    list_knowledge_items,
    update_knowledge_item_payload,
    update_knowledge_item_status,
    update_knowledge_item_type,
)
from ..knowledge_utils import build_review_item
from ..inferences import InferenceStatus, update_inferences_status
from ..schemas import KnowledgeItemStatus, KnowledgeItemType

router = APIRouter()


REVIEW_HIDE_KEYS = {"child_birth_weight", "child_latest_weight"}


def _require_profile_id() -> int:
    caregiver_data, _ = fetch_primary_profiles()
    profile_id = caregiver_data.get("id")
    if profile_id is None:
        raise HTTPException(status_code=400, detail="No caregiver profile found")
    return profile_id


class ConfirmPayload(BaseModel):
    importance: Optional[str] = None


class EditPayload(BaseModel):
    payload: Dict[str, Any] = Body(default_factory=dict)
    importance: Optional[str] = None


@router.get("/api/v1/knowledge/review")
def review_knowledge() -> list[Dict[str, Any]]:
    profile_id = _require_profile_id()
    items = list_knowledge_items(profile_id, limit=500)
    result = []
    for item in items:
        if item.status not in {KnowledgeItemStatus.PENDING, KnowledgeItemStatus.ACTIVE}:
            continue
        if item.profile_id != profile_id:
            continue
        if item.key in REVIEW_HIDE_KEYS:
            continue
        result.append(build_review_item(item))
    return result


def _apply_importance_and_meta(
    payload: Dict[str, Any],
    *,
    importance: Optional[str] = None,
    reset_dismiss: bool = False,
    bump_confidence: bool = False,
) -> Dict[str, Any]:
    updated = dict(payload or {})
    if importance:
        updated["importance"] = importance
    if reset_dismiss:
        updated["dismiss_count"] = 0
    if bump_confidence:
        current = updated.get("confidence", 0.5)
        updated["confidence"] = min(1.0, current + 0.05)
    return updated


def _validate_ownership(item, profile_id: int) -> None:
    if item.profile_id != profile_id:
        raise HTTPException(status_code=403, detail="Not allowed to modify this item")


@router.post("/api/v1/knowledge/{item_id}/confirm")
def confirm_knowledge(item_id: int, payload: ConfirmPayload) -> Dict[str, Any]:
    profile_id = _require_profile_id()
    _caregiver, child = fetch_primary_profiles()
    item = get_knowledge_item(item_id)
    _validate_ownership(item, profile_id)
    new_payload = _apply_importance_and_meta(
        item.payload,
        importance=payload.importance,
        reset_dismiss=True,
        bump_confidence=True,
    )
    updated = update_knowledge_item_payload(item_id, new_payload, status=KnowledgeItemStatus.ACTIVE)
    dedupe_key = (item.payload or {}).get("_dedupe_key")
    update_inferences_status(
        child_id=child.get("id") if isinstance(child, dict) else None,
        inference_type=item.key,
        dedupe_key=dedupe_key,
        status=InferenceStatus.CONFIRMED,
    )
    return build_review_item(updated)


@router.post("/api/v1/knowledge/{item_id}/reject")
def reject_knowledge(item_id: int) -> Dict[str, Any]:
    profile_id = _require_profile_id()
    _caregiver, child = fetch_primary_profiles()
    item = get_knowledge_item(item_id)
    _validate_ownership(item, profile_id)
    updated_payload = dict(item.payload or {})
    updated_payload["dismiss_count"] = updated_payload.get("dismiss_count", 0) + 1
    updated = update_knowledge_item_payload(item_id, updated_payload, status=KnowledgeItemStatus.REJECTED)
    dedupe_key = (item.payload or {}).get("_dedupe_key")
    update_inferences_status(
        child_id=child.get("id") if isinstance(child, dict) else None,
        inference_type=item.key,
        dedupe_key=dedupe_key,
        status=InferenceStatus.REJECTED,
    )
    return build_review_item(updated)


@router.post("/api/v1/knowledge/{item_id}/edit")
def edit_knowledge(item_id: int, payload: EditPayload) -> Dict[str, Any]:
    profile_id = _require_profile_id()
    item = get_knowledge_item(item_id)
    _validate_ownership(item, profile_id)
    merged_payload = dict(item.payload or {})
    merged_payload.update(payload.payload)
    merged_payload.setdefault("confidence", merged_payload.get("confidence", 0.5))
    merged_payload.setdefault("dismiss_count", merged_payload.get("dismiss_count", 0))
    if item.type == KnowledgeItemType.INFERRED:
        update_knowledge_item_type(item_id, KnowledgeItemType.EXPLICIT)
    final_payload = _apply_importance_and_meta(merged_payload, importance=payload.importance, reset_dismiss=True)
    updated = update_knowledge_item_payload(item_id, final_payload, status=KnowledgeItemStatus.ACTIVE)
    return build_review_item(updated)
