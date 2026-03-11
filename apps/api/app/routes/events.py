from datetime import datetime
from typing import List, Optional

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from ..supabase import AuthContext, get_admin_client, get_auth_context, resolve_child_id

router = APIRouter(prefix="/api/v1")
legacy_router = APIRouter()
logger = logging.getLogger(__name__)


class EventOut(BaseModel):
    id: str
    child_id: str
    type: str
    title: str
    detail: Optional[str] = None
    amount_label: Optional[str] = None
    start: datetime
    end: Optional[datetime] = None
    has_note: bool = False
    is_custom: bool = False
    source: Optional[str] = None
    origin_message_id: Optional[str] = None
    recorded_by_user_id: Optional[str] = None
    recorded_by_first_name: Optional[str] = None
    recorded_by_last_name: Optional[str] = None


@router.get("/events", response_model=List[EventOut])
async def list_events(
    child_id: Optional[str] = Query(None, description="Child identifier"),
    start: datetime = Query(..., description="Start of range"),
    end: datetime = Query(..., description="End of range"),
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> List[EventOut]:
    """Return logged timeline events for the selected child within a date window."""

    resolved_child_id = resolve_child_id(child_id_header, child_id, required=True)
    if resolved_child_id is None:
        raise HTTPException(
            status_code=400,
            detail="child_id is required for timeline events.",
        )

    logger.info(
        "child-scoped request",
        extra={"method": "GET", "path": "/events", "child_id": resolved_child_id},
    )
    params = {
        "select": (
            "id,child_id,type,title,detail,amount_label,start,end,has_note,"
            "is_custom,source,origin_message_id,recorded_by_user_id"
        ),
        "family_id": f"eq.{auth.family_id}",
        "child_id": f"eq.{resolved_child_id}",
        "order": "start.desc",
        "and": f"(start.gte.{start.isoformat()},start.lt.{end.isoformat()})",
    }
    try:
        rows = await auth.supabase.select("timeline_events", params=params)
    except HTTPException as exc:
        detail = str(exc.detail or "").lower()
        missing_recorder = "recorded_by_user_id" in detail and "does not exist" in detail
        if not missing_recorder:
            raise
        legacy_params = dict(params)
        legacy_params["select"] = (
            "id,child_id,type,title,detail,amount_label,start,end,has_note,"
            "is_custom,source,origin_message_id"
        )
        rows = await auth.supabase.select("timeline_events", params=legacy_params)
        for row in rows:
            row["recorded_by_user_id"] = None

    origin_message_ids = sorted(
        {
            str(row.get("origin_message_id"))
            for row in rows
            if row.get("origin_message_id") and not row.get("recorded_by_user_id")
        }
    )
    if origin_message_ids:
        try:
            message_rows = await auth.supabase.select(
                "conversation_messages",
                params={
                    "select": "id,user_id",
                    "id": f"in.({','.join(origin_message_ids)})",
                },
            )
        except HTTPException:
            message_rows = []
        by_message_id = {
            str(row.get("id")): str(row.get("user_id"))
            for row in message_rows
            if row.get("id") and row.get("user_id")
        }
        for row in rows:
            if row.get("recorded_by_user_id"):
                continue
            origin_message_id = str(row.get("origin_message_id") or "")
            inferred_recorder = by_message_id.get(origin_message_id)
            if inferred_recorder:
                row["recorded_by_user_id"] = inferred_recorder

    recorder_ids = sorted(
        {str(row.get("recorded_by_user_id")) for row in rows if row.get("recorded_by_user_id")}
    )
    recorder_map = {}
    if recorder_ids:
        member_lookup = auth.supabase
        try:
            member_lookup = get_admin_client()
        except RuntimeError:
            member_lookup = auth.supabase
        member_rows = await member_lookup.select(
            "family_members",
            params={
                "select": "user_id,first_name,last_name",
                "family_id": f"eq.{auth.family_id}",
                "user_id": f"in.({','.join(recorder_ids)})",
            },
        )
        recorder_map = {str(row.get("user_id")): row for row in member_rows if row.get("user_id")}

    events: List[EventOut] = []
    for row in rows:
        recorder_id = str(row.get("recorded_by_user_id")) if row.get("recorded_by_user_id") else None
        recorder = recorder_map.get(recorder_id or "", {}) if recorder_id else {}
        if not isinstance(recorder, dict):
            recorder = {}
        events.append(
            EventOut(
                id=row["id"],
                child_id=row["child_id"],
                type=row["type"],
                title=row["title"],
                detail=row.get("detail"),
                amount_label=row.get("amount_label"),
                start=row["start"],
                end=row.get("end"),
                has_note=bool(row.get("has_note")),
                is_custom=bool(row.get("is_custom")),
                source=row.get("source"),
                origin_message_id=row.get("origin_message_id"),
                recorded_by_user_id=recorder_id,
                recorded_by_first_name=recorder.get("first_name"),
                recorded_by_last_name=recorder.get("last_name"),
            )
        )
    logger.info(
        "timeline events query",
        extra={
            "child_id": resolved_child_id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "count": len(events),
        },
    )  # TODO: tone down once Timeline is stable
    return events


@legacy_router.get("/events", response_model=List[EventOut])
async def legacy_list_events(
    child_id: Optional[str] = Query(None, description="Child identifier"),
    start: datetime = Query(..., description="Start of range"),
    end: datetime = Query(..., description="End of range"),
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> List[EventOut]:
    logger.warning("legacy route hit: /events")
    return await list_events(
        child_id=child_id,
        start=start,
        end=end,
        auth=auth,
        child_id_header=child_id_header,
    )
