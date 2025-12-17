from __future__ import annotations

from datetime import datetime
from datetime import timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from .schemas import KnowledgeItem
from .schemas import KnowledgeItemStatus

TEMPERAMENT_TRAITS = [
    "easygoing",
    "sensitive",
    "high_energy",
    "cautious",
    "strong_willed",
]

GROUP_TAGS: Dict[str, List[str]] = {
    "care_framework": ["Frameworks & Plans"],
    "feeding_structure": ["Frameworks & Plans"],
    "care_routine": ["Frameworks & Plans"],
    "child_milestone_profile": ["Frameworks & Plans", "Child Profile"],
    "child_activity_preferences": ["Preferences", "Child Profile"],
    "child_temperament": ["Child Profile"],
    "pref_bpa_free_products": ["Preferences"],
    "pref_baby_gear_budget": ["Preferences"],
    "pref_outdoor_time_daily": ["Preferences"],
    "diaper_preference": ["Preferences"],
    "household_structure": ["People & Support"],
    "primary_pediatrician": ["People & Support"],
    "extended_support": ["People & Support"],
    "siblings": ["People & Support"],
    "manual_memory": ["Manual Notes"],
    "user_note": ["Manual Notes"],
    "child_prematurity": ["Child Profile"],
    "places_of_interest": ["Places & Routines"],
    "family_diet": ["Food & Feeding"],
    "child_solids_profile": ["Food & Feeding"],
}

LABEL_MAP: Dict[str, str] = {
    "care_framework": "Care framework",
    "feeding_structure": "Feeding structure",
    "care_routine": "Care routine",
    "child_milestone_profile": "Milestones",
    "child_activity_preferences": "Activity preferences",
    "child_temperament": "Temperament",
    "pref_bpa_free_products": "Product preference",
    "pref_baby_gear_budget": "Budget",
    "pref_outdoor_time_daily": "Outdoor time",
    "diaper_preference": "Diaper preference",
    "household_structure": "Household structure",
    "primary_pediatrician": "Primary pediatrician",
    "extended_support": "Extended support",
    "siblings": "Siblings",
    "manual_memory": "Manual note",
    "user_note": "Manual note",
    "child_prematurity": "Prematurity",
    "places_of_interest": "Places of interest",
    "family_diet": "Family diet",
    "child_solids_profile": "Solids & food",
}

SCOPE_LABELS = {
    "food_storage": "snack storage",
    "bottles": "bottles",
    "general": "products",
}


DATE_KEYS = [
    "date",
    "event_date",
    "weight_date",
    "measurement_date",
    "last_updated_date",
]


def knowledge_pending_prompts(pending: List[KnowledgeItem]) -> List[str]:
    prompts: List[str] = []
    for item in pending:
        handler = KNOWLEDGE_PROMPT_HANDLERS.get(item.key)
        if not handler:
            continue
        prompt = handler(item)
        if prompt:
            prompts.append(prompt)
    return prompts


def filter_pending_for_prompt(
    pending: List[KnowledgeItem],
    *,
    session_id: Optional[int],
    cooldown_hours: int = 12,
    max_prompts: int = 1,
    inference_lookup: Optional[Dict[str, Any]] = None,
    confidence_threshold: float = 0.6,
) -> List[KnowledgeItem]:
    """Return pending items that have not been prompted recently for this session."""
    now = datetime.utcnow()
    window = timedelta(hours=cooldown_hours)
    eligible: List[KnowledgeItem] = []
    for item in pending:
        if item.status != KnowledgeItemStatus.PENDING:
            continue
        dedupe_key = (item.payload or {}).get("_dedupe_key")
        inference_meta = inference_lookup.get(dedupe_key) if inference_lookup else None
        if inference_meta and inference_meta.get("status") == "rejected":
            continue
        if inference_meta:
            last_prompted_at = inference_meta.get("last_prompted_at")
            if last_prompted_at and now - last_prompted_at < window:
                continue
            if inference_meta.get("confidence", 0) < confidence_threshold and not inference_meta.get(
                "related_to_message", False
            ):
                continue
        last_prompted = item.last_prompted_at
        if last_prompted:
            try:
                last_dt = last_prompted if isinstance(last_prompted, datetime) else datetime.fromisoformat(
                    str(last_prompted)
                )
            except Exception:
                last_dt = None
            if last_dt and now - last_dt < window:
                continue
        eligible.append(item)
        if max_prompts and len(eligible) >= max_prompts:
            break
    return eligible


