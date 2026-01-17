"""SQLite helpers."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from uuid import uuid4

from . import dev_config
from .config import CONFIG
from .schemas import KnowledgeItem, KnowledgeItemStatus, KnowledgeItemType, Task, TaskStatus

_DB_PATH = CONFIG.resolved_database_path
_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

_ASSIGNED_TO_UNSET = object()


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    cursor = conn.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cursor.fetchall()}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def initialize_db() -> None:
    with sqlite3.connect(_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                external_id TEXT UNIQUE,
                name TEXT,
                first_name TEXT,
                last_name TEXT,
                email TEXT,
                phone TEXT,
                relationship TEXT,
                status TEXT DEFAULT 'pending',
                is_owner INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )

        _ensure_column(conn, "users", "first_name", "TEXT")
        _ensure_column(conn, "users", "last_name", "TEXT")
        _ensure_column(conn, "children", "first_name", "TEXT")
        _ensure_column(conn, "children", "last_name", "TEXT")
        _ensure_column(conn, "children", "contact_notes", "TEXT")
        _ensure_column(conn, "children", "gender", "TEXT")
        _ensure_column(conn, "children", "birth_weight", "REAL")
        _ensure_column(conn, "children", "birth_weight_unit", "TEXT")
        _ensure_column(conn, "children", "latest_weight", "REAL")
        _ensure_column(conn, "children", "latest_weight_date", "TEXT")
        _ensure_column(conn, "children", "routine_eligible", "INTEGER DEFAULT 0")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS children (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                first_name TEXT,
                last_name TEXT,
                birth_date TEXT,
                due_date TEXT,
                adjusted_birth_date TEXT,
                timezone TEXT DEFAULT 'UTC',
                day_start_minute INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS care_team_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                child_id INTEGER NOT NULL,
                role TEXT,
                status TEXT DEFAULT 'pending',
                invited_at TEXT,
                accepted_at TEXT,
                removed_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (child_id) REFERENCES children(id)
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                input_text TEXT NOT NULL,
                actions_json TEXT NOT NULL
            );
            """
        )

        _ensure_column(conn, "activity_logs", "user_id", "INTEGER")
        _ensure_column(conn, "activity_logs", "child_id", "INTEGER")
        _ensure_column(conn, "activity_logs", "raw_timestamp", "TEXT")
        _ensure_column(conn, "activity_logs", "adjusted_timestamp", "TEXT")
        _ensure_column(conn, "activity_logs", "logging_offset_minutes", "REAL")
        _ensure_column(conn, "activity_logs", "stage_context", "TEXT")
        _ensure_column(conn, "activity_logs", "sleep_type", "TEXT")
        _ensure_column(conn, "activity_logs", "sleep_start_mood", "TEXT")
        _ensure_column(conn, "activity_logs", "sleep_end_mood", "TEXT")
        _ensure_column(conn, "activity_logs", "sleep_location", "TEXT")
        _ensure_column(conn, "activity_logs", "sleep_method", "TEXT")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS inferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                child_id INTEGER,
                user_id INTEGER,
                inference_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                confidence REAL DEFAULT 0.5,
                status TEXT DEFAULT 'pending',
                source TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT,
                FOREIGN KEY (child_id) REFERENCES children(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            """
        )
        _ensure_column(conn, "inferences", "dedupe_key", "TEXT")
        _ensure_column(conn, "inferences", "last_prompted_at", "TEXT")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS knowledge_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                key TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_prompted_at TEXT,
                last_prompted_session_id INTEGER,
                FOREIGN KEY (profile_id) REFERENCES users(id)
            );
            """
        )
        _ensure_column(conn, "knowledge_items", "last_prompted_at", "TEXT")
        _ensure_column(conn, "knowledge_items", "last_prompted_session_id", "INTEGER")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                child_id INTEGER,
                title TEXT,
                is_active INTEGER DEFAULT 1,
                last_message_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                catch_up_mode INTEGER DEFAULT 0,
                catch_up_started_at TEXT,
                catch_up_last_message_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (child_id) REFERENCES children(id)
            );
            """
        )
        _ensure_column(conn, "conversation_sessions", "catch_up_mode", "INTEGER DEFAULT 0")
        _ensure_column(conn, "conversation_sessions", "catch_up_started_at", "TEXT")
        _ensure_column(conn, "conversation_sessions", "catch_up_last_message_at", "TEXT")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                user_id INTEGER,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                intent TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES conversation_sessions(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS message_feedback (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                user_id TEXT,
                session_id TEXT,
                rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
                feedback_text TEXT,
                model_version TEXT,
                response_metadata TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS message_feedback_user_unique
            ON message_feedback (conversation_id, message_id, user_id)
            WHERE user_id IS NOT NULL
            """
        )
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS message_feedback_session_unique
            ON message_feedback (conversation_id, message_id, session_id)
            WHERE session_id IS NOT NULL
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS share_links (
                token TEXT PRIMARY KEY,
                session_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT,
                FOREIGN KEY (session_id) REFERENCES conversation_sessions(id)
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_child_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                child_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                metrics_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(child_id, date),
                FOREIGN KEY (child_id) REFERENCES children(id)
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS routine_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                child_id INTEGER NOT NULL UNIQUE,
                prompt_shown_count INTEGER DEFAULT 0,
                accepted_count INTEGER DEFAULT 0,
                first_prompt_date TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (child_id) REFERENCES children(id)
            );
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS loading_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                message_id INTEGER,
                thinking_short_ms REAL,
                thinking_rich_ms REAL,
                error_type TEXT,
                retry_count INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES conversation_sessions(id),
                FOREIGN KEY (message_id) REFERENCES conversation_messages(id)
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS timeline_events (
                id TEXT PRIMARY KEY,
                child_id INTEGER NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                detail TEXT,
                amount_label TEXT,
                start TEXT NOT NULL,
                end TEXT,
                has_note INTEGER DEFAULT 0,
                is_custom INTEGER DEFAULT 0,
                source TEXT,
                origin_message_id INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY (child_id) REFERENCES children(id),
                FOREIGN KEY (origin_message_id) REFERENCES conversation_messages(id)
            );
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                child_id INTEGER,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                due_at TEXT,
                remind_at TEXT,
                completed_at TEXT,
                reminder_channel TEXT,
                last_reminded_at TEXT,
                snooze_count INTEGER DEFAULT 0,
                is_recurring INTEGER DEFAULT 0,
                recurrence_rule TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (child_id) REFERENCES children(id)
            );
            """
        )

        _ensure_column(conn, "tasks", "created_by_user_id", "INTEGER")
        _ensure_column(conn, "tasks", "assigned_to_user_id", "INTEGER")
        _ensure_column(conn, "tasks", "remind_at", "TEXT")
        _ensure_column(conn, "tasks", "completed_at", "TEXT")
        _ensure_column(conn, "tasks", "reminder_channel", "TEXT")
        _ensure_column(conn, "tasks", "last_reminded_at", "TEXT")
        _ensure_column(conn, "tasks", "snooze_count", "INTEGER")
        _ensure_column(conn, "tasks", "is_recurring", "INTEGER")
        _ensure_column(conn, "tasks", "recurrence_rule", "TEXT")

        conn.execute(
            """
            UPDATE tasks
            SET created_by_user_id = user_id
            WHERE user_id IS NOT NULL AND created_by_user_id IS NULL
            """
        )
        conn.execute(
            """
            UPDATE tasks
            SET assigned_to_user_id = user_id
            WHERE user_id IS NOT NULL AND assigned_to_user_id IS NULL
            """
        )
        conn.execute(
            """
            UPDATE tasks
            SET snooze_count = 0
            WHERE snooze_count IS NULL
            """
        )
        conn.execute(
            """
            UPDATE tasks
            SET is_recurring = 0
            WHERE is_recurring IS NULL
            """
        )

        conn.commit()


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(_DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


def ensure_default_profiles() -> None:
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(_DB_PATH) as conn:
        user_exists = conn.execute("SELECT id FROM users LIMIT 1").fetchone()
        if not user_exists:
            conn.execute(
                """
                INSERT INTO users (name, first_name, last_name, email, phone, relationship, status, is_owner, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'active', 1, ?, ?)
                """,
                (
                    "Primary Caregiver",
                    "Primary",
                    "Caregiver",
                    "care@example.com",
                    "",
                    "Parent",
                    now,
                    now,
                ),
            )

        child_exists = conn.execute("SELECT id FROM children LIMIT 1").fetchone()
        if not child_exists:
            conn.execute(
                """
                INSERT INTO children (name, first_name, last_name, birth_date, due_date, adjusted_birth_date, timezone, day_start_minute, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                """,
                (
                    "Baby",
                    "Baby",
                    "",
                    "",
                    "",
                    "",
                    "UTC",
                    now,
                    now,
                ),
            )

        conn.commit()


def fetch_recent_actions(limit: int = 10) -> List[dict]:
    """Return a flattened list of the most recent action dictionaries."""
    with sqlite3.connect(_DB_PATH) as conn:
        rows = conn.execute(
            "SELECT actions_json FROM activity_logs ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    actions: List[dict] = []
    for (payload,) in rows:
        try:
            data = json.loads(payload)
        except Exception:
            continue
        items = data.get("actions") or []
        actions.extend(items)
    actions.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    return actions[:limit]


def fetch_primary_profiles() -> tuple[dict, dict]:
    ensure_default_profiles()
    with sqlite3.connect(_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        user_row = conn.execute("SELECT * FROM users ORDER BY id LIMIT 1").fetchone()
        child_row = conn.execute("SELECT * FROM children ORDER BY id LIMIT 1").fetchone()
    return _row_to_dict(user_row), _row_to_dict(child_row)


def update_user_profile(data: dict) -> None:
    ensure_default_profiles()
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(_DB_PATH) as conn:
        user_id = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()[0]
        conn.execute(
            """
            UPDATE users SET
                first_name = ?,
                last_name = ?,
                email = ?,
                phone = ?,
                relationship = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                data.get("first_name"),
                data.get("last_name"),
                data.get("email"),
                data.get("phone"),
                data.get("relationship"),
                now,
                user_id,
            ),
        )
        conn.commit()


