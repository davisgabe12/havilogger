"""Knowledge graph storage helpers."""
from __future__ import annotations

import json
import re
import unicodedata
import hashlib
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

from enum import Enum
from pydantic import BaseModel, Field

from .db import (
    create_knowledge_item,
    find_knowledge_item,
    get_connection,
    get_primary_profile_id,
    update_knowledge_item_payload,
)
from .schemas import Action, KnowledgeItemStatus, KnowledgeItemType


class InferenceStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    EXPIRED = "expired"


# Inference contract:
# - dedupe_key = hash(child_id, inference_type, payload) to prevent duplicates across all statuses.
# - lifecycle: pending -> confirmed/rejected; rejected is never re-created or re-prompted.
# - prompt cadence: last_prompted_at is updated when we surface a prompt to avoid spamming.

class Inference(BaseModel):
    id: int
    child_id: Optional[int]
    user_id: Optional[int]
    inference_type: str
    payload: Dict[str, Any]
    confidence: float = 0.5
    status: str = InferenceStatus.PENDING
    source: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    expires_at: Optional[datetime] = None
    dedupe_key: Optional[str] = None
    last_prompted_at: Optional[datetime] = None


class CreateInferencePayload(BaseModel):
    child_id: Optional[int] = None
    user_id: Optional[int] = None
    inference_type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.5
    status: str = InferenceStatus.PENDING
    source: Optional[str] = None
    expires_at: Optional[datetime] = None


def create_inference(data: CreateInferencePayload) -> Inference:
    now = datetime.now(tz=timezone.utc).isoformat()
    dedupe_key = _dedupe_key(data.child_id, data.inference_type, data.payload)
    existing = get_inference_by_dedupe_key(dedupe_key)
    if existing:
        # If it already exists (even rejected), reuse it instead of spamming new rows.
        return existing
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO inferences (
                child_id,
                user_id,
                inference_type,
                payload,
                confidence,
                status,
                source,
                created_at,
                updated_at,
                expires_at,
                dedupe_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.child_id,
                data.user_id,
                data.inference_type,
                json.dumps(data.payload, ensure_ascii=False),
                data.confidence,
                data.status,
                data.source,
                now,
                now,
                data.expires_at.isoformat() if data.expires_at else None,
                dedupe_key,
            ),
        )
        conn.commit()
        inference_id = cursor.lastrowid

    return get_inference(inference_id)


def get_inference(inference_id: int) -> Inference:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM inferences WHERE id = ?",
            (inference_id,),
        )
        row = cursor.fetchone()
    if not row:
        raise ValueError(f"Inference {inference_id} not found")
    return _row_to_inference(row)


def get_inference_by_dedupe_key(dedupe_key: str) -> Optional[Inference]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM inferences WHERE dedupe_key = ? LIMIT 1",
            (dedupe_key,),
        )
        row = cursor.fetchone()
    if not row:
        return None
    return _row_to_inference(row)


def list_inferences(
    *,
    child_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Inference]:
    query = "SELECT * FROM inferences"
    clauses = []
    params: List[Any] = []

    if child_id is not None:
        clauses.append("child_id = ?")
        params.append(child_id)
    if status is not None:
        clauses.append("status = ?")
        params.append(status)

    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    with get_connection() as conn:
        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
    return [_row_to_inference(row) for row in rows]


def update_inference_status(
    inference_id: int,
    *,
    status: str,
) -> Inference:
    now = datetime.now(tz=timezone.utc).isoformat()
    with get_connection() as conn:
        conn.execute(
            "UPDATE inferences SET status = ?, updated_at = ? WHERE id = ?",
            (status, now, inference_id),
        )
        conn.commit()
    return get_inference(inference_id)


def _row_to_inference(row: Any) -> Inference:
    # Older databases won't have the extra columns until migration; guard by length.
    dedupe_key = row[11] if len(row) > 11 else None
    last_prompted = row[12] if len(row) > 12 else None
    return Inference(
        id=row[0],
        child_id=row[1],
        user_id=row[2],
        inference_type=row[3],
        payload=json.loads(row[4]),
        confidence=row[5],
        status=row[6],
        source=row[7],
        created_at=datetime.fromisoformat(row[8]),
        updated_at=datetime.fromisoformat(row[9]),
        expires_at=datetime.fromisoformat(row[10]) if row[10] else None,
        dedupe_key=dedupe_key,
        last_prompted_at=datetime.fromisoformat(last_prompted) if last_prompted else None,
    )


