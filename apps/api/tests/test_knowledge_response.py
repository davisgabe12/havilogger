from __future__ import annotations

from app.knowledge_guidance import (
    apply_activity_suggestions,
    apply_milestone_context,
    apply_temperament_adjustments,
)


def test_temperament_adjusts_tone() -> None:
    reply = "Transition him to bedtime."
    context = {"temperament": {"sensitive": True}}
    updated = apply_temperament_adjustments(reply, context)
    assert "gentle" in updated.lower()


def test_activity_suggestions_reflect_preferences() -> None:
    reply = "Here are some ideas."
    context = {
        "latest_message_lower": "Any activity ideas?",
        "activities": {"favorite_activities": ["water play"], "tags": []},
        "milestones": {"gross_motor": "crawling", "fine_motor": None, "language": None, "social": None},
    }
    updated = apply_activity_suggestions(reply, context)
    assert "water play" in updated.lower()


def test_milestone_next_steps() -> None:
    reply = "Here is what's next."
    context = {
        "latest_message_lower": "what's next developmentally?",
        "milestones": {"gross_motor": "crawling", "fine_motor": None, "language": None, "social": None},
    }
    updated = apply_milestone_context(reply, context)
    assert "pulling to stand" in updated.lower()
