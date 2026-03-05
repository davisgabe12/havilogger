"""OpenAI integration for transforming free-form text into structured actions."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from openai import APIError, OpenAI

from .config import CONFIG
from .schemas import Action, ActionMetadata, CoreActionType

logger = logging.getLogger(__name__)

client = OpenAI(api_key=CONFIG.openai_api_key)
USE_RESPONSES_API = bool(os.getenv("ENABLE_OPENAI_RESPONSES")) and bool(getattr(client, "responses", None))

_ACTION_TYPE_ALIASES = {
    "feed": CoreActionType.ACTIVITY.value,
    "feeding": CoreActionType.ACTIVITY.value,
    "ate": CoreActionType.ACTIVITY.value,
    "eat": CoreActionType.ACTIVITY.value,
    "food": CoreActionType.ACTIVITY.value,
    "bottle": CoreActionType.ACTIVITY.value,
}

SYSTEM_PROMPT = """
You are Havi—an on-call pediatric nurse with Ritz-Carlton 10/5-star hospitality.
Mission clarity: lighten caregiver mental load by logging flawlessly, surfacing insights, explaining what’s ahead, coordinating among caregivers, and anticipating needs before parents ask. Become the easiest, most natural way to capture each day while saving time and delivering better outcomes for the baby and family.

[1] Priority Stack
  1. Produce valid JSON that matches the schema—no prose outside the JSON.
  2. Confirm what you logged in warm, concise language (“Done—logged both diapers from 2 and 4 pm.”).
  3. Offer at most one optional follow-up that adds value (never interrogative, never more than one question). If context is thin, explain why extra detail helps (“Tiny details teach me what works so I can suggest better ideas.”).
  4. Capture preferences, routines, or inferred insights in metadata.extra using clear keys ({"sibling_name": "Noah"}).

[2] Tone + Style
  - Hospitality-first: calm, friendly, anticipatory, always reducing mental load.
  - Celebrate effort (“Busy night—hope you get a little rest.”).
  - Avoid filler (“gathering that,” “just checking in”). Never interrogate.
  - When uncertain, share assumptions and invite corrections.

[3] Logging & Inference Rules
  - Split batch inputs into separate actions with inferred timestamps (“1am diaper, 3am feed…”).
  - Classify “blowout” as dirty diaper; if details unclear, ask only one clarifying question.
  - Normalize obvious typos (ox → oz).
  - Store inferred defaults (e.g., “assumed 30‑min nursing, both sides”) in metadata.extra until confirmed.
  - Always infer timestamps (“just now” → current time) and mark timezone assumptions in metadata.extra.
  - Use recent history: if multiple nighttime events, acknowledge it (“Busy night!”).

[4] Follow-Up Discipline
  - Only one question max per reply, optional and value-based (“Want me to watch the next diaper window?”).
  - Skip questions for symptoms unless user explicitly asks; focus on safety guidance (“If you notice trouble breathing…”).
  - When context is thin or early in relationship, explain why details help (“Even small notes teach me what soothes Lev.”).

[5] Development & Expectations
  - Use adjusted age (due vs birth) to explain milestones; cite CDC, AAP/APA, Huckleberry, Moms on Call when sharing expectations.
  - Tie milestone guidance to recent logs (“since naps stretched yesterday…”).
  - If critical profile data is missing (DOB, gender, weights), politely ask for it so personalization improves.

[6] Catch-Up Mode
  - When user wants to “log the day and catch up,” acknowledge last known event and invite entries (“Last log: diaper at 3:40 PM—share updates when ready.”).
  - Confirm after each batch before saving.

[7] Routines
  - Do not suggest saving a routine after a single event.
  - Reference well-known frameworks (Moms on Call, Happiest Baby, APA) when prompting routine setup.
  - When milestones shift, ask if routine should adjust (“Lev is nearing a new stage—want me to update the routine?”).

[8] Feeding Heuristics
  - Track last 3–5 feed entries: if ≥70% share method (breast, bottle, combo), assume that method and avoid asking.
  - If unclear/inconsistent, log the event then ask once (“Was this breast, bottle, or combo? I can track more accurately once I know.”).

[9] Symptom Logging
  - For symptoms (cough, fever, rash, etc.), log the event and share safety guidance (“If you notice labored breathing or symptoms lasting several days, reach out to your pediatrician.”).
  - Do not mix routine/behavior follow-ups in the same turn unless user explicitly asks.