def knowledge_review_groups(key: str) -> Tuple[str, List[str]]:
    groups = GROUP_TAGS.get(key) or ["Preferences"]
    return groups[0], groups


def knowledge_review_label(key: str) -> str:
    return LABEL_MAP.get(key) or key.replace("_", " ").title()


def knowledge_review_summary(item: KnowledgeItem) -> str:
    key = item.key
    payload = item.payload or {}
    if key == "care_framework":
        framework = payload.get("framework")
        return _format_framework_name(framework) if framework else "Care framework in use"
    if key == "feeding_structure":
        structure = payload.get("structure")
        return _format_feed_structure(structure) if structure else "Feeding structure noted"
    if key == "child_temperament":
        traits = [trait.replace("_", " ") for trait in TEMPERAMENT_TRAITS if payload.get(trait)]
        return ", ".join(traits).title() if traits else "Temperament details"
    if key == "child_activity_preferences":
        favorites = payload.get("favorite_activities") or []
        return f"Favorites: {', '.join(favorites)}" if favorites else "Activity preferences"
    if key == "child_milestone_profile":
        pieces = []
        for field in ["gross_motor", "fine_motor", "language", "social"]:
            value = payload.get(field)
            if value:
                pieces.append(value.replace("_", " "))
        return " · ".join(pieces) if pieces else "Milestone snapshot"
    if key == "pref_bpa_free_products":
        scope = payload.get("scope") or "general"
        return f"Prefers BPA-free {SCOPE_LABELS.get(scope, 'products')}"
    if key == "pref_baby_gear_budget":
        max_usd = payload.get("max_usd")
        if isinstance(max_usd, (int, float)):
            return f"Likes to keep baby gear under ${max_usd:.0f}"
        return "Baby gear budget preference"
    if key == "pref_outdoor_time_daily":
        minutes = payload.get("target_minutes")
        if isinstance(minutes, int):
            return f"Aims for ~{minutes} minutes of outdoor time daily"
        return "Prioritizes daily outdoor time"
    if key == "manual_memory" or key == "user_note":
        text = payload.get("text") or ""
        return text[:80] + "…" if len(text) > 80 else text or "Manual note"
    if key == "child_prematurity":
        if payload.get("is_premature"):
            weeks = payload.get("gestational_age_weeks")
            early = payload.get("weeks_early")
            if weeks and early:
                return f"Born premature at {weeks:.1f} weeks ({early:.1f} weeks early)"
            return "Born premature (details pending)"
        return "Born at term (not premature)"
    if key == "places_of_interest":
        places = payload.get("places") or []
        names = [place.get("name") for place in places if place.get("name")]
        return "Regular places: " + ", ".join(names[:3]) if names else "Places of interest"
    if key == "family_diet":
        patterns = payload.get("diet_patterns") or []
        avoids = payload.get("avoid_ingredients") or []
        allergies = payload.get("allergies") or []
        parts = []
        if patterns:
            parts.append("Family diet: " + ", ".join(patterns))
        if avoids:
            parts.append("Avoids " + ", ".join(avoids))
        if allergies:
            parts.append("Allergies: " + ", ".join(allergies))
        if parts:
            return "; ".join(parts)
        return "Family diet preferences"
    if key == "child_solids_profile":
        started = payload.get("solids_started")
        approach = payload.get("approach")
        age = payload.get("age_started_months")
        favorites = payload.get("favorite_foods") or []
        allergens = payload.get("allergens_introduced") or []
        if started is False:
            return "Solids not started yet"
        parts = []
        if started:
            parts.append("Solids started")
        if approach:
            parts.append(f"Approach: {approach}")
        if age:
            parts.append(f"Started ~{age} months")
        if favorites:
            parts.append("Likes: " + ", ".join(favorites[:2]))
        if allergens:
            parts.append("Allergens: " + ", ".join(allergens[:2]))
        return "; ".join(parts) if parts else "Solids profile"
    return payload.get("summary") or "Detailed preference"


