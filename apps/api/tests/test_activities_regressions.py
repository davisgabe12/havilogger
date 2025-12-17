from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import ensure_default_profiles, get_connection, get_primary_child_id


client = TestClient(app)

BANNED_PHRASES = [
    "before we continue",
    "i captured what you shared",
    "to personalize expectations",
    "due date",
    "gender",
    "share them here",
    "remember",
]

BANNED_MEMORY_PHRASES = [
    "keep looking for patterns",
    "tiny details teach me",
    "helps me learn what works",
    "captured what you shared",
]

BANNED_UI_PHRASES = ["?", "gender", "due date", "remember"]

GUIDANCE_MARKERS = ["hitting", "gentle hands", "stay calm"]


@pytest.fixture(autouse=True)
def reset_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        for table in [
            "conversation_messages",
            "conversation_sessions",
            "activity_logs",
            "inferences",
            "knowledge_items",
            "timeline_events",
        ]:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()


def assert_no_gating(data: dict) -> None:
    message = data.get("assistant_message") or ""
    lower = message.lower()
    for phrase in BANNED_PHRASES:
        assert phrase not in lower
    for phrase in BANNED_MEMORY_PHRASES:
        assert phrase not in lower
    nudges = data.get("ui_nudges")
    if nudges is not None:
        assert isinstance(nudges, list)
        for nudge in nudges:
            assert isinstance(nudge, str)
            lower_nudge = nudge.lower()
            for forbidden in BANNED_UI_PHRASES:
                assert forbidden not in lower_nudge


def test_non_logging_advice_is_not_gated() -> None:
    child_id = get_primary_child_id()
    resp = client.post(
        "/api/v1/activities",
        json={"message": "baby is hitting, is that normal", "child_id": child_id},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["intent"] != "logging"
    assert data["assistant_message"]
    assert_no_gating(data)
    assert "logged" not in data["assistant_message"].lower()


def test_aggression_synonyms_trigger_guidance() -> None:
    child_id = get_primary_child_id()
    messages = [
        "my baby smacked me, is that normal",
        "my toddler hits sometimes",
    ]
    for text in messages:
        resp = client.post("/api/v1/activities", json={"message": text, "child_id": child_id})
        assert resp.status_code == 200
        data = resp.json()
        guidance_lower = data["assistant_message"].lower()
        assert any(marker in guidance_lower for marker in GUIDANCE_MARKERS)
        assert_no_gating(data)
        assert "logged" not in guidance_lower


def test_logging_reply_stays_minimal() -> None:
    child_id = get_primary_child_id()
    resp = client.post("/api/v1/activities", json={"message": "woke at 3am", "child_id": child_id})
    assert resp.status_code == 200
    data = resp.json()
    assert data["intent"] == "logging"
    assert data["assistant_message"].startswith("Logged:")
    assert "\n" not in data["assistant_message"]
    assert_no_gating(data)
    ui = data.get("ui_nudges")
    assert not ui
