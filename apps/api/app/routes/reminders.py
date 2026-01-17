from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..db import acknowledge_reminder, get_task, list_due_reminders
from ..schemas import Task, TaskStatus

router = APIRouter(prefix="/api/v1", tags=["reminders"])


class ReminderAckPayload(BaseModel):
    snooze_minutes: Optional[int] = Field(default=None, ge=1, le=1440)


@router.get("/reminders/due", response_model=List[Task])
async def list_due_reminders_endpoint(
    child_id: Optional[int] = Query(None, description="Optional child id"),
) -> List[Task]:
    return list_due_reminders(child_id=child_id)


@router.post("/reminders/{task_id}/ack", response_model=Task)
async def acknowledge_reminder_endpoint(task_id: int, payload: ReminderAckPayload) -> Task:
    task = get_task(task_id)
    if task.status != TaskStatus.OPEN:
        raise HTTPException(status_code=400, detail="Reminder can only be acknowledged for open tasks")
    now = datetime.utcnow()
    snooze_minutes = payload.snooze_minutes
    remind_at = None
    snooze_count = task.snooze_count or 0
    if snooze_minutes:
        remind_at = (now + timedelta(minutes=snooze_minutes)).isoformat()
        snooze_count += 1
    return acknowledge_reminder(
        task_id,
        remind_at=remind_at,
        snooze_count=snooze_count,
        last_reminded_at=now.isoformat(),
    )