def detect_knowledge_inferences(
    message: str,
    actions: List[Action],
    *,
    child_id: Optional[int] = None,
    user_id: Optional[int] = None,
    profile_id: Optional[int] = None,
) -> List[Inference]:
    normalized_message = message.strip()
    if not normalized_message:
        return []

    lower = _normalize_message(normalized_message)
    candidates: List[Tuple[str, Dict[str, Any]]] = []

    if "moms on call" in lower:
        candidates.append(
            (
                "care_framework",
                {
                    "framework": "moms_on_call",
                    "evidence": normalized_message,
                    "source": "chat",
                },
            )
        )

    has_formula_action = any(
        action.metadata.substance and "formula" in action.metadata.substance.lower()
        for action in actions
    )
    mentions_breast = "breast" in lower or "breastfeeding" in lower
    mentions_combo = any(word in lower for word in ("combo", "combination", "mixed"))
    if (mentions_combo and (mentions_breast or has_formula_action)) or (mentions_breast and has_formula_action):
        candidates.append(
            (
                "feeding_structure",
                {
                    "structure": "combo",
                    "evidence": normalized_message,
                    "source": "chat",
                },
            )
        )

    activity_payload = _detect_activity_payload(lower)
    if activity_payload:
        candidates.append(("child_activity_preferences", activity_payload))

    milestone_payload = _detect_milestone_payload(lower)
    if milestone_payload:
        candidates.append(("child_milestone_profile", milestone_payload))

    bpa_payload = _detect_bpa_free_payload(lower)
    if bpa_payload:
        candidates.append(("pref_bpa_free_products", bpa_payload))

    budget_payload = _detect_baby_gear_budget_payload(lower)
    if budget_payload:
        candidates.append(("pref_baby_gear_budget", budget_payload))

    outdoor_payload = _detect_daily_outdoor_payload(lower)
    if outdoor_payload:
        candidates.append(("pref_outdoor_time_daily", outdoor_payload))

    prematurity_payload = _detect_child_prematurity_payload(lower)
    if prematurity_payload:
        candidates.append(("child_prematurity", prematurity_payload))

    places_payload = _detect_places_of_interest_payload(normalized_message)
    if places_payload:
        candidates.append(("places_of_interest", places_payload))

    family_diet_payload = _detect_family_diet_payload(lower)
    if family_diet_payload:
        candidates.append(("family_diet", family_diet_payload))

    solids_payload = _detect_child_solids_payload(lower)
    if solids_payload:
        candidates.append(("child_solids_profile", solids_payload))

    if profile_id is None:
        profile_id = get_primary_profile_id()

    created: List[Inference] = []
    for inference_type, payload in candidates:
        candidate_payload = CreateInferencePayload(
            child_id=child_id,
            user_id=user_id,
            inference_type=inference_type,
            payload=payload,
            source="text_heuristic",
        )
        inference = create_inference(candidate_payload)
        created.append(inference)
        _persist_pending_knowledge(
            profile_id,
            inference_type,
            payload,
            dedupe_key=inference.dedupe_key,
        )
    return created


def _persist_pending_knowledge(
    profile_id: Optional[int],
    key: str,
    payload: Dict[str, Any],
    *,
    dedupe_key: Optional[str],
) -> None:
    if profile_id is None:
        return
    existing = find_knowledge_item(profile_id, key)
    merge_fn = _MERGE_HANDLERS.get(key)
    if existing and existing.status != KnowledgeItemStatus.REJECTED:
        if merge_fn:
            merged = merge_fn(existing.payload, payload)
            update_knowledge_item_payload(existing.id, merged)
        return
    final_payload = payload
    if merge_fn and existing:
        final_payload = merge_fn(existing.payload, payload)
    if dedupe_key:
        final_payload = {**final_payload, "_dedupe_key": dedupe_key}
    create_knowledge_item(
        profile_id=profile_id,
        key=key,
        type=KnowledgeItemType.INFERRED,
        status=KnowledgeItemStatus.PENDING,
        payload=final_payload,
    )


