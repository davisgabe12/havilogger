from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .conversations import get_session
from .db import create_share_link, get_share_link, list_conversation_messages, session_has_messages

router = APIRouter()


class ShareConversationRequest(BaseModel):
    session_id: int = Field(..., alias="sessionId")

    model_config = ConfigDict(populate_by_name=True)


@router.post("/conversation")
def create_share(payload: ShareConversationRequest) -> dict:
    if not session_has_messages(payload.session_id):
        raise HTTPException(status_code=404, detail="Session not found or has no messages.")

    try:
        get_session(payload.session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Session not found or has no messages.")

    expires_at = (datetime.utcnow() + timedelta(days=7)).isoformat()
    token = uuid4().hex
    create_share_link(token, payload.session_id, expires_at=expires_at)
    return {"token": token, "expires_at": expires_at}


@router.get("/{token}")
def fetch_share(token: str) -> dict:
    link = get_share_link(token)
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")

    expires_at = link.get("expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) < datetime.utcnow():
                raise HTTPException(status_code=404, detail="Share link has expired")
        except ValueError:
            # If expiry is malformed, treat as non-expiring for now.
            expires_at = None

    session_id = link["session_id"]
    try:
        session = get_session(session_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Share link not found")

    messages = list_conversation_messages(session_id)
    sanitized_messages = [
        {
            "id": msg["id"],
            "role": msg["role"],
            "text": msg["content"],
            "created_at": msg["created_at"],
        }
        for msg in messages
    ]

    return {
        "token": token,
        "session_id": session_id,
        "title": session.title,
        "messages": sanitized_messages,
        "expires_at": expires_at,
    }