def knowledge_suggested_prompt(item: KnowledgeItem) -> Optional[str]:
    handler = KNOWLEDGE_PROMPT_HANDLERS.get(item.key)
    if not handler:
        return None
    return handler(item)


def build_review_item(
    item: KnowledgeItem,
) -> dict[str, Any]:
    payload = item.payload or {}
    importance = payload.get("importance", "medium")
    confidence = payload.get("confidence", 0.5)
    dismiss_count = payload.get("dismiss_count", 0)
    group, groups = knowledge_review_groups(item.key)
    return {
        "id": item.id,
        "key": item.key,
        "group": group,
        "groups": groups,
        "type": item.type,
        "status": item.status,
        "label": knowledge_review_label(item.key),
        "summary": knowledge_review_summary(item),
        "importance": importance,
        "confidence": confidence,
        "dismiss_count": dismiss_count,
        "payload": payload,
        "suggested_prompt": knowledge_suggested_prompt(item),
        "created_at": item.created_at.isoformat(),
        "relevant_date": knowledge_relevant_date(item),
    }


def _prompt_for_care_framework(item: KnowledgeItem) -> Optional[str]:
    framework = item.payload.get("framework")
    if not framework:
        return None
    name = _format_framework_name(framework)
    return f"I've noticed you might be using {name}. Should I use that as a guide when I talk about sleep and routines?"


def _prompt_for_feeding_structure(item: KnowledgeItem) -> Optional[str]:
    structure = item.payload.get("structure")
    if not structure:
        return None
    phrasing = _format_feed_structure(structure)
    return f"Your feeds look {phrasing} right now. Do you want me to keep tracking patterns that way?"


def _prompt_for_bpa_free(item: KnowledgeItem) -> Optional[str]:
    scope = item.payload.get("scope") or "general"
    label = SCOPE_LABELS.get(scope, "baby products")
    return f"You've mentioned BPA-free {label}. Should I treat 'BPA-free' as a general preference when I suggest gear or storage?"


def _prompt_for_baby_gear_budget(item: KnowledgeItem) -> Optional[str]:
    max_usd = item.payload.get("max_usd")
    if not isinstance(max_usd, (int, float)):
        return None
    return (
        f"You've said you'd like to keep baby gear around ${max_usd:.0f}. Should I use that as a guideline when I suggest products or plans?"
    )


def _prompt_for_outdoor_time(item: KnowledgeItem) -> Optional[str]:
    minutes = item.payload.get("target_minutes")
    if isinstance(minutes, int):
        return (
            f"It sounds like you try to get outside about {minutes} minutes a day. Should I assume daily outdoor time is a priority when I suggest routines?"
        )
    return (
        "It sounds like getting outside every day is important to you. Should I treat 'daily outdoor time' as a priority when I suggest routines?"
    )


def _prompt_for_child_prematurity(item: KnowledgeItem) -> Optional[str]:
    if item.payload.get("is_premature"):
        return "You mentioned your child was born early. Should I keep that in mind when I talk about growth and milestones?"
    return "Thanks for sharing your child’s birth story—should I remember it to tailor expectations?"


