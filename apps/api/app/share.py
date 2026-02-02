from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .supabase import AuthContext, get_auth_context, get_public_client, resolve_optional_uuid

router = APIRouter()


class ShareConversationRequest(BaseModel):
    session_id: str = Field(..., alias="sessionId")

    model_config = ConfigDict(populate_by_name=True)

class ShareMemoryRequest(BaseModel):
    knowledge_item_id: str = Field(..., alias="knowledgeItemId")

    model_config = ConfigDict(populate_by_name=True)


@router.post("/conversation")
async def create_share(
    payload: ShareConversationRequest,
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    session_uuid = resolve_optional_uuid(payload.session_id, "session_id")
    if not session_uuid:
        raise HTTPException(status_code=400, detail="Invalid session_id")
    session_rows = await auth.supabase.select(
        "conversation_sessions",
        params={
            "select": "id,title,family_id",
            "id": f"eq.{session_uuid}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    if not session_rows:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    token = uuid4().hex
    await auth.supabase.insert(
        "share_links",
        {
            "token": token,
            "session_id": session_uuid,
            "family_id": auth.family_id,
            "created_by_user_id": auth.user_id,
            "share_type": "conversation",
        },
    )
    return {"token": token, "expires_at": None}


@router.post("/memory")
async def create_memory_share(
    payload: ShareMemoryRequest,
    auth: AuthContext = Depends(get_auth_context),
) -> dict:
    memory_uuid = resolve_optional_uuid(payload.knowledge_item_id, "knowledge_item_id")
    if not memory_uuid:
        raise HTTPException(status_code=400, detail="Invalid knowledge_item_id")
    rows = await auth.supabase.select(
        "knowledge_items",
        params={
            "select": "id",
            "id": f"eq.{memory_uuid}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Memory not found.")
    token = uuid4().hex
    await auth.supabase.insert(
        "share_links",
        {
            "token": token,
            "knowledge_item_id": memory_uuid,
            "family_id": auth.family_id,
            "created_by_user_id": auth.user_id,
            "share_type": "memory",
        },
    )
    return {"token": token, "expires_at": None}


@router.get("/{token}")
async def fetch_share(token: str) -> dict:
    public = get_public_client()
    try:
        result = await public.rpc("public_share_by_token", {"p_token": token})
    except HTTPException as exc:
        if exc.status_code >= 400:
            raise HTTPException(status_code=404, detail="Share link not found.") from exc
        raise
    if not result:
        raise HTTPException(status_code=404, detail="Share link not found.")
    return result
