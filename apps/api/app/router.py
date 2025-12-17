from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List


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


def classify_intent(message: str) -> IntentResult:
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

    time_hint = bool(re.search(r"\b\d{1,2}\s*(am|pm)\b|\b\d{1,2}:\d{2}\b", lower))
    feeding_hint = any(word in lower for word in ["bottle", "feed", "feeding", "formula", "nursed", "nursing"])
    diaper_hint = any(word in lower for word in ["diaper", "poop", "pee", "dirty", "wet", "change"])
    sleep_hint = any(word in lower for word in ["nap", "slept", "woke"])
    oz_hint = "oz" in lower and (feeding_hint or time_hint)
    logging_hint = any(
        word in lower
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

    task_phrase = any(
        phrase in lower for phrase in ["remind me", "don't forget", "dont forget", "to-do", "todo"]
    )
    explicit_task = bool(re.search(r"\btask[s]?\b", lower))
    need_to = bool(re.search(r"\bi need to\b", lower))
    logging_signals = logging_hint or oz_hint or feeding_hint or diaper_hint or (time_hint and (feeding_hint or diaper_hint or sleep_hint))
    if task_phrase:
        return add("reminder/todo phrasing", "task_request", 0.92)
    if (explicit_task or need_to) and not logging_signals:
        return add("task wording without logging signals", "task_request", 0.78)

    # Logging: require stronger hints (time/feeding/diaper).
    if logging_hint or oz_hint or feeding_hint or diaper_hint or (time_hint and (feeding_hint or diaper_hint or sleep_hint)):
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
        return add("small talk", "chit_chat", 0.45)

    # Fallback
    return IntentResult("general_parenting_advice", 0.35, ["fallback"])