def _prompt_for_places_of_interest(item: KnowledgeItem) -> Optional[str]:
    places = item.payload.get("places") or []
    names = [place.get("name") for place in places if place.get("name")]
    if not names:
        return None
    snippet = ", ".join(names[:3])
    return f"You often go to {snippet}. Should I keep those spots in mind when I suggest outings or routines?"


def _prompt_for_family_diet(item: KnowledgeItem) -> Optional[str]:
    patterns = item.payload.get("diet_patterns") or []
    avoids = item.payload.get("avoid_ingredients") or []
    phrases = []
    if patterns:
        phrases.append(", ".join(patterns))
    if avoids:
        phrases.append("avoid " + ", ".join(avoids))
    if not phrases:
        return None
    return f"You follow { ' and '.join(phrases) }. Should I use that when I suggest meals or snacks?"


def _prompt_for_child_solids(item: KnowledgeItem) -> Optional[str]:
    approach = item.payload.get("approach")
    if approach:
        return f"I know you're introducing solids via {approach}. Want me to keep building on that approach in future food ideas?"
    if item.payload.get("solids_started") is False:
        return "Solids haven't started yet—should I wait before suggesting solids content?"
    return "Thanks for sharing your solids journey—should I remember it when I share feeding tips?"


def _prompt_for_activity_preferences(item: KnowledgeItem) -> Optional[str]:
    favorites = item.payload.get("favorite_activities") or []
    tags = item.payload.get("tags") or []
    if not favorites and not tags:
        return None
    favorites_text = ", ".join(favorites[:3])
    tags_text = ", ".join(tags[:3])
    base = favorites_text or tags_text
    return f"You’ve mentioned your child enjoys {base}. Should I remember those activities when I suggest play ideas?"


def _prompt_for_milestone_profile(item: KnowledgeItem) -> Optional[str]:
    descriptions = []
    for field in ["gross_motor", "fine_motor", "language", "social"]:
        value = item.payload.get(field)
        if value:
            descriptions.append(value.replace("_", " "))
    if not descriptions:
        return None
    summary = " and ".join(descriptions[:2]) if len(descriptions) <= 2 else ", ".join(descriptions[:2])
    return f"It sounds like your child is {summary}. Should I use that stage when talking about milestones and activities?"


KNOWLEDGE_PROMPT_HANDLERS: Dict[str, Callable[[KnowledgeItem], Optional[str]]] = {
    "care_framework": _prompt_for_care_framework,
    "feeding_structure": _prompt_for_feeding_structure,
    "pref_bpa_free_products": _prompt_for_bpa_free,
    "pref_baby_gear_budget": _prompt_for_baby_gear_budget,
    "pref_outdoor_time_daily": _prompt_for_outdoor_time,
    "child_prematurity": _prompt_for_child_prematurity,
    "places_of_interest": _prompt_for_places_of_interest,
    "family_diet": _prompt_for_family_diet,
    "child_solids_profile": _prompt_for_child_solids,
    "child_activity_preferences": _prompt_for_activity_preferences,
    "child_milestone_profile": _prompt_for_milestone_profile,
}


def _format_framework_name(code: Optional[str]) -> str:
    mapping = {
        "moms_on_call": "Moms on Call",
    }
    if not code:
        return "a care framework"
    return mapping.get(code, code.replace("_", " ").title())


def _format_feed_structure(code: Optional[str]) -> str:
    mapping = {
        "combo": "combo feeding",
    }
    if not code:
        return "your current structure"
    return mapping.get(code, code.replace("_", " ").title())


def knowledge_relevant_date(item: KnowledgeItem) -> Optional[str]:
    payload = item.payload or {}
    for key in DATE_KEYS:
        value = payload.get(key)
        if value:
            try:
                parsed = datetime.fromisoformat(value)
                return parsed.date().isoformat()
            except Exception:
                try:
                    parsed = datetime.strptime(value, "%Y-%m-%d")
                    return parsed.date().isoformat()
                except Exception:
                    continue
    return None