[10] Output & Metadata
  - Populate metadata fields (amount_value, sleep_location, etc.) whenever relevant; extra assumptions go into metadata.extra.
  - Preserve caregiver phrasing in note fields.
  - Whenever multiple instances are mentioned, create separate actions—even for the same type.

Return only JSON that matches the provided schema. Keep assistant_message warm, concise, and anticipatory, always aiming to reduce caregiver mental load.
"""
FALLBACK_PROMPT_SUFFIX = "\nReturn ONLY valid JSON that matches the schema. Do not wrap it in markdown fences."

INTENT_CLASSIFIER_PROMPT = """
You classify a caregiver message into one intent label.
Return JSON only with this schema:
{
  "intent": string,
  "confidence": number between 0 and 1,
  "reason": string
}
Rules:
1) intent must be exactly one of the provided allowed intents.
2) choose the single best intent for this message.
3) confidence reflects certainty in the chosen intent.
4) no markdown, no extra keys.
"""

GUIDANCE_COMPOSER_PROMPT = """
You are HAVI, a pediatric guidance assistant.
Write practical caregiver guidance in concise Markdown.

Output contract:
1) Start with a short normalization/evidence sentence.
2) Include 3-5 concrete action steps as a numbered list.
3) Include a short "What not to do" section.
4) Include a short reusable script parents can say.
5) Ask at most 2 targeted follow-up questions.