def _dedupe_key(child_id: Optional[int], inference_type: str, payload: Dict[str, Any]) -> str:
    payload_str = json.dumps(payload or {}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()
    return f"{child_id or 'none'}::{inference_type}::{payload_hash}"


def mark_inferences_prompted(dedupe_keys: List[str]) -> None:
    if not dedupe_keys:
        return
    now = datetime.now(tz=timezone.utc).isoformat()
    with get_connection() as conn:
        conn.executemany(
            "UPDATE inferences SET last_prompted_at = ?, updated_at = ? WHERE dedupe_key = ?",
            [(now, now, key) for key in dedupe_keys],
        )
        conn.commit()


def update_inferences_status(
    *,
    child_id: Optional[int],
    inference_type: str,
    dedupe_key: Optional[str] = None,
    status: InferenceStatus,
) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    clauses = ["inference_type = ?"]
    params: List[Any] = [inference_type]
    if child_id is not None:
        clauses.append("child_id = ?")
        params.append(child_id)
    if dedupe_key:
        clauses.append("dedupe_key = ?")
        params.append(dedupe_key)
    where_clause = " AND ".join(clauses)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE inferences SET status = ?, updated_at = ? WHERE {where_clause}",
            (status.value, now, *params),
        )
        conn.commit()


def _detect_bpa_free_payload(lower: str) -> Optional[Dict[str, Any]]:
    strong_triggers = ["bpa-free", "bpa free", "keep everything bpa-free", "keep everything bpa free"]
    weak_triggers = [
        "read an article",
        "read about",
        "saw bpa-free",
        "what does bpa-free mean",
        "heard about",
    ]
    if not any(trigger in lower for trigger in strong_triggers):
        return None
    if any(trigger in lower for trigger in weak_triggers):
        return None
    scope = "general"
    if "snack" in lower or "container" in lower or "storage" in lower:
        scope = "food_storage"
    elif "bottle" in lower:
        scope = "bottles"
    return {"scope": scope, "source": "chat"}


def _detect_baby_gear_budget_payload(lower: str) -> Optional[Dict[str, Any]]:
    context_keywords = ["gear", "stroller", "items", "baby gear", "big items"]
    trigger_keywords = ["keep", "under", "budget", "stay"]
    if not any(keyword in lower for keyword in context_keywords):
        return None
    if not any(keyword in lower for keyword in trigger_keywords):
        return None
    value = _extract_numeric_value(lower)
    if value is None:
        return None
    return {"max_usd": value, "source": "chat"}


def _detect_daily_outdoor_payload(lower: str) -> Optional[Dict[str, Any]]:
    outside_keywords = ["outside", "outdoors"]
    time_keywords = ["every day", "daily", "each day", "every afternoon"]
    if not any(keyword in lower for keyword in outside_keywords):
        return None
    if not any(keyword in lower for keyword in time_keywords):
        return None
    minutes = _extract_minutes(lower)
    return {"target_minutes": minutes, "source": "chat"}


def _extract_numeric_value(text: str) -> Optional[float]:
    match = re.search(r"\$?(\d+(?:\.\d+)?)", text)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def _extract_minutes(text: str) -> Optional[int]:
    minute_match = re.search(r"(\d+)\s*minutes?", text)
    if minute_match:
        return int(minute_match.group(1))
    hour_match = re.search(r"(\d+)\s*hours?", text)
    if hour_match:
        return int(hour_match.group(1)) * 60
    if "an hour" in text:
        return 60
    return None


