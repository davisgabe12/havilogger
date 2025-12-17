from __future__ import annotations

from datetime import datetime, timezone

from app.main import build_assistant_message
from app.schemas import Action, ActionMetadata, CoreActionType, KnowledgeItem, KnowledgeItemStatus, KnowledgeItemType


def test_logging_reply_strips_knowledge_prompts() -> None:
    actions = [
        Action(
            action_type=CoreActionType.SLEEP,
            timestamp=datetime(2025, 12, 11, 11, 0, tzinfo=timezone.utc),
            metadata=ActionMetadata(duration_minutes=120),
        )
    ]
    child = {"first_name": "Lev", "timezone": "America/Los_Angeles"}
    knowledge = [
        KnowledgeItem(
            id=1,
            profile_id=1,
            key="care_framework",
            type=KnowledgeItemType.INFERRED,
            status=KnowledgeItemStatus.PENDING,
            payload={"framework": "moms_on_call"},
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
    ]
    message = build_assistant_message(
        actions,
        "woke at 3am",
        child_data=child,
        context={
            "knowledge": knowledge,
            "pending_prompts": ["Thanks for sharing your solids journey—should I remember it?"],
            "intent": "logging",
        },
    )
    assert "solids" not in message.lower()
    assert "Logged" in message