def update_child_profile(data: dict) -> None:
    ensure_default_profiles()
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(_DB_PATH) as conn:
        child_id = conn.execute("SELECT id FROM children ORDER BY id LIMIT 1").fetchone()[0]
        conn.execute(
            """
            UPDATE children SET
                first_name = ?,
                last_name = ?,
                birth_date = ?,
                due_date = ?,
                timezone = COALESCE(?, timezone),
                gender = COALESCE(?, gender),
                birth_weight = COALESCE(?, birth_weight),
                birth_weight_unit = COALESCE(?, birth_weight_unit),
                latest_weight = COALESCE(?, latest_weight),
                latest_weight_date = COALESCE(?, latest_weight_date),
                routine_eligible = COALESCE(?, routine_eligible),
                updated_at = ?
            WHERE id = ?
            """,
            (
                data.get("first_name"),
                data.get("last_name"),
                data.get("birth_date"),
                data.get("due_date"),
                data.get("timezone"),
                data.get("gender"),
                data.get("birth_weight"),
                data.get("birth_weight_unit"),
                data.get("latest_weight"),
                data.get("latest_weight_date"),
                data.get("routine_eligible"),
                now,
                child_id,
            ),
        )
        conn.commit()


def _row_to_dict(row: sqlite3.Row | None) -> dict:
    if row is None:
        return {}
    return {key: row[key] for key in row.keys()}