def _normalize_message(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.replace("’", "'").replace("‘", "'")
    return normalized.lower()


def _normalize_food_term(term: str) -> str:
    term = term.strip().lower()
    if term.endswith("s") and term not in {"shellfish"}:
        return term[:-1]
    return term


def _detect_activity_payload(lower: str) -> Optional[Dict[str, Any]]:
    signals = [
        (["water play", "bath", "splash"], "water play", ["sensory", "water"]),
        (["reading", "books"], "reading books", ["reading", "quiet_play"]),
        (["music", "dance", "dancing"], "music and dancing", ["music", "gross_motor"]),
        (["animals", "dog", "cat"], "animals", ["animals", "social"]),
        (["climb", "rough-and-tumble", "rough and tumble"], "climbing/rough-and-tumble", ["gross_motor", "high_energy"]),
    ]
    activities: list[str] = []
    tags: list[str] = []
    for keywords, activity, signal_tags in signals:
        if any(keyword in lower for keyword in keywords):
            if activity not in activities:
                activities.append(activity)
            for tag in signal_tags:
                if tag not in tags:
                    tags.append(tag)
    if "outside" in lower or "outdoors" in lower:
        if "outdoor" not in tags:
            tags.append("outdoor")
    if "quiet" in lower:
        if "quiet_play" not in tags:
            tags.append("quiet_play")
    if not activities and not tags:
        return None
    return {
        "favorite_activities": activities,
        "tags": tags,
        "source": "chat",
    }


def _detect_milestone_payload(lower: str) -> Optional[Dict[str, Any]]:
    weak_modifiers = ["might", "maybe", "probably"]
    if any(mod in lower for mod in weak_modifiers):
        return None
    payload: Dict[str, Any] = {}
    patterns = {
        "gross_motor": [
            ("rolling over", "rolling"),
            ("just started rolling", "rolling"),
            ("just started crawling", "crawling"),
            ("pulling up to stand", "pulling_to_stand"),
            ("cruising", "cruising"),
            ("walking now", "walking"),
            ("just started walking", "walking"),
        ],
        "fine_motor": [
            ("pincer grasp", "pincer_grasp"),
            ("picking up small puffs", "pincer_grasp"),
            ("stacking blocks", "stacking_blocks"),
            ("reaches and grasps", "grasping"),
            ("grasping toys", "grasping"),
        ],
        "language": [
            ("cooing", "cooing"),
            ("babbling", "babbling"),
            ("saying 'mama' and 'dada'", "first_words"),
            ("two words", "two_word_phrases"),
            ("first words", "first_words"),
        ],
        "social": [
            ("smiles at us all the time", "smiling"),
            ("stranger anxiety", "stranger_anxiety"),
            ("interactive play", "interactive_play"),
            ("peekaboo", "interactive_play"),
        ],
    }
    for field, checks in patterns.items():
        for phrase, value in checks:
            if phrase in lower:
                payload[field] = value
                break
    return payload if payload else None


def _detect_child_prematurity_payload(lower: str) -> Optional[Dict[str, Any]]:
    weak_phrases = ["read an article", "read about", "saw preterm", "what does premature mean"]
    if any(weak in lower for weak in weak_phrases):
        return None
    detected = False
    payload: Dict[str, Any] = {"source": "chat"}
    weeks_match = re.search(r"born at (\d+(?:\.\d+)?) weeks", lower)
    if weeks_match:
        gestational = float(weeks_match.group(1))
        payload["gestational_age_weeks"] = gestational
        payload["weeks_early"] = round(max(0.0, 40.0 - gestational), 1)
        payload["is_premature"] = gestational < 37.0
        detected = True
    early_match = re.search(r"(\d+(?:\.\d+)?) weeks early", lower)
    if early_match:
        weeks_early = float(early_match.group(1))
        payload["weeks_early"] = weeks_early
        payload["gestational_age_weeks"] = round(max(0.0, 40.0 - weeks_early), 1)
        payload["is_premature"] = weeks_early >= 2.0
        detected = True
    if "premature" in lower or "preterm" in lower or "nicu" in lower:
        payload.setdefault("is_premature", True)
        detected = True
    return payload if detected else None


def _detect_places_of_interest_payload(message: str) -> Optional[Dict[str, Any]]:
    normalized = _normalize_message(message)
    ascii_message = unicodedata.normalize("NFKC", message).replace("’", "'").replace("‘", "'")
    freq_keywords = ["usually", "often", "every", "weekly", "regular", "always", "daily", "monthly"]
    weekday_keywords = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    if "once" in normalized and not any(keyword in normalized for keyword in freq_keywords + weekday_keywords):
        return None
    if not any(keyword in normalized for keyword in freq_keywords + weekday_keywords):
        return None
    place_patterns = [
        ("park", ["park", "playground"]),
        ("grandparent_home", ["grandma", "grandpa", "grandparents", "nana", "nana's", "grandma's"]),
        ("library", ["library"]),
        ("childcare", ["daycare", "preschool"]),
        ("pediatrician_office", ["pediatrician", "doctor's office"]),
        ("other", ["parklet", "play cafe", "play cafe"]),
    ]
    for place_type, keywords in place_patterns:
        for keyword in keywords:
            if keyword in normalized:
                name = _capture_place_name(ascii_message, keyword) or f"{keyword.title()} near us"
                place = {
                    "name": name,
                    "type": place_type,
                    "city": _extract_city(message),
                    "notes": message,
                }
                return {"places": [place], "source": "chat"}
    return None


def _capture_place_name(text: str, keyword: str) -> Optional[str]:
    match = re.search(rf"(?:to|at|the)\s+([\w\s]+?\s+{keyword})", text, re.IGNORECASE)
    if match:
        return match.group(1).strip().title()
    return None


def _extract_city(text: str) -> Optional[str]:
    match = re.search(r"in\s+([A-Za-z\s]+)", text)
    if match:
        return match.group(1).strip().title()
    return None


def _matches_avoid_phrase(lower: str, ingredient: str) -> bool:
    pattern = rf"(?:avoid|dont eat|don't eat|without)\b[^.]*?\b{ingredient}\b"
    return bool(re.search(pattern, lower))


def _mentions_allergy(lower: str, term: str) -> bool:
    pattern = rf"allergic to\b[^.]*\b{term}s?\b"
    return bool(re.search(pattern, lower)) or f"{term} allergy" in lower or f"{term}s allergy" in lower


def _detect_family_diet_payload(lower: str) -> Optional[Dict[str, Any]]:
    diet_patterns = []
    avoids = set()
    allergies = set()
    pattern_map = {
        "vegetarian": ["vegetarian"],
        "pescatarian": ["pescatarian"],
        "kosher": ["kosher"],
        "dairy-free": ["dairy-free", "dairy free"],
        "gluten-free": ["gluten-free", "gluten free"],
    }
    avoid_keywords = ["pork", "shellfish", "beef", "sugar", "processed foods"]
    allergy_keywords = ["peanut", "egg", "dairy", "milk"]
    for key, phrases in pattern_map.items():
        if any(phrase in lower for phrase in phrases):
            diet_patterns.append(key)
    for ingredient in avoid_keywords:
        if _matches_avoid_phrase(lower, ingredient):
            avoids.add(_normalize_food_term(ingredient))
    for base in allergy_keywords:
        if _mentions_allergy(lower, base):
            allergies.add(base)
    if not (diet_patterns or avoids or allergies):
        return None
    return {
        "diet_patterns": diet_patterns,
        "avoid_ingredients": list(avoids),
        "allergies": list(allergies),
        "source": "chat",
    }


def _detect_child_solids_payload(lower: str) -> Optional[Dict[str, Any]]:
    if "solids" not in lower:
        return None
    payload: Dict[str, Any] = {"source": "chat"}
    detected = False
    if "hasn't started solids" in lower or "has not started solids" in lower:
        payload["solids_started"] = False
        detected = True
    elif "started solids" in lower or "just started solids" in lower:
        payload["solids_started"] = True
        detected = True
    if "blw" in lower or "baby-led" in lower:
        payload["approach"] = "blw"
        detected = True
    elif "puree" in lower or "purees" in lower:
        payload["approach"] = "puree"
        detected = True
    elif "combo" in lower or "combination" in lower:
        payload["approach"] = "combo"
        detected = True
    age_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:months|mos)", lower)
    if age_match:
        payload["age_started_months"] = float(age_match.group(1))
        detected = True
    allergens = []
    favorite_foods = []
    disliked_foods = []
    foods = ["avocado", "sweet potato", "peas", "bananas", "carrot", "apple"]
    positive = ["love", "loves", "like", "likes", "favorite", "enjoy"]
    negative = ["hate", "hates", "dislike", "dislikes", "not a fan"]
    for food in foods:
        if food in lower:
            if any(p in lower for p in positive) or f"with {food}" in lower or f"and {food}" in lower:
                favorite_foods.append(food)
                detected = True
            if any(n in lower for n in negative):
                disliked_foods.append(food)
                detected = True
    for allergen in ["peanut", "egg", "milk"]:
        if f"introduced {allergen}" in lower or f"{allergen} introduced" in lower:
            allergens.append(allergen)
            detected = True
        if f"{allergen} allergy" in lower or f"allergic to {allergen}" in lower:
            allergens.append(allergen)
            detected = True
    if allergens:
        payload["allergens_introduced"] = list(dict.fromkeys(allergens))
    if favorite_foods:
        payload["favorite_foods"] = list(dict.fromkeys(favorite_foods))
    if disliked_foods:
        payload["disliked_foods"] = list(dict.fromkeys(disliked_foods))
    if favorite_foods or disliked_foods or allergens:
        detected = True
    if detected:
        return payload
    return None


