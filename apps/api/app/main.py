from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from typing import Any, Callable, Dict, List, Optional, Tuple, Literal
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

from dateparser.search import search_dates
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, model_validator

from .config import CONFIG
from .conversations import ConversationMessage, ConversationSession
from .supabase import (
    AuthContext,
    get_admin_client,
    get_auth_context,
    get_user_context,
    resolve_child_id,
    resolve_optional_uuid,
)
from .inferences import CreateInferencePayload, Inference, InferenceStatus
from .routes import events as events_routes
from .routes import feedback as feedback_routes
from .routes import knowledge as knowledge_routes
from .routes import reminders as reminder_routes
from .routes import tasks as task_routes
from . import share as share_routes
from .schemas import (
    Action,
    ActionMetadata,
    ChatRequest,
    ChatResponse,
    CoreActionType,
    KnowledgeItem,
    KnowledgeItemStatus,
    KnowledgeItemType,
    LoadingMetricsPayload,
)


logger = logging.getLogger(__name__)


def _format_compose_error(reason: Optional[str] = None) -> str:
    raw = (reason or "").strip()
    show_details = os.getenv("HAVI_SHOW_ERROR_DETAILS", "1") != "0"
    if not show_details:
        return "Error composing response [E_COMPOSE]: internal error"
    if not raw:
        raw = "internal composition error"
    if len(raw) > 200:
        raw = raw[:197] + "..."
    return f"Error composing response [E_COMPOSE]: {raw}"


def maybe_autotitle_session(
    session: ConversationSession,
    *,
    child_id: Optional[str],
    child_name: Optional[str],
    message: str,
    existing_message_count: int,
) -> ConversationSession:
    if existing_message_count != 0:
        return session
    if session.title != "New chat":
        return session
    base_title = generate_conversation_title(message, child_name=child_name)
    unique_title = ensure_unique_title(base_title=base_title, child_id=child_id)
    return update_session_title(session.id, unique_title)
RELATIVE_TIME_HINTS = [
    "today",
    "tonight",
    "this morning",
    "this afternoon",
    "this evening",
    "earlier today",
    "earlier",
    "just now",
    "right now",
    "now",
    "a bit ago",
    "recently",
]
MONTH_HINTS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
]

class CaregiverProfile(BaseModel):
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    relationship: Optional[str] = ""


class ChildProfile(BaseModel):
    id: Optional[str] = None
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    birth_date: Optional[str] = ""
    due_date: Optional[str] = ""
    timezone: Optional[str] = ""
    gender: Optional[str] = ""
    birth_weight: Optional[float] = None
    birth_weight_unit: Optional[str] = None
    latest_weight: Optional[float] = None
    latest_weight_date: Optional[str] = None
    routine_eligible: Optional[bool] = False

    @model_validator(mode="after")
    def validate_birth_or_due_date(self) -> "ChildProfile":
        birth_date = (self.birth_date or "").strip()
        due_date = (self.due_date or "").strip()
        if not birth_date and not due_date and self.id is None:
            return self
        # Both dates are allowed; only reject when neither is set to avoid 500s.
        if not birth_date and not due_date:
            raise ValueError("Child must have a birth_date or due_date.")
        return self


class SettingsPayload(BaseModel):
    caregiver: CaregiverProfile
    child: ChildProfile


class SettingsResponse(BaseModel):
    caregiver: CaregiverProfile
    child: ChildProfile
    children: List[ChildProfile] = Field(default_factory=list)


class CreateFamilyPayload(BaseModel):
    name: str


class CreateChildPayload(BaseModel):
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    birth_date: Optional[str] = ""
    due_date: Optional[str] = ""
    timezone: Optional[str] = ""
    gender: Optional[str] = ""
    birth_weight: Optional[float] = None
    birth_weight_unit: Optional[str] = None


class InviteCreatePayload(BaseModel):
    email: str
    role: Optional[str] = None


class InviteAcceptPayload(BaseModel):
    token: str


class InferenceResolvePayload(BaseModel):
    action: Literal["confirm_general", "confirm_sometimes", "reject"]


class RenameConversationPayload(BaseModel):
    title: str


class CreateConversationMessagePayload(BaseModel):
    role: str
    content: str
    user_id: Optional[str] = None
    intent: Optional[str] = None


STAGE_TIPS = [
    (
        0,
        4,
        {
            "cdc": "expect 6–8 wet diapers, strong startle reflexes, and early eye-contact attempts.",
            "aap": "AAP/APA emphasize skin-to-skin care, on-demand feeds, and tracking mustard-yellow stools.",
            "huckleberry": "Huckleberry’s newborn guides expect mustard-yellow poops plus 4–8 diapers and naps roughly every 45–60 minutes.",
        },
    ),
    (
        5,
        8,
        {
            "cdc": "look for longer wake windows, social smiles, and beginning head control.",
            "aap": "AAP suggests daily tummy time reps, talk-through routines, and gentle contrast toys.",
            "huckleberry": "Huckleberry’s 2-month sample days highlight 60–90 minute wake windows and soothed evenings with a feed-bath-diaper routine.",
        },
    ),
    (
        9,
        12,
        {
            "cdc": "rolling attempts, hand-to-mouth play, and more intentional coos become common.",
            "aap": "AAP highlights predictable nap blocks, bedtime routines, and plenty of supervised floor play.",
            "huckleberry": "Huckleberry’s 3-month schedule expects 75–120 minute wake windows and one longer restorative nap, often mid-day.",
        },
    ),
]

CATCH_UP_ENTRY_PHRASES = [
    "log the day and catch up",
    "catching up on today",
    "catch up on today",
    "backfill today",
    "backfill yesterday",
    "log everything from today",
    "log the day",
]

CATCH_UP_EXIT_PHRASES = [
    "done",
    "that's it",
    "we're caught up",
    "caught up",
    "all set",
    "finished logging",
]

SYMPTOM_KEYWORDS = {
    "cough": ["cough", "coughing"],
    "fever": ["fever", "temperature"],
    "rash": ["rash"],
    "vomit": ["vomit", "throw up", "spit up", "spitup"],
    "congestion": ["congestion", "stuffy"],
    "injury": ["bump", "fall", "bruise"],
    "respiratory": ["breath", "breathing", "wheeze", "wheezing"],
}

FEED_KEYWORDS = {
    "breast": ["breast", "nurse", "nursing", "latch", "latched"],
    "bottle": ["bottle", "formula", "pumped", "pump"],
    "combo": ["both breast and bottle", "combo", "both"],
}