def _feedback_row_to_dict(row: sqlite3.Row | None) -> dict:
    data = _row_to_dict(row)
    if not data:
        return {}
    metadata = data.get("response_metadata")
    if metadata:
        try:
            data["response_metadata"] = json.loads(metadata)
        except (TypeError, json.JSONDecodeError):
            data["response_metadata"] = None
    return data


def upsert_message_feedback(
    conversation_id: str,
    message_id: str,
    rating: str,
    *,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    feedback_text: Optional[str] = None,
    model_version: Optional[str] = None,
    response_metadata: Optional[Dict[str, Any]] = None,
) -> dict:
    timestamp = datetime.now(tz=timezone.utc).isoformat()
    metadata_payload = json.dumps(response_metadata) if response_metadata is not None else None

    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        existing = None
        # Best-effort de-duplication: without a user_id or session_id, we cannot
        # enforce uniqueness for anonymous feedback.
        if user_id:
            existing = conn.execute(
                """
                SELECT *
                FROM message_feedback
                WHERE conversation_id = ? AND message_id = ? AND user_id = ?
                """,
                (conversation_id, message_id, user_id),
            ).fetchone()
        elif session_id:
            existing = conn.execute(
                """
                SELECT *
                FROM message_feedback
                WHERE conversation_id = ? AND message_id = ? AND session_id = ?
                """,
                (conversation_id, message_id, session_id),
            ).fetchone()

        if existing:
            conn.execute(
                """
                UPDATE message_feedback
                SET rating = ?,
                    feedback_text = ?,
                    model_version = ?,
                    response_metadata = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    rating,
                    feedback_text,
                    model_version,
                    metadata_payload,
                    timestamp,
                    existing["id"],
                ),
            )
            feedback_id = existing["id"]
        else:
            feedback_id = str(uuid4())
            conn.execute(
                """
                INSERT INTO message_feedback (
                    id,
                    conversation_id,
                    message_id,
                    user_id,
                    session_id,
                    rating,
                    feedback_text,
                    model_version,
                    response_metadata,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    feedback_id,
                    conversation_id,
                    message_id,
                    user_id,
                    session_id,
                    rating,
                    feedback_text,
                    model_version,
                    metadata_payload,
                    timestamp,
                    timestamp,
                ),
            )

        row = conn.execute("SELECT * FROM message_feedback WHERE id = ?", (feedback_id,)).fetchone()
        conn.commit()

    return _feedback_row_to_dict(row)


