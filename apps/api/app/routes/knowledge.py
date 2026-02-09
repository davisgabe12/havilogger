from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from ..schemas import KnowledgeItem, KnowledgeItemStatus, KnowledgeItemType
from ..supabase import AuthContext, get_auth_context, resolve_child_id, resolve_optional_uuid

router = APIRouter()


class ConfirmPayload(BaseModel):
    importance: Optional[str] = None


class EditPayload(BaseModel):
    payload: Dict[str, Any] = Body(default_factory=dict)
    summary: Optional[str] = None


class ArchivePayload(BaseModel):
    reason: Optional[str] = None


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _summarize(payload: Dict[str, Any]) -> str:
    for key in ["summary", "note", "text", "description"]:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    parts: list[str] = []
    for key, value in payload.items():
        if isinstance(value, str) and value.strip():
            parts.append(f"{key.replace('_', ' ')}: {value.strip()}")
        elif isinstance(value, bool):
            parts.append(f"{key.replace('_', ' ')}: {'yes' if value else 'no'}")
    return " · ".join(parts) if parts else "New memory"


def _map_knowledge_row(row: Dict[str, Any]) -> Dict[str, Any]:
    payload = row.get("payload") or {}
    summary = _summarize(payload) if isinstance(payload, dict) else ""
    return {
        "id": row.get("id"),
        "family_id": row.get("family_id"),
        "user_id": row.get("user_id"),
        "subject_id": row.get("subject_id"),
        "key": row.get("key"),
        "type": row.get("type") or KnowledgeItemType.INFERRED,
        "status": row.get("status") or KnowledgeItemStatus.ACTIVE,
        "payload": payload,
        "confidence": row.get("confidence"),
        "qualifier": row.get("qualifier"),
        "age_range_weeks": row.get("age_range_weeks"),
        "activated_at": row.get("activated_at"),
        "expires_at": row.get("expires_at"),
        "created_at": row.get("created_at") or _now_iso(),
        "updated_at": row.get("updated_at") or _now_iso(),
        "summary": summary,
    }


@router.get("/api/v1/knowledge", response_model=list[KnowledgeItem])
async def list_knowledge(
    status: Optional[str] = Query(None),
    child_id: Optional[str] = Query(None),
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> list[KnowledgeItem]:
    resolved_child_id = resolve_child_id(child_id_header, child_id)
    if resolved_child_id:
        child_rows = await auth.supabase.select(
            "children",
            params={
                "select": "id",
                "id": f"eq.{resolved_child_id}",
                "family_id": f"eq.{auth.family_id}",
                "limit": "1",
            },
        )
        if not child_rows:
            raise HTTPException(status_code=404, detail="Child not found.")
    now_iso = _now_iso()
    params: Dict[str, Any] = {
        "select": (
            "id,family_id,user_id,subject_id,key,type,status,payload,confidence,qualifier,"
            "age_range_weeks,activated_at,expires_at,created_at,updated_at"
        ),
        "family_id": f"eq.{auth.family_id}",
        "order": "updated_at.desc",
        "or": f"(expires_at.is.null,expires_at.gt.{now_iso})",
    }
    if resolved_child_id:
        params["subject_id"] = f"eq.{resolved_child_id}"
    if status:
        params["status"] = f"eq.{status}"
    rows = await auth.supabase.select("knowledge_items", params=params)
    return [KnowledgeItem.model_validate(_map_knowledge_row(row)) for row in rows]


@router.get("/api/v1/knowledge/review")
async def review_knowledge(
    auth: AuthContext = Depends(get_auth_context),
    child_id: Optional[str] = Query(None),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> list[Dict[str, Any]]:
    resolved_child_id = resolve_child_id(child_id_header, child_id)
    if resolved_child_id:
        child_rows = await auth.supabase.select(
            "children",
            params={
                "select": "id",
                "id": f"eq.{resolved_child_id}",
                "family_id": f"eq.{auth.family_id}",
                "limit": "1",
            },
        )
        if not child_rows:
            raise HTTPException(status_code=404, detail="Child not found.")
    params: Dict[str, Any] = {
        "select": (
            "id,family_id,user_id,subject_id,key,type,status,payload,confidence,qualifier,"
            "age_range_weeks,activated_at,expires_at,created_at,updated_at"
        ),
        "family_id": f"eq.{auth.family_id}",
        "order": "updated_at.desc",
    }
    if resolved_child_id:
        params["subject_id"] = f"eq.{resolved_child_id}"
    rows = await auth.supabase.select("knowledge_items", params=params)
    return [_map_knowledge_row(row) for row in rows]


@router.post("/api/v1/knowledge/{item_id}/confirm")
async def confirm_knowledge(
    item_id: str,
    payload: ConfirmPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> Dict[str, Any]:
    item_uuid = resolve_optional_uuid(item_id, "item_id")
    if not item_uuid:
        raise HTTPException(status_code=400, detail="Invalid item_id")
    updated = await auth.supabase.update(
        "knowledge_items",
        {
            "status": KnowledgeItemStatus.ACTIVE.value,
            "updated_at": _now_iso(),
            "activated_at": _now_iso(),
        },
        params={"id": f"eq.{item_uuid}", "family_id": f"eq.{auth.family_id}"},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Knowledge item not found.")
    return _map_knowledge_row(updated[0])


@router.post("/api/v1/knowledge/{item_id}/reject")
async def reject_knowledge(
    item_id: str,
    auth: AuthContext = Depends(get_auth_context),
) -> Dict[str, Any]:
    item_uuid = resolve_optional_uuid(item_id, "item_id")
    if not item_uuid:
        raise HTTPException(status_code=400, detail="Invalid item_id")
    updated = await auth.supabase.update(
        "knowledge_items",
        {
            "status": KnowledgeItemStatus.REJECTED.value,
            "updated_at": _now_iso(),
        },
        params={"id": f"eq.{item_uuid}", "family_id": f"eq.{auth.family_id}"},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Knowledge item not found.")
    return _map_knowledge_row(updated[0])


@router.post("/api/v1/knowledge/{item_id}/archive")
async def archive_knowledge(
    item_id: str,
    payload: ArchivePayload,
    auth: AuthContext = Depends(get_auth_context),
) -> Dict[str, Any]:
    item_uuid = resolve_optional_uuid(item_id, "item_id")
    if not item_uuid:
        raise HTTPException(status_code=400, detail="Invalid item_id")
    updated = await auth.supabase.update(
        "knowledge_items",
        {
            "status": KnowledgeItemStatus.ARCHIVED.value,
            "updated_at": _now_iso(),
        },
        params={"id": f"eq.{item_uuid}", "family_id": f"eq.{auth.family_id}"},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Knowledge item not found.")
    return _map_knowledge_row(updated[0])


@router.post("/api/v1/knowledge/{item_id}/edit")
async def edit_knowledge(
    item_id: str,
    payload: EditPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> Dict[str, Any]:
    item_uuid = resolve_optional_uuid(item_id, "item_id")
    if not item_uuid:
        raise HTTPException(status_code=400, detail="Invalid item_id")
    updates: Dict[str, Any] = {"updated_at": _now_iso()}
    if isinstance(payload.payload, dict) and payload.payload:
        updates["payload"] = payload.payload
    updated = await auth.supabase.update(
        "knowledge_items",
        updates,
        params={"id": f"eq.{item_uuid}", "family_id": f"eq.{auth.family_id}"},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Knowledge item not found.")
    row = updated[0]
    mapped = _map_knowledge_row(row)
    if payload.summary:
        mapped["summary"] = payload.summary
    return mapped
