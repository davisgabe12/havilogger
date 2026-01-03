"""Pydantic schemas shared across the API."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class CoreActionType(str, Enum):
    BATH = "bath"
    GROWTH = "growth"
    DIAPER_POOP = "dirty_diaper_poop"
    DIAPER_PEE = "dirty_diaper_pee"
    DIAPER_PEE_AND_POOP = "dirty_diaper_pee_and_poop"
    MEDICATION = "medication"
    SLEEP = "sleep"
    ACTIVITY = "activity"
    CUSTOM = "custom"


CORE_ACTION_DESCRIPTIONS = {
    CoreActionType.BATH: "Bath time or hygiene events",
    CoreActionType.GROWTH: "Measurements like weight, height, head circumference",
    CoreActionType.DIAPER_POOP: "Dirty diaper with poop",
    CoreActionType.DIAPER_PEE: "Dirty diaper with pee",
    CoreActionType.DIAPER_PEE_AND_POOP: "Dirty diaper with both pee and poop",
    CoreActionType.MEDICATION: "Medication dose",
    CoreActionType.SLEEP: "Sleep start/stop",
    CoreActionType.ACTIVITY: "Playtime, tummy time, or other activities",
    CoreActionType.CUSTOM: "Anything outside the core schema",
}


class ActionMetadata(BaseModel):
    amount_value: Optional[float] = Field(
        default=None,
        description="Numeric amount when applicable (e.g., 4)",
    )
    amount_unit: Optional[str] = Field(default=None, description="Unit like oz, ml")
    substance: Optional[str] = Field(default=None, description="Formula type, med name, etc.")
    measurement_type: Optional[str] = Field(default=None, description="weight | height | head circumference")
    measurement_unit: Optional[str] = Field(default=None, description="lb | kg | in | cm | etc")
    duration_minutes: Optional[float] = Field(default=None)
    outcome: Optional[str] = Field(default=None, description="Went well, refused bottle, etc.")
    sleep_type: Optional[str] = Field(default=None, description="sleep | nap")
    sleep_start_mood: Optional[str] = Field(
        default=None,
        description="How the child felt / how long it took to fall asleep",
    )
    sleep_end_mood: Optional[str] = Field(default=None, description="Mood on waking")
    sleep_location: Optional[str] = Field(
        default=None,
        description="on_caregiver | crib | bassinet | parent_room | child_room | stroller | car_seat | other",
    )
    sleep_method: Optional[str] = Field(
        default=None,
        description="How the child fell asleep (self_soothed, caregiver_soothed, etc.)",
    )
    stage_context: Optional[str] = Field(
        default=None,
        description="Snapshot of development phase when the event occurred",
    )
    extra: Dict[str, Any] = Field(default_factory=dict)


class Action(BaseModel):
    action_type: CoreActionType
    timestamp: datetime
    note: Optional[str] = None
    metadata: ActionMetadata = Field(default_factory=ActionMetadata)
    is_core_action: bool = True
    custom_action_label: Optional[str] = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Freeform parent input")
    timezone: Optional[str] = Field(
        default=None, description="Client-reported timezone (IANA name or city)."
    )
    child_id: Optional[int] = Field(default=None, description="Target child id for the message.")
    source: Optional[str] = Field(
        default=None,
        description="Where the message originated (chat, chip, manual, import).",
    )


class ChatResponse(BaseModel):
    actions: List[Action]
    raw_message: str = Field(description="Original message echoed back for debugging")
    model: str
    latency_ms: int
    assistant_message: str = Field(default="")
    question_category: str = Field(default="generic")
    session_id: Optional[int] = None
    user_message_id: Optional[int] = None
    assistant_message_id: Optional[int] = None
    intent: Optional[str] = Field(default=None, description="Router-derived primary intent")
    ui_nudges: Optional[List[str]] = Field(default=None, description="Optional UI nudges for surfacing outside the main message")


class LoadingMetricsPayload(BaseModel):
    session_id: Optional[int] = None
    message_id: Optional[int] = None
    thinking_short_ms: Optional[int] = None
    thinking_rich_ms: Optional[int] = None
    error_type: Optional[str] = None
    retry_count: Optional[int] = None


class KnowledgeItemType(str, Enum):
    EXPLICIT = "explicit"
    INFERRED = "inferred"


class KnowledgeItemStatus(str, Enum):
    ACTIVE = "active"
    PENDING = "pending"
    REJECTED = "rejected"


class KnowledgeItem(BaseModel):
    id: int
    profile_id: int
    key: str
    type: KnowledgeItemType
    status: KnowledgeItemStatus
    payload: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    last_prompted_at: Optional[datetime] = None
    last_prompted_session_id: Optional[int] = None


class TaskStatus(str, Enum):
    OPEN = "open"
    DONE = "done"


class Task(BaseModel):
    id: int
    user_id: Optional[int] = None
    child_id: Optional[int] = None
    title: str
    status: TaskStatus
    due_at: Optional[datetime] = None
    created_at: datetime
    created_by_user_id: Optional[int] = None
    assigned_to_user_id: Optional[int] = None
