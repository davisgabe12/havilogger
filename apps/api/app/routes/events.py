from typing import List, Optional

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from ..supabase import AuthContext, get_auth_context, resolve_child_id

router = APIRouter()
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
            "is_custom,source,origin_message_id"
        ),
        "family_id": f"eq.{auth.family_id}",
        "child_id": f"eq.{resolved_child_id}",
        "order": "start.desc",
        "and": f"(start.gte.{start.isoformat()},start.lt.{end.isoformat()})",
    }
    rows = await auth.supabase.select("timeline_events", params=params)
    events: List[EventOut] = []
    for row in rows:
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