def persist_log(
    input_text: str,
    actions: dict,
    *,
    user_id: Optional[int] = None,
    child_id: Optional[int] = None,
    raw_timestamp: Optional[str] = None,
    adjusted_timestamp: Optional[str] = None,
    logging_offset_minutes: Optional[float] = None,
    stage_context: Optional[str] = None,
    sleep_metadata: Optional[dict] = None,
) -> None:
    payload = json.dumps(actions, ensure_ascii=False)
    timestamp = datetime.now(tz=timezone.utc).isoformat()
    sleep_metadata = sleep_metadata or {}

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO activity_logs (
                created_at,
                input_text,
                actions_json,
                user_id,
                child_id,
                raw_timestamp,
                adjusted_timestamp,
                logging_offset_minutes,
                stage_context,
                sleep_type,
                sleep_start_mood,
                sleep_end_mood,
                sleep_location,
                sleep_method
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                timestamp,
                input_text,
                payload,
                user_id,
                child_id,
                raw_timestamp,
                adjusted_timestamp,
                logging_offset_minutes,
                stage_context,
                sleep_metadata.get("sleep_type"),
                sleep_metadata.get("sleep_start_mood"),
                sleep_metadata.get("sleep_end_mood"),
                sleep_metadata.get("sleep_location"),
                sleep_metadata.get("sleep_method"),
            ),
        )
        conn.commit()


def insert_timeline_event(
    *,
    child_id: int,
    event_type: str,
    title: str,
    detail: Optional[str] = None,
    amount_label: Optional[str] = None,
    start: str,
    end: Optional[str] = None,
    has_note: bool = False,
    is_custom: bool = False,
    source: Optional[str] = None,
    origin_message_id: Optional[int] = None,
) -> str:
    event_id = str(uuid4())
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO timeline_events (
                id,
                child_id,
                type,
                title,
                detail,
                amount_label,
                start,
                end,
                has_note,
                is_custom,
                source,
                origin_message_id,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                child_id,
                event_type,
                title,
                detail,
                amount_label,
                start,
                end,
                1 if has_note else 0,
                1 if is_custom else 0,
                source,
                origin_message_id,
                now,
            ),
        )
        conn.commit()
    return event_id


