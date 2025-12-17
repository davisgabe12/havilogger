"""Conversation session + message helpers."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field

from .db import get_connection


class ConversationIntent(str):
    LOG = "log"
    EXPECTED = "expected"
    NORMAL = "normal"
    COMPARE = "compare"
    SUGGESTION = "suggestion"
    INSIGHT = "insight"
    RESEARCH = "research"
    PLAN = "plan"
    REMINDER = "reminder"
    UNKNOWN = "unknown"


class ConversationMessage(BaseModel):
    id: int
    session_id: int
    user_id: Optional[int]
    role: str
    content: str
    intent: Optional[str] = None
    created_at: datetime


class ConversationSession(BaseModel):
    id: int
    user_id: Optional[int]
    child_id: Optional[int]
    title: str
    is_active: bool
    last_message_at: datetime
    created_at: datetime
    updated_at: datetime
    catch_up_mode: bool = False
    catch_up_started_at: Optional[datetime] = None
    catch_up_last_message_at: Optional[datetime] = None


class CreateMessagePayload(BaseModel):
    session_id: int
    role: str
    content: str
    user_id: Optional[int] = None
    intent: Optional[str] = None


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _row_to_session(row) -> ConversationSession:
    return ConversationSession(
        id=row[0],
        user_id=row[1],
        child_id=row[2],
        title=row[3] or "Daily log",
        is_active=bool(row[4]),
        last_message_at=datetime.fromisoformat(row[5]),
        created_at=datetime.fromisoformat(row[6]),
        updated_at=datetime.fromisoformat(row[7]),
        catch_up_mode=bool(row[8]),
        catch_up_started_at=datetime.fromisoformat(row[9]) if row[9] else None,
        catch_up_last_message_at=datetime.fromisoformat(row[10]) if row[10] else None,
    )


def _row_to_message(row) -> ConversationMessage:
    return ConversationMessage(
        id=row[0],
        session_id=row[1],
        user_id=row[2],
        role=row[3],
        content=row[4],
        intent=row[5],
        created_at=datetime.fromisoformat(row[6]),
    )


def create_session(*, user_id: Optional[int], child_id: Optional[int], title: Optional[str] = None) -> ConversationSession:
    now = _now_iso()
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO conversation_sessions (
                user_id,
                child_id,
                title,
                is_active,
                last_message_at,
                created_at,
                updated_at,
                catch_up_mode,
                catch_up_started_at,
                catch_up_last_message_at
            )
            VALUES (?, ?, ?, 1, ?, ?, ?, 0, NULL, NULL)
            """,
            (user_id, child_id, title or "Daily log", now, now, now),
        )
        conn.commit()
        session_id = cursor.lastrowid
    return get_session(session_id)


def create_or_get_active_session(*, user_id: Optional[int], child_id: Optional[int]) -> ConversationSession:
    if child_id is None:
        raise ValueError("child_id is required to create or fetch a conversation session.")
    with get_connection() as conn:
        cursor = conn.execute(
            """
            SELECT * FROM conversation_sessions
            WHERE user_id IS ? AND child_id IS ? AND is_active = 1
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (user_id, child_id),
        )
        row = cursor.fetchone()
    if row:
        return _row_to_session(row)
    return create_session(user_id=user_id, child_id=child_id)


def get_session(session_id: int) -> ConversationSession:
    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM conversation_sessions WHERE id = ?", (session_id,))
        row = cursor.fetchone()
    if not row:
        raise ValueError(f"Session {session_id} not found")
    return _row_to_session(row)


def list_sessions(
    *,
    user_id: Optional[int] = None,
    child_id: Optional[int] = None,
    limit: int = 20,
) -> List[ConversationSession]:
    query = "SELECT * FROM conversation_sessions"
    clauses = []
    params = []
    if user_id is not None:
        clauses.append("user_id = ?")
        params.append(user_id)
    if child_id is not None:
        clauses.append("child_id = ?")
        params.append(child_id)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY last_message_at DESC LIMIT ?"
    params.append(limit)

    with get_connection() as conn:
        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
    return [_row_to_session(row) for row in rows]


def close_session(session_id: int) -> ConversationSession:
    now = _now_iso()
    with get_connection() as conn:
        conn.execute(
            "UPDATE conversation_sessions SET is_active = 0, updated_at = ? WHERE id = ?",
            (now, session_id),
        )
        conn.commit()
    return get_session(session_id)


def reopen_session(session_id: int) -> ConversationSession:
    now = _now_iso()
    with get_connection() as conn:
        conn.execute(
            "UPDATE conversation_sessions SET is_active = 1, updated_at = ?, last_message_at = ? WHERE id = ?",
            (now, now, session_id),
        )
        conn.commit()
    return get_session(session_id)


def append_message(data: CreateMessagePayload) -> ConversationMessage:
    now = _now_iso()
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO conversation_messages (session_id, user_id, role, content, intent, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (data.session_id, data.user_id, data.role, data.content, data.intent, now),
        )
        conn.execute(
            "UPDATE conversation_sessions SET last_message_at = ?, updated_at = ?, is_active = 1 WHERE id = ?",
            (now, now, data.session_id),
        )
        conn.commit()
        message_id = cursor.lastrowid
    return get_message(message_id)


def get_message(message_id: int) -> ConversationMessage:
    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM conversation_messages WHERE id = ?", (message_id,))
        row = cursor.fetchone()
    if not row:
        raise ValueError(f"Message {message_id} not found")
    return _row_to_message(row)


def list_messages(session_id: int, limit: int = 100) -> List[ConversationMessage]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?",
            (session_id, limit),
        )
        rows = cursor.fetchall()
    return [_row_to_message(row) for row in rows]


def get_last_assistant_message(session_id: int) -> Optional[str]:
    with get_connection() as conn:
        cursor = conn.execute(
            "SELECT content FROM conversation_messages WHERE session_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1",
            (session_id,),
        )
        row = cursor.fetchone()
    if not row:
        return None
    return row[0]


def set_catch_up_mode(session_id: int, enabled: bool) -> None:
    now = _now_iso()
    started_at = now if enabled else None
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE conversation_sessions
            SET catch_up_mode = ?,
                catch_up_started_at = ?,
                catch_up_last_message_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (1 if enabled else 0, started_at, started_at, now, session_id),
        )
        conn.commit()


def touch_catch_up_mode(session_id: int) -> None:
    now = _now_iso()
    with get_connection() as conn:
        conn.execute(
            "UPDATE conversation_sessions SET catch_up_last_message_at = ?, updated_at = ? WHERE id = ?",
            (now, now, session_id),
        )
        conn.commit()


def catch_up_mode_should_end(session: ConversationSession, timeout_seconds: int = 900) -> bool:
    if not session.catch_up_mode:
        return False
    if not session.catch_up_last_message_at:
        return False
    elapsed = datetime.now(tz=timezone.utc) - session.catch_up_last_message_at
    return elapsed.total_seconds() >= timeout_seconds