def _merge_activity_preferences(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    existing_activities = existing.get("favorite_activities") or []
    existing_tags = existing.get("tags") or []
    new_activities = incoming.get("favorite_activities") or []
    new_tags = incoming.get("tags") or []
    merged_activities = _merge_unique(existing_activities, new_activities)
    merged_tags = _merge_unique(existing_tags, new_tags)
    return {
        "favorite_activities": merged_activities,
        "tags": merged_tags,
        "source": incoming.get("source", "chat"),
    }


def _merge_milestone_profile(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = existing.copy()
    for key, value in incoming.items():
        if value:
            merged[key] = value
    merged.setdefault("source", incoming.get("source", "chat"))
    return merged


def _merge_prematurity(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = existing.copy()
    for key in ["is_premature", "gestational_age_weeks", "weeks_early"]:
        if incoming.get(key) is not None:
            merged[key] = incoming[key]
    merged["source"] = _merge_sources(existing, incoming)
    return merged


def _merge_places(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged_places = list(existing.get("places") or [])
    seen = {(place.get("name"), place.get("type")) for place in merged_places if place.get("name")}
    for place in incoming.get("places") or []:
        key = (place.get("name"), place.get("type"))
        if key not in seen:
            merged_places.append(place)
            seen.add(key)
    merged = existing.copy()
    merged["places"] = merged_places
    merged["source"] = _merge_sources(existing, incoming)
    return merged


def _merge_family_diet(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = existing.copy()
    merged["diet_patterns"] = _merge_unique(existing.get("diet_patterns") or [], incoming.get("diet_patterns") or [])
    merged["avoid_ingredients"] = _merge_unique(existing.get("avoid_ingredients") or [], incoming.get("avoid_ingredients") or [])
    merged["allergies"] = _merge_unique(existing.get("allergies") or [], incoming.get("allergies") or [])
    merged["source"] = _merge_sources(existing, incoming)
    return merged


def _merge_child_solids(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = existing.copy()
    for key in ["solids_started", "approach", "age_started_months"]:
        if incoming.get(key) is not None:
            merged[key] = incoming[key]
    merged["favorite_foods"] = _merge_unique(
        existing.get("favorite_foods") or [], incoming.get("favorite_foods") or []
    )
    merged["disliked_foods"] = _merge_unique(
        existing.get("disliked_foods") or [], incoming.get("disliked_foods") or []
    )
    merged["allergens_introduced"] = _merge_unique(
        existing.get("allergens_introduced") or [], incoming.get("allergens_introduced") or []
    )
    merged["source"] = _merge_sources(existing, incoming)
    return merged


def _merge_sources(existing: Dict[str, Any], incoming: Dict[str, Any]) -> str:
    existing_src = existing.get("source")
    incoming_src = incoming.get("source")
    if existing_src and incoming_src and existing_src != incoming_src:
        return "chat+settings"
    return incoming_src or existing_src or "chat"


def _merge_unique(base: List[str], additions: List[str]) -> List[str]:
    result = list(base)
    seen = set(base)
    for value in additions:
        if value and value not in seen:
            result.append(value)
            seen.add(value)
    return result


_MERGE_HANDLERS: dict[str, Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]] = {
    "child_activity_preferences": _merge_activity_preferences,
    "child_milestone_profile": _merge_milestone_profile,
    "child_prematurity": _merge_prematurity,
    "places_of_interest": _merge_places,
    "family_diet": _merge_family_diet,
    "child_solids_profile": _merge_child_solids,
}