def has_child_profiles() -> bool:
    with sqlite3.connect(_DB_PATH) as conn:
        row = conn.execute("SELECT 1 FROM children LIMIT 1").fetchone()
    return bool(row)


def list_timeline_events(child_id: Optional[int], start: str, end: str) -> List[dict]:
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        query = """
            SELECT *
            FROM timeline_events
            WHERE start >= ?
              AND start < ?
        """
        params: list = [start, end]
        if child_id is not None:
            query += "\n              AND child_id = ?"
            params.append(child_id)
        elif not dev_config.ALLOW_ORPHAN_EVENTS:
            # This branch should only be reached in testing when the route allows it;
            # keep the clause for safety but make it impossible to match.
            query += "\n              AND 1 = 0"
        query += "\n            ORDER BY start DESC"
        cursor = conn.execute(query, tuple(params))
        rows = cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


def get_primary_child_id() -> int:
    ensure_default_profiles()
    with sqlite3.connect(_DB_PATH) as conn:
        row = conn.execute("SELECT id FROM children ORDER BY id LIMIT 1").fetchone()
    if not row:
        raise RuntimeError("No child profile found")
    return row[0]


def get_primary_profile_id() -> int:
    ensure_default_profiles()
    with sqlite3.connect(_DB_PATH) as conn:
        row = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
    if not row:
        raise RuntimeError("No caregiver profile found")
    return row[0]


def _row_to_knowledge_item(row) -> KnowledgeItem:
    return KnowledgeItem(
        id=row["id"],
        profile_id=row["profile_id"],
        key=row["key"],
        type=KnowledgeItemType(row["type"]),
        status=KnowledgeItemStatus(row["status"]),
        payload=json.loads(row["payload"]),
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        last_prompted_at=datetime.fromisoformat(row["last_prompted_at"]) if row["last_prompted_at"] else None,
        last_prompted_session_id=row["last_prompted_session_id"],
    )


def create_knowledge_item(
    profile_id: int,
    key: str,
    *,
    type: KnowledgeItemType,
    status: KnowledgeItemStatus,
    payload: dict,
) -> KnowledgeItem:
    now = datetime.utcnow().isoformat()
    payload_json = json.dumps(payload, ensure_ascii=False)
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO knowledge_items (
                profile_id,
                key,
                type,
                status,
                payload,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                profile_id,
                key,
                type.value,
                status.value,
                payload_json,
                now,
                now,
            ),
        )
        conn.commit()
        item_id = cursor.lastrowid
    return get_knowledge_item(item_id)


def get_knowledge_item(item_id: int) -> KnowledgeItem:
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute("SELECT * FROM knowledge_items WHERE id = ?", (item_id,))
        row = cursor.fetchone()
    if not row:
        raise ValueError(f"Knowledge item {item_id} not found")
    return _row_to_knowledge_item(row)


def find_knowledge_item(profile_id: int, key: str) -> Optional[KnowledgeItem]:
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT * FROM knowledge_items WHERE profile_id = ? AND key = ? ORDER BY updated_at DESC LIMIT 1",
            (profile_id, key),
        )
        row = cursor.fetchone()
    if not row:
        return None
    return _row_to_knowledge_item(row)


def list_knowledge_items(
    profile_id: int,
    *,
    status: Optional[KnowledgeItemStatus] = None,
    limit: int = 50,
) -> List[KnowledgeItem]:
    query = "SELECT * FROM knowledge_items WHERE profile_id = ?"
    params: List[Any] = [profile_id]
    if status:
        query += " AND status = ?"
        params.append(status.value)
    query += " ORDER BY updated_at DESC LIMIT ?"
    params.append(limit)
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(query, tuple(params))
        rows = cursor.fetchall()
    return [_row_to_knowledge_item(row) for row in rows]


