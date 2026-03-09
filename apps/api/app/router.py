from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from typing import List, Optional

from .openai_client import classify_intent_with_openai


@dataclass
class IntentResult:
    intent: str
    confidence: float
    reasons: List[str]


INTENTS = {
    "logging",
    "saving",
    "task_request",
    "milestone_expectations",
    "activity_request",
    "health_sleep_question",
    "general_parenting_advice",
    "chit_chat",
}


def has_logging_signals(message: str) -> bool:
    text = (message or "").strip().lower()
    if not text:
        return False
    time_hint = bool(re.search(r"\b\d{1,2}\s*(am|pm)\b|\b\d{1,2}:\d{2}\b", text))
    feeding_hint = any(
        word in text
        for word in ["bottle", "feed", "feeding", "formula", "nursed", "nursing"]
    )
    diaper_hint = any(
        word in text for word in ["diaper", "poop", "pee", "dirty", "wet", "change"]
    )
    sleep_hint = any(word in text for word in ["nap", "slept", "woke"])
    oz_hint = "oz" in text and (feeding_hint or time_hint)
    logging_hint = any(
        word in text
        for word in [
            "log",
            "logged",
            "record",
            "track",
            "medicine",
            "med",
            "dose",
            "spit up",
        ]
    )
    return (
        logging_hint
        or oz_hint
        or feeding_hint
        or diaper_hint
        or (time_hint and (feeding_hint or diaper_hint or sleep_hint))
    )


def classify_intent(message: str) -> IntentResult:
    rule_result = _classify_intent_rules(message)
    should_try_model, skip_reason, rollout_pct = _should_try_model_classifier(
        message,
        rule_result,
    )
    if not should_try_model:
        reasons = list(rule_result.reasons)
        if skip_reason:
            reasons.append(f"model_skipped:{skip_reason}")
        reasons.append(f"model_rollout_pct:{rollout_pct:.1f}")
        return IntentResult(rule_result.intent, rule_result.confidence, reasons)

    reasons_base = list(rule_result.reasons)
    reasons_base.append(f"model_rollout_pct:{rollout_pct:.1f}")

    model_result = classify_intent_with_openai(
        message,
        allowed_intents=sorted(INTENTS),
    )
    if not model_result:
        reasons_base.append("model_fallback:model_unavailable")
        return IntentResult(rule_result.intent, rule_result.confidence, reasons_base)

    model_intent = str(model_result.get("intent") or "").strip()
    model_confidence = float(model_result.get("confidence") or 0.0)
    if model_intent not in INTENTS:
        reasons_base.append("model_fallback:invalid_intent")
        return IntentResult(rule_result.intent, rule_result.confidence, reasons_base)
    threshold = _model_override_threshold()
    if model_confidence < threshold:
        reasons_base.append(
            f"model_fallback:below_threshold({model_confidence:.2f}<{threshold:.2f})"
        )
        return IntentResult(rule_result.intent, rule_result.confidence, reasons_base)

    reasons = reasons_base
    reasons.append(
        "openai_classifier_override"
        f" ({rule_result.intent} -> {model_intent})"
    )
    if model_result.get("reason"):
        reasons.append(f"openai_reason: {model_result['reason']}")
    return IntentResult(model_intent, model_confidence, reasons)


def classify_intent_rules_only(message: str) -> IntentResult:
    """Expose deterministic-only classification for telemetry baselines."""
    return _classify_intent_rules(message)


def _should_try_model_classifier(
    message: str,
    rule_result: IntentResult,
) -> tuple[bool, Optional[str], float]:
    rollout_pct = _model_classifier_rollout_pct()
    text = (message or "").strip()
    if not text:
        return False, "empty_message", rollout_pct
    if rule_result.intent in {"saving", "task_request"} and rule_result.confidence >= 0.75:
        return False, "deterministic_high_confidence", rollout_pct
    if rule_result.intent == "logging" and rule_result.confidence >= 0.8:
        return False, "deterministic_logging", rollout_pct
    ambiguous = False
    if rule_result.intent == "general_parenting_advice" and rule_result.confidence <= 0.55:
        ambiguous = True
    elif rule_result.confidence < 0.6:
        ambiguous = True
    if not ambiguous:
        return False, "rule_confidence_sufficient", rollout_pct
    if not _is_in_rollout_bucket(text, rollout_pct):
        return False, "outside_rollout_bucket", rollout_pct
    return True, None, rollout_pct


