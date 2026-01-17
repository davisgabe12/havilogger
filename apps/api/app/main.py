from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Any, Callable, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from .config import CONFIG
from .conversations import (
    ConversationIntent,
    ConversationMessage,
    ConversationSession,
    CreateMessagePayload,
    append_message,
    catch_up_mode_should_end,
    create_session,
    count_messages,
    ensure_unique_title,
    generate_conversation_title,
    get_last_assistant_message,
    get_session,
    list_messages,
    list_sessions,
    set_catch_up_mode,
    touch_catch_up_mode,
    update_session_title,
)
from .context_builders import build_child_context
from .db import (
    create_task,
    fetch_primary_profiles,
    fetch_recent_actions,
    get_routine_metrics,
    initialize_db,
    insert_timeline_event,
    list_knowledge_items,
    persist_log,
    set_explicit_knowledge,
    update_child_profile,
    update_user_profile,
    upsert_routine_metrics,
    mark_knowledge_prompted,
)
from .insight_engine import compare_metrics, expected_ranges
from .metrics import record_loading_metric
from .inferences import (
    CreateInferencePayload,
    Inference,
    InferenceStatus,
    create_inference,
    detect_knowledge_inferences,
    list_inferences,
    mark_inferences_prompted,
    update_inference_status,
    update_inferences_status,
)
from .openai_client import generate_actions
from .knowledge_guidance import (
    apply_activity_suggestions,
    apply_milestone_context,
    apply_temperament_adjustments,
)
from .knowledge_utils import knowledge_pending_prompts, filter_pending_for_prompt
from .router import classify_intent
from .routes import events as events_routes
from .routes import knowledge as knowledge_routes
from .routes import tasks as task_routes
from . import share as share_routes
from .schemas import (
    Action,
    ChatRequest,
    ChatResponse,
    CoreActionType,
    KnowledgeItem,
    KnowledgeItemStatus,
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
    child_id: Optional[int],
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
    id: Optional[int] = None
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


class SettingsPayload(BaseModel):
    caregiver: CaregiverProfile
    child: ChildProfile


class SettingsResponse(BaseModel):
    caregiver: CaregiverProfile
    child: ChildProfile


class RenameConversationPayload(BaseModel):
    title: str


class CreateConversationMessagePayload(BaseModel):
    role: str
    content: str
    user_id: Optional[int] = None
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

initialize_db()

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
app.include_router(knowledge_routes.router)
app.include_router(task_routes.router)
app.include_router(share_routes.router, prefix="/api/v1/share", tags=["share"])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/api/v1/activities", response_model=ChatResponse)
async def capture_activity(payload: ChatRequest) -> ChatResponse:
    start = time.perf_counter()
    if payload.child_id is None:
        raise HTTPException(status_code=400, detail="child_id is required for activities.")
    if payload.conversation_id is None:
        raise HTTPException(status_code=400, detail="conversation_id is required for activities.")
    logger.info(
        "child-scoped request",
        extra={"method": "POST", "path": "/api/v1/activities", "child_id": payload.child_id},
    )
    caregiver_data, child_data = fetch_primary_profiles()
    profile_id = caregiver_data.get("id")
    active_knowledge: List[KnowledgeItem] = []
    pending_knowledge: List[KnowledgeItem] = []
    if profile_id is not None:
        active_knowledge = list_knowledge_items(profile_id, status=KnowledgeItemStatus.ACTIVE)
        pending_knowledge = list_knowledge_items(profile_id, status=KnowledgeItemStatus.PENDING)
    child_id = payload.child_id
    child_context = build_child_context(profile_id, child_id)
    resolved_timezone, timezone_prompt = resolve_timezone(payload.timezone, child_data)
    child_data["timezone"] = resolved_timezone
    normalized_message, typo_corrections = normalize_parental_typos(payload.message)
    intent_result = classify_intent(normalized_message)
    symptom_tags = message_symptom_tags(normalized_message)
    question_category = classify_question_category(normalized_message, symptom_tags)
    try:
        session = get_session(payload.conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    prefixed_notes: List[str] = []
    analysis_message = normalized_message
    last_assistant_message = get_last_assistant_message(session.id)
    existing_message_count = count_messages(session.id)
    save_target = detect_memory_save_target(analysis_message)
    if save_target:
        memory_response = handle_memory_command(
            target=save_target,
            profile_id=profile_id,
            session=session,
            payload=payload,
            pending_knowledge=pending_knowledge,
            question_category=question_category,
            start=start,
            last_assistant_message=last_assistant_message,
        )
        if memory_response:
            session = maybe_autotitle_session(
                session,
                child_id=child_id,
                child_name=child_data.get("first_name"),
                message=payload.message,
                existing_message_count=existing_message_count,
            )
            return memory_response
    routine_acceptance = detect_routine_acceptance(analysis_message)
    routine_accept_message: Optional[str] = None
    if routine_acceptance:
        upsert_routine_metrics(child_id=child_id, accepted_delta=1)
        routine_accept_message = (
            "Happy to do it—I’ll synthesize a routine using Moms on Call, Happiest Baby, and APA guidance."
        )

    if catch_up_mode_should_end(session):
        set_catch_up_mode(session.id, False)
        session = get_session(session.id)
        prefixed_notes.append("All set—we’re out of catch-up mode.")

    if detect_catch_up_entry(analysis_message):
        set_catch_up_mode(session.id, True)
        session = get_session(session.id)
        assistant_message = build_catch_up_entry_message(describe_last_event(resolved_timezone))
        user_message_obj = append_message(
            CreateMessagePayload(
                session_id=session.id,
                role="user",
                content=payload.message,
                intent="log",
            )
        )
        session = maybe_autotitle_session(
            session,
            child_id=child_id,
            child_name=child_data.get("first_name"),
            message=payload.message,
            existing_message_count=existing_message_count,
        )
        assistant_message_obj = append_message(
            CreateMessagePayload(
                session_id=session.id,
                role="assistant",
                content=assistant_message,
                intent="log",
            )
        )
        latency_ms = int((time.perf_counter() - start) * 1000)
        return ChatResponse(
            actions=[],
            raw_message=payload.message,
            model=CONFIG.openai_model,
            latency_ms=latency_ms,
            assistant_message=assistant_message,
            question_category=question_category,
            conversation_id=session.id,
            user_message_id=user_message_obj.id,
            assistant_message_id=assistant_message_obj.id,
            intent=intent_result.intent,
        )

    exit_phrase = session.catch_up_mode and detect_catch_up_exit(analysis_message)
    unrelated_exit = session.catch_up_mode and is_unrelated_question(analysis_message)
    if exit_phrase and not message_describes_event(analysis_message):
        set_catch_up_mode(session.id, False)
        session = get_session(session.id)
        assistant_message = "All set—we’re out of catch-up mode."
        user_message_obj = append_message(
            CreateMessagePayload(
                session_id=session.id,
                role="user",
                content=payload.message,
                intent="log",
            )
        )
        session = maybe_autotitle_session(
            session,
            child_id=child_id,
            child_name=child_data.get("first_name"),
            message=payload.message,
            existing_message_count=existing_message_count,
        )
        assistant_message_obj = append_message(
            CreateMessagePayload(
                session_id=session.id,
                role="assistant",
                content=assistant_message,
                intent="log",
            )
        )
        latency_ms = int((time.perf_counter() - start) * 1000)
        return ChatResponse(
            actions=[],
            raw_message=payload.message,
            model=CONFIG.openai_model,
            latency_ms=latency_ms,
            assistant_message=assistant_message,
            question_category=question_category,
            conversation_id=session.id,
            user_message_id=user_message_obj.id,
            assistant_message_id=assistant_message_obj.id,
            intent=intent_result.intent,
        )

    if unrelated_exit:
        set_catch_up_mode(session.id, False)
        session = get_session(session.id)
        prefixed_notes.append("All set—we’re out of catch-up mode.")

    if intent_result.intent == "task_request":
        task_title = extract_task_title(payload.message)
        due_at = extract_task_due_at(payload.message, resolved_timezone)
        owner_id = profile_id if profile_id is not None else 1
        created_task = create_task(
            title=task_title,
            user_id=owner_id,
            child_id=child_id,
            due_at=due_at,
        )
        user_message_obj = append_message(
            CreateMessagePayload(
                session_id=session.id,
                role="user",
                content=payload.message,
                intent="task_request",
            )
        )
        session = maybe_autotitle_session(
            session,
            child_id=child_id,
            child_name=child_data.get("first_name"),
            message=payload.message,
            existing_message_count=existing_message_count,
        )
        assistant_message = f"Task added: {created_task.title}."
        assistant_message_obj = append_message(
            CreateMessagePayload(
                session_id=session.id,
                role="assistant",
                content=assistant_message,
                intent="task_request",
            )
        )
        latency_ms = int((time.perf_counter() - start) * 1000)
        return ChatResponse(
            actions=[],
            raw_message=payload.message,
            model=CONFIG.openai_model,
            latency_ms=latency_ms,
            assistant_message=assistant_message,
            question_category=question_category,
            intent=intent_result.intent,
            conversation_id=session.id,
            user_message_id=user_message_obj.id,
            assistant_message_id=assistant_message_obj.id,
        )

    try:
        actions: List[Action] = await asyncio.to_thread(
            generate_actions, analysis_message, knowledge_context=child_context
        )
    except RuntimeError as exc:  # Raised when OpenAI client fails
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    normalize_action_timestamps(actions, resolved_timezone, payload.message)

    apply_blowout_classification(actions, analysis_message)

    recent_actions_for_context = recent_action_models(24)
    feed_pattern = determine_feed_pattern(recent_actions_for_context)
    inferred_feed_method = infer_feed_method_from_message(analysis_message)
    annotate_feed_method(actions, inferred_feed_method)
    routine_ready = evaluate_routine_similarity(recent_actions_for_context, resolved_timezone)
    if bool(child_data.get("routine_eligible")) != routine_ready:
        update_child_profile({"routine_eligible": routine_ready})
        child_data["routine_eligible"] = routine_ready
    routine_prompt_text = maybe_offer_routine_prompt(
        child_id=child_id,
        routine_ready=routine_ready,
        symptom_tags=symptom_tags,
        catch_up_mode=session.catch_up_mode,
        recent_message=analysis_message,
        actions_logged_count=len(actions),
    )

    persist_log(
        input_text=payload.message,
        actions={"actions": [action.model_dump(mode="json") for action in actions]},
    )

    user_message = append_message(
        CreateMessagePayload(
            session_id=session.id,
            role="user",
            content=payload.message,
            intent="log",
        )
    )
    session = maybe_autotitle_session(
        session,
        child_id=child_id,
        child_name=child_data.get("first_name"),
        message=payload.message,
        existing_message_count=existing_message_count,
    )

    message_source = (payload.source or "chat").lower()
    record_timeline_events(
        actions,
        child_id=child_id,
        source=message_source,
        origin_message_id=user_message.id,
        input_text=payload.message,
        child_timezone=resolved_timezone or "America/Los_Angeles",
    )

    if session.catch_up_mode:
        touch_catch_up_mode(session.id)

    thin_context = len(recent_actions_for_context) == 0
    night_events = count_recent_night_events(recent_actions_for_context, resolved_timezone)
    message_feed = message_mentions_feed(analysis_message)
    needs_feed_follow_up = False
    feed_follow_up_text: Optional[str] = None
    if message_feed:
        if inferred_feed_method and feed_pattern and inferred_feed_method != feed_pattern:
            needs_feed_follow_up = True
        elif not inferred_feed_method and not feed_pattern:
            needs_feed_follow_up = True
        elif not inferred_feed_method and feed_pattern:
            annotate_feed_method(actions, feed_pattern)
    if needs_feed_follow_up:
        feed_follow_up_text = "Logged it. Was this breast, bottle, or combo? I can track patterns more accurately once I know."

    autocorrect_note = None
    if typo_corrections:
        swaps = ", ".join(f"“{orig}”→“{replacement}”" for orig, replacement in typo_corrections)
        autocorrect_note = f"I assumed {swaps}. If that's off, let me know and I’ll fix it."

    knowledge_inferences = detect_knowledge_inferences(
        message=analysis_message,
        actions=actions,
        child_id=child_id,
        user_id=None,
        profile_id=caregiver_data.get("id"),
    )
    if knowledge_inferences:
        logger.info(
            "created knowledge inferences",
            extra={"count": len(knowledge_inferences)},
        )
    if profile_id is not None:
        pending_knowledge = list_knowledge_items(profile_id, status=KnowledgeItemStatus.PENDING)
    pending_inference_lookup = {}
    pending_inferences = list_inferences(child_id=child_id, status=InferenceStatus.PENDING.value)
    related_keys = {inf.dedupe_key for inf in knowledge_inferences if inf.dedupe_key}
    intent_tag = intent_result.intent
    intent_relevant_for_prompts = intent_tag in {"saving", "logging"} or intent_result.confidence >= 0.7
    for inf in pending_inferences:
        if inf.dedupe_key:
            pending_inference_lookup[inf.dedupe_key] = {
                "confidence": inf.confidence,
                "status": inf.status,
                "last_prompted_at": inf.last_prompted_at,
                "related_to_message": intent_relevant_for_prompts and inf.dedupe_key in related_keys,
            }
    pending_prompt_items = filter_pending_for_prompt(
        pending_knowledge,
        session_id=session.id,
        inference_lookup=pending_inference_lookup,
        max_prompts=1,
    )
    pending_prompt_texts = knowledge_pending_prompts(pending_prompt_items)
    if pending_prompt_texts:
        mark_knowledge_prompted([item.id for item in pending_prompt_items], session_id=session.id)
        dedupe_keys = [
            (item.payload or {}).get("_dedupe_key") for item in pending_prompt_items if item.payload
        ]
        mark_inferences_prompted([key for key in dedupe_keys if key])

    question_only = not actions and ("?" in analysis_message or question_category in {"sleep", "routine", "health"})

    assistant_message, ui_nudges = build_assistant_message(
        actions,
        analysis_message,
        child_data=child_data,
        context={
            "timezone_prompt": timezone_prompt,
            "symptom_tags": symptom_tags,
            "question_category": question_category,
            "feed_follow_up": feed_follow_up_text,
            "thin_context": thin_context,
            "night_events": night_events,
            "catch_up_exit_note": " ".join(prefixed_notes) if prefixed_notes else None,
            "in_catch_up_mode": session.catch_up_mode,
            "recent_actions": recent_actions_for_context,
            "routine_prompt": routine_prompt_text,
            "routine_accept_message": routine_accept_message,
            "autocorrect_note": autocorrect_note,
            "question_only": question_only,
            "knowledge": active_knowledge,
            "pending_knowledge": pending_knowledge,
            "pending_prompts": pending_prompt_texts,
            "intent": intent_result.intent,
        },
    )

    guidance_context = {
        **child_context,
        "latest_message_lower": analysis_message.lower(),
        "question_category": question_category,
    }
    # For logging, keep the message minimal and skip post-processing that can add knowledge prompts.
    if intent_result.intent != "logging":
        try:
            assistant_message = apply_temperament_adjustments(assistant_message, guidance_context)
            assistant_message = apply_activity_suggestions(assistant_message, guidance_context)
            assistant_message = apply_milestone_context(assistant_message, guidance_context)
        except Exception as exc:
            logger.exception("Error in guidance post-processing", exc_info=exc)
            assistant_message = _format_compose_error(str(exc))

    assistant_message_obj = append_message(
        CreateMessagePayload(
            session_id=session.id,
            role="assistant",
            content=assistant_message,
            intent="log",
        )
    )

    maybe_record_sibling_inference(payload.message)

    latency_ms = int((time.perf_counter() - start) * 1000)
    return ChatResponse(
        actions=actions,
        raw_message=payload.message,
        model=CONFIG.openai_model,
        latency_ms=latency_ms,
        assistant_message=assistant_message,
        question_category=question_category,
        intent=intent_result.intent,
        conversation_id=session.id,
        user_message_id=user_message.id,
        assistant_message_id=assistant_message_obj.id,
        ui_nudges=ui_nudges or None,
    )


@app.get("/")
async def root() -> dict:
    return {"message": "HaviLogger API ready"}


@app.post("/api/v1/inferences", response_model=Inference)
async def record_inference(payload: CreateInferencePayload) -> Inference:
    if payload.child_id is None:
        raise HTTPException(status_code=400, detail="child_id is required for inferences.")
    logger.info(
        "child-scoped request",
        extra={"method": "POST", "path": "/api/v1/inferences", "child_id": payload.child_id},
    )
    return create_inference(payload)


@app.get("/api/v1/inferences", response_model=List[Inference])
async def fetch_inferences(child_id: Optional[int] = None, status: Optional[str] = None) -> List[Inference]:
    if child_id is None:
        raise HTTPException(status_code=400, detail="child_id is required for inferences.")
    logger.info(
        "child-scoped request",
        extra={"method": "GET", "path": "/api/v1/inferences", "child_id": child_id},
    )
    return list_inferences(child_id=child_id, status=status)


@app.post("/api/v1/inferences/{inference_id}/status", response_model=Inference)
async def change_inference_status(inference_id: int, status: InferenceStatus) -> Inference:
    return update_inference_status(inference_id, status=status)


@app.post("/api/v1/conversations", response_model=ConversationSession)
async def create_conversation(user_id: Optional[int] = None, child_id: Optional[int] = None) -> ConversationSession:
    if child_id is None:
        raise HTTPException(status_code=400, detail="child_id is required for conversations.")
    logger.info(
        "child-scoped request",
        extra={"method": "POST", "path": "/api/v1/conversations", "child_id": child_id},
    )
    return create_session(user_id=user_id, child_id=child_id)


@app.get("/api/v1/conversations", response_model=List[ConversationSession])
async def fetch_conversations(user_id: Optional[int] = None, child_id: Optional[int] = None) -> List[ConversationSession]:
    if child_id is None:
        raise HTTPException(status_code=400, detail="child_id is required for conversations.")
    logger.info(
        "child-scoped request",
        extra={"method": "GET", "path": "/api/v1/conversations", "child_id": child_id},
    )
    return list_sessions(user_id=user_id, child_id=child_id)


@app.get("/api/v1/conversations/{session_id}", response_model=ConversationSession)
async def fetch_conversation(session_id: int) -> ConversationSession:
    return get_session(session_id)


@app.patch("/api/v1/conversations/{session_id}", response_model=ConversationSession)
async def rename_conversation(session_id: int, payload: RenameConversationPayload) -> ConversationSession:
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title cannot be empty")
    return update_session_title(session_id, title)


@app.post("/api/v1/conversations/{session_id}/messages", response_model=ConversationMessage)
async def post_message(session_id: int, payload: CreateConversationMessagePayload) -> ConversationMessage:
    return append_message(
        CreateMessagePayload(
            session_id=session_id,
            role=payload.role,
            content=payload.content,
            user_id=payload.user_id,
            intent=payload.intent,
        )
    )


@app.get("/api/v1/conversations/{session_id}/messages", response_model=List[ConversationMessage])
async def fetch_messages(session_id: int) -> List[ConversationMessage]:
    return list_messages(session_id)


@app.post("/api/v1/metrics/loading")
async def ingest_loading_metrics(payload: LoadingMetricsPayload) -> dict:
    record_loading_metric(
        session_id=payload.session_id,
        message_id=payload.message_id,
        thinking_short_ms=payload.thinking_short_ms,
        thinking_rich_ms=payload.thinking_rich_ms,
        error_type=payload.error_type,
        retry_count=payload.retry_count,
    )
    return {"status": "ok"}


@app.get("/api/v1/settings", response_model=SettingsResponse)
async def get_settings() -> SettingsResponse:
    caregiver_data, child_data = fetch_primary_profiles()
    return _build_settings_response(caregiver_data, child_data)


@app.put("/api/v1/settings", response_model=SettingsResponse)
async def update_settings(payload: SettingsPayload) -> SettingsResponse:
    update_user_profile(payload.caregiver.model_dump())
    update_child_profile(payload.child.model_dump())
    caregiver_data, child_data = fetch_primary_profiles()
    profile_id = caregiver_data.get("id")
    child_id = child_data.get("id")
    _sync_child_knowledge(profile_id, child_id, payload.child)
    return _build_settings_response(caregiver_data, child_data)


@app.get("/api/v1/insights/compare")
async def compare_insight(child_id: int, days: int = 1, baseline_days: int = 1) -> dict:
    logger.info(
        "child-scoped request",
        extra={"method": "GET", "path": "/api/v1/insights/compare", "child_id": child_id},
    )
    return compare_metrics(child_id, days=days, baseline_days=baseline_days)


@app.get("/api/v1/insights/expected")
async def expected_insight(child_id: int, stage: str) -> dict:
    logger.info(
        "child-scoped request",
        extra={"method": "GET", "path": "/api/v1/insights/expected", "child_id": child_id},
    )
    # For now, expected ranges just use stage presets without live observations.
    return expected_ranges(stage)


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


def extract_task_due_at(message: str, timezone_value: Optional[str]) -> Optional[str]:
    """Best-effort parse of a due date/time from a task message.

    This is intentionally narrow: it looks for patterns like "6pm on 1/2/25"
    and interprets them in the caregiver's local timezone before storing an
    ISO timestamp in UTC (matching how the UI writes due_at).
    """
    if not message:
        return None

    date_match = _TASK_DATE_PATTERN.search(message)
    if not date_match:
        return None
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


def detect_memory_save_target(message: str) -> Optional[str]:
    lower = message.lower()
    if any(phrase in lower for phrase in SAVE_THAT_PHRASES):
        return "assistant"
    if any(phrase in lower for phrase in SAVE_THIS_PHRASES + SAVE_GENERIC_PHRASES):
        return "user"
    return None


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
        ("date of birth", child_data.get("birth_date")),
        ("gender", child_data.get("gender")),
        ("birth weight", child_data.get("birth_weight")),
        ("latest weight", child_data.get("latest_weight")),
        ("latest weight date", child_data.get("latest_weight_date")),
        ("due date", child_data.get("due_date")),
    ]
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


def _build_settings_response(caregiver_data: dict, child_data: dict) -> SettingsResponse:
    caregiver = CaregiverProfile(
        first_name=(caregiver_data.get("first_name") or ""),
        last_name=(caregiver_data.get("last_name") or ""),
        email=(caregiver_data.get("email") or ""),
        phone=(caregiver_data.get("phone") or ""),
        relationship=(caregiver_data.get("relationship") or ""),
    )
    child = ChildProfile(
        id=child_data.get("id"),
        first_name=(child_data.get("first_name") or ""),
        last_name=(child_data.get("last_name") or ""),
        birth_date=(child_data.get("birth_date") or ""),
        due_date=(child_data.get("due_date") or ""),
    )
    return SettingsResponse(caregiver=caregiver, child=child)


def _sync_child_knowledge(
    profile_id: Optional[int],
    child_id: Optional[int],
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


def _reject_related_inferences(child_id: Optional[int], knowledge_key: str) -> None:
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
        if action.metadata.amount_value:
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
