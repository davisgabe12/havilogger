from __future__ import annotations

from typing import Any, Dict, List, Optional

from .db import list_knowledge_items
from .schemas import KnowledgeItemStatus


TEMPERAMENT_TRAITS = [
    "easygoing",
    "sensitive",
    "high_energy",
    "cautious",
    "strong_willed",
]

MILESTONE_FIELDS = ["gross_motor", "fine_motor", "language", "social"]


def build_child_context(profile_id: Optional[int], child_id: Optional[int]) -> Dict[str, Any]:
    """Gather active knowledge items and map them into structured child context."""

    def _empty_context() -> Dict[str, Any]:
        return {
            "temperament": {trait: None for trait in TEMPERAMENT_TRAITS},
            "activities": {"favorite_activities": [], "tags": []},
            "milestones": {field: None for field in MILESTONE_FIELDS},
            "feeding_type": None,
            "diaper_preference": None,
            "care_routine": None,
        }

    if profile_id is None:
        return _empty_context()

    context = _empty_context()
    items = list_knowledge_items(profile_id, status=KnowledgeItemStatus.ACTIVE, limit=200)
    for item in items:
        payload = item.payload or {}
        if item.key == "child_temperament":
            for trait in TEMPERAMENT_TRAITS:
                if trait in payload:
                    context["temperament"][trait] = payload[trait]
        elif item.key == "child_activity_preferences":
            favorites = payload.get("favorite_activities") or []
            tags = payload.get("tags") or []
            context["activities"]["favorite_activities"] = _merge_unique(
                context["activities"]["favorite_activities"],
                favorites,
            )
            context["activities"]["tags"] = _merge_unique(context["activities"]["tags"], tags)
        elif item.key == "child_milestone_profile":
            for field in MILESTONE_FIELDS:
                value = payload.get(field)
                if value:
                    context["milestones"][field] = value
        elif item.key == "feeding_structure":
            context["feeding_type"] = payload.get("structure") or context["feeding_type"]
        elif item.key == "care_framework":
            context["care_routine"] = payload
        elif item.key == "diaper_preference":
            context["diaper_preference"] = payload
    return context


def _merge_unique(base: List[str], additions: List[str]) -> List[str]:
    seen = set(base)
    merged = list(base)
    for value in additions:
        if value and value not in seen:
            merged.append(value)
            seen.add(value)
    return merged
