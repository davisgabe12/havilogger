from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import Action, ActionMetadata, CoreActionType
from app.db import ensure_default_profiles, get_connection, get_primary_child_id
from .conversation_helpers import create_conversation, with_conversation

client = TestClient(app)

DEFAULT_PROFILE = {
    "first_name": "Lev",
    "last_name": "Davis",
    "birth_date": "2024-05-01",
    "due_date": "2024-05-07",
    "gender": "boy",
    "birth_weight": 7.5,
    "birth_weight_unit": "lb",
    "latest_weight": 11.2,
    "latest_weight_date": "2024-06-10",
    "timezone": "America/Los_Angeles",
}


class ResponseJudge:
    def __init__(self, required, forbidden=None):
        self.required = required
        self.forbidden = forbidden or []

    def evaluate(self, reply: str) -> None:
        lower = reply.lower()
        for phrase in self.required:
            assert phrase.lower() in lower, f"Expected '{phrase}' in reply: {reply}"
        for phrase in self.forbidden:
            assert phrase.lower() not in lower, f"Did not expect '{phrase}' in reply: {reply}"


class AdviceJudge:
    def evaluate(self, reply: str) -> None:
        lower = reply.lower()
        for keyword in ["cdc", "aap", "huckleberry", "emily oster"]:
            assert keyword in lower, f"Expected source keyword '{keyword}' in reply: {reply}"
        for pillar in ["food", "fatigue", "feelings", "fever"]:
            assert pillar in lower, f"Expected '{pillar}' pillar in reply: {reply}"


def reset_state() -> None:
    ensure_default_profiles()
    with get_connection() as conn:
        for table in [
            "activity_logs",
            "conversation_messages",
            "conversation_sessions",
            "routine_metrics",
            "loading_metrics",
            "timeline_events",
            "inferences",
            "knowledge_items",
        ]:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()


def seed_profile(overrides: dict | None = None) -> None:
    payload = {
        "caregiver": {
            "first_name": "Alex",
            "last_name": "Davis",
            "phone": "(555) 555-1212",
            "email": "alex@example.com",
            "relationship": "Mom",
        },
        "child": DEFAULT_PROFILE.copy(),
    }
    if overrides:
        payload["child"].update(overrides)
    resp = client.put("/api/v1/settings", json=payload)
    assert resp.status_code == 200


def make_action(
    action_type: CoreActionType | str,
    timestamp: datetime,
    *,
    note: str | None = None,
    metadata: dict | None = None,
) -> Action:
    meta = ActionMetadata(**(metadata or {}))
    core_type = action_type if isinstance(action_type, CoreActionType) else CoreActionType(action_type)
    return Action(
        action_type=core_type,
        timestamp=timestamp,
        note=note,
        metadata=meta,
        is_core_action=True,
        custom_action_label=None,
    )


def to_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


def scenario_actions(raw_batches):
    batches = []
    for batch in raw_batches:
        actions = []
        for entry in batch:
            actions.append(
                make_action(
                    entry["type"],
                    to_dt(entry["timestamp"]),
                    note=entry.get("note"),
                    metadata=entry.get("metadata"),
                )
            )
        batches.append(actions)
    return batches


def fetch_latest_logged_actions() -> list[dict]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT actions_json FROM activity_logs ORDER BY id DESC LIMIT 1"
        ).fetchone()
    assert row, "Expected activity log entry but found none"
    payload = row[0]
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")
    data = json.loads(payload)
    return data.get("actions", [])


def assert_actions_match(expected: list[Action], actual_payload: list[dict]) -> None:
    exp_serialized = [action.model_dump(mode="json") for action in expected]
    assert len(exp_serialized) == len(actual_payload), (
        f"Expected {len(exp_serialized)} actions, found {len(actual_payload)}"
    )
    for idx, (expected_item, actual_item) in enumerate(zip(exp_serialized, actual_payload)):
        assert (
            expected_item["action_type"] == actual_item["action_type"]
        ), f"Action {idx} type mismatch: expected {expected_item['action_type']} vs {actual_item['action_type']}"
        assert (
            datetime.fromisoformat(expected_item["timestamp"].replace("Z", "+00:00"))
            == datetime.fromisoformat(actual_item["timestamp"].replace("Z", "+00:00"))
        ), f"Action {idx} timestamp mismatch: expected {expected_item['timestamp']} vs {actual_item['timestamp']}"
        assert expected_item.get("note") == actual_item.get(
            "note"
        ), f"Action {idx} note mismatch"
        assert expected_item.get("metadata") == actual_item.get(
            "metadata"
        ), f"Action {idx} metadata mismatch"


