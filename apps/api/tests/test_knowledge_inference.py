from __future__ import annotations

import pytest
from datetime import datetime

from app.db import (
    find_knowledge_item,
    get_primary_child_id,
    get_primary_profile_id,
    list_knowledge_items,
)
from app.inferences import (
    InferenceStatus,
    detect_knowledge_inferences,
    list_inferences,
    update_inference_status,
)
from app.knowledge_utils import knowledge_pending_prompts
from app.schemas import (
    Action,
    ActionMetadata,
    CoreActionType,
    KnowledgeItem,
    KnowledgeItemStatus,
    KnowledgeItemType,
)

from .test_conversation_cases import DEFAULT_PROFILE, client, reset_state, seed_profile


def test_detects_moms_on_call_inference() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    inferences = detect_knowledge_inferences(
        "We’re following Moms on Call for naps",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    assert len(inferences) == 1
    inference = inferences[0]
    assert inference.inference_type == "care_framework"
    assert inference.status == InferenceStatus.PENDING.value

    pending = list_inferences(child_id=child_id, status=InferenceStatus.PENDING.value)
    assert pending, "Expected at least one pending inference"

    duplicates = detect_knowledge_inferences(
        "We’re following Moms on Call for naps",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    assert duplicates == []


def test_detects_combo_feeding_from_action() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    feeding_action = Action(
        action_type=CoreActionType.ACTIVITY,
        timestamp=datetime(2024, 6, 2, 9, 0, 0),
        metadata=ActionMetadata(substance="Formula"),
    )

    inferences = detect_knowledge_inferences(
        "We combo feed today",
        [feeding_action],
        child_id=child_id,
        profile_id=profile_id,
    )
    assert len(inferences) == 1
    assert inferences[0].inference_type == "feeding_structure"


def test_confirm_and_reject_inference() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    inference = detect_knowledge_inferences(
        "We’re following Moms on Call for naps",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )[0]
    assert inference.status == InferenceStatus.PENDING.value

    confirmed = update_inference_status(inference.id, status=InferenceStatus.CONFIRMED.value)
    assert confirmed.status == InferenceStatus.CONFIRMED.value

    rejected = update_inference_status(inference.id, status=InferenceStatus.REJECTED.value)
    assert rejected.status == InferenceStatus.REJECTED.value


def test_detect_bpa_free_preference() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "We only use BPA-free snack containers at home.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )

    item = find_knowledge_item(profile_id, "pref_bpa_free_products")
    assert item is not None
    assert item.key == "pref_bpa_free_products"
    assert item.type == KnowledgeItemType.INFERRED
    assert item.status == KnowledgeItemStatus.PENDING
    assert item.payload["scope"] == "food_storage"


def test_ignore_weak_bpa_free_reference() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "I read an article about BPA-free plastics.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "pref_bpa_free_products")
    assert item is None


def test_detect_baby_gear_budget() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "We really need to keep baby gear under $300.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )

    item = find_knowledge_item(profile_id, "pref_baby_gear_budget")
    assert item is not None
    assert item.payload["max_usd"] == pytest.approx(300.0, rel=1e-3)


def test_detect_daily_outdoor_preference_with_minutes() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "We aim for at least 30 minutes outside daily.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )

    item = find_knowledge_item(profile_id, "pref_outdoor_time_daily")
    assert item is not None
    assert item.payload["target_minutes"] == 30


def test_detect_daily_outdoor_preference_without_minutes() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "We try to get outside every day.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )

    item = find_knowledge_item(profile_id, "pref_outdoor_time_daily")
    assert item is not None
    assert item.payload["target_minutes"] is None


def test_detect_child_prematurity_from_weeks_at_birth() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "He was born at 35 weeks.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "child_prematurity")
    assert item is not None
    assert item.payload["is_premature"] is True
    assert pytest.approx(item.payload["gestational_age_weeks"], rel=1e-2) == 35.0


def test_detect_child_prematurity_from_weeks_early() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "She was born 5 weeks early.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "child_prematurity")
    assert item is not None
    assert item.payload["is_premature"] is True
    assert item.payload["weeks_early"] == pytest.approx(5.0, rel=1e-2)


def test_prematurity_ignored_for_weak_reference() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "I read about premature births and NICU care.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "child_prematurity")
    assert item is None


def _build_pending_item(key: str, payload: dict, item_id: int) -> KnowledgeItem:
    now = datetime.utcnow()
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


def test_knowledge_pending_prompts_empty() -> None:
    assert knowledge_pending_prompts([]) == []


def test_knowledge_pending_prompts_care_framework() -> None:
    item = _build_pending_item("care_framework", {"framework": "moms_on_call"}, 1)
    prompts = knowledge_pending_prompts([item])
    assert prompts == [
        "I've noticed you might be using Moms on Call. Should I use that as a guide when I talk about sleep and routines?"
    ]


def test_knowledge_pending_prompts_multiple() -> None:
    items = [
        _build_pending_item("care_framework", {"framework": "moms_on_call"}, 2),
        _build_pending_item("feeding_structure", {"structure": "combo"}, 3),
    ]
    prompts = knowledge_pending_prompts(items)
    assert len(prompts) == 2
    assert prompts[1] == "Your feeds look combo feeding right now. Do you want me to keep tracking patterns that way?"


def test_pending_prompts_include_new_preferences() -> None:
    items = [
        _build_pending_item("pref_bpa_free_products", {"scope": "bottles"}, 4),
        _build_pending_item("pref_baby_gear_budget", {"max_usd": 400}, 5),
        _build_pending_item("pref_outdoor_time_daily", {"target_minutes": 25}, 6),
    ]
    prompts = knowledge_pending_prompts(items)
    assert any("BPA-free" in prompt for prompt in prompts)
    assert any("gear" in prompt.lower() for prompt in prompts)
    assert any("outside" in prompt.lower() for prompt in prompts)


def test_detect_child_activity_preferences() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "He LOVES water play and reading books.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )

    item = find_knowledge_item(profile_id, "child_activity_preferences")
    assert item is not None
    assert "water play" in item.payload.get("favorite_activities", [])
    assert "reading books" in item.payload.get("favorite_activities", [])
    tags = item.payload.get("tags", [])
    assert "sensory" in tags
    assert "reading" in tags


def test_activity_preferences_merge_additional_signals() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "He LOVES water play.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    detect_knowledge_inferences(
        "She loves reading books.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )

    item = find_knowledge_item(profile_id, "child_activity_preferences")
    assert item is not None
    activities = item.payload.get("favorite_activities", [])
    assert "water play" in activities
    assert "reading books" in activities


def test_detect_child_milestone_profile_gross_motor_and_language() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "He just started crawling and is babbling constantly.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )

    item = find_knowledge_item(profile_id, "child_milestone_profile")
    assert item is not None
    assert item.payload["gross_motor"] == "crawling"
    assert item.payload["language"] == "babbling"


def test_detect_child_milestone_profile_updates_existing() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "He just started rolling over.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    detect_knowledge_inferences(
        "She’s walking now.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )

    item = find_knowledge_item(profile_id, "child_milestone_profile")
    assert item is not None
    assert item.payload["gross_motor"] == "walking"


def test_milestone_ignores_weak_language() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "He might crawl soon.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )

    item = find_knowledge_item(profile_id, "child_milestone_profile")
    assert item is None


def test_pending_prompt_for_activity_and_milestone() -> None:
    items = [
        _build_pending_item("child_activity_preferences", {"favorite_activities": ["water play"]}, 7),
        _build_pending_item("child_milestone_profile", {"gross_motor": "crawling"}, 8),
    ]
    prompts = knowledge_pending_prompts(items)
    assert any("favorite activities" in prompt.lower() or "water play" in prompt.lower() for prompt in prompts)
    assert any("crawling" in prompt.lower() or "milestones" in prompt.lower() for prompt in prompts)


def test_settings_rejects_birth_and_due_date() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    payload = {
        "caregiver": {
            "first_name": "Alex",
            "last_name": "Davis",
            "email": "alex@example.com",
            "phone": "(555) 555-1212",
            "relationship": "Mom",
        },
        "child": {
            "first_name": "Lev",
            "last_name": "Davis",
            "birth_date": "2024-06-01",
            "due_date": "2024-06-29",
            "gender": "boy",
        },
    }
    resp = client.put("/api/v1/settings", json=payload)
    assert resp.status_code == 422
    assert "birth_date" in resp.text or "due_date" in resp.text


def test_settings_rejects_missing_birth_and_due_date() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    payload = {
        "caregiver": {
            "first_name": "Alex",
            "last_name": "Davis",
            "email": "alex@example.com",
            "phone": "(555) 555-1212",
            "relationship": "Mom",
        },
        "child": {
            "first_name": "Lev",
            "last_name": "Davis",
            "birth_date": "",
            "due_date": "",
            "gender": "boy",
        },
    }
    resp = client.put("/api/v1/settings", json=payload)
    assert resp.status_code == 422
    assert "birth_date" in resp.text or "due_date" in resp.text


def test_detect_places_of_interest_park() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "We usually go to the park by our house every weekend.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "places_of_interest")
    assert item is not None
    places = item.payload.get("places") or []
    assert places and places[0]["type"] in {"park", "playground"}


def test_detect_places_of_interest_grandparent_home() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "We visit Grandma's house in Boulder every Friday.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "places_of_interest")
    assert item is not None
    assert item.payload.get("places")[0]["type"] == "grandparent_home"


def test_places_ignored_for_one_off() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "We went to a park once yesterday.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "places_of_interest")
    assert item is None


def test_detect_family_diet_patterns_and_avoids() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "We're vegetarian and avoid pork and shellfish.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "family_diet")
    assert item is not None
    assert "vegetarian" in item.payload.get("diet_patterns", [])
    assert "pork" in item.payload.get("avoid_ingredients", [])
    assert "shellfish" in item.payload.get("avoid_ingredients", [])


def test_detect_family_diet_allergies() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "He is allergic to peanuts and eggs.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "family_diet")
    assert item is not None
    assert "peanut" in item.payload.get("allergies", [])
    assert "egg" in item.payload.get("allergies", [])


def test_detect_child_solids_started_blw() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "We started solids at 6 months and we're doing BLW with avocado.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "child_solids_profile")
    assert item is not None
    assert item.payload.get("solids_started") is True
    assert item.payload.get("approach") == "blw"
    assert item.payload.get("favorite_foods") and "avocado" in item.payload["favorite_foods"]


def test_detect_child_solids_not_started() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    child_id = get_primary_child_id()
    profile_id = get_primary_profile_id()

    detect_knowledge_inferences(
        "He hasn't started solids yet.",
        [],
        child_id=child_id,
        profile_id=profile_id,
    )
    item = find_knowledge_item(profile_id, "child_solids_profile")
    assert item is not None
    assert item.payload.get("solids_started") is False


def test_settings_sync_saves_birth_weight_knowledge() -> None:
    reset_state()
    seed_profile(DEFAULT_PROFILE)
    payload = {
        "caregiver": {
            "first_name": "Alex",
            "last_name": "Davis",
            "email": "alex@example.com",
            "phone": "(555) 555-1212",
            "relationship": "Mom",
        },
        "child": {
            "first_name": "Lev",
            "last_name": "Davis",
            "birth_date": "2024-05-01",
            "due_date": "",
            "timezone": "America/Los_Angeles",
            "gender": "boy",
            "birth_weight": 8.2,
            "birth_weight_unit": "lb",
            "latest_weight": 12.5,
            "latest_weight_date": "2024-06-15",
        },
    }

    resp = client.put("/api/v1/settings", json=payload)
    assert resp.status_code == 200

    profile_id = get_primary_profile_id()
    knowledge_items = list_knowledge_items(profile_id, status=KnowledgeItemStatus.ACTIVE)
    birth_weight_items = [item for item in knowledge_items if item.key == "child_birth_weight"]
    assert len(birth_weight_items) == 1
    assert birth_weight_items[0].payload["value"] == 8.2