app = FastAPI(
    title="HaviLogger API",
    version="0.1.0",
    description="Transforms parenting notes into structured actions",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

app.include_router(events_routes.router)
app.include_router(feedback_routes.router)
app.include_router(knowledge_routes.router)
app.include_router(reminder_routes.router)
app.include_router(task_routes.router)
app.include_router(share_routes.router, prefix="/api/v1/share", tags=["share"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _session_from_row(row: Dict[str, Any]) -> ConversationSession:
    now_iso = _now_iso()
    data = {
        "id": row.get("id"),
        "user_id": row.get("user_id"),
        "child_id": row.get("child_id"),
        "title": row.get("title") or "New chat",
        "last_message_at": row.get("last_message_at") or row.get("created_at") or now_iso,
        "created_at": row.get("created_at") or now_iso,
        "updated_at": row.get("updated_at") or row.get("created_at") or now_iso,
        "catch_up_mode": bool(row.get("catch_up_mode") or False),
        "catch_up_started_at": row.get("catch_up_started_at"),
        "catch_up_last_message_at": row.get("catch_up_last_message_at"),
    }
    return ConversationSession.model_validate(data)


def _message_from_row(row: Dict[str, Any]) -> ConversationMessage:
    now_iso = _now_iso()
    data = {
        "id": row.get("id"),
        "session_id": row.get("session_id"),
        "user_id": row.get("user_id"),
        "role": row.get("role"),
        "content": row.get("content"),
        "intent": row.get("intent"),
        "created_at": row.get("created_at") or now_iso,
    }
    return ConversationMessage.model_validate(data)


async def _get_conversation_session(auth: AuthContext, session_id: str) -> ConversationSession:
    rows = await auth.supabase.select(
        "conversation_sessions",
        params={
            "select": (
                "id,user_id,child_id,title,last_message_at,created_at,updated_at,"
                "catch_up_mode,catch_up_started_at,catch_up_last_message_at"
            ),
            "id": f"eq.{session_id}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _session_from_row(rows[0])


async def _create_conversation_session(
    auth: AuthContext,
    *,
    child_id: str,
    title: str = "New chat",
) -> ConversationSession:
    now_iso = _now_iso()
    created = await auth.supabase.insert(
        "conversation_sessions",
        {
            "family_id": auth.family_id,
            "child_id": child_id,
            "user_id": auth.user_id,
            "title": title,
            "last_message_at": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso,
        },
    )
    if not created:
        raise HTTPException(status_code=500, detail="Unable to create conversation")
    return _session_from_row(created[0])


async def _list_conversation_sessions(
    auth: AuthContext,
    *,
    child_id: str,
    limit: int = 20,
) -> List[ConversationSession]:
    rows = await auth.supabase.select(
        "conversation_sessions",
        params={
            "select": (
                "id,user_id,child_id,title,last_message_at,created_at,updated_at,"
                "catch_up_mode,catch_up_started_at,catch_up_last_message_at"
            ),
            "family_id": f"eq.{auth.family_id}",
            "child_id": f"eq.{child_id}",
            "order": "last_message_at.desc",
            "limit": str(limit),
        },
    )
    return [_session_from_row(row) for row in rows]


async def _touch_conversation(
    auth: AuthContext,
    session_id: str,
    timestamp_iso: str,
) -> None:
    await auth.supabase.update(
        "conversation_sessions",
        {"last_message_at": timestamp_iso, "updated_at": timestamp_iso},
        params={"id": f"eq.{session_id}", "family_id": f"eq.{auth.family_id}"},
    )


async def _insert_conversation_message(
    auth: AuthContext,
    *,
    session_id: str,
    role: str,
    content: str,
    user_id: Optional[str],
    intent: Optional[str] = None,
) -> ConversationMessage:
    now_iso = _now_iso()
    created = await auth.supabase.insert(
        "conversation_messages",
        {
            "session_id": session_id,
            "user_id": user_id,
            "role": role,
            "content": content,
            "intent": intent,
            "created_at": now_iso,
        },
    )
    if not created:
        raise HTTPException(status_code=500, detail="Unable to create message")
    return _message_from_row(created[0])


async def _list_conversation_messages(
    auth: AuthContext,
    *,
    session_id: str,
    limit: int = 100,
) -> List[ConversationMessage]:
    rows = await auth.supabase.select(
        "conversation_messages",
        params={
            "select": "id,session_id,user_id,role,content,intent,created_at",
            "session_id": f"eq.{session_id}",
            "order": "created_at.asc",
            "limit": str(limit),
        },
    )
    return [_message_from_row(row) for row in rows]


async def _insert_timeline_event(
    auth: AuthContext,
    *,
    child_id: str,
    event_type: str,
    title: str,
    detail: Optional[str],
    amount_label: Optional[str],
    start_iso: str,
    end_iso: Optional[str],
    source: Optional[str],
    origin_message_id: Optional[str],
    has_note: bool = False,
    is_custom: bool = False,
) -> Optional[Dict[str, Any]]:
    title = title.strip()
    if not title or not event_type:
        return None
    created = await auth.supabase.insert(
        "timeline_events",
        {
            "family_id": auth.family_id,
            "child_id": child_id,
            "type": event_type,
            "title": title,
            "detail": detail,
            "amount_label": amount_label,
            "start": start_iso,
            "end": end_iso,
            "has_note": has_note,
            "is_custom": is_custom,
            "source": source,
            "origin_message_id": origin_message_id,
        },
    )
    return created[0] if created else None


@app.post("/api/v1/activities", response_model=ChatResponse)
async def capture_activity(
    payload: ChatRequest,
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> ChatResponse:
    start = time.perf_counter()
    child_id = resolve_child_id(child_id_header, payload.child_id, required=True)
    if not child_id:
        raise HTTPException(status_code=400, detail="child_id is required for activities.")
    logger.info(
        "child-scoped request",
        extra={"method": "POST", "path": "/api/v1/activities", "child_id": child_id},
    )
    conversation_id = (
        resolve_optional_uuid(payload.conversation_id, "conversation_id")
        if payload.conversation_id
        else None
    )
    if conversation_id:
        await _get_conversation_session(auth, conversation_id)
    else:
        conversation = await _create_conversation_session(auth, child_id=child_id)
        conversation_id = conversation.id

    child_rows = await auth.supabase.select(
        "children",
        params={
            "select": "id,first_name,name,timezone,birth_date,due_date",
            "id": f"eq.{child_id}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    child_row = child_rows[0] if child_rows else {}
    timezone_value = child_row.get("timezone") or payload.timezone
    symptom_tags = message_symptom_tags(payload.message)
    question_category = classify_question_category(payload.message, symptom_tags)
    is_question = _is_question(payload.message)
    user_intent = "question" if is_question else "log"

    user_message = await _insert_conversation_message(
        auth,
        session_id=conversation_id,
        role="user",
        content=payload.message,
        user_id=auth.user_id,
        intent=user_intent,
    )
    memory_target = detect_memory_save_target(payload.message)
    if memory_target:
        now_iso = _now_iso()
        summary_text = _strip_memory_prefix(payload.message)
        age_weeks = _child_age_weeks(child_row) if child_row else None
        age_range = _age_range_weeks(age_weeks)
        created = await auth.supabase.insert(
            "knowledge_items",
            {
                "family_id": auth.family_id,
                "user_id": auth.user_id,
                "subject_id": child_id,
                "key": "manual_memory",
                "type": KnowledgeItemType.EXPLICIT.value,
                "status": KnowledgeItemStatus.ACTIVE.value,
                "payload": {"summary": summary_text},
                "confidence": "medium",
                "age_range_weeks": age_range,
                "activated_at": now_iso,
                "created_at": now_iso,
                "updated_at": now_iso,
            },
        )
        if not created:
            raise HTTPException(status_code=500, detail="Unable to save memory.")
        assistant_text = "Got it — I’ll remember that."
        assistant_message = await _insert_conversation_message(
            auth,
            session_id=conversation_id,
            role="assistant",
            content=assistant_text,
            user_id=auth.user_id,
            intent="memory",
        )
        await _touch_conversation(auth, conversation_id, now_iso)
        latency_ms = int((time.perf_counter() - start) * 1000)
        return ChatResponse(
            actions=[],
            raw_message=payload.message,
            model="havi-local",
            latency_ms=latency_ms,
            assistant_message=assistant_text,
            question_category=question_category,
            conversation_id=conversation_id,
            user_message_id=user_message.id,
            assistant_message_id=assistant_message.id,
            intent="memory",
        )
    actions: List[Action] = []
    assistant_text: str
    intent = "log"

    if not is_question:
        segments = _split_message_into_events(payload.message)
        actions = [
            _action_from_segment(segment, timezone_value)
            for segment in segments
            if segment
        ]
        for action in actions:
            event_type = _timeline_type_for_action(action)
            if not event_type:
                continue
            event_start = action.timestamp
            if event_start.tzinfo is None:
                event_start = event_start.replace(tzinfo=timezone.utc)
            start_iso = event_start.astimezone(timezone.utc).isoformat()
            end_iso = None
            if action.action_type == CoreActionType.SLEEP and action.metadata.duration_minutes:
                end_iso = (
                    event_start
                    + timedelta(minutes=action.metadata.duration_minutes)
                ).astimezone(timezone.utc).isoformat()
            await _insert_timeline_event(
                auth,
                child_id=child_id,
                event_type=event_type,
                title=_timeline_title_for_action(action),
                detail=_timeline_detail_for_action(action),
                amount_label=_timeline_amount_label(action),
                start_iso=start_iso,
                end_iso=end_iso,
                source=payload.source or "chat",
                origin_message_id=user_message.id,
                has_note=bool(action.note),
                is_custom=not action.is_core_action,
            )
        if actions:
            await auth.supabase.insert(
                "activity_logs",
                {
                    "family_id": auth.family_id,
                    "child_id": child_id,
                    "user_id": auth.user_id,
                    "actions_json": [action.model_dump(mode="json") for action in actions],
                    "source": payload.source or "chat",
                },
            )
        inference = _detect_memory_inference(payload.message)
        if inference:
            inference_type, inference_payload, confidence = inference
            await _maybe_create_inference(
                auth,
                child_id=child_id,
                inference_type=inference_type,
                payload=inference_payload,
                confidence=confidence,
                source="chat",
            )
        assistant_text = (
            summarize_actions(actions, child_row, {"symptom_tags": symptom_tags})
            or "Got it — I logged that."
        )
    else:
        assistant_text = _build_question_response(
            payload.message,
            child_row=child_row,
            category=question_category,
        )
        intent = "question"

    assistant_message = await _insert_conversation_message(
        auth,
        session_id=conversation_id,
        role="assistant",
        content=assistant_text,
        user_id=auth.user_id,
        intent=intent,
    )

    await _touch_conversation(auth, conversation_id, _now_iso())
    latency_ms = int((time.perf_counter() - start) * 1000)
    return ChatResponse(
        actions=actions,
        raw_message=payload.message,
        model="havi-local",
        latency_ms=latency_ms,
        assistant_message=assistant_text,
        question_category=question_category,
        conversation_id=conversation_id,
        user_message_id=user_message.id,
        assistant_message_id=assistant_message.id,
        intent=intent,
    )

@app.get("/")
async def root() -> dict:
    return {"message": "HaviLogger API ready"}


@app.post("/api/v1/inferences", response_model=Inference)
async def record_inference(
    payload: CreateInferencePayload,
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> Inference:
    child_id = resolve_child_id(child_id_header, payload.child_id, required=True)
    if not child_id:
        raise HTTPException(status_code=400, detail="child_id is required for inferences.")
    logger.info(
        "child-scoped request",
        extra={"method": "POST", "path": "/api/v1/inferences", "child_id": child_id},
    )
    dedupe_key = _dedupe_key_for_inference(child_id, payload.inference_type, payload.payload)
    existing = await auth.supabase.select(
        "inferences",
        params={
            "select": (
                "id,child_id,user_id,inference_type,payload,confidence,status,source,created_at,"
                "updated_at,expires_at,dedupe_key,last_prompted_at"
            ),
            "dedupe_key": f"eq.{dedupe_key}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    if existing:
        return Inference.model_validate(existing[0])

    child_rows = await auth.supabase.select(
        "children",
        params={
            "select": "birth_date,due_date",
            "id": f"eq.{child_id}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    age_weeks = _child_age_weeks(child_rows[0]) if child_rows else None
    dtu = get_dtu(age_weeks)
    expires_at = (
        payload.expires_at.isoformat()
        if payload.expires_at
        else (datetime.now(tz=timezone.utc) + timedelta(days=_inference_expiry_days(dtu))).isoformat()
    )

    created = await auth.supabase.insert(
        "inferences",
        {
            "family_id": auth.family_id,
            "child_id": child_id,
            "user_id": auth.user_id,
            "inference_type": payload.inference_type,
            "payload": payload.payload,
            "confidence": payload.confidence,
            "status": InferenceStatus.PENDING.value,
            "source": payload.source,
            "expires_at": expires_at,
            "dedupe_key": dedupe_key,
        },
    )
    if not created:
        raise HTTPException(status_code=500, detail="Unable to create inference")
    return Inference.model_validate(created[0])


async def _maybe_create_inference(
    auth: AuthContext,
    *,
    child_id: str,
    inference_type: str,
    payload: Dict[str, Any],
    confidence: float,
    source: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    dedupe_key = _dedupe_key_for_inference(child_id, inference_type, payload)
    existing = await auth.supabase.select(
        "inferences",
        params={
            "select": (
                "id,child_id,user_id,inference_type,payload,confidence,status,source,created_at,"
                "updated_at,expires_at,dedupe_key,last_prompted_at"
            ),
            "dedupe_key": f"eq.{dedupe_key}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    if existing:
        if existing[0].get("status") == InferenceStatus.REJECTED.value:
            return None
        return existing[0]

    child_rows = await auth.supabase.select(
        "children",
        params={
            "select": "birth_date,due_date",
            "id": f"eq.{child_id}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    age_weeks = _child_age_weeks(child_rows[0]) if child_rows else None
    dtu = get_dtu(age_weeks)
    expires_at = (
        datetime.now(tz=timezone.utc) + timedelta(days=_inference_expiry_days(dtu))
    ).isoformat()

    created = await auth.supabase.insert(
        "inferences",
        {
            "family_id": auth.family_id,
            "child_id": child_id,
            "user_id": auth.user_id,
            "inference_type": inference_type,
            "payload": payload,
            "confidence": confidence,
            "status": InferenceStatus.PENDING.value,
            "source": source,
            "expires_at": expires_at,
            "dedupe_key": dedupe_key,
        },
    )
    return created[0] if created else None


@app.get("/api/v1/inferences", response_model=List[Inference])
async def fetch_inferences(
    child_id: Optional[str] = None,
    status: Optional[str] = None,
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> List[Inference]:
    resolved_child_id = resolve_child_id(child_id_header, child_id, required=True)
    if not resolved_child_id:
        raise HTTPException(status_code=400, detail="child_id is required for inferences.")
    logger.info(
        "child-scoped request",
        extra={"method": "GET", "path": "/api/v1/inferences", "child_id": resolved_child_id},
    )
    now_iso = _now_iso()
    params = {
        "select": (
            "id,child_id,user_id,inference_type,payload,confidence,status,source,created_at,"
            "updated_at,expires_at,dedupe_key,last_prompted_at"
        ),
        "family_id": f"eq.{auth.family_id}",
        "child_id": f"eq.{resolved_child_id}",
        "order": "created_at.desc",
        "or": f"(expires_at.is.null,expires_at.gt.{now_iso})",
    }
    requested_status = status or InferenceStatus.PENDING.value
    params["status"] = f"eq.{requested_status}"

    child_rows = await auth.supabase.select(
        "children",
        params={
            "select": "birth_date,due_date",
            "id": f"eq.{resolved_child_id}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    age_weeks = _child_age_weeks(child_rows[0]) if child_rows else None
    dtu = get_dtu(age_weeks)
    min_confidence = _inference_min_confidence(dtu)

    rows = await auth.supabase.select("inferences", params=params)
    filtered = [row for row in rows if (row.get("confidence") or 0) >= min_confidence]
    return [Inference.model_validate(row) for row in filtered]


async def _create_knowledge_from_inference(
    auth: AuthContext,
    inference_row: Dict[str, Any],
    *,
    confidence: str,
    qualifier: Optional[str],
) -> Dict[str, Any]:
    child_id = inference_row.get("child_id")
    child_rows = []
    if child_id:
        child_rows = await auth.supabase.select(
            "children",
            params={
                "select": "birth_date,due_date",
                "id": f"eq.{child_id}",
                "family_id": f"eq.{auth.family_id}",
                "limit": "1",
            },
        )
    age_weeks = _child_age_weeks(child_rows[0]) if child_rows else None
    age_range = _age_range_weeks(age_weeks)
    payload = inference_row.get("payload") or {}
    if isinstance(payload, dict):
        payload = {**payload, "source_inference_id": inference_row.get("id")}
    now_iso = _now_iso()
    created = await auth.supabase.insert(
        "knowledge_items",
        {
            "family_id": auth.family_id,
            "user_id": auth.user_id,
            "subject_id": child_id,
            "key": inference_row.get("inference_type") or "memory",
            "type": KnowledgeItemType.INFERRED.value,
            "status": KnowledgeItemStatus.ACTIVE.value,
            "payload": payload,
            "confidence": confidence,
            "qualifier": qualifier,
            "age_range_weeks": age_range,
            "activated_at": now_iso,
            "created_at": now_iso,
            "updated_at": now_iso,
        },
    )
    if not created:
        raise HTTPException(status_code=500, detail="Unable to save memory.")
    return created[0]


@app.post("/api/v1/inferences/{inference_id}/status", response_model=Inference)
async def change_inference_status(
    inference_id: str,
    status: InferenceStatus,
    auth: AuthContext = Depends(get_auth_context),
) -> Inference:
    inference_uuid = resolve_optional_uuid(inference_id, "inference_id")
    if not inference_uuid:
        raise HTTPException(status_code=400, detail="Invalid inference_id")
    updated = await auth.supabase.update(
        "inferences",
        {
            "status": status.value,
            "updated_at": _now_iso(),
        },
        params={"id": f"eq.{inference_uuid}", "family_id": f"eq.{auth.family_id}"},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Inference not found")
    return Inference.model_validate(updated[0])


@app.post("/api/v1/inferences/{inference_id}/resolve")
async def resolve_inference(
    inference_id: str,
    payload: InferenceResolvePayload,
    auth: AuthContext = Depends(get_auth_context),
) -> Dict[str, Any]:
    inference_uuid = resolve_optional_uuid(inference_id, "inference_id")
    if not inference_uuid:
        raise HTTPException(status_code=400, detail="Invalid inference_id")
    rows = await auth.supabase.select(
        "inferences",
        params={
            "select": (
                "id,child_id,user_id,inference_type,payload,confidence,status,source,created_at,"
                "updated_at,expires_at,dedupe_key,last_prompted_at"
            ),
            "id": f"eq.{inference_uuid}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Inference not found")
    inference_row = rows[0]

    action = payload.action
    if action == "reject":
        updated = await auth.supabase.update(
            "inferences",
            {"status": InferenceStatus.REJECTED.value, "updated_at": _now_iso()},
            params={"id": f"eq.{inference_uuid}", "family_id": f"eq.{auth.family_id}"},
        )
        return updated[0] if updated else inference_row

    confidence = "medium" if action == "confirm_general" else "low"
    qualifier = None if action == "confirm_general" else "sometimes"
    await _create_knowledge_from_inference(
        auth,
        inference_row,
        confidence=confidence,
        qualifier=qualifier,
    )
    updated = await auth.supabase.update(
        "inferences",
        {"status": InferenceStatus.CONFIRMED.value, "updated_at": _now_iso()},
        params={"id": f"eq.{inference_uuid}", "family_id": f"eq.{auth.family_id}"},
    )
    return updated[0] if updated else inference_row


@app.post("/api/v1/conversations", response_model=ConversationSession)
async def create_conversation(
    child_id: Optional[str] = None,
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> ConversationSession:
    resolved_child_id = resolve_child_id(child_id_header, child_id, required=True)
    if not resolved_child_id:
        raise HTTPException(status_code=400, detail="child_id is required for conversations.")
    logger.info(
        "child-scoped request",
        extra={"method": "POST", "path": "/api/v1/conversations", "child_id": resolved_child_id},
    )
    return await _create_conversation_session(auth, child_id=resolved_child_id)


@app.get("/api/v1/conversations", response_model=List[ConversationSession])
async def fetch_conversations(
    child_id: Optional[str] = None,
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> List[ConversationSession]:
    resolved_child_id = resolve_child_id(child_id_header, child_id, required=True)
    if not resolved_child_id:
        raise HTTPException(status_code=400, detail="child_id is required for conversations.")
    logger.info(
        "child-scoped request",
        extra={"method": "GET", "path": "/api/v1/conversations", "child_id": resolved_child_id},
    )
    return await _list_conversation_sessions(auth, child_id=resolved_child_id)


@app.get("/api/v1/conversations/{session_id}", response_model=ConversationSession)
async def fetch_conversation(
    session_id: str,
    auth: AuthContext = Depends(get_auth_context),
) -> ConversationSession:
    session_uuid = resolve_optional_uuid(session_id, "conversation_id")
    if not session_uuid:
        raise HTTPException(status_code=400, detail="Invalid conversation id")
    return await _get_conversation_session(auth, session_uuid)


@app.patch("/api/v1/conversations/{session_id}", response_model=ConversationSession)
async def rename_conversation(
    session_id: str,
    payload: RenameConversationPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> ConversationSession:
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title cannot be empty")
    session_uuid = resolve_optional_uuid(session_id, "conversation_id")
    if not session_uuid:
        raise HTTPException(status_code=400, detail="Invalid conversation id")
    updated = await auth.supabase.update(
        "conversation_sessions",
        {"title": title, "updated_at": _now_iso()},
        params={"id": f"eq.{session_uuid}", "family_id": f"eq.{auth.family_id}"},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _session_from_row(updated[0])


@app.post("/api/v1/conversations/{session_id}/messages", response_model=ConversationMessage)
async def post_message(
    session_id: str,
    payload: CreateConversationMessagePayload,
    auth: AuthContext = Depends(get_auth_context),
) -> ConversationMessage:
    session_uuid = resolve_optional_uuid(session_id, "conversation_id")
    if not session_uuid:
        raise HTTPException(status_code=400, detail="Invalid conversation id")
    await _get_conversation_session(auth, session_uuid)
    message = await _insert_conversation_message(
        auth,
        session_id=session_uuid,
        role=payload.role,
        content=payload.content,
        user_id=payload.user_id or auth.user_id,
        intent=payload.intent,
    )
    await _touch_conversation(auth, session_uuid, _now_iso())
    return message


@app.get("/api/v1/conversations/{session_id}/messages", response_model=List[ConversationMessage])
async def fetch_messages(
    session_id: str,
    auth: AuthContext = Depends(get_auth_context),
) -> List[ConversationMessage]:
    session_uuid = resolve_optional_uuid(session_id, "conversation_id")
    if not session_uuid:
        raise HTTPException(status_code=400, detail="Invalid conversation id")
    await _get_conversation_session(auth, session_uuid)
    return await _list_conversation_messages(auth, session_id=session_uuid)


@app.post("/api/v1/metrics/loading")
async def ingest_loading_metrics(
    payload: LoadingMetricsPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    session_id = resolve_optional_uuid(payload.session_id, "session_id")
    message_id = resolve_optional_uuid(payload.message_id, "message_id")
    if session_id:
        await auth.supabase.insert(
            "loading_metrics",
            {
                "session_id": session_id,
                "message_id": message_id,
                "thinking_short_ms": payload.thinking_short_ms,
                "thinking_rich_ms": payload.thinking_rich_ms,
                "error_type": payload.error_type,
                "retry_count": payload.retry_count,
            },
        )
    return {"status": "ok"}


def _normalize_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _normalize_gender(value: Optional[str]) -> Optional[str]:
    normalized = _normalize_text(value)
    if not normalized:
        return None
    return normalized.lower()


def _parse_iso_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _child_age_weeks(child_row: Dict[str, Any]) -> Optional[int]:
    birth_date = _parse_iso_date(child_row.get("birth_date"))
    due_date = _parse_iso_date(child_row.get("due_date"))
    base = birth_date or due_date
    if not base:
        return None
    delta_days = (datetime.now(tz=timezone.utc) - base).days
    return max(0, delta_days // 7)


def get_dtu(child_age_weeks: Optional[int]) -> str:
    if child_age_weeks is None:
        return "unknown"
    if child_age_weeks <= 4:
        return "newborn"
    if child_age_weeks <= 26:
        return "infant"
    return "older"


def _inference_expiry_days(dtu: str) -> int:
    if dtu == "newborn":
        return 14
    if dtu == "infant":
        return 30
    return 90


def _inference_min_confidence(dtu: str) -> float:
    if dtu == "newborn":
        return 0.45
    if dtu == "infant":
        return 0.5
    return 0.55


def _age_range_weeks(child_age_weeks: Optional[int]) -> Optional[str]:
    if child_age_weeks is None:
        return None
    start = max(0, child_age_weeks)
    end = start + 1
    return f"[{start},{end}]"


def _dedupe_key_for_inference(
    child_id: Optional[str],
    inference_type: str,
    payload: Dict[str, Any],
) -> str:
    base = json.dumps(
        {"child_id": child_id, "type": inference_type, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def _split_message_into_events(message: str) -> List[str]:
    if not message:
        return []
    parts = re.split(r"\s+(?:and|then)\s+|;|\n", message)
    cleaned = [part.strip() for part in parts if part and part.strip()]
    return cleaned or [message.strip()]


_AMOUNT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|ml|milliliters?)\b", re.IGNORECASE)
_HOUR_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b", re.IGNORECASE)
_MIN_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b", re.IGNORECASE)


def _extract_amount_from_text(message: str) -> tuple[Optional[float], Optional[str]]:
    match = _AMOUNT_RE.search(message)
    if not match:
        return None, None
    value = float(match.group(1))
    unit = match.group(2).lower()
    unit = "oz" if unit.startswith("o") else "ml"
    return value, unit


def _extract_duration_minutes(message: str) -> Optional[float]:
    match = _HOUR_RE.search(message)
    if match:
        return float(match.group(1)) * 60.0
    match = _MIN_RE.search(message)
    if match:
        return float(match.group(1))
    return None


def _infer_diaper_action_type(message: str) -> CoreActionType:
    lower = message.lower()
    has_poop = "poop" in lower or "bm" in lower
    has_pee = "pee" in lower or "wet" in lower
    if has_poop and has_pee:
        return CoreActionType.DIAPER_PEE_AND_POOP
    if has_poop:
        return CoreActionType.DIAPER_POOP
    if has_pee:
        return CoreActionType.DIAPER_PEE
    return CoreActionType.DIAPER_PEE_AND_POOP


def _action_from_segment(segment: str, timezone_value: Optional[str]) -> Action:
    lower = segment.lower()
    timestamp_iso = extract_event_start(segment, timezone_value)
    try:
        timestamp = datetime.fromisoformat(timestamp_iso)
    except ValueError:
        timestamp = datetime.now(tz=timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    metadata = ActionMetadata()
    action_type: CoreActionType

    if any(word in lower for word in ["sleep", "nap", "slept", "woke"]):
        action_type = CoreActionType.SLEEP
        metadata.duration_minutes = _extract_duration_minutes(segment)
    elif any(word in lower for word in ["diaper", "poop", "pee", "wet"]):
        action_type = _infer_diaper_action_type(segment)
    elif "bath" in lower:
        action_type = CoreActionType.BATH
    elif "med" in lower:
        action_type = CoreActionType.MEDICATION
    else:
        action_type = CoreActionType.ACTIVITY
        amount_value, amount_unit = _extract_amount_from_text(segment)
        if amount_value is not None:
            metadata.amount_value = amount_value
            metadata.amount_unit = amount_unit or "oz"
        method = infer_feed_method_from_message(segment)
        if method:
            extra = dict(metadata.extra or {})
            extra["feed_method"] = method
            metadata.extra = extra

    return Action(
        action_type=action_type,
        timestamp=timestamp,
        note=segment,
        metadata=metadata,
        is_core_action=True,
    )


def _is_question(message: str) -> bool:
    lowered = message.strip().lower()
    if lowered.endswith("?"):
        return True
    return "what is normal" in lowered or lowered.startswith("what is")


def _detect_memory_inference(
    message: str,
) -> Optional[tuple[str, Dict[str, Any], float]]:
    lower = message.lower()
    if any(term in lower for term in ["likes", "love", "prefers", "soothes", "calms"]):
        return ("preference_note", {"summary": message}, 0.55)
    if any(term in lower for term in ["routine", "schedule", "bedtime"]):
        return ("routine_note", {"summary": message}, 0.55)
    if "allergy" in lower or "allergic" in lower:
        return ("allergy_watch", {"summary": message}, 0.6)
    if "sleep" in lower and any(term in lower for term in ["always", "usually"]):
        return ("sleep_note", {"note": message}, 0.5)
    return None


def _build_question_response(
    message: str,
    *,
    child_row: Dict[str, Any],
    category: str,
) -> str:
    child_name = child_row.get("first_name") or child_row.get("name") or "your child"
    weeks = _child_age_weeks(child_row)
    age_label = f"{weeks} weeks" if weeks is not None else "this stage"
    wake_window = estimate_wake_window_label(weeks)
    feed_spacing = estimate_feed_spacing_label(weeks)
    if category == "sleep":
        return (
            f"For {child_name} around {age_label}, wake windows typically sit around "
            f"{wake_window}. If naps feel short or bedtime is rocky, I can help adjust."
        )
    if category == "routine":
        return (
            f"For {child_name} around {age_label}, a gentle routine is feeds about "
            f"{feed_spacing} with wake windows near {wake_window}. Want help mapping today?"
        )
    if category == "health":
        return (
            f"For {child_name} around {age_label}, keep an eye on hydration and comfort. "
            "If anything feels urgent or out of character, call your pediatrician."
        )
    return (
        f"For {child_name} around {age_label}, it’s common to see {wake_window} wake windows "
        f"and feeds about {feed_spacing}. If you want, share more and I can tailor guidance."
    )


def _normalize_caregiver_payload(caregiver: CaregiverProfile) -> Dict[str, Any]:
    data = caregiver.model_dump()
    return {
        "first_name": _normalize_text(data.get("first_name")),
        "last_name": _normalize_text(data.get("last_name")),
        "email": _normalize_text(data.get("email")),
        "phone": _normalize_text(data.get("phone")),
        "relationship": _normalize_text(data.get("relationship")),
    }


async def _fetch_supabase_settings(auth: AuthContext) -> tuple[dict, List[dict]]:
    caregiver = next(
        (
            row
            for row in auth.memberships
            if row.get("family_id") == auth.family_id and row.get("user_id") == auth.user_id
        ),
        {},
    )
    children = await auth.supabase.select(
        "children",
        params={
            "select": (
                "id,name,first_name,last_name,birth_date,due_date,gender,birth_weight,"
                "birth_weight_unit,latest_weight,latest_weight_date,timezone,routine_eligible"
            ),
            "family_id": f"eq.{auth.family_id}",
            "order": "created_at.asc",
        },
    )
    return caregiver, children


async def _upsert_child_profile(
    auth: AuthContext,
    payload: ChildProfile,
    birth_date: Optional[str],
    due_date: Optional[str],
    gender: Optional[str],
) -> None:
    child_payload: Dict[str, Any] = {
        "first_name": _normalize_text(payload.first_name),
        "last_name": _normalize_text(payload.last_name),
        "birth_date": birth_date,
        "due_date": due_date,
        "gender": gender,
        "birth_weight": payload.birth_weight,
        "birth_weight_unit": _normalize_text(payload.birth_weight_unit),
        "latest_weight": payload.latest_weight,
        "latest_weight_date": _normalize_text(payload.latest_weight_date),
        "timezone": _normalize_text(payload.timezone),
    }
    name_parts = [part for part in [child_payload["first_name"], child_payload["last_name"]] if part]
    if name_parts:
        child_payload["name"] = " ".join(name_parts)

    child_id = _normalize_text(payload.id)
    if child_id:
        updated = await auth.supabase.update(
            "children",
            child_payload,
            params={
                "id": f"eq.{child_id}",
                "family_id": f"eq.{auth.family_id}",
            },
        )
        if updated:
            return

    existing_children = await auth.supabase.select(
        "children",
        params={
            "select": "id",
            "family_id": f"eq.{auth.family_id}",
            "order": "created_at.asc",
            "limit": "1",
        },
    )
    if existing_children:
        await auth.supabase.update(
            "children",
            child_payload,
            params={
                "id": f"eq.{existing_children[0]['id']}",
                "family_id": f"eq.{auth.family_id}",
            },
        )
        return

    await auth.supabase.insert(
        "children",
        {
            **child_payload,
            "family_id": auth.family_id,
        },
    )


@app.get("/api/v1/settings", response_model=SettingsResponse)
async def get_settings(
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> SettingsResponse:
    caregiver_data, children_data = await _fetch_supabase_settings(auth)
    selected_child_id = resolve_optional_uuid(child_id_header, "child_id") if child_id_header else None
    return _build_settings_response(caregiver_data, children_data, selected_child_id)


@app.put("/api/v1/settings", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsPayload,
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> SettingsResponse:
    if not payload.child.birth_date and not payload.child.due_date:
        raise HTTPException(status_code=400, detail="Birth date or due date is required.")

    birth_date = _normalize_text(payload.child.birth_date)
    due_date = _normalize_text(payload.child.due_date)
    gender = _normalize_gender(payload.child.gender)
    birth_weight = payload.child.birth_weight

    if birth_date:
        if not gender:
            raise HTTPException(status_code=400, detail="Gender is required for a birth date.")
        if birth_weight is None:
            raise HTTPException(status_code=400, detail="Birth weight is required for a birth date.")
    elif due_date and not gender:
        raise HTTPException(status_code=400, detail="Gender is required for a due date.")
    if gender and gender not in {"boy", "girl", "unknown"}:
        raise HTTPException(status_code=400, detail="Gender must be boy, girl, or unknown.")

    caregiver_payload = _normalize_caregiver_payload(payload.caregiver)
    if caregiver_payload:
        await auth.supabase.update(
            "family_members",
            caregiver_payload,
            params={
                "family_id": f"eq.{auth.family_id}",
                "user_id": f"eq.{auth.user_id}",
            },
        )

    await _upsert_child_profile(
        auth=auth,
        payload=payload.child,
        birth_date=birth_date,
        due_date=due_date,
        gender=gender,
    )

    caregiver_data, children_data = await _fetch_supabase_settings(auth)
    selected_child_id = resolve_optional_uuid(payload.child.id, "child_id") if payload.child.id else None
    if not selected_child_id and child_id_header:
        selected_child_id = resolve_optional_uuid(child_id_header, "child_id")
    return _build_settings_response(caregiver_data, children_data, selected_child_id)


@app.post("/api/v1/families")
async def create_family(
    payload: CreateFamilyPayload,
    user_ctx=Depends(get_user_context),
) -> dict:
    name = (payload.name or "").strip() or "Family"
    created = await user_ctx.supabase.insert("families", {"name": name})
    if not created:
        raise HTTPException(status_code=500, detail="Unable to create family")
    family_id = created[0].get("id")
    await user_ctx.supabase.insert(
        "family_members",
        {
            "family_id": family_id,
            "user_id": user_ctx.user_id,
            "role": "owner",
            "is_primary": True,
        },
    )
    return {"id": family_id, "name": name}


@app.post("/api/v1/children", response_model=ChildProfile)
async def create_child(
    payload: CreateChildPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> ChildProfile:
    birth_date = _normalize_text(payload.birth_date)
    due_date = _normalize_text(payload.due_date)
    gender = _normalize_gender(payload.gender)

    if not birth_date and not due_date:
        raise HTTPException(status_code=400, detail="Birth date or due date is required.")
    if birth_date:
        if not gender:
            raise HTTPException(status_code=400, detail="Gender is required for a birth date.")
        if payload.birth_weight is None:
            raise HTTPException(status_code=400, detail="Birth weight is required for a birth date.")
    elif due_date and not gender:
        raise HTTPException(status_code=400, detail="Gender is required for a due date.")
    if gender and gender not in {"boy", "girl", "unknown"}:
        raise HTTPException(status_code=400, detail="Gender must be boy, girl, or unknown.")

    child_payload: Dict[str, Any] = {
        "family_id": auth.family_id,
        "first_name": _normalize_text(payload.first_name),
        "last_name": _normalize_text(payload.last_name),
        "birth_date": birth_date,
        "due_date": due_date,
        "gender": gender,
        "birth_weight": payload.birth_weight,
        "birth_weight_unit": _normalize_text(payload.birth_weight_unit),
        "timezone": _normalize_text(payload.timezone),
    }
    name_parts = [part for part in [child_payload["first_name"], child_payload["last_name"]] if part]
    if name_parts:
        child_payload["name"] = " ".join(name_parts)

    created = await auth.supabase.insert("children", child_payload)
    if not created:
        raise HTTPException(status_code=500, detail="Unable to create child")
    row = created[0]
    child_first_name = row.get("first_name") or row.get("name") or ""
    return ChildProfile(
        id=row.get("id"),
        first_name=child_first_name,
        last_name=(row.get("last_name") or ""),
        birth_date=(row.get("birth_date") or ""),
        due_date=(row.get("due_date") or ""),
        gender=(row.get("gender") or ""),
        birth_weight=row.get("birth_weight"),
        birth_weight_unit=(row.get("birth_weight_unit") or None),
        latest_weight=row.get("latest_weight"),
        latest_weight_date=(row.get("latest_weight_date") or ""),
        timezone=(row.get("timezone") or ""),
        routine_eligible=bool(row.get("routine_eligible")),
    )


@app.post("/api/v1/invites")
async def create_invite(
    payload: InviteCreatePayload,
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    email = (payload.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    token = uuid4().hex
    created = await auth.supabase.insert(
        "family_invites",
        {
            "family_id": auth.family_id,
            "email": email,
            "role": payload.role or "member",
            "token": token,
        },
    )
    if not created:
        raise HTTPException(status_code=500, detail="Unable to create invite.")
    base_url = os.getenv("HAVI_SITE_URL") or os.getenv("NEXT_PUBLIC_SITE_URL") or "http://localhost:3000"
    return {
        "token": token,
        "family_id": auth.family_id,
        "email": email,
        "invite_url": f"{base_url.rstrip('/')}/app/invite?token={token}",
    }


@app.post("/api/v1/invites/accept")
async def accept_invite(
    payload: InviteAcceptPayload,
    user_ctx=Depends(get_user_context),
) -> dict:
    token = (payload.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Invite token is required.")
    admin = get_admin_client()
    invites = await admin.select(
        "family_invites",
        params={
            "select": "id,family_id,email,role,accepted_at",
            "token": f"eq.{token}",
            "limit": "1",
        },
    )
    if not invites:
        raise HTTPException(status_code=404, detail="Invite not found.")
    invite = invites[0]
    if invite.get("accepted_at"):
        return {"status": "already_accepted", "family_id": invite.get("family_id")}
    invite_email = (invite.get("email") or "").lower()
    user_email = (user_ctx.user_email or "").lower()
    if invite_email and user_email and invite_email != user_email:
        raise HTTPException(status_code=403, detail="Invite does not match this account.")

    await admin.upsert(
        "family_members",
        {
            "family_id": invite.get("family_id"),
            "user_id": user_ctx.user_id,
            "role": invite.get("role") or "member",
            "is_primary": False,
        },
        on_conflict="family_id,user_id",
    )
    await admin.update(
        "family_invites",
        {
            "accepted_at": _now_iso(),
            "accepted_by_user_id": user_ctx.user_id,
        },
        params={"id": f"eq.{invite.get('id')}"},
    )
    return {"status": "accepted", "family_id": invite.get("family_id")}

STAGE_GUIDANCE = {
    "newborn_week_1": {
        "sleep_hours": (14, 18),
        "poop_per_day": (4, 8),
        "feed_per_day": (8, 12),
        "notes": "Newborn tummies are adjusting—expect frequent yellow seedy diapers and 2-3h feeds.",
    },
    "month_3": {
        "sleep_hours": (14, 17),
        "poop_per_day": (1, 3),
        "feed_per_day": (5, 7),
        "notes": "Three-month-olds often stretch nights but still wake 1-2 times; daytime poops may slow down.",
    },
}


async def _fetch_activity_actions(
    auth: AuthContext,
    *,
    child_id: str,
    start: datetime,
    end: datetime,
) -> List[Dict[str, Any]]:
    rows = await auth.supabase.select(
        "activity_logs",
        params={
            "select": "actions_json,created_at",
            "family_id": f"eq.{auth.family_id}",
            "child_id": f"eq.{child_id}",
            "order": "created_at.desc",
            "limit": "500",
        },
    )
    actions: List[Dict[str, Any]] = []
    for row in rows:
        created_at = _parse_iso_date(row.get("created_at"))
        if created_at and (created_at < start or created_at > end):
            continue
        payload = row.get("actions_json")
        if isinstance(payload, list):
            actions.extend(payload)
        elif isinstance(payload, dict):
            candidate = payload.get("actions") or payload.get("items") or []
            if isinstance(candidate, list):
                actions.extend(candidate)
    return actions


def _summaries_from_actions(actions: List[Dict[str, Any]]) -> Dict[str, float]:
    totals = defaultdict(float)
    for action in actions:
        atype = action.get("action_type")
        if not atype:
            continue
        metadata = action.get("metadata") or {}
        totals[f"count_{atype}"] += 1
        if atype == "sleep" and metadata.get("duration_minutes"):
            totals["sleep_minutes"] += float(metadata.get("duration_minutes", 0))
        if atype == "activity" and metadata.get("amount_value"):
            totals["feed_oz"] += float(metadata.get("amount_value", 0))
    return dict(totals)


async def _compare_metrics(
    auth: AuthContext,
    *,
    child_id: str,
    days: int = 1,
    baseline_days: int = 1,
) -> Dict[str, Any]:
    now = datetime.now(tz=timezone.utc)
    window_start = now - timedelta(days=days)
    baseline_start = window_start - timedelta(days=baseline_days)
    current_actions = await _fetch_activity_actions(
        auth,
        child_id=child_id,
        start=window_start,
        end=now,
    )
    baseline_actions = await _fetch_activity_actions(
        auth,
        child_id=child_id,
        start=baseline_start,
        end=window_start,
    )
    current_summary = _summaries_from_actions(current_actions)
    baseline_summary = _summaries_from_actions(baseline_actions)
    deltas: Dict[str, Dict[str, float]] = {}
    for key in set(current_summary) | set(baseline_summary):
        current_value = current_summary.get(key, 0.0)
        baseline_value = baseline_summary.get(key, 0.0)
        deltas[key] = {
            "current": current_value,
            "baseline": baseline_value,
            "delta": current_value - baseline_value,
        }
    return {
        "window_days": days,
        "baseline_days": baseline_days,
        "current": current_summary,
        "baseline": baseline_summary,
        "metrics": deltas,
    }


def _expected_ranges(stage: str, observed: Dict[str, float] | None = None) -> Dict[str, Any]:
    stage_data = STAGE_GUIDANCE.get(stage, {})
    guidance = {
        "stage": stage,
        "ranges": stage_data,
        "notes": stage_data.get("notes", "") if stage_data else "",
        "observed": observed or {},
        "risks": [],
        "options": [],
    }
    if observed and stage_data:
        sleep_hours = observed.get("sleep_minutes", 0) / 60
        feed_count = observed.get("count_activity", 0)
        poop_count = observed.get("count_dirty_diaper_poop", 0) + observed.get(
            "count_dirty_diaper_pee_and_poop", 0
        )
        if sleep_hours < stage_data.get("sleep_hours", (0, 0))[0]:
            guidance["risks"].append(
                "Sleep trending short; watch wake windows and bedtime routine."
            )
        if feed_count < stage_data.get("feed_per_day", (0, 0))[0]:
            guidance["options"].append(
                "Consider offering an extra daytime feed or earlier top-off."
            )
        if poop_count < stage_data.get("poop_per_day", (0, 0))[0]:
            guidance["options"].append(
                "If stools slow down, offer tummy time or consult pediatrician if discomfort appears."
            )
    return guidance


@app.get("/api/v1/insights/compare")
async def compare_insight(
    child_id: Optional[str] = None,
    days: int = 1,
    baseline_days: int = 1,
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> dict:
    resolved_child_id = resolve_child_id(child_id_header, child_id, required=True)
    if not resolved_child_id:
        raise HTTPException(status_code=400, detail="child_id is required.")
    logger.info(
        "child-scoped request",
        extra={
            "method": "GET",
            "path": "/api/v1/insights/compare",
            "child_id": resolved_child_id,
        },
    )
    return await _compare_metrics(
        auth,
        child_id=resolved_child_id,
        days=days,
        baseline_days=baseline_days,
    )


@app.get("/api/v1/insights/expected")
async def expected_insight(
    child_id: Optional[str] = None,
    stage: str = "",
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> dict:
    resolved_child_id = resolve_child_id(child_id_header, child_id, required=True)
    if not resolved_child_id:
        raise HTTPException(status_code=400, detail="child_id is required.")
    logger.info(
        "child-scoped request",
        extra={
            "method": "GET",
            "path": "/api/v1/insights/expected",
            "child_id": resolved_child_id,
        },
    )
    # For now, expected ranges just use stage presets without live observations.
    return _expected_ranges(stage)


def maybe_record_sibling_inference(message: str) -> None:
    pattern = re.compile(
        r"(?P<sibling>[a-zA-Z]+)\s*,?\s+(?P<child>[a-zA-Z]+)'s\s+(?P<relation>brother|sister)",
        re.IGNORECASE,
    )
    match = pattern.search(message)
    if not match:
        return

    sibling = match.group("sibling").strip(" ,.").title()
    child = match.group("child").strip(" ,.").title()
    relation = match.group("relation").lower()

    create_inference(
        CreateInferencePayload(
            inference_type="sibling_relationship",
            payload={
                "child_name": child,
                "sibling_name": sibling,
                "relationship": relation,
            },
            confidence=0.55,
            source="text_heuristic",
        )
    )


CITY_TIMEZONE_MAP = {
    "los angeles": "America/Los_Angeles",
    "san francisco": "America/Los_Angeles",
    "seattle": "America/Los_Angeles",
    "new york": "America/New_York",
    "boston": "America/New_York",
    "chicago": "America/Chicago",
    "houston": "America/Chicago",
    "austin": "America/Chicago",
    "atlanta": "America/New_York",
    "london": "Europe/London",
}


def normalize_timezone(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    key = candidate.lower()
    if key in CITY_TIMEZONE_MAP:
        candidate = CITY_TIMEZONE_MAP[key]
    try:
        ZoneInfo(candidate)
        return candidate
    except Exception:
        return None


def resolve_timezone(payload_timezone: Optional[str], child_data: dict) -> tuple[Optional[str], Optional[str]]:
    stored_tz = normalize_timezone(child_data.get("timezone"))
    payload_tz = normalize_timezone(payload_timezone)
    tz = stored_tz or payload_tz
    prompt = None
    if tz:
        if tz != child_data.get("timezone"):
            update_child_profile({"timezone": tz})
            child_data["timezone"] = tz
    else:
        # Default to Pacific Time when no timezone is provided to keep events in a recent window.
        tz = "America/Los_Angeles"
        update_child_profile({"timezone": tz})
        child_data["timezone"] = tz
        prompt = "I can personalize times once I know your timezone—share your city or zone when you can."
    return tz, prompt


def _strip_task_datetime_phrases(text: str) -> str:
    """Remove simple date/time phrases and nearby glue words from a task title."""
    if not text:
        return ""

    result = text

    # Remove common "time + date" or "date + time" phrases with glue words.
    removal_patterns = [
        rf"\s*\b(?:for|at)\s+{_TASK_TIME_REGEX}\s*(?:on\s+{_TASK_DATE_REGEX})?",
        rf"\s*\bon\s+{_TASK_DATE_REGEX}\s*(?:at\s+{_TASK_TIME_REGEX})?",
        rf"\s*{_TASK_DATE_REGEX}\s+{_TASK_TIME_REGEX}",
        rf"\s*{_TASK_TIME_REGEX}\s+on\s+{_TASK_DATE_REGEX}",
    ]
    for pattern in removal_patterns:
        result = re.sub(pattern, "", result, flags=re.IGNORECASE)

    # Trim any trailing standalone date or time fragments.
    result = re.sub(rf"\s*{_TASK_DATE_REGEX}\s*$", "", result, flags=re.IGNORECASE)
    result = re.sub(rf"\s*{_TASK_TIME_REGEX}\s*$", "", result, flags=re.IGNORECASE)

    # Remove trailing glue words like "for", "at", "on" if they are left dangling.
    result = re.sub(r"\s*\b(?:for|at|on)\b\s*$", "", result, flags=re.IGNORECASE)

    # Normalize whitespace and strip punctuation.
    result = re.sub(r"\s+", " ", result).strip(" .,:;-")
    return result


def extract_task_title(message: str) -> str:
    text = (message or "").strip()
    patterns = [
        r"remind me to\s+(.+)",
        r"remind me\s+(.+)",
        r"don't forget to\s+(.+)",
        r"don't forget\s+(.+)",
        r"dont forget to\s+(.+)",
        r"dont forget\s+(.+)",
        r"\bi need to\s+(.+)",
        r"\bto-?do[:\-\s]*\s*(.+)",
        r"\btodo[:\-\s]*\s*(.+)",
        r"\btask[s]?:?\s*(.+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            candidate = match.group(1).strip(" .")
            if candidate:
                cleaned = _strip_task_datetime_phrases(candidate)
                return cleaned or candidate
    base = text.strip(" .")
    cleaned = _strip_task_datetime_phrases(base)
    return cleaned or base or "Task"


_TASK_DATE_REGEX = r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b"
_TASK_TIME_REGEX = r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b"
_TASK_DATE_PATTERN = re.compile(_TASK_DATE_REGEX)
_TASK_TIME_PATTERN = re.compile(_TASK_TIME_REGEX, re.IGNORECASE)


_DATE_HINT_WORDS = {
    "today",
    "tomorrow",
    "tonight",
    "morning",
    "afternoon",
    "evening",
    "next",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "weekday",
    "weekend",
    "week",
    "month",
    "year",
}


def _has_date_hint(text: str) -> bool:
    lower = text.lower()
    if re.search(r"\d", lower):
        return True
    return any(word in lower for word in _DATE_HINT_WORDS)


def _build_dateparser_settings(
    tz_name: str, base_time: Optional[datetime] = None
) -> Dict[str, Any]:
    settings: Dict[str, Any] = {
        "RETURN_AS_TIMEZONE_AWARE": True,
        "TIMEZONE": tz_name,
        "TO_TIMEZONE": "UTC",
        "PREFER_DATES_FROM": "future",
    }
    if base_time is not None:
        settings["RELATIVE_BASE"] = base_time
    return settings


def _parse_natural_datetime(
    message: str,
    timezone_value: Optional[str],
    base_time: Optional[datetime] = None,
) -> Optional[datetime]:
    tz_name = timezone_value or "America/Los_Angeles"
    settings = _build_dateparser_settings(tz_name, base_time)
    try:
        parsed = search_dates(
            message,
            settings=settings,
            languages=["en"],
        )
    except (ValueError, TypeError):
        parsed = None
    if not parsed:
        return None
    for phrase, parsed_dt in parsed:
        if parsed_dt and _has_date_hint(phrase):
            return parsed_dt
    return None


def extract_task_due_at(
    message: str,
    timezone_value: Optional[str],
    base_time: Optional[datetime] = None,
) -> Optional[str]:
    """Best-effort parse of a due date/time from a task message.

    This is intentionally narrow: it looks for patterns like "6pm on 1/2/25"
    and interprets them in the caregiver's local timezone before storing an
    ISO timestamp in UTC (matching how the UI writes due_at).
    """
    if not message:
        return None

    date_match = _TASK_DATE_PATTERN.search(message)
    if not date_match:
        parsed_dt = _parse_natural_datetime(message, timezone_value, base_time)
        if not parsed_dt:
            return None
        if parsed_dt.tzinfo is None:
            tz_name = timezone_value or "America/Los_Angeles"
            try:
                parsed_dt = parsed_dt.replace(tzinfo=ZoneInfo(tz_name))
            except Exception:
                parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
        return parsed_dt.astimezone(timezone.utc).isoformat()
    month_str, day_str, year_str = date_match.groups()
    try:
        month = int(month_str)
        day = int(day_str)
        year = int(year_str)
    except ValueError:
        return None
    if year < 100:
        year += 2000

    time_match = _TASK_TIME_PATTERN.search(message)
    hour = 0
    minute = 0
    if time_match:
        hour_str, minute_str, meridiem = time_match.groups()
        try:
            hour = int(hour_str)
            minute = int(minute_str or "0")
        except ValueError:
            hour, minute = 0, 0
        meridiem = (meridiem or "").lower()
        if meridiem == "pm" and hour != 12:
            hour += 12
        if meridiem == "am" and hour == 12:
            hour = 0

    tz_name = timezone_value or "America/Los_Angeles"
    try:
        tzinfo = ZoneInfo(tz_name)
    except Exception:
        tzinfo = timezone.utc

    try:
        local_dt = datetime(year, month, day, hour, minute, tzinfo=tzinfo)
    except ValueError:
        return None
    utc_dt = local_dt.astimezone(timezone.utc)
    return utc_dt.isoformat()


def extract_task_remind_at(
    message: str,
    timezone_value: Optional[str],
    base_time: Optional[datetime] = None,
) -> Optional[str]:
    if not message:
        return None
    parsed_dt = _parse_natural_datetime(message, timezone_value, base_time)
    if not parsed_dt:
        return None
    if parsed_dt.tzinfo is None:
        tz_name = timezone_value or "America/Los_Angeles"
        try:
            parsed_dt = parsed_dt.replace(tzinfo=ZoneInfo(tz_name))
        except Exception:
            parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
    return parsed_dt.astimezone(timezone.utc).isoformat()


def extract_event_start(
    message: str,
    timezone_value: Optional[str],
    base_time: Optional[datetime] = None,
) -> str:
    """Parse a natural language time and return an ISO timestamp in UTC."""
    tz_name = timezone_value or "America/Los_Angeles"
    tzinfo = None
    try:
        tzinfo = ZoneInfo(tz_name)
    except Exception:
        tzinfo = timezone.utc
    base = base_time or datetime.now(tzinfo)
    parsed_dt = _parse_natural_datetime(message, tz_name, base)
    if parsed_dt:
        if parsed_dt.tzinfo is None:
            parsed_dt = parsed_dt.replace(tzinfo=tzinfo)
        return parsed_dt.astimezone(timezone.utc).isoformat()
    return datetime.now(tz=timezone.utc).isoformat()


def detect_catch_up_entry(message: str) -> bool:
    lower = message.lower()
    return any(phrase in lower for phrase in CATCH_UP_ENTRY_PHRASES)


def detect_catch_up_exit(message: str) -> bool:
    lower = message.lower()
    return any(phrase in lower for phrase in CATCH_UP_EXIT_PHRASES)


def message_symptom_tags(message: str) -> List[str]:
    lower = message.lower()
    tags = []
    for tag, keywords in SYMPTOM_KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            tags.append(tag)
    return tags


def classify_question_category(message: str, symptom_tags: List[str]) -> str:
    lower = message.lower()
    if symptom_tags:
        return "health"
    if any(word in lower for word in ["sleep", "nap", "wake window", "bedtime"]):
        return "sleep"
    if any(word in lower for word in ["routine", "schedule", "plan the day"]):
        return "routine"
    return "generic"


def apply_blowout_classification(actions: List[Action], original_message: str) -> None:
    lower = original_message.lower()
    if "blowout" not in lower:
        return
    for action in actions:
        if "blowout" in (action.note or "").lower():
            if action.action_type not in {
                CoreActionType.DIAPER_PEE,
                CoreActionType.DIAPER_POOP,
                CoreActionType.DIAPER_PEE_AND_POOP,
            }:
                action.action_type = CoreActionType.DIAPER_PEE_AND_POOP
            return
    actions.append(
        Action(
            action_type=CoreActionType.DIAPER_PEE_AND_POOP,
            timestamp=datetime.now(timezone.utc),
            note="Blowout diaper",
            metadata=ActionMetadata(),
        )
    )


def infer_feed_method_from_message(message: str) -> Optional[str]:
    lower = message.lower()
    if not any(keyword in lower for keywords in FEED_KEYWORDS.values() for keyword in keywords):
        return None
    for method, keywords in FEED_KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            return method
    return None


def determine_feed_pattern(actions: List[Action]) -> Optional[str]:
    methods: List[str] = []
    for action in actions:
        if action.action_type != CoreActionType.ACTIVITY:
            continue
        method = action.metadata.extra.get("feed_method")
        if method:
            methods.append(method)
    if not methods:
        return None
    sample = methods[:5]
    counts = Counter(sample)
    method, count = counts.most_common(1)[0]
    return method if count / len(sample) >= 0.7 else None


def annotate_feed_method(actions: List[Action], method: Optional[str]) -> None:
    if not method:
        return
    for action in actions:
        if action.action_type == CoreActionType.ACTIVITY:
            extra = dict(action.metadata.extra or {})
            extra.setdefault("feed_method", method)
            action.metadata.extra = extra


def is_unrelated_question(message: str) -> bool:
    lower = message.lower()
    if "?" in message:
        return True
    return any(keyword in lower for keyword in ["compare", "expected", "what's expected", "milestone"])


def message_describes_event(message: str) -> bool:
    lower = message.lower()
    if any(word in lower for word in ["diaper", "feed", "nap", "slept", "woke", "oz", "ounce", "bottle", "bath", "med", "medicine"]):
        return True
    return bool(re.search(r"\b\d{1,2}(:\d{2})?\s*(am|pm)?\b", message.lower()))


def normalize_parental_typos(message: str) -> tuple[str, List[tuple[str, str]]]:
    if not message:
        return message, []

    corrections: List[tuple[str, str]] = []
    text = message

    def apply_pattern(pattern: re.Pattern, replacer):
        nonlocal text

        def _sub(match: re.Match) -> str:
            replacement = replacer(match)
            original = match.group(0)
            if original != replacement:
                corrections.append((original.strip(), replacement.strip()))
            return replacement

        text = pattern.sub(_sub, text)

    simple_replacements = {
        r"\bforumala\b": "formula",
        r"\bformuala\b": "formula",
        r"\bforuma\b": "formula",
        r"\bformla\b": "formula",
        r"\bhiting\b": "hitting",
        r"\bhittng\b": "hitting",
        r"\bhittting\b": "hitting",
    }
    for pattern, replacement in simple_replacements.items():
        apply_pattern(re.compile(pattern, re.IGNORECASE), lambda _match, repl=replacement: repl)

    apply_pattern(
        re.compile(r"(\d+(?:\.\d+)?)\s*ox\b", re.IGNORECASE),
        lambda match: f"{match.group(1)} oz",
    )

    apply_pattern(
        re.compile(r"\box\b(?=\s*(?:bottle|feed|formula|milk))", re.IGNORECASE),
        lambda _match: "oz",
    )

    apply_pattern(
        re.compile(r"\b(is|feels|seems|looks|was)\s+suck\b", re.IGNORECASE),
        lambda match: f"{match.group(1)} sick",
    )

    return text, corrections


SAVE_THAT_PHRASES = ["save that", "remember that"]
SAVE_THIS_PHRASES = ["save this", "remember this"]
SAVE_GENERIC_PHRASES = ["save to memory", "save to knowledge", "remember to save"]
_SAVE_PREFIX_RE = re.compile(
    r"^(save (this|that)|remember (this|that)|save to memory|save to knowledge|remember to save)\s*[:,-]?\s*",
    re.IGNORECASE,
)


def detect_memory_save_target(message: str) -> Optional[str]:
    lower = message.lower()
    if any(phrase in lower for phrase in SAVE_THAT_PHRASES):
        return "assistant"
    if any(phrase in lower for phrase in SAVE_THIS_PHRASES + SAVE_GENERIC_PHRASES):
        return "user"
    return None


def _strip_memory_prefix(message: str) -> str:
    cleaned = _SAVE_PREFIX_RE.sub("", message or "").strip()
    return cleaned or (message or "").strip()


def _select_memory_text(target: str, user_message: str, assistant_message: Optional[str]) -> Optional[str]:
    if target == "assistant":
        return assistant_message
    return user_message


def _build_memory_response(
    assistant_text: str,
    session: ConversationSession,
    payload_message: str,
    question_category: str,
    start: float,
) -> ChatResponse:
    user_message_obj = append_message(
        CreateMessagePayload(
            session_id=session.id,
            role="user",
            content=payload_message,
            intent=ConversationIntent.UNKNOWN,
        )
    )
    assistant_message_obj = append_message(
        CreateMessagePayload(
            session_id=session.id,
            role="assistant",
            content=assistant_text,
            intent=ConversationIntent.UNKNOWN,
        )
    )
    latency_ms = int((time.perf_counter() - start) * 1000)
    return ChatResponse(
        actions=[],
        raw_message=payload_message,
        model=CONFIG.openai_model,
        latency_ms=latency_ms,
        assistant_message=assistant_text,
        question_category=question_category,
        conversation_id=session.id,
        user_message_id=user_message_obj.id,
        assistant_message_id=assistant_message_obj.id,
    )


def _manual_memory_clarification_response(
    session: ConversationSession,
    payload_message: str,
    question_category: str,
    start: float,
) -> ChatResponse:
    return _build_memory_response(
        assistant_text="What would you like me to save?",
        session=session,
        payload_message=payload_message,
        question_category=question_category,
        start=start,
    )


def _pending_inference_response(
    session: ConversationSession,
    payload_message: str,
    question_category: str,
    start: float,
    pending_knowledge: List[KnowledgeItem],
) -> ChatResponse:
    hint = pending_knowledge[0].payload.get("framework") or pending_knowledge[0].key
    assistant_text = (
        f"I’m still waiting to confirm {hint}. Want to confirm it before I save anything else?"
    )
    return _build_memory_response(
        assistant_text=assistant_text,
        session=session,
        payload_message=payload_message,
        question_category=question_category,
        start=start,
    )


def handle_memory_command(
    *,
    target: str,
    profile_id: Optional[int],
    session: ConversationSession,
    payload: ChatRequest,
    pending_knowledge: List[KnowledgeItem],
    question_category: str,
    start: float,
    last_assistant_message: Optional[str],
) -> Optional[ChatResponse]:
    if target not in {"assistant", "user"}:
        return None
    target_text = _select_memory_text(target, payload.message, last_assistant_message)
    if not target_text:
        return _manual_memory_clarification_response(
            session=session,
            payload_message=payload.message,
            question_category=question_category,
            start=start,
        )
    if pending_knowledge and target == "user":
        return _pending_inference_response(
            session=session,
            payload_message=payload.message,
            question_category=question_category,
            start=start,
            pending_knowledge=pending_knowledge,
        )
    if profile_id is not None:
        set_explicit_knowledge(profile_id, "manual_memory", {"text": target_text})
        assistant_text = "Got it — I’ll remember that."
    else:
        assistant_text = "I’d love to save that, but can you finish setting up your profile first?"
    return _build_memory_response(
        assistant_text=assistant_text,
        session=session,
        payload_message=payload.message,
        question_category=question_category,
        start=start,
    )


def _contains_explicit_date(user_text: str) -> bool:
    lowered = user_text.lower()
    if any(month in lowered for month in MONTH_HINTS):
        return True
    return any(part.isdigit() and len(part) == 4 and part.startswith("20") for part in lowered.split())

def _extract_time_from_text(user_text: str) -> Optional[tuple[int, int]]:
    lowered = user_text.lower()
    match = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", lowered)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    meridiem = match.group(3)
    if meridiem == "pm" and hour != 12:
        hour += 12
    if meridiem == "am" and hour == 12:
        hour = 0
    return hour, minute


def _normalize_inferred_timestamp(user_text: str, ts: datetime, tzinfo, now_local: datetime) -> datetime:
    lowered = user_text.lower()
    has_relative_hint = any(hint in lowered for hint in RELATIVE_TIME_HINTS)
    explicit_date = _contains_explicit_date(user_text)
    if explicit_date:
        return ts
    if has_relative_hint:
        time_hint = _extract_time_from_text(user_text)
        if time_hint:
            hour, minute = time_hint
            ts = ts.astimezone(tzinfo).replace(
                year=now_local.year,
                month=now_local.month,
                day=now_local.day,
                hour=hour,
                minute=minute,
                second=0,
                microsecond=0,
            )
            return ts
        delta_seconds = abs((now_local - ts).total_seconds())
        if delta_seconds > 48 * 3600 or ts.year < now_local.year:
            ts = ts.replace(year=now_local.year, month=now_local.month, day=now_local.day)
            if ts > now_local:
                ts = now_local
    return ts


def normalize_action_timestamps(actions: List[Action], timezone_value: Optional[str], original_message: str) -> None:
    tz_value = timezone_value or "America/Los_Angeles"
    try:
        tzinfo = ZoneInfo(tz_value)
    except Exception:
        tzinfo = timezone.utc
    now_local = datetime.now(tzinfo)
    time_only = bool(re.search(r"\b\d{1,2}(?::\d{2})?\s*(am|pm)\b", original_message.lower())) and not _contains_explicit_date(original_message)
    for action in actions:
        base_ts = action.timestamp
        ts = base_ts.replace(tzinfo=None)
        extra_meta = action.metadata.extra or {}
        if "timezone_assumed" in extra_meta:
            extra_meta.pop("timezone_assumed", None)
        extra_meta["timezone"] = tz_value
        ts = ts.replace(tzinfo=tzinfo)
        if time_only:
            ts = ts.replace(year=now_local.year, month=now_local.month, day=now_local.day)
        if ts > now_local:
            ts = now_local
        ts = _normalize_inferred_timestamp(original_message, ts, tzinfo, now_local)
        if extra_meta.get("assumed_time") or extra_meta.get("assumed_timezone"):
            delta = abs((now_local - ts).total_seconds())
            if delta > 24 * 3600:
                ts = now_local
        action.timestamp = ts
        action.metadata.extra = extra_meta


def build_catch_up_entry_message(last_event_summary: Optional[str]) -> str:
    if last_event_summary:
        return (
            f"Great—ready when you are. Share events one at a time or in batches; "
            f"I’ll confirm before saving. The last event I have is {last_event_summary}. Go ahead whenever you’re ready."
        )
    return (
        "Great—ready when you are. Share events one at a time or in batches; I’ll confirm before saving. "
        "I don’t have any earlier logs yet, so feel free to start wherever is easiest."
    )


def describe_last_event(timezone_value: Optional[str]) -> Optional[str]:
    recent = recent_action_models(1)
    if not recent:
        return None
    return describe_action(recent[0], timezone_value)


def count_recent_night_events(actions: List[Action], timezone_value: Optional[str]) -> int:
    if not actions:
        return 0
    tzinfo = ZoneInfo(timezone_value) if timezone_value else None
    count = 0
    for action in actions:
        dt = action.timestamp
        if tzinfo:
            try:
                dt = dt.astimezone(tzinfo)
            except Exception:
                pass
        hour = dt.hour
        if 0 <= hour <= 5:
            count += 1
    return count


def message_mentions_feed(message: str) -> bool:
    lower = message.lower()
    return any(keyword in lower for keyword in ["feed", "bottle", "nurse", "breast", "formula", "oz", "ounce"])


def profile_missing_fields_for_expectations(child_data: dict) -> List[str]:
    requirements = [
        ("gender", child_data.get("gender")),
        ("birth weight", child_data.get("birth_weight")),
        ("latest weight", child_data.get("latest_weight")),
        ("latest weight date", child_data.get("latest_weight_date")),
    ]
    birth_date = child_data.get("birth_date")
    due_date = child_data.get("due_date")
    if not birth_date and not due_date:
        requirements.append(("date of birth or due date", None))
    return [label for label, value in requirements if not value]


def detect_routine_acceptance(message: str) -> bool:
    lower = message.lower()
    if "routine" not in lower:
        return False
    return any(
        phrase in lower
        for phrase in ["set up", "setup", "build", "start", "help me", "create", "plan a routine"]
    )


def metric_similarity(a: float, b: float) -> float:
    if a == 0 and b == 0:
        return 1.0
    if a == 0 or b == 0:
        return 0.0
    diff = abs(a - b) / max(a, b)
    return max(0.0, 1.0 - diff)


def evaluate_routine_similarity(actions: List[Action], timezone_value: Optional[str]) -> bool:
    tzinfo = None
    if timezone_value:
        try:
            tzinfo = ZoneInfo(timezone_value)
        except Exception:
            tzinfo = None
    per_day: Dict[str, Dict[str, float]] = {}
    for action in actions:
        dt = action.timestamp
        if tzinfo:
            try:
                dt = dt.astimezone(tzinfo)
            except Exception:
                pass
        day_key = dt.date().isoformat()
        metrics = per_day.setdefault(day_key, {"feeds": 0.0, "sleeps": 0.0, "diapers": 0.0})
        if action.action_type == CoreActionType.ACTIVITY:
            metrics["feeds"] += 1
        elif action.action_type in {
            CoreActionType.DIAPER_PEE,
            CoreActionType.DIAPER_POOP,
            CoreActionType.DIAPER_PEE_AND_POOP,
        }:
            metrics["diapers"] += 1
        elif action.action_type == CoreActionType.SLEEP and action.metadata.duration_minutes:
            metrics["sleeps"] += action.metadata.duration_minutes
    days = sorted(per_day.items(), key=lambda item: item[0], reverse=True)
    if len(days) < 2:
        return False
    (_, day_one), (_, day_two) = days[:2]
    feed_score = metric_similarity(day_one["feeds"], day_two["feeds"])
    sleep_score = metric_similarity(day_one["sleeps"], day_two["sleeps"])
    diaper_score = metric_similarity(day_one["diapers"], day_two["diapers"])
    similarity = (feed_score + sleep_score + diaper_score) / 3
    return similarity >= 0.65


def maybe_offer_routine_prompt(
    *,
    child_id: int,
    routine_ready: bool,
    symptom_tags: List[str],
    catch_up_mode: bool,
    recent_message: str,
    actions_logged_count: int,
) -> Optional[str]:
    if not routine_ready or symptom_tags or catch_up_mode:
        return None
    if actions_logged_count < 2:
        lower = recent_message.lower()
        keyword_hits = any(
            token in lower for token in ["night", "overnight", "catch up", "catch-up", "bedtime", "routine", "another night"]
        )
        if not keyword_hits:
            return None
    metrics = get_routine_metrics(child_id) or {}
    if metrics.get("prompt_shown_count"):
        return None
    upsert_routine_metrics(child_id=child_id, prompt_shown_delta=1)
    return (
        "Captured—another night in the books. I can start building a routine from your recent patterns using "
        "Moms on Call, Happiest Baby, and APA guidance. Routines help lighten the mental load—want me to set one up?"
    )


def _build_settings_response(
    caregiver_data: dict,
    children_data: List[dict],
    selected_child_id: Optional[str] = None,
) -> SettingsResponse:
    caregiver = CaregiverProfile(
        first_name=(caregiver_data.get("first_name") or ""),
        last_name=(caregiver_data.get("last_name") or ""),
        email=(caregiver_data.get("email") or ""),
        phone=(caregiver_data.get("phone") or ""),
        relationship=(caregiver_data.get("relationship") or ""),
    )

    child_profiles: List[ChildProfile] = []
    for row in children_data:
        child_first_name = row.get("first_name") or row.get("name") or ""
        child_profiles.append(
            ChildProfile(
                id=row.get("id"),
                first_name=child_first_name,
                last_name=(row.get("last_name") or ""),
                birth_date=(row.get("birth_date") or ""),
                due_date=(row.get("due_date") or ""),
                gender=(row.get("gender") or ""),
                birth_weight=row.get("birth_weight"),
                birth_weight_unit=(row.get("birth_weight_unit") or None),
                latest_weight=row.get("latest_weight"),
                latest_weight_date=(row.get("latest_weight_date") or ""),
                timezone=(row.get("timezone") or ""),
                routine_eligible=bool(row.get("routine_eligible")),
            )
        )

    selected_child = next(
        (child for child in child_profiles if child.id == selected_child_id),
        child_profiles[0] if child_profiles else ChildProfile(),
    )

    return SettingsResponse(caregiver=caregiver, child=selected_child, children=child_profiles)


def _sync_child_knowledge(
    profile_id: Optional[int],
    child_id: Optional[str],
    child: ChildProfile,
) -> None:
    if profile_id is None:
        return

    if child.birth_weight is not None:
        payload = {
            "value": child.birth_weight,
            "unit": child.birth_weight_unit or "lb",
            "source": "settings",
        }
        set_explicit_knowledge(profile_id, "child_birth_weight", payload)
        _reject_related_inferences(child_id, "child_birth_weight")

    if child.latest_weight is not None:
        payload = {
            "value": child.latest_weight,
            "date": child.latest_weight_date or "",
            "source": "settings",
        }
        set_explicit_knowledge(profile_id, "child_latest_weight", payload)
        _reject_related_inferences(child_id, "child_latest_weight")

    birth_date = child.birth_date
    due_date = child.due_date
    if birth_date and due_date:
        try:
            birth_dt = datetime.fromisoformat(birth_date)
            due_dt = datetime.fromisoformat(due_date)
            days_diff = (due_dt - birth_dt).days
            weeks_early = max(0.0, days_diff / 7.0)
            gestational = round(max(0.0, 40.0 - weeks_early), 1)
            payload = {
                "is_premature": weeks_early >= 2.0,
                "gestational_age_weeks": gestational if weeks_early > 0 else 40.0,
                "weeks_early": weeks_early,
                "source": "settings",
            }
            if weeks_early >= 2.0:
                set_explicit_knowledge(profile_id, "child_prematurity", payload)
        except ValueError:
            pass


KNOWLEDGE_INFERENCE_MAP: dict[str, List[str]] = {
    "child_birth_weight": ["growth"],
    "child_latest_weight": ["growth"],
}


def _reject_related_inferences(child_id: Optional[str], knowledge_key: str) -> None:
    if child_id is None:
        return
    inference_types = KNOWLEDGE_INFERENCE_MAP.get(knowledge_key, [knowledge_key])
    for inference in list_inferences(child_id=child_id):
        if inference.inference_type in inference_types and inference.status != InferenceStatus.REJECTED.value:
            update_inference_status(inference.id, status=InferenceStatus.REJECTED.value)


def build_assistant_message(
    actions: List[Action],
    original_message: str,
    *,
    child_data: dict,
    context: Dict[str, Any],
) -> tuple[str, List[str]]:
    ui_nudges: list[str] = []
    context_actions = context.get("recent_actions") or actions or recent_action_models(4)
    try:
        summary = summarize_actions(actions, child_data, context)
        intent = (context.get("intent") or "").strip()
        # Logging path: keep responses tight and never surface fallbacks here.
        if intent == "logging":
            descriptions = [
                describe_action(action, child_data.get("timezone"))
                for action in actions
            ] if actions else []
            if descriptions:
                base = f"Logged: {', '.join(descriptions)}."
            else:
                base = "Logged your update."
            follow_up = ""
            if context.get("feed_follow_up"):
                follow_up = f" {context['feed_follow_up']}"
            parts = [
                (base or "").strip(),
                (follow_up or "").strip(),
                (context.get("autocorrect_note") or "").strip(),
            ]
            reply = " ".join(part for part in parts if part).strip()
            if not reply:
                return _format_compose_error("empty logging reply"), ui_nudges or []
            return reply, []

        # Non-logging: advice / guidance / general replies.
        stage_line = stage_guidance(
            original_message,
            child_data,
            context_actions,
            context.get("question_category", "generic"),
        )
        guidance = symptom_guidance(original_message, context.get("symptom_tags", []))
        knowledge_line = knowledge_active_line(context.get("knowledge") or [])
        pending_prompts = context.get("pending_prompts") or knowledge_pending_prompts(
            context.get("pending_knowledge") or []
        )
        pieces: list[str] = []
        if knowledge_line:
            pieces.append(knowledge_line)
        if pending_prompts:
            forbidden = ["remember", "saving", "should i remember", "should i save", "dob", "gender", "due date"]
            for prompt in pending_prompts:
                cleaned = prompt.strip()
                lower = cleaned.lower()
                if not cleaned:
                    continue
                if any(word in lower for word in forbidden):
                    continue
                if "?" in cleaned:
                    continue
                ui_nudges.append(cleaned)
                if len(ui_nudges) >= 2:
                    break
        if context.get("catch_up_exit_note"):
            pieces.append(context["catch_up_exit_note"])
        pieces.append(summary)
        if context.get("timezone_prompt"):
            pieces.append(context["timezone_prompt"])
        if context.get("routine_accept_message"):
            pieces.append(context["routine_accept_message"])
        if context.get("routine_prompt"):
            pieces.append(context["routine_prompt"])
        if stage_line:
            pieces.append(stage_line)
        if guidance:
            pieces.append(guidance)
        if context.get("autocorrect_note"):
            pieces.append(context["autocorrect_note"])
        reply = " ".join(part for part in pieces if part).strip()
        has_actions = bool(actions)
        expected_intents = {
            "milestone_expectations",
            "activity_request",
            "health_sleep_question",
            "general_parenting_advice",
        }
        requires_content = has_actions or (intent in expected_intents)
        had_any_piece = any(bool(part) for part in pieces)
        if not reply:
            if requires_content and had_any_piece:
                return _format_compose_error("empty composed reply"), ui_nudges or []
            fallback_message = (
                "I’m not sure I caught that—tell me what happened and what you want "
                "(log it or get guidance), and I’ll take it from there."
            )
            return fallback_message, ui_nudges or []
        return reply, ui_nudges
    except Exception as exc:
        return _format_compose_error(str(exc)), ui_nudges or []


def summarize_actions(actions: List[Action], child_data: dict, context: Dict[str, Any]) -> str:
    child_name = child_data.get("first_name") or "your child"
    timezone_pref = child_data.get("timezone")
    if not actions:
        return ""
    parts = [describe_action(action, timezone_pref) for action in actions]
    if len(parts) == 1:
        summary = f"{child_name}'s {parts[0]}."
    else:
        summary = f"{child_name}'s {', '.join(parts)}."
    follow_up = build_follow_up(actions, child_name, context)
    if follow_up:
        summary = f"{summary} {follow_up}"
    return summary.strip()


def describe_action(action: Action, timezone_pref: Optional[str] = None) -> str:
    timestamp = format_time(action.timestamp, timezone_pref)
    meta = action.metadata
    if action.note:
        return action.note
    if action.action_type == CoreActionType.ACTIVITY and meta.amount_value:
        return f"Fed {meta.amount_value:g} {meta.amount_unit or ''} around {timestamp}".strip()
    if action.action_type in {
        CoreActionType.DIAPER_POOP,
        CoreActionType.DIAPER_PEE,
        CoreActionType.DIAPER_PEE_AND_POOP,
    }:
        return f"Dirty diaper at {timestamp}"
    if action.action_type == CoreActionType.SLEEP and meta.duration_minutes:
        minutes = int(round(meta.duration_minutes))
        if minutes % 60 == 0 and minutes:
            hours = minutes // 60
            label = f"{hours} hr" if hours == 1 else f"{hours} hrs"
        else:
            label = f"{minutes} min"
        return f"Sleep for {label} ending {timestamp}"
    label = action.action_type.value.replace("_", " ")
    return f"{label} at {timestamp}"


def build_follow_up(actions: List[Action], child_name: str, context: Dict[str, Any]) -> str:
    if context.get("symptom_tags"):
        return ""
    if context.get("feed_follow_up"):
        return context["feed_follow_up"]
    if context.get("night_events", 0) >= 3:
        return "Busy night! Hope you get a little rest today."
    if context.get("thin_context"):
        return f"If helpful, share small details (like what soothes {child_name} during changes) so I can tailor support."
    if context.get("in_catch_up_mode"):
        return "I’ll keep confirming as we go—feel free to send the next update."
    diaper_actions = [
        action
        for action in actions
        if action.action_type
        in {CoreActionType.DIAPER_PEE, CoreActionType.DIAPER_POOP, CoreActionType.DIAPER_PEE_AND_POOP}
    ]
    if diaper_actions:
        return f"Want me to track diaper streaks or anything else since we last chatted about {child_name}?"
    if any(action.action_type == CoreActionType.SLEEP for action in actions):
        return f"Want a nudge if wake windows drift or a nap comparison later today for {child_name}?"
    if any(action.action_type == CoreActionType.ACTIVITY for action in actions):
        return "I can keep routine notes whenever you want."
    return ""


def knowledge_active_line(knowledge: List[KnowledgeItem]) -> Optional[str]:
    if not knowledge:
        return None
    framework_names: list[str] = []
    feeding_structures: set[str] = set()
    for item in knowledge:
        if item.key == "care_framework":
            framework = item.payload.get("framework")
            if framework:
                framework_names.append(_format_framework_name(framework))
        elif item.key == "feeding_structure":
            structure = item.payload.get("structure")
            if structure:
                feeding_structures.add(structure)
    parts: list[str] = []
    if framework_names:
        parts.append(f"I’ll keep framing updates by {', '.join(framework_names)} guidance.")
    if "combo" in feeding_structures:
        parts.append("I know you’re combo feeding; I’ll keep that approach in mind.")
    return " ".join(parts) if parts else None




def format_time(dt, target_timezone: Optional[str] = None) -> str:
    try:
        display_dt = dt
        if target_timezone:
            try:
                tzinfo = ZoneInfo(target_timezone)
                display_dt = dt.astimezone(tzinfo)
            except Exception:
                pass
        base = display_dt.strftime("%I:%M %p").lstrip("0")
        tz = display_dt.tzname()
        if not tz:
            tz = display_dt.strftime("%z") or "UTC"
        return f"{base} {tz}"
    except Exception:
        return "that time"


def symptom_guidance(message: str, tags: List[str]) -> str:
    responses = []
    if "cough" in tags:
        responses.append(
            "Logged the coughing. If you notice trouble breathing, fast breathing, or symptoms lasting several days, reach out to your pediatrician."
        )
    if "fever" in tags:
        responses.append("For fevers above 100.4°F or lasting beyond a day, call your pediatrician.")
    if "vomit" in tags:
        responses.append("Offer smaller amounts more frequently and watch hydration; call your doctor if vomiting persists.")
    if "rash" in tags:
        responses.append("Rashes that spread, blister, or pair with fever deserve a pediatrician’s glance.")
    if "respiratory" in tags:
        responses.append("If noisy breathing comes with chest retractions, color changes, or longer pauses, reach out to your pediatrician or urgent care.")
    if not responses and "?" in message:
        responses.append(
            "If you share what feels most different or what you’re hoping for help with, I can turn it into clear next steps."
        )
    return " ".join(responses)


VALID_EVENT_SOURCES = {"chat", "chip", "manual", "import"}


def _timeline_type_for_action(action: Action) -> Optional[str]:
    if action.action_type == CoreActionType.SLEEP:
        return "sleep"
    if action.action_type in {
        CoreActionType.DIAPER_PEE,
        CoreActionType.DIAPER_POOP,
        CoreActionType.DIAPER_PEE_AND_POOP,
    }:
        return "diaper"
    if action.action_type == CoreActionType.GROWTH:
        return "growth"
    if action.action_type == CoreActionType.ACTIVITY:
        extra = action.metadata.extra or {}
        if action.metadata.amount_value is not None or extra.get("feed_method"):
            return "bottle"
        return "activity"
    if action.action_type in {CoreActionType.BATH, CoreActionType.MEDICATION}:
        return "activity"
    if action.action_type == CoreActionType.CUSTOM:
        return "activity"
    return None


def _timeline_title_for_action(action: Action) -> str:
    if action.custom_action_label:
        return action.custom_action_label
    mapping = {
        CoreActionType.SLEEP: "Sleep",
        CoreActionType.ACTIVITY: "Activity",
        CoreActionType.BATH: "Bath",
        CoreActionType.MEDICATION: "Medication",
        CoreActionType.GROWTH: "Growth",
        CoreActionType.DIAPER_PEE: "Dirty diaper (pee)",
        CoreActionType.DIAPER_POOP: "Dirty diaper (poop)",
        CoreActionType.DIAPER_PEE_AND_POOP: "Dirty diaper (pee + poop)",
    }
    return mapping.get(action.action_type, action.action_type.value.replace("_", " ").title())


def _timeline_detail_for_action(action: Action) -> Optional[str]:
    note = action.note
    meta = action.metadata
    diaper_types = {
        CoreActionType.DIAPER_PEE,
        CoreActionType.DIAPER_POOP,
        CoreActionType.DIAPER_PEE_AND_POOP,
    }
    if action.action_type in diaper_types:
        components: List[str] = []
        substance = meta.substance
        if substance:
            components.append(str(substance).title())
        if note:
            components.append(note)
        if components:
            return " – ".join(components)
    if note:
        return note
    for attr in ("outcome", "substance", "measurement_type"):
        value = getattr(meta, attr, None)
        if value:
            return str(value)
    return None


def _timeline_amount_label(action: Action) -> Optional[str]:
    meta = action.metadata
    if meta.amount_value is None:
        return None
    unit = meta.amount_unit or ""
    if unit:
        return f"{meta.amount_value:g} {unit}".strip()
    return f"{meta.amount_value:g}"

def _sleep_logged_as_wake(message: str) -> bool:
    lower = message.lower()
    wake_terms = ["woke", "woke up", "woken", "waking up", "woke at", "woke from"]
    return any(term in lower for term in wake_terms)


def record_timeline_events(
    actions: List[Action],
    *,
    child_id: int,
    source: str,
    origin_message_id: Optional[int],
    input_text: str,
    child_timezone: str,
) -> None:
    normalized_source = source if source in VALID_EVENT_SOURCES else "chat"
    try:
        tzinfo = ZoneInfo(child_timezone)
    except Exception:
        tzinfo = timezone.utc
    now_utc = datetime.now(timezone.utc)
    for action in actions:
        event_type = _timeline_type_for_action(action)
        if not event_type:
            continue
        base_ts = action.timestamp.replace(tzinfo=None)
        end_local: Optional[datetime] = None
        start_local = base_ts.replace(tzinfo=tzinfo)
        # If a sleep entry was logged as a wake-up with a duration, treat the provided
        # timestamp as the end and backfill the start for the timeline.
        if (
            action.action_type == CoreActionType.SLEEP
            and action.metadata.duration_minutes
            and _sleep_logged_as_wake(input_text)
        ):
            end_local = start_local
            start_local = start_local - timedelta(minutes=action.metadata.duration_minutes)
        start_dt = start_local.astimezone(timezone.utc)
        if start_dt > now_utc:
            start_dt = now_utc
        extra_meta = action.metadata.extra or {}
        if extra_meta.get("assumed_time") or extra_meta.get("assumed_timezone"):
            delta = abs((now_utc - start_dt).total_seconds())
            if delta > 24 * 3600:
                start_dt = now_utc
        end_ts: Optional[str] = None
        if action.action_type == CoreActionType.SLEEP and action.metadata.duration_minutes:
            if end_local is None:
                end_local = start_local + timedelta(minutes=action.metadata.duration_minutes)
            end_dt = end_local.astimezone(timezone.utc)
            end_ts = end_dt.isoformat()
        insert_timeline_event(
            child_id=child_id,
            event_type=event_type,
            title=_timeline_title_for_action(action),
            detail=_timeline_detail_for_action(action),
            amount_label=_timeline_amount_label(action),
            start=start_dt.isoformat(),
            end=end_ts,
            has_note=bool(action.note),
            is_custom=not action.is_core_action,
            source=normalized_source,
            origin_message_id=origin_message_id,
        )
        logger.info(
            "timeline event normalized",
            extra={
                "child_id": child_id,
                "action_type": action.action_type,
                "input_text": input_text,
                "parsed_local": start_local.isoformat(),
                "timezone": str(tzinfo),
                "stored_utc": start_dt.isoformat(),
            },
        )


def recent_action_models(limit: int) -> List[Action]:
    """Pull recent actions from storage to ground stage answers."""
    raw_actions = fetch_recent_actions(limit=limit)
    results: List[Action] = []
    for action_dict in raw_actions:
        try:
            results.append(Action.model_validate(action_dict))
        except ValidationError:
            continue
    return results


def estimate_wake_window_label(weeks: Optional[int]) -> str:
    if weeks is None:
        return "calm, repeatable wake windows"
    if weeks <= 4:
        return "45–60 minute wake windows"
    if weeks <= 8:
        return "60–90 minute wake windows"
    if weeks <= 12:
        return "75–120 minute wake windows"
    return "90–150 minute wake windows"


def estimate_feed_spacing_label(weeks: Optional[int]) -> str:
    if weeks is None or weeks <= 4:
        return "every ~2–3 hours"
    if weeks <= 8:
        return "about every 3 hours"
    if weeks <= 12:
        return "roughly every 3–4 hours"
    return "about every 4 hours"


def _latest_action_of_type(actions: List[Action], target_types: set[CoreActionType]) -> Optional[Action]:
    for action in actions:
        if action.action_type in target_types:
            return action
    return None


def build_four_f_lines(
    actions: List[Action],
    child_name: str,
    message: str,
    timezone_pref: Optional[str],
    weeks: Optional[int],
) -> str:
    last_feed = _latest_action_of_type(actions, {CoreActionType.ACTIVITY})
    last_sleep = _latest_action_of_type(actions, {CoreActionType.SLEEP})

    if last_feed:
        feed_amount = ""
        if last_feed.metadata.amount_value:
            feed_amount = f"{last_feed.metadata.amount_value:g} {last_feed.metadata.amount_unit or 'oz'} "
        feed_line = f"keep feeds like the {feed_amount or 'recent'}feed around {format_time(last_feed.timestamp, timezone_pref)} steady"
    else:
        feed_line = f"keep offering feeds {estimate_feed_spacing_label(weeks)}—it keeps {child_name} fueled even on louder nights"

    if last_sleep and last_sleep.metadata.duration_minutes:
        minutes = int(round(last_sleep.metadata.duration_minutes))
        if minutes % 60 == 0:
            hours = minutes // 60
            sleep_length = f"{hours} hr" if hours == 1 else f"{hours} hrs"
        else:
            sleep_length = f"{minutes} min"
        fatigue_line = f"protect a {sleep_length} stretch like the one that ended {format_time(last_sleep.timestamp, timezone_pref)} and reset if wake windows creep longer than {estimate_wake_window_label(weeks)}"
    else:
        fatigue_line = f"aim for {estimate_wake_window_label(weeks)} so bedtime doesn’t arrive overtired"

    lower = message.lower()
    if "breath" in lower or "cough" in lower:
        feelings_line = f"listen for when the sound happens—during calm feeds, drowsy transitions, or when {child_name} is upset—so we know if it’s effort or just noisy newborn breathing"
    else:
        feelings_line = f"note {child_name}'s cues (coos vs. fuss) during the day so I can see what soothes fastest"

    fever_line = "call your pediatrician if you ever see retractions, color changes, or fever above 100.4°F for this age"

    return (
        f"Food—{feed_line}. "
        f"Fatigue—{fatigue_line}. "
        f"Feelings—{feelings_line}. "
        f"Fever—{fever_line}."
    )


def stage_guidance(
    message: str,
    child_data: dict,
    context_actions: List[Action],
    question_category: str,
) -> str:
    lower = message.lower()
    requested_week = parse_week_from_message(lower)
    aggression_pattern = r"\b(hit(ting|s)?|smack(ed|ing|s)?|slap(ped|ping|s)?|swat(ted|ting|s)?|punch(ed|ing|es)?|kick(ed|ing|s)?)\b"
    if re.search(aggression_pattern, lower):
        return (
            "Hitting can be a common cause-and-effect test. "
            "1) Stay calm and block the swing so no one gets hurt. "
            "2) Label “gentle hands” and guide a soft touch so your child knows what to do instead. "
            "3) Redirect to a pillow, stuffed animal, or other safe target to get the energy out. "
            "4) Later, praise gentle touches and call out the behavior you want more of. "
            "Red flags—call your pediatrician if hits leave marks or bruises, happen very frequently and feel out of control, "
            "or come with loss of eye contact or other skills."
        )
    expectation_terms = [
        "week",
        "expect",
        "expected",
        "milestone",
        "development",
        "what's ahead",
        "ahead today",
        "normal",
        "typical",
        "should i worry",
        "is it ok",
        "is it okay",
    ]
    should_answer = any(term in lower for term in expectation_terms) or requested_week is not None
    if not should_answer and question_category not in {"sleep", "routine"}:
        return ""
    child_name = child_data.get("first_name") or "your child"
    weeks = requested_week or compute_child_weeks(child_data)
    if weeks is None:
        if question_category == "sleep":
            return (
                f"Here’s a quick sleep check-in for {child_name}: aim for calm wind-downs, predictable wake windows "
                "when you can, and a consistent wake-up anchor. Reach out to your pediatrician if you see breathing "
                "changes or very hard-to-soothe nights."
            )
        return (
            f"Here’s a quick checkpoint for {child_name}: steady feeds, several wet diapers, calm alert periods, "
            "and responsive soothing are good signs. If something feels off, it’s always okay to call your pediatrician."
        )
    tip = pick_stage_tip(weeks)
    if not tip:
        return ""
    timezone_pref = child_data.get("timezone")
    context_line = describe_recent_context(context_actions, timezone_pref)
    cdc_line = tip.get("cdc", "")
    aap_line = tip.get("aap", "")
    huck_line = tip.get("huckleberry", "")
    pieces = []
    if context_line:
        pieces.append(context_line)
    pieces.append(f"For around week {weeks}, {child_name} can aim for:")
    if cdc_line:
        pieces.append(f"• CDC milestones: {cdc_line}")
    if aap_line:
        pieces.append(f"• AAP/APA guidance: {aap_line}")
    if huck_line:
        pieces.append(f"• Huckleberry: {huck_line}")
    four_f_block = build_four_f_lines(context_actions, child_name, message, timezone_pref, weeks)
    if four_f_block:
        pieces.append(f"Emily Oster’s Four F lens: {four_f_block}")
    if nearing_stage_transition(weeks):
        pieces.append(
            f"{child_name} is approaching a new stage. Want me to adjust the routine with cues from Moms on Call, Happiest Baby, or APA guidance?"
        )
    else:
        pieces.append("Does anything feel off so far, or want me to compare to yesterday?")
    pieces.append("Sources: CDC, AAP/APA, Huckleberry, Emily Oster.")
    return " ".join(pieces).strip()


def parse_week_from_message(message: str) -> Optional[int]:
    match = re.search(r"week\s*(\d{1,2})", message)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return None
    return None


def describe_recent_context(actions: List[Action], timezone_pref: Optional[str]) -> str:
    if not actions:
        return ""
    snippets = [describe_action(action, timezone_pref) for action in actions[:2]]
    joined = "; ".join(snippets)
    return f"Based on your recent logs ({joined}),"


def compute_child_weeks(child_data: dict) -> Optional[int]:
    dob = child_data.get("birth_date") or child_data.get("due_date")
    if not dob:
        return None
    try:
        birth = datetime.fromisoformat(dob).date()
    except ValueError:
        return None
    today = datetime.now(timezone.utc).date()
    diff = (today - birth).days
    return max(1, diff // 7) if diff >= 0 else None


def pick_stage_tip(weeks: int) -> Optional[dict]:
    for start, end, tip in STAGE_TIPS:
        if start <= weeks <= end:
            return tip
    if weeks > STAGE_TIPS[-1][1]:
        return {
            "cdc": "expect bigger leaps in babbling, rolling, and tracking caregivers across the room.",
            "aap": "AAP suggests leaning into daily routines, floor play, and plenty of narrated caregiving moments.",
        }
    return None


def nearing_stage_transition(weeks: int) -> bool:
    return any(abs(weeks - boundary) <= 1 for boundary in [4, 8, 12])
