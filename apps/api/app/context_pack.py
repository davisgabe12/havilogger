from __future__ import annotations

from typing import Any, Dict, List, Optional

from .conversations import list_messages


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def _normalize_role(role: str) -> str:
    if role == "assistant":
        return "assistant"
    return "user"


def _summary_stub(content: str, *, message_id: int, max_chars: int) -> str:
    prefix = f"(truncated; message_id={message_id}) "
    if max_chars <= len(prefix):
        return prefix[:max_chars]
    available = max_chars - len(prefix)
    if len(content) <= available:
        return f"{prefix}{content}"
    if available < 40:
        return f"{prefix}{content[-available:]}"
    head_len = available // 2
    tail_len = available - head_len
    head = content[:head_len].rstrip()
    tail = content[-tail_len:].lstrip()
    return f"{prefix}{head}\n…\n{tail}"


def build_message_context(
    session_id: int,
    *,
    max_messages: int = 50,
    budget_tokens: int = 2000,
) -> Dict[str, Any]:
    messages = list_messages(session_id, limit=None)
    context_messages: List[Dict[str, Any]] = []
    omissions: List[Dict[str, Any]] = []
    if not messages:
        return {
            "messages": [],
            "budget": {"max_tokens_est": budget_tokens, "max_messages": max_messages},
            "omissions": [],
        }

    last_assistant = next((msg for msg in reversed(messages) if msg.role == "assistant"), None)
    last_assistant_summary: Optional[str] = None
    reserved_tokens = 0
    reserved_messages = 0
    if last_assistant is not None:
        last_tokens = estimate_tokens(last_assistant.content)
        if last_tokens > budget_tokens:
            max_chars = max(20, min(1000, budget_tokens * 4 - 80))
            last_assistant_summary = _summary_stub(
                last_assistant.content,
                message_id=last_assistant.id,
                max_chars=max_chars,
            )
            reserved_tokens = estimate_tokens(last_assistant_summary)
        else:
            reserved_tokens = last_tokens
        reserved_messages = 1

    remaining_tokens = budget_tokens
    remaining_messages = max_messages

    for message in reversed(messages):
        message_id = str(message.id)
        role = _normalize_role(message.role)
        content = message.content

        if last_assistant is not None and message.id == last_assistant.id:
            if last_assistant_summary is not None:
                content = last_assistant_summary
                omissions.append(
                    {
                        "message_id": message_id,
                        "reason": "replaced_by_summary",
                        "summary": content,
                    }
                )
            token_estimate = estimate_tokens(content)
            context_messages.append(
                {
                    "role": role,
                    "content": content,
                    "message_id": message_id,
                    "created_at": message.created_at.isoformat(),
                }
            )
            remaining_tokens -= token_estimate
            remaining_messages -= 1
            reserved_tokens = 0
            reserved_messages = 0
            continue

        token_estimate = estimate_tokens(content)
        if remaining_messages - reserved_messages <= 0:
            omissions.append({"message_id": message_id, "reason": "budget"})
            continue
        if remaining_tokens - token_estimate < reserved_tokens:
            omissions.append({"message_id": message_id, "reason": "budget"})
            continue

        context_messages.append(
            {
                "role": role,
                "content": content,
                "message_id": message_id,
                "created_at": message.created_at.isoformat(),
            }
        )
        remaining_tokens -= token_estimate
        remaining_messages -= 1

    context_messages.reverse()

    return {
        "messages": context_messages,
        "budget": {"max_tokens_est": budget_tokens, "max_messages": max_messages},
        "omissions": omissions,
    }