def _model_classifier_rollout_pct() -> float:
    raw = os.getenv("OPENAI_INTENT_CLASSIFIER_TRAFFIC_PCT", "100").strip()
    try:
        value = float(raw)
    except ValueError:
        value = 100.0
    return max(0.0, min(100.0, value))


def _is_in_rollout_bucket(seed: str, rollout_pct: float) -> bool:
    if rollout_pct >= 100.0:
        return True
    if rollout_pct <= 0.0:
        return False
    digest = hashlib.sha256(seed.lower().strip().encode("utf-8")).hexdigest()
    bucket = int(digest[:8], 16) % 10000 / 100.0
    return bucket < rollout_pct


def _model_override_threshold() -> float:
    raw = os.getenv("OPENAI_INTENT_OVERRIDE_CONFIDENCE", "0.65").strip()
    try:
        value = float(raw)
    except ValueError:
        value = 0.65
    return max(0.0, min(1.0, value))


def _classify_intent_rules(message: str) -> IntentResult:
    text = (message or "").strip()
    lower = text.lower()
    reasons: List[str] = []
    if not text:
        return IntentResult("general_parenting_advice", 0.1, ["empty message"])

    def add(reason: str, intent: str, confidence: float) -> IntentResult:
        reasons.append(reason)
        if confidence < 0.5 and intent != "general_parenting_advice":
            return IntentResult("general_parenting_advice", 0.35, reasons + ["fell back due to low confidence"])
        return IntentResult(intent, confidence, reasons)

    # Precedence: saving > logging > health_sleep > milestone > activity > general > chit_chat

    # Explicit saving verbs always win.
    if re.search(r"\b(save|remember|note|keep track|keep this|save this)\b", lower):
        return add("saving verb detected", "saving", 0.95)

    task_phrase = any(
        phrase in lower for phrase in ["remind me", "don't forget", "dont forget", "to-do", "todo"]
    )
    explicit_task = bool(re.search(r"\btask[s]?\b", lower))
    need_to = bool(re.search(r"\bi need to\b", lower))
    logging_signals = has_logging_signals(text)
    if task_phrase:
        return add("reminder/todo phrasing", "task_request", 0.92)
    if (explicit_task or need_to) and not logging_signals:
        return add("task wording without logging signals", "task_request", 0.78)

    # Logging: require stronger hints (time/feeding/diaper).
    if logging_signals:
        return add("logging keywords/time context", "logging", 0.82)

    # Health / sleep
    if any(
        phrase in lower
        for phrase in [
            "won't sleep",
            "won’t sleep",
            "settle",
            "sleep train",
            "sleep schedule",
            "fever",
            "cough",
            "rash",
            "sick",
            "ill",
            "vomit",
            "spit up",
            "doctor",
            "pediatrician",
            "hitting",
            "hits",
            "smack",
            "slap",
            "kick",
        ]
    ):
        return add("health/sleep keyword", "health_sleep_question", 0.84)

    # Milestones / development (require explicit phrasing).
    if any(
        phrase in lower
        for phrase in [
            "milestone",
            "milestones",
            "development",
            "developing",
            "what to expect",
            "is it normal",
        ]
    ):
        return add("development/milestone phrasing", "milestone_expectations", 0.76)

    # Activity requests
    if any(phrase in lower for phrase in ["activity", "activities", "ideas", "play", "game", "craft"]):
        return add("activity request keywords", "activity_request", 0.7)

    # General advice
    if "should we" in lower or "what should" in lower or "advice" in lower:
        return add("advice phrasing", "general_parenting_advice", 0.55)

    # Chit chat / thanks
    if any(phrase in lower for phrase in ["lol", "thanks", "thank you", "haha", "hi", "hello", "ok thanks"]):
        return add("small talk", "chit_chat", 0.55)

    # Fallback
    return IntentResult("general_parenting_advice", 0.35, ["fallback"])
