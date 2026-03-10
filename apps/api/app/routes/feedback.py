from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from ..supabase import AuthContext, get_auth_context, resolve_optional_uuid

router = APIRouter()
DEFAULT_MODEL_VERSION = "havi-local"


class MessageFeedbackPayload(BaseModel):
    conversation_id: str = Field(..., min_length=1)
    message_id: str = Field(..., min_length=1)
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    rating: Literal["up", "down"]
    feedback_text: Optional[str] = None
    model_version: Optional[str] = None
    response_metadata: Optional[Dict[str, Any]] = None


def _route_kind_from_assistant_intent(intent: Optional[str]) -> Optional[str]:
    normalized = (intent or "").strip().lower()
    if not normalized:
        return None
    if normalized == "logging":
        return "log"
    if normalized == "mixed":
        return "mixed"
    if normalized == "question":
        return "ask"
    return "unknown"


async def _enrich_feedback_metadata(
    *,
    auth: AuthContext,
    conversation_id: str,
    message_id: str,
    payload: MessageFeedbackPayload,
) -> Dict[str, Any]:
    metadata: Dict[str, Any] = dict(payload.response_metadata or {})
    metadata.setdefault("conversation_id", conversation_id)
    metadata.setdefault("assistant_message_id", message_id)
    metadata.setdefault("feedback_saved_at", datetime.now(tz=timezone.utc).isoformat())

    try:
        message_rows = await auth.supabase.select(
            "conversation_messages",
            params={
                "select": "id,session_id,intent,created_at",
                "id": f"eq.{message_id}",
                "limit": "1",
            },
        )
        if message_rows:
            message_row = message_rows[0]
            if message_row.get("intent"):
                assistant_intent = str(message_row.get("intent"))
                metadata.setdefault("assistant_intent", assistant_intent)
                derived_route_kind = _route_kind_from_assistant_intent(assistant_intent)
                if derived_route_kind:
                    metadata.setdefault("assistant_route_kind", derived_route_kind)
            if message_row.get("session_id"):
                metadata.setdefault("session_id", message_row.get("session_id"))
    except Exception:
        # Feedback should never fail solely because enrichment lookups fail.
        pass

    return metadata


async def _save_feedback(
    payload: MessageFeedbackPayload,
    auth: AuthContext,
) -> Dict[str, Any]:
    conversation_id = resolve_optional_uuid(payload.conversation_id, "conversation_id")
    message_id = resolve_optional_uuid(payload.message_id, "message_id")
    if not conversation_id or not message_id:
        raise HTTPException(status_code=400, detail="Invalid feedback identifiers")
    response_metadata = await _enrich_feedback_metadata(
        auth=auth,
        conversation_id=conversation_id,
        message_id=message_id,
        payload=payload,
    )
    model_version = (payload.model_version or "").strip() or DEFAULT_MODEL_VERSION
    response_metadata.setdefault("model_version", model_version)
    feedback_payload = {
        "conversation_id": conversation_id,
        "message_id": message_id,
        "user_id": auth.user_id,
        # Authenticated feedback should key on user identity only.
        # Keeping this null avoids cross-user conflicts on session-scoped unique indexes.
        "session_id": None,
        "rating": payload.rating,
        "feedback_text": payload.feedback_text,
        "model_version": model_version,
        "response_metadata": response_metadata,
    }

    saved_rows = await auth.supabase.upsert(
        "message_feedback",
        feedback_payload,
        on_conflict="conversation_id,message_id,user_id",
    )
    return saved_rows[0] if saved_rows else {
        "conversation_id": conversation_id,
        "message_id": message_id,
        "user_id": auth.user_id,
        "rating": payload.rating,
        "feedback_text": payload.feedback_text,
    }


@router.post("/api/v1/messages/feedback")
async def create_feedback(
    payload: MessageFeedbackPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> Dict[str, Any]:
    return await _save_feedback(payload, auth)


@router.put("/api/v1/messages/feedback")
async def update_feedback(
    payload: MessageFeedbackPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> Dict[str, Any]:
    return await _save_feedback(payload, auth)


@router.get("/api/v1/messages/feedback")
async def list_feedback(
    conversation_id: str = Query(..., min_length=1),
    message_ids: Optional[str] = Query(None, description="Comma-separated message ids"),
    auth: AuthContext = Depends(get_auth_context),
) -> List[Dict[str, Any]]:
    ids = [item.strip() for item in message_ids.split(",")] if message_ids else []
    ids = [item for item in ids if item]
    conversation_uuid = resolve_optional_uuid(conversation_id, "conversation_id")
    if not conversation_uuid:
        return []
    params = {
        "select": (
            "conversation_id,message_id,user_id,session_id,rating,feedback_text,model_version,response_metadata"
        ),
        "conversation_id": f"eq.{conversation_uuid}",
    }
    if ids:
        params["message_id"] = f"in.({','.join(ids)})"
    rows = await auth.supabase.select("message_feedback", params=params)
    return rows