def update_knowledge_item_status(item_id: int, status: KnowledgeItemStatus) -> KnowledgeItem:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(
            "UPDATE knowledge_items SET status = ?, updated_at = ? WHERE id = ?",
            (status.value, now, item_id),
        )
        conn.commit()
    return get_knowledge_item(item_id)


def update_knowledge_item_type(item_id: int, type: KnowledgeItemType) -> KnowledgeItem:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(
            "UPDATE knowledge_items SET type = ?, updated_at = ? WHERE id = ?",
            (type.value, now, item_id),
        )
        conn.commit()
    return get_knowledge_item(item_id)


def update_knowledge_item_payload(
    item_id: int,
    payload: dict,
    *,
    status: Optional[KnowledgeItemStatus] = None,
) -> KnowledgeItem:
    now = datetime.utcnow().isoformat()
    fields = ["payload = ?", "updated_at = ?"]
    params: List[Any] = [json.dumps(payload, ensure_ascii=False), now]
    if status:
        fields.insert(0, "status = ?")
        params.insert(0, status.value)
    params.append(item_id)
    query = f"UPDATE knowledge_items SET {', '.join(fields)} WHERE id = ?"
    with get_connection() as conn:
        conn.execute(query, tuple(params))
        conn.commit()
    return get_knowledge_item(item_id)


def mark_knowledge_prompted(item_ids: List[int], *, session_id: Optional[int] = None) -> None:
    if not item_ids:
        return
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        for item_id in item_ids:
            conn.execute(
                """
                UPDATE knowledge_items
                SET last_prompted_at = ?, last_prompted_session_id = ?
                WHERE id = ?
                """,
                (now, session_id, item_id),
            )
        conn.commit()


def _reject_inferred_knowledge(profile_id: int, key: str) -> None:
    items = list_knowledge_items(profile_id)
    for item in items:
        if item.key == key and item.type == KnowledgeItemType.INFERRED and item.status == KnowledgeItemStatus.ACTIVE:
            update_knowledge_item_status(item.id, KnowledgeItemStatus.REJECTED)


def set_explicit_knowledge(profile_id: int, key: str, payload: dict) -> KnowledgeItem:
    existing = find_knowledge_item(profile_id, key)
    if existing and existing.type == KnowledgeItemType.EXPLICIT:
        return update_knowledge_item_payload(
            existing.id,
            payload,
            status=KnowledgeItemStatus.ACTIVE,
        )
    _reject_inferred_knowledge(profile_id, key)
    return create_knowledge_item(
        profile_id=profile_id,
        key=key,
        type=KnowledgeItemType.EXPLICIT,
        status=KnowledgeItemStatus.ACTIVE,
        payload=payload,
    )


def upsert_routine_metrics(*, child_id: int, prompt_shown_delta: int = 0, accepted_delta: int = 0) -> None:
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM routine_metrics WHERE child_id = ?", (child_id,)).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO routine_metrics (
                    child_id,
                    prompt_shown_count,
                    accepted_count,
                    first_prompt_date,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    child_id,
                    max(prompt_shown_delta, 0),
                    max(accepted_delta, 0),
                    now if prompt_shown_delta > 0 else None,
                    now,
                    now,
                ),
            )
        else:
            new_prompt_count = row["prompt_shown_count"] + prompt_shown_delta
            new_accept_count = row["accepted_count"] + accepted_delta
            first_prompt_param = None
            if row["first_prompt_date"]:
                first_prompt_param = row["first_prompt_date"]
            elif prompt_shown_delta > 0:
                first_prompt_param = now
            conn.execute(
                """
                UPDATE routine_metrics
                SET prompt_shown_count = ?,
                    accepted_count = ?,
                    first_prompt_date = COALESCE(first_prompt_date, ?),
                    updated_at = ?
                WHERE child_id = ?
                """,
                (new_prompt_count, new_accept_count, first_prompt_param, now, child_id),
        )
        conn.commit()


def get_routine_metrics(child_id: int) -> Optional[dict]:
    with sqlite3.connect(_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM routine_metrics WHERE child_id = ?", (child_id,)).fetchone()
    if not row:
        return None
    return dict(row)


def create_share_link(token: str, session_id: int, *, expires_at: Optional[str] = None) -> None:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO share_links (token, session_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, session_id, now, expires_at),
        )
        conn.commit()