Safety:
- Do not provide medical diagnosis.
- Escalate to pediatrician/urgent care when red-flag symptoms are present.
- Avoid certainty claims when context is incomplete.
"""


def _json_schema() -> Dict[str, Any]:
    return {
        "name": "activity_log_schema",
        "schema": {
            "type": "object",
            "properties": {
                "actions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": [
                            "action_type",
                            "timestamp",
                            "note",
                            "metadata",
                            "is_core_action",
                        ],
                        "properties": {
                            "action_type": {
                                "type": "string",
                                "enum": [value.value for value in CoreActionType],
                            },
                            "timestamp": {
                                "type": "string",
                                "description": "ISO 8601 timestamp with timezone",
                            },
                            "note": {"type": ["string", "null"]},
                            "metadata": {
                                "type": "object",
                                "properties": {
                                    "amount_value": {"type": ["number", "null"]},
                                    "amount_unit": {"type": ["string", "null"]},
                                    "substance": {"type": ["string", "null"]},
                                    "measurement_type": {"type": ["string", "null"]},
                                    "measurement_unit": {"type": ["string", "null"]},
                                    "duration_minutes": {"type": ["number", "null"]},
                                    "outcome": {"type": ["string", "null"]},
                                    "sleep_type": {"type": ["string", "null"]},
                                    "sleep_start_mood": {"type": ["string", "null"]},
                                    "sleep_end_mood": {"type": ["string", "null"]},
                                    "sleep_location": {"type": ["string", "null"]},
                                    "sleep_method": {"type": ["string", "null"]},
                                    "stage_context": {"type": ["string", "null"]},
                                    "extra": {"type": "object", "additionalProperties": True},
                                },
                                "additionalProperties": False,
                                "required": [
                                    "amount_value",
                                    "amount_unit",
                                    "substance",
                                    "measurement_type",
                                    "measurement_unit",
                                    "duration_minutes",
                                    "outcome",
                                    "sleep_type",
                                    "sleep_start_mood",
                                    "sleep_end_mood",
                                    "sleep_location",
                                    "sleep_method",
                                    "stage_context",
                                    "extra",
                                ],
                            },
                            "is_core_action": {"type": "boolean"},
                            "custom_action_label": {"type": ["string", "null"]},
                        },
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["actions"],
            "additionalProperties": False,
        },
    }


def _parse_timestamp(timestamp_str: str) -> datetime:
    ts = timestamp_str.strip()
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    return datetime.fromisoformat(ts)


def _coerce_action(action: Dict[str, Any]) -> Action:
    metadata = action.get("metadata", {})
    parsed_timestamp = _parse_timestamp(action["timestamp"])
    raw_type = action.get("action_type", "")
    action_type_value = _ACTION_TYPE_ALIASES.get(raw_type.lower().strip(), raw_type)
    custom_label = action.get("custom_action_label")
    try:
        core_type = CoreActionType(action_type_value)
    except ValueError:
        core_type = CoreActionType.CUSTOM
        if not custom_label:
            custom_label = raw_type or "custom"
    return Action(
        action_type=core_type,
        timestamp=parsed_timestamp,
        note=action.get("note"),
        metadata=ActionMetadata(**metadata),
        is_core_action=action.get("is_core_action", True),
        custom_action_label=custom_label,
    )


def _build_context_system_message(context: Optional[Dict[str, Any]]) -> Optional[Dict[str, str]]:
    if not context:
        return None
    payload = {
        "role": "system",
        "content": (
            "Here is known context about the child. "
            "You MUST incorporate these details into guidance where relevant:\n\n"
            f"{json.dumps(context, ensure_ascii=False, indent=2)}"
        ),
    }
    return payload


def _normalize_context_messages(
    context_messages: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, str]]:
    if not context_messages:
        return []
    normalized: List[Dict[str, str]] = []
    for message in context_messages:
        role = message.get("role")
        content = message.get("content")
        if role not in {"user", "assistant", "system"}:
            continue
        if not isinstance(content, str):
            continue
        normalized.append({"role": role, "content": content})
    return normalized


def _call_chat_completions(
    message: str,
    context: Optional[Dict[str, Any]] = None,
    context_messages: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Fallback for SDK builds lacking the Responses API."""
    system_prompt = SYSTEM_PROMPT + FALLBACK_PROMPT_SUFFIX
    try:
        context_message = _build_context_system_message(context)
        message_list = [{"role": "system", "content": system_prompt}]
        if context_message:
            message_list.append(context_message)
        normalized_context_messages = _normalize_context_messages(context_messages)
        if normalized_context_messages:
            message_list.extend(normalized_context_messages)
        else:
            message_list.append({"role": "user", "content": message})
        response = client.chat.completions.create(
            model=CONFIG.openai_model,
            messages=message_list,
            temperature=0.2,
            response_format={"type": "json_schema", "json_schema": _json_schema()},
        )
    except APIError as exc:
        logger.exception("OpenAI chat API failed, falling back to stub", exc_info=exc)
        return _stub_response("Chat completions stub")

    try:
        raw_content = response.choices[0].message.content or ""
    except (AttributeError, IndexError, KeyError) as exc:
        logger.exception("Unexpected OpenAI response format, falling back to stub", exc_info=exc)
        return _stub_response("Chat completions stub")

    try:
        return _parse_json_payload(raw_content)
    except json.JSONDecodeError as exc:
        logger.exception("Failed to parse OpenAI JSON payload, falling back to stub", exc_info=exc)
        return _stub_response("Chat completions stub")


def _stub_response(note: str = "Responses API stub") -> Dict[str, Any]:
    now = datetime.utcnow().isoformat()
    stub_action = {
        "action_type": CoreActionType.CUSTOM.value,
        "timestamp": now,
        "note": note,
        "metadata": {
            "amount_value": None,
            "amount_unit": None,
            "substance": None,
            "measurement_type": None,
            "measurement_unit": None,
            "duration_minutes": None,
            "outcome": None,
            "sleep_type": None,
            "sleep_start_mood": None,
            "sleep_end_mood": None,
            "sleep_location": None,
            "sleep_method": None,
            "stage_context": None,
            "extra": {},
        },
        "is_core_action": False,
    }
    return {"actions": [stub_action]}


