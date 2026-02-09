from datetime import datetime
from typing import List, Optional
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from ..schemas import Task, TaskStatus
from ..supabase import AuthContext, get_auth_context, resolve_child_id, resolve_optional_uuid

router = APIRouter(prefix="/api/v1", tags=["tasks"])
legacy_router = APIRouter()
logger = logging.getLogger(__name__)


class CreateTaskPayload(BaseModel):
    title: str
    child_id: Optional[str] = None
    due_at: Optional[datetime] = None
    remind_at: Optional[datetime] = None
    reminder_channel: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurrence_rule: Optional[str] = None
    assigned_to_user_id: Optional[str] = None


class UpdateTaskPayload(BaseModel):
    title: Optional[str] = None
    due_at: Optional[datetime] = None
    remind_at: Optional[datetime] = None
    reminder_channel: Optional[str] = None
    completed_at: Optional[datetime] = None
    last_reminded_at: Optional[datetime] = None
    snooze_count: Optional[int] = None
    is_recurring: Optional[bool] = None
    recurrence_rule: Optional[str] = None
    status: Optional[TaskStatus] = None
    assigned_to_user_id: Optional[str] = None


@router.post("/tasks", response_model=Task)
async def create_task_endpoint(
    payload: CreateTaskPayload,
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> Task:
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    due_at = payload.due_at.isoformat() if payload.due_at else None
    remind_at = payload.remind_at.isoformat() if payload.remind_at else None
    child_id = resolve_child_id(child_id_header, payload.child_id)
    assigned_to_user_id = resolve_optional_uuid(
        payload.assigned_to_user_id, "assigned_to_user_id"
    )
    created_by = auth.user_id
    created = await auth.supabase.insert(
        "tasks",
        {
            "family_id": auth.family_id,
            "child_id": child_id,
            "title": title,
            "status": TaskStatus.OPEN.value,
            "due_at": due_at,
            "remind_at": remind_at,
            "reminder_channel": payload.reminder_channel,
            "is_recurring": payload.is_recurring,
            "recurrence_rule": payload.recurrence_rule,
            "created_by_user_id": created_by,
            "assigned_to_user_id": assigned_to_user_id or created_by,
        },
    )
    if not created:
        raise HTTPException(status_code=500, detail="Unable to create task")
    row = created[0]
    row["user_id"] = row.get("created_by_user_id")
    return Task.model_validate(row)


@router.get("/tasks", response_model=List[Task])
async def list_tasks_endpoint(
    view: str = Query("open", description="View filter: open | scheduled | completed"),
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
        "order": "created_at.desc",
    }
    if resolved_child_id:
        params["child_id"] = f"eq.{resolved_child_id}"
    view = (view or "open").lower()
    if view == "completed":
        params["status"] = f"eq.{TaskStatus.DONE.value}"
    elif view == "scheduled":
        params["status"] = f"eq.{TaskStatus.OPEN.value}"
        params["due_at"] = "not.is.null"
    else:
        params["status"] = f"eq.{TaskStatus.OPEN.value}"
    rows = await auth.supabase.select("tasks", params=params)
    for row in rows:
        row["user_id"] = row.get("created_by_user_id")
    return [Task.model_validate(row) for row in rows]


@router.patch("/tasks/{task_id}", response_model=Task)
async def update_task_endpoint(
    task_id: str,
    payload: UpdateTaskPayload,
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
    updates: dict = {}
    if "title" in payload.model_fields_set:
        title = (payload.title or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="title cannot be empty")
        updates["title"] = title
    if "due_at" in payload.model_fields_set:
        updates["due_at"] = payload.due_at.isoformat() if payload.due_at else None
    if "remind_at" in payload.model_fields_set:
        updates["remind_at"] = payload.remind_at.isoformat() if payload.remind_at else None
    if "reminder_channel" in payload.model_fields_set:
        updates["reminder_channel"] = payload.reminder_channel
    if "completed_at" in payload.model_fields_set:
        updates["completed_at"] = payload.completed_at.isoformat() if payload.completed_at else None
    if "last_reminded_at" in payload.model_fields_set:
        updates["last_reminded_at"] = (
            payload.last_reminded_at.isoformat() if payload.last_reminded_at else None
        )
    if "snooze_count" in payload.model_fields_set:
        updates["snooze_count"] = payload.snooze_count
    if "is_recurring" in payload.model_fields_set:
        updates["is_recurring"] = payload.is_recurring
    if "recurrence_rule" in payload.model_fields_set:
        updates["recurrence_rule"] = payload.recurrence_rule
    if "status" in payload.model_fields_set and payload.status is not None:
        if payload.status not in {TaskStatus.DONE, TaskStatus.OPEN}:
            raise HTTPException(status_code=400, detail="Unsupported status change")
        updates["status"] = payload.status.value
        if payload.status == TaskStatus.DONE and "completed_at" not in updates:
            updates["completed_at"] = datetime.utcnow().isoformat()
        if payload.status == TaskStatus.OPEN and "completed_at" not in updates:
            updates["completed_at"] = None
    if "assigned_to_user_id" in payload.model_fields_set:
        updates["assigned_to_user_id"] = resolve_optional_uuid(
            payload.assigned_to_user_id, "assigned_to_user_id"
        )
    if not updates:
        row = tasks[0]
        row["user_id"] = row.get("created_by_user_id")
        return Task.model_validate(row)
    updated = await auth.supabase.update(
        "tasks",
        updates,
        params={"id": f"eq.{task_uuid}", "family_id": f"eq.{auth.family_id}"},
    )
    row = (updated or tasks)[0]
    row["user_id"] = row.get("created_by_user_id")
    return Task.model_validate(row)


@legacy_router.post("/tasks", response_model=Task)
async def legacy_create_task(
    payload: CreateTaskPayload,
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> Task:
    logger.warning("legacy route hit: /tasks (POST)")
    return await create_task_endpoint(payload, auth, child_id_header)


@legacy_router.get("/tasks", response_model=List[Task])
async def legacy_list_tasks(
    view: str = Query("open", description="View filter: open | scheduled | completed"),
    child_id: Optional[str] = Query(None, description="Optional child id"),
    auth: AuthContext = Depends(get_auth_context),
    child_id_header: Optional[str] = Header(None, alias="X-Havi-Child-Id"),
) -> List[Task]:
    logger.warning("legacy route hit: /tasks (GET)")
    return await list_tasks_endpoint(view, child_id, auth, child_id_header)


@legacy_router.patch("/tasks/{task_id}", response_model=Task)
async def legacy_update_task(
    task_id: str,
    payload: UpdateTaskPayload,
    auth: AuthContext = Depends(get_auth_context),
) -> Task:
    logger.warning("legacy route hit: /tasks/{task_id}")
    return await update_task_endpoint(task_id, payload, auth)
