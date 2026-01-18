from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from ..db import list_message_feedback, upsert_message_feedback

router = APIRouter()


class MessageFeedbackPayload(BaseModel):
    conversation_id: str = Field(..., min_length=1)
    message_id: str = Field(..., min_length=1)
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    rating: Literal["up", "down"]
    feedback_text: Optional[str] = None
    model_version: Optional[str] = None
    response_metadata: Optional[Dict[str, Any]] = None


def _save_feedback(payload: MessageFeedbackPayload) -> Dict[str, Any]:
    return upsert_message_feedback(
        conversation_id=payload.conversation_id,
        message_id=payload.message_id,
        rating=payload.rating,
        user_id=payload.user_id,
        session_id=payload.session_id,
        feedback_text=payload.feedback_text,
        model_version=payload.model_version,
        response_metadata=payload.response_metadata,
    )


@router.post("/api/v1/messages/feedback")
def create_feedback(payload: MessageFeedbackPayload) -> Dict[str, Any]:
    return _save_feedback(payload)


@router.put("/api/v1/messages/feedback")
def update_feedback(payload: MessageFeedbackPayload) -> Dict[str, Any]:
    return _save_feedback(payload)


@router.get("/api/v1/messages/feedback")
def list_feedback(
    conversation_id: str = Query(..., min_length=1),
    message_ids: Optional[str] = Query(None, description="Comma-separated message ids"),
) -> List[Dict[str, Any]]:
    ids = [item.strip() for item in message_ids.split(",")] if message_ids else []
    ids = [item for item in ids if item]
    return list_message_feedback(conversation_id, ids or None)