def _call_responses_api(
    message: str, context_messages: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    return _stub_response("Responses API stub")


def _parse_json_payload(raw_content: Any) -> Dict[str, Any]:
    if isinstance(raw_content, str):
        content = raw_content
    else:
        chunks = []
        for part in raw_content:
            text = getattr(part, "text", None)
            if text is None and isinstance(part, dict):
                text = part.get("text")
            if text:
                chunks.append(text)
        content = "".join(chunks)
    content = content.strip().strip("`")
    return json.loads(content)


def _openai_intent_classifier_enabled() -> bool:
    return os.getenv("ENABLE_OPENAI_INTENT_CLASSIFIER", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _openai_guidance_composer_enabled() -> bool:
    return os.getenv("ENABLE_OPENAI_GUIDANCE_COMPOSER", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _extract_text_content(raw_content: Any) -> str:
    if isinstance(raw_content, str):
        return raw_content.strip()
    chunks = []
    for part in raw_content:
        text = getattr(part, "text", None)
        if text is None and isinstance(part, dict):
            text = part.get("text")
        if text:
            chunks.append(text)
    return "".join(chunks).strip()


def classify_intent_with_openai(
    message: str,
    *,
    allowed_intents: List[str],
) -> Optional[Dict[str, Any]]:
    if not _openai_intent_classifier_enabled():
        return None
    text = (message or "").strip()
    if not text:
        return None

    try:
        response = client.chat.completions.create(
            model=CONFIG.openai_model,
            messages=[
                {"role": "system", "content": INTENT_CLASSIFIER_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"message": text, "allowed_intents": allowed_intents},
                        ensure_ascii=False,
                    ),
                },
            ],
            temperature=0,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "intent_classifier_schema",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "intent": {"type": "string", "enum": allowed_intents},
                            "confidence": {"type": "number"},
                            "reason": {"type": "string"},
                        },
                        "required": ["intent", "confidence", "reason"],
                        "additionalProperties": False,
                    },
                },
            },
        )
    except APIError as exc:
        logger.warning("OpenAI intent classifier failed; falling back to rules", exc_info=exc)
        return None
    except Exception as exc:
        logger.warning("Unexpected classifier error; falling back to rules", exc_info=exc)
        return None

    try:
        raw_content = response.choices[0].message.content or ""
    except (AttributeError, IndexError, KeyError) as exc:
        logger.warning("Unexpected classifier response shape; falling back", exc_info=exc)
        return None

    try:
        parsed = _parse_json_payload(raw_content)
    except json.JSONDecodeError as exc:
        logger.warning("Classifier payload parse failed; falling back", exc_info=exc)
        return None

    intent = str(parsed.get("intent") or "").strip()
    if intent not in allowed_intents:
        return None
    confidence = parsed.get("confidence")
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = 0.0
    reason = str(parsed.get("reason") or "model classifier")
    return {
        "intent": intent,
        "confidence": max(0.0, min(1.0, confidence_value)),
        "reason": reason,
    }


def compose_guidance_with_openai(
    message: str,
    *,
    child_context: Optional[Dict[str, Any]] = None,
    question_category: Optional[str] = None,
    symptom_tags: Optional[List[str]] = None,
) -> Optional[str]:
    if not _openai_guidance_composer_enabled():
        return None

    text = (message or "").strip()
    if not text:
        return None

    prompt_payload = {
        "message": text,
        "question_category": question_category or "generic",
        "symptom_tags": symptom_tags or [],
        "child_context": child_context or {},
    }
    try:
        response = client.chat.completions.create(
            model=CONFIG.openai_model,
            messages=[
                {"role": "system", "content": GUIDANCE_COMPOSER_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(prompt_payload, ensure_ascii=False),
                },
            ],
            temperature=0.2,
        )
    except APIError as exc:
        logger.warning("OpenAI guidance composer failed; falling back", exc_info=exc)
        return None
    except Exception as exc:
        logger.warning("Unexpected guidance composer failure; falling back", exc_info=exc)
        return None

    try:
        raw_content = response.choices[0].message.content or ""
    except (AttributeError, IndexError, KeyError) as exc:
        logger.warning("Unexpected guidance response shape; falling back", exc_info=exc)
        return None

    guidance_text = _extract_text_content(raw_content)
    return guidance_text or None


def generate_actions(
    message: str,
    *,
    knowledge_context: Optional[Dict[str, Any]] = None,
    context_messages: Optional[List[Dict[str, Any]]] = None,
) -> List[Action]:
    global USE_RESPONSES_API

    payload: Dict[str, Any] | None = None
    if USE_RESPONSES_API:
        try:
            payload = _call_responses_api(message, context_messages)
        except AttributeError:
            # SDK no longer exposes the Responses API; fall back permanently.
            USE_RESPONSES_API = False
        except RuntimeError as exc:
            raise exc

    if payload is None:
        payload = _call_chat_completions(
            message, knowledge_context, context_messages=context_messages
        )
    raw_actions = payload.get("actions", [])
    return [_coerce_action(item) for item in raw_actions]
