"""Telemetry storage for loading/error metrics and routine prompts."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from .db import get_connection


def record_loading_metric(
    *,
    session_id: Optional[int],
    message_id: Optional[int],
    thinking_short_ms: Optional[int],
    thinking_rich_ms: Optional[int],
    error_type: Optional[str],
    retry_count: Optional[int],
) -> None:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO loading_metrics (
                session_id,
                message_id,
                thinking_short_ms,
                thinking_rich_ms,
                error_type,
                retry_count,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                message_id,
                thinking_short_ms,
                thinking_rich_ms,
                error_type,
                retry_count,
                now,
            ),
        )
        conn.commit()
