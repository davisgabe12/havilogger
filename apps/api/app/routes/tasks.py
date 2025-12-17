from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..db import create_task, get_task, list_tasks, update_task as update_task_db
from ..schemas import Task, TaskStatus

router = APIRouter(prefix="/api/v1", tags=["tasks"])


class CreateTaskPayload(BaseModel):
    title: str
    child_id: Optional[int] = None
    due_at: Optional[datetime] = None


class UpdateTaskPayload(BaseModel):
    title: Optional[str] = None
    due_at: Optional[datetime] = None
    status: Optional[TaskStatus] = None


@router.post("/tasks", response_model=Task)
async def create_task_endpoint(payload: CreateTaskPayload) -> Task:
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    due_at = payload.due_at.isoformat() if payload.due_at else None
    return create_task(
        title=title,
        user_id=payload.user_id,
        child_id=payload.child_id,
        due_at=due_at,
        status=TaskStatus.OPEN,
    )


@router.get("/tasks", response_model=List[Task])
async def list_tasks_endpoint(
    view: str = Query("open", description="View filter: open | scheduled | completed"),
    child_id: Optional[int] = Query(None, description="Optional child id"),
) -> List[Task]:
    return list_tasks(view=view, child_id=child_id)


@router.patch("/tasks/{task_id}", response_model=Task)
async def update_task_endpoint(task_id: int, payload: UpdateTaskPayload) -> Task:
    try:
        updates: dict = {}
        if "title" in payload.model_fields_set:
            title = (payload.title or "").strip()
            if not title:
                raise HTTPException(status_code=400, detail="title cannot be empty")
            updates["title"] = title
        if "due_at" in payload.model_fields_set:
            updates["due_at"] = payload.due_at.isoformat() if payload.due_at else None
        if "status" in payload.model_fields_set and payload.status is not None:
            if payload.status not in {TaskStatus.DONE, TaskStatus.OPEN}:
                raise HTTPException(status_code=400, detail="Unsupported status change")
            updates["status"] = payload.status
        if not updates:
            return get_task(task_id)
        return update_task_db(task_id, **updates)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
