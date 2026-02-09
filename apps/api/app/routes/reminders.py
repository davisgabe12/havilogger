from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from ..schemas import Task, TaskStatus
from ..supabase import AuthContext, get_auth_context, resolve_child_id, resolve_optional_uuid

router = APIRouter(prefix="/api/v1", tags=["reminders"])
legacy_router = APIRouter()
logger = logging.getLogger(__name__)


class ReminderAckPayload(BaseModel):
    snooze_minutes: Optional[int] = Field(default=None, ge=1, le=1440)


@router.get("/reminders/due", response_model=List[Task])
async def list_due_reminders_endpoint(
    child_id: Optional[str] = Query(None, description="Optional child id"),
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> List[Task]:
    resolved_child_id = resolve_child_id(child_id_header, child_id)
    params = {
        "select": (
            "id,child_id,title,status,due_at,remind_at,completed_at,reminder_channel,"
            "last_reminded_at,snooze_count,is_recurring,recurrence_rule,created_at,"
            "created_by_user_id,assigned_to_user_id"
        ),
        "family_id": f"eq.{auth.family_id}",
        "status": f"eq.{TaskStatus.OPEN.value}",
        "remind_at": f"lte.{datetime.utcnow().isoformat()}",
        "order": "remind_at.asc",
    }
    if resolved_child_id:
        params["child_id"] = f"eq.{resolved_child_id}"
    rows = await auth.supabase.select("tasks", params=params)
    for row in rows:
        row["user_id"] = row.get("created_by_user_id")
    return [Task.model_validate(row) for row in rows]


@router.post("/reminders/{task_id}/ack", response_model=Task)
async def acknowledge_reminder_endpoint(
    task_id: str,
    payload: ReminderAckPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> Task:
    task_uuid = resolve_optional_uuid(task_id, "task_id")
    if not task_uuid:
        raise HTTPException(status_code=400, detail="Invalid task_id")
    tasks = await auth.supabase.select(
        "tasks",
        params={
            "select": (
                "id,child_id,title,status,due_at,remind_at,completed_at,reminder_channel,"
                "last_reminded_at,snooze_count,is_recurring,recurrence_rule,created_at,"
                "created_by_user_id,assigned_to_user_id"
            ),
            "id": f"eq.{task_uuid}",
            "family_id": f"eq.{auth.family_id}",
            "limit": "1",
        },
    )
    if not tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    task = tasks[0]
    if task.get("status") != TaskStatus.OPEN.value:
        raise HTTPException(status_code=400, detail="Reminder can only be acknowledged for open tasks")
    now = datetime.utcnow()
    snooze_minutes = payload.snooze_minutes
    remind_at = None
    snooze_count = task.get("snooze_count") or 0
    if snooze_minutes:
        remind_at = (now + timedelta(minutes=snooze_minutes)).isoformat()
        snooze_count += 1
    updated = await auth.supabase.update(
        "tasks",
        {
            "remind_at": remind_at,
            "snooze_count": snooze_count,
            "last_reminded_at": now.isoformat(),
        },
        params={"id": f"eq.{task_uuid}", "family_id": f"eq.{auth.family_id}"},
    )
    row = (updated or tasks)[0]
    row["user_id"] = row.get("created_by_user_id")
    return Task.model_validate(row)


@legacy_router.get("/reminders/due", response_model=List[Task])
async def legacy_list_due_reminders(
    child_id: Optional[str] = Query(None, description="Optional child id"),
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> List[Task]:
    logger.warning("legacy route hit: /reminders/due")
    return await list_due_reminders_endpoint(child_id, auth, child_id_header)


@legacy_router.post("/reminders/{task_id}/ack", response_model=Task)
async def legacy_acknowledge_reminder(
    task_id: str,
    payload: ReminderAckPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> Task:
    logger.warning("legacy route hit: /reminders/{task_id}/ack")
    return await acknowledge_reminder_endpoint(task_id, payload, auth)