def get_share_link(token: str) -> Optional[dict]:
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM share_links WHERE token = ?", (token,)).fetchone()
    if not row:
        return None
    return dict(row)


def session_has_messages(session_id: int) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM conversation_messages WHERE session_id = ? LIMIT 1",
            (session_id,),
        ).fetchone()
    return bool(row)


def list_conversation_messages(session_id: int, limit: int = 500) -> List[dict]:
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            """
            SELECT id, role, content, created_at
            FROM conversation_messages
            WHERE session_id = ?
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (session_id, limit),
        )
        rows = cursor.fetchall()
    return [_row_to_dict(row) for row in rows]


def _row_to_task(row) -> Task:
    return Task(
        id=row["id"],
        user_id=row["user_id"],
        child_id=row["child_id"],
        title=row["title"],
        status=TaskStatus(row["status"]),
        due_at=datetime.fromisoformat(row["due_at"]) if row["due_at"] else None,
        remind_at=datetime.fromisoformat(row["remind_at"]) if row["remind_at"] else None,
        completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
        reminder_channel=row["reminder_channel"],
        last_reminded_at=datetime.fromisoformat(row["last_reminded_at"]) if row["last_reminded_at"] else None,
        snooze_count=row["snooze_count"],
        is_recurring=bool(row["is_recurring"]) if row["is_recurring"] is not None else None,
        recurrence_rule=row["recurrence_rule"],
        created_at=datetime.fromisoformat(row["created_at"]),
        created_by_user_id=row["created_by_user_id"],
        assigned_to_user_id=row["assigned_to_user_id"],
    )


def create_task(
    *,
    title: str,
    user_id: Optional[int] = None,
    child_id: Optional[int] = None,
    due_at: Optional[str] = None,
    remind_at: Optional[str] = None,
    reminder_channel: Optional[str] = None,
    is_recurring: Optional[bool] = None,
    recurrence_rule: Optional[str] = None,
    assigned_to_user_id: Optional[int] = None,
    status: TaskStatus = TaskStatus.OPEN,
) -> Task:
    now = datetime.utcnow().isoformat()
    creator_id = user_id
    assignee_id = assigned_to_user_id if assigned_to_user_id is not None else creator_id
    recurring_flag = 1 if is_recurring else 0
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO tasks (
                user_id,
                child_id,
                title,
                status,
                due_at,
                remind_at,
                completed_at,
                reminder_channel,
                last_reminded_at,
                snooze_count,
                is_recurring,
                recurrence_rule,
                created_at,
                created_by_user_id,
                assigned_to_user_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                child_id,
                title,
                status.value,
                due_at,
                remind_at,
                None,
                reminder_channel,
                None,
                0,
                recurring_flag,
                recurrence_rule,
                now,
                creator_id,
                assignee_id,
            ),
        )
        conn.commit()
        task_id = cursor.lastrowid
    return get_task(task_id)


def get_task(task_id: int) -> Task:
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        raise ValueError(f"Task {task_id} not found")
    return _row_to_task(row)


def list_tasks(
    *,
    view: str = "open",
    child_id: Optional[int] = None,
    user_id: Optional[int] = None,
    limit: int = 100,
) -> List[Task]:
    query = "SELECT * FROM tasks WHERE 1 = 1"
    params: List[object] = []
    view_lower = (view or "open").lower()
    if view_lower == "completed":
        query += " AND status = ?"
        params.append(TaskStatus.DONE.value)
    elif view_lower == "scheduled":
        query += " AND status = ? AND due_at IS NOT NULL"
        params.append(TaskStatus.OPEN.value)
    else:  # default to open
        query += " AND status = ? AND due_at IS NULL"
        params.append(TaskStatus.OPEN.value)
    if child_id is not None:
        query += " AND (child_id = ? OR child_id IS NULL)"
        params.append(child_id)
    if user_id is not None:
        query += " AND user_id = ?"
        params.append(user_id)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(query, tuple(params)).fetchall()
    return [_row_to_task(row) for row in rows]


def list_due_reminders(
    *,
    now: Optional[datetime] = None,
    child_id: Optional[int] = None,
    limit: int = 50,
) -> List[Task]:
    current = (now or datetime.utcnow()).isoformat()
    query = """
        SELECT *
        FROM tasks
        WHERE status = ?
          AND remind_at IS NOT NULL
          AND remind_at <= ?
          AND (last_reminded_at IS NULL OR last_reminded_at < remind_at)
    """
    params: List[object] = [TaskStatus.OPEN.value, current]
    if child_id is not None:
        query += " AND (child_id = ? OR child_id IS NULL)"
        params.append(child_id)
    query += " ORDER BY remind_at ASC LIMIT ?"
    params.append(limit)
    with get_connection() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(query, tuple(params)).fetchall()
    return [_row_to_task(row) for row in rows]


def acknowledge_reminder(
    task_id: int,
    *,
    remind_at: Optional[str] = None,
    snooze_count: Optional[int] = None,
    last_reminded_at: Optional[str] = None,
) -> Task:
    updates: Dict[str, object] = {}
    if remind_at is not None:
        updates["remind_at"] = remind_at
    if snooze_count is not None:
        updates["snooze_count"] = snooze_count
    if last_reminded_at is not None:
        updates["last_reminded_at"] = last_reminded_at
    if not updates:
        return get_task(task_id)
    return update_task(task_id, **updates)


def update_task_status(task_id: int, status: TaskStatus) -> Task:
    completed_at = datetime.utcnow().isoformat() if status == TaskStatus.DONE else None
    with get_connection() as conn:
        conn.execute(
            "UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?",
            (status.value, completed_at, task_id),
        )
        conn.commit()
    return get_task(task_id)


def update_task(
    task_id: int,
    *,
    title: Optional[str] = None,
    due_at: Optional[str] = None,
    remind_at: Optional[str] = None,
    reminder_channel: Optional[str] = None,
    completed_at: Optional[str] = None,
    last_reminded_at: Optional[str] = None,
    snooze_count: Optional[int] = None,
    is_recurring: Optional[bool] = None,
    recurrence_rule: Optional[str] = None,
    status: Optional[TaskStatus] = None,
    assigned_to_user_id: object = _ASSIGNED_TO_UNSET,
) -> Task:
    fields: List[str] = []
    params: List[object] = []
    if title is not None:
        fields.append("title = ?")
        params.append(title)
    if due_at is not None:
        fields.append("due_at = ?")
        params.append(due_at)
    if remind_at is not None:
        fields.append("remind_at = ?")
        params.append(remind_at)
    if reminder_channel is not None:
        fields.append("reminder_channel = ?")
        params.append(reminder_channel)
    if completed_at is not None:
        fields.append("completed_at = ?")
        params.append(completed_at)
    if last_reminded_at is not None:
        fields.append("last_reminded_at = ?")
        params.append(last_reminded_at)
    if snooze_count is not None:
        fields.append("snooze_count = ?")
        params.append(snooze_count)
    if is_recurring is not None:
        fields.append("is_recurring = ?")
        params.append(1 if is_recurring else 0)
    if recurrence_rule is not None:
        fields.append("recurrence_rule = ?")
        params.append(recurrence_rule)
    if status is not None:
        fields.append("status = ?")
        params.append(status.value)
        if completed_at is None:
            if status == TaskStatus.DONE:
                fields.append("completed_at = ?")
                params.append(datetime.utcnow().isoformat())
            else:
                fields.append("completed_at = ?")
                params.append(None)
    if assigned_to_user_id is not _ASSIGNED_TO_UNSET:
        fields.append("assigned_to_user_id = ?")
        params.append(assigned_to_user_id)
    if not fields:
        return get_task(task_id)
    params.append(task_id)
    set_clause = ", ".join(fields)
    with get_connection() as conn:
        conn.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", tuple(params))
        conn.commit()
    return get_task(task_id)