SCENARIOS = [
    {
        "name": "feed_diaper_combo",
        "profile": DEFAULT_PROFILE,
        "messages": [
            {"text": "Changed pee diaper at 2p and fed 4 oz at 2:15p.", "timezone": "America/Los_Angeles"},
        ],
        "actions": scenario_actions(
            [
                [
                    {"type": "dirty_diaper_pee", "timestamp": "2024-06-01T21:00:00+00:00"},
                    {
                        "type": "activity",
                        "timestamp": "2024-06-01T21:15:00+00:00",
                        "metadata": {"amount_value": 4, "amount_unit": "oz", "substance": "formula"},
                    },
                ]
            ]
        ),
        "expect": ["dirty diaper", "4 oz", "breast, bottle, or combo"],
    },
    {
        "name": "single_diaper_no_routine",
        "profile": DEFAULT_PROFILE,
        "messages": [
            {"text": "I just changed a dirty diaper for Lev—please log it.", "timezone": "America/Los_Angeles"},
        ],
        "actions": scenario_actions(
            [
                [
                    {"type": "dirty_diaper_pee", "timestamp": "2024-06-02T19:00:00+00:00"},
                ]
            ]
        ),
        "expect": ["dirty diaper"],
        "forbidden": ["routine", "keep an eye on the next diaper window"],
    },
    {
        "name": "bath_routine_follow_up",
        "profile": DEFAULT_PROFILE,
        "messages": [{"text": "Finished bath routine.", "timezone": "America/Los_Angeles"}],
        "actions": scenario_actions(
            [
                [
                    {"type": "bath", "timestamp": "2024-06-02T02:00:00+00:00"},
                    {"type": "dirty_diaper_pee_and_poop", "timestamp": "2024-06-02T02:05:00+00:00"},
                ]
            ]
        ),
        "expect": ["bath", "small details"],
    },
    {
        "name": "sleep_logging",
        "profile": DEFAULT_PROFILE,
        "messages": [{"text": "Nap 2 hours ending 1pm.", "timezone": "America/Los_Angeles"}],
        "actions": scenario_actions(
            [
                [
                    {
                        "type": "sleep",
                        "timestamp": "2024-06-02T20:00:00+00:00",
                        "metadata": {"duration_minutes": 120},
                    }
                ]
            ]
        ),
        "expect": ["sleep for 2 hrs", "small details"],
    },
    {
        "name": "milestones_known",
        "profile": DEFAULT_PROFILE,
        "messages": [{"text": "What are milestones to look for in week 9?", "timezone": "America/Los_Angeles"}],
        "actions": scenario_actions([[]]),
        "expect": ["cdc", "aap", "four f", "huckleberry"],
        "advice_required": True,
    },
    {
        "name": "milestones_missing_profile",
        "profile": {
            "birth_date": "",
            "due_date": "",
            "gender": "",
            "birth_weight": None,
            "latest_weight": None,
            "latest_weight_date": None,
            "timezone": "",
        },
        "messages": [{"text": "What milestones should I expect today?", "timezone": "America/Los_Angeles"}],
        "actions": scenario_actions([[]]),
        "expect": ["date of birth", "due date"],
    },
    {
        "name": "symptom_guidance",
        "profile": DEFAULT_PROFILE,
        "messages": [
            {
                "text": "He had 3 oz of forumala and keeps coughing tonight.",
                "timezone": "America/Los_Angeles",
            }
        ],
        "actions": scenario_actions(
            [
                [
                    {
                        "type": "activity",
                        "timestamp": "2024-06-03T01:00:00+00:00",
                        "metadata": {"amount_value": 3, "amount_unit": "oz"},
                    }
                ]
            ]
        ),
        "expect": ["trouble breathing", "pediatrician"],
    },
    {
        "name": "breathing_normal",
        "profile": DEFAULT_PROFILE,
        "messages": [
            {
                "text": "Is loud breathing normal at night at this age?",
                "timezone": "America/Los_Angeles",
            }
        ],
        "actions": scenario_actions([[]]),
        "expect": ["noisy breathing", "huckleberry"],
        "advice_required": True,
    },
    {
        "name": "catch_up_mode",
        "profile": DEFAULT_PROFILE,
        "messages": [
            {"text": "I want to log the day and catch up.", "timezone": "America/Los_Angeles"},
            {
                "text": "Here goes: 1am diaper, 3am feed 3 oz, 4am diaper, then slept until 6:30.",
                "timezone": "America/Los_Angeles",
            },
        ],
        "actions": scenario_actions(
            [
                [],
                [
                    {"type": "dirty_diaper_pee", "timestamp": "2024-06-03T08:00:00+00:00"},
                    {
                        "type": "activity",
                        "timestamp": "2024-06-03T11:00:00+00:00",
                        "metadata": {"amount_value": 3, "amount_unit": "oz"},
                    },
                    {"type": "dirty_diaper_pee_and_poop", "timestamp": "2024-06-03T12:00:00+00:00"},
                    {
                        "type": "sleep",
                        "timestamp": "2024-06-03T13:30:00+00:00",
                        "metadata": {"duration_minutes": 270},
                    },
                ],
            ]
        ),
        "response_index": -1,
        "expect": ["dirty diaper", "sleep for 270", "breast, bottle, or combo"],
        "forbidden": ["keep an eye on the next diaper window"],
        "generator_actions": scenario_actions(
            [
                [
                    {"type": "dirty_diaper_pee", "timestamp": "2024-06-03T08:00:00+00:00"},
                    {
                        "type": "activity",
                        "timestamp": "2024-06-03T11:00:00+00:00",
                        "metadata": {"amount_value": 3, "amount_unit": "oz"},
                    },
                    {"type": "dirty_diaper_pee_and_poop", "timestamp": "2024-06-03T12:00:00+00:00"},
                    {
                        "type": "sleep",
                        "timestamp": "2024-06-03T13:30:00+00:00",
                        "metadata": {"duration_minutes": 270},
                    },
                ],
            ]
        ),
    },
    {
        "name": "routine_prompt",
        "profile": DEFAULT_PROFILE,
        "messages": [
            {"text": "Day one log: feed and nap.", "timezone": "America/Los_Angeles"},
            {"text": "Day two log: similar pattern.", "timezone": "America/Los_Angeles"},
            {"text": "Another night in the books.", "timezone": "America/Los_Angeles"},
        ],
        "actions": scenario_actions(
            [
                [
                    {
                        "type": "activity",
                        "timestamp": "2024-06-01T15:00:00+00:00",
                        "metadata": {"amount_value": 4, "amount_unit": "oz"},
                    },
                    {
                        "type": "sleep",
                        "timestamp": "2024-06-01T18:00:00+00:00",
                        "metadata": {"duration_minutes": 240},
                    },
                    {"type": "dirty_diaper_pee", "timestamp": "2024-06-01T20:00:00+00:00"},
                ],
                [
                    {
                        "type": "activity",
                        "timestamp": "2024-06-02T15:00:00+00:00",
                        "metadata": {"amount_value": 4, "amount_unit": "oz"},
                    },
                    {
                        "type": "sleep",
                        "timestamp": "2024-06-02T18:30:00+00:00",
                        "metadata": {"duration_minutes": 245},
                    },
                    {"type": "dirty_diaper_pee", "timestamp": "2024-06-02T20:00:00+00:00"},
                ],
                [
                    {
                        "type": "activity",
                        "timestamp": "2024-06-03T15:00:00+00:00",
                        "metadata": {"amount_value": 4, "amount_unit": "oz"},
                    },
                    {
                        "type": "sleep",
                        "timestamp": "2024-06-03T18:30:00+00:00",
                        "metadata": {"duration_minutes": 245},
                    },
                    {"type": "dirty_diaper_pee", "timestamp": "2024-06-03T20:00:00+00:00"},
                ],
            ]
        ),
        "expect": ["routines help lighten the mental load"],
    },
    {
        "name": "timezone_prompt",
        "profile": {
            "timezone": "",
        },
        "messages": [{"text": "Just had a diaper.", "timezone": None}],
        "actions": scenario_actions(
            [
                [
                    {"type": "dirty_diaper_pee", "timestamp": "2024-06-04T15:00:00+00:00"},
                ]
            ]
        ),
        "expect": ["personalize times once I know your timezone"],
    },
    {
        "name": "typo_sick",
        "profile": DEFAULT_PROFILE,
        "messages": [{"text": "I think baby is suck.", "timezone": "America/Los_Angeles"}],
        "actions": scenario_actions(
            [
                [
                    {
                        "type": "custom",
                        "timestamp": "2024-06-04T18:00:00+00:00",
                        "note": "Baby seems sick",
                    }
                ]
            ]
        ),
        "expect": ["assumed"],
        "expect_normalized_contains": "sick",
    },
]


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s["name"] for s in SCENARIOS])
def test_conversation_scenarios(monkeypatch, scenario):
    reset_state()
    seed_profile(scenario.get("profile"))
    conversation_id = create_conversation(client, child_id=get_primary_child_id())

    action_batches = scenario["actions"]
    generator_batches = scenario.get("generator_actions", action_batches)
    batch_iter = iter(generator_batches)
    sent_messages: list[str] = []

    def fake_generate_actions(message: str, **kwargs):
        sent_messages.append(message)
        try:
            return next(batch_iter)
        except StopIteration:
            return []

    monkeypatch.setattr("app.main.generate_actions", fake_generate_actions)

    responses = []
    for idx, message in enumerate(scenario["messages"]):
        payload = {"message": message["text"], "child_id": get_primary_child_id()}
        if message.get("timezone") is not None:
            payload["timezone"] = message["timezone"]
        response = client.post(
            "/api/v1/activities",
            json=with_conversation(payload, conversation_id=conversation_id),
        )
        assert response.status_code == 200
        responses.append(response.json()["assistant_message"])
        expected_batch = action_batches[idx]
        if expected_batch:
            logged = fetch_latest_logged_actions()
            assert_actions_match(expected_batch, logged)

    reply = responses[scenario.get("response_index", -1)]
    judge = ResponseJudge(scenario["expect"], scenario.get("forbidden", []))
    judge.evaluate(reply)
    if scenario.get("advice_required"):
        AdviceJudge().evaluate(reply)
    normalized_expectation = scenario.get("expect_normalized_contains")
    if normalized_expectation:
        assert any(
            normalized_expectation.lower() in sent.lower()
            for sent in sent_messages
        ), f"Expected normalized text '{normalized_expectation}' in generate_actions payloads: {sent_messages}"
