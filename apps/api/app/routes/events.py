from datetime import datetime
from typing import List, Optional

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..db import list_timeline_events

router = APIRouter()
logger = logging.getLogger(__name__)


class EventOut(BaseModel):
    id: str
    child_id: int
    type: str
    title: str
    detail: Optional[str] = None
    amount_label: Optional[str] = None
    start: datetime
    end: Optional[datetime] = None
    has_note: bool = False
    is_custom: bool = False
    source: Optional[str] = None
    origin_message_id: Optional[int] = None


@router.get("/events", response_model=List[EventOut])
async def list_events(
    child_id: Optional[int] = Query(None, description="Child identifier"),
    start: datetime = Query(..., description="Start of range"),
    end: datetime = Query(..., description="End of range"),
) -> List[EventOut]:
    """Return logged timeline events for the selected child within a date window."""

    if child_id is None:
        raise HTTPException(
            status_code=400,
            detail="child_id is required for timeline events.",
        )

    logger.info(
        "child-scoped request",
        extra={"method": "GET", "path": "/events", "child_id": child_id},
    )

    rows = list_timeline_events(child_id, start.isoformat(), end.isoformat())
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
                start=datetime.fromisoformat(row["start"]),
                end=datetime.fromisoformat(row["end"]) if row.get("end") else None,
                has_note=bool(row.get("has_note")),
                is_custom=bool(row.get("is_custom")),
                source=row.get("source"),
                origin_message_id=row.get("origin_message_id"),
            )
        )
    logger.info(
        "timeline events query",
        extra={
            "child_id": child_id,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "count": len(events),
        },
    )  # TODO: tone down once Timeline is stable
    return events
