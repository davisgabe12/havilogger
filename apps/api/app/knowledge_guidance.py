from __future__ import annotations

from typing import Any, Dict, List

MILESTONE_FIELDS = ["gross_motor", "fine_motor", "language", "social"]

ACTIVITY_TRIGGERS = [
    "activity ideas",
    "play ideas",
    "what should we do",
    "any ideas",
    "what to do today",
    "activity suggestion",
    "play suggestion",
]

MILESTONE_TRIGGERS = [
    "what's next",
    "next milestone",
    "what to expect",
    "what comes next",
    "next steps",
    "what should we expect",
    "developmentally",
]

MILESTONE_NEXT_STEP_HINTS: Dict[str, Dict[str, str]] = {
    "gross_motor": {
        "rolling": "pulling to sit, scooting, or crawling may come next",
        "crawling": "pulling to stand and cruising along furniture is often next",
        "pulling_to_stand": "cruising edges and tentative steps usually follow",
        "cruising": "walking and more confident exploration is around the corner",
        "walking": "balancing, gentle running, and stair support are the next wins",
    },
    "fine_motor": {
        "grasping": "reaching for smaller toys and transferring objects back and forth",
        "pincer_grasp": "stacking blocks and unpacking toys become easier",
        "stacking_blocks": "scribbling, self-feeding with a spoon, or more precise play may arrive",
    },
    "language": {
        "cooing": "babbling or more intentional sounds usually follow",
        "babbling": "first words and repeated syllables are often next",
        "first_words": "two-word phrases and naming caregivers are common soon",
        "two_word_phrases": "short sentences and storytelling may arrive next",
    },
    "social": {
        "smiling": "interactive games and recognizing familiar faces usually follow",
        "stranger_anxiety": "comfort with new people and shared play may deepen",
        "interactive_play": "turn-taking, peekaboo, and imaginative play are often nearby",
    },
}


def apply_temperament_adjustments(reply: str, context: Dict[str, Any]) -> str:
    temperament = context.get("temperament") or {}
    adjustments: List[str] = []
    if temperament.get("sensitive"):
        adjustments.append("I'll keep transitions extra gentle and predictable for them.")
    if temperament.get("high_energy"):
        adjustments.append("Can we build in more gross-motor outlets to match that energy?")
    if temperament.get("cautious"):
        adjustments.append("I'll encourage slow introductions before new experiences.")
    if temperament.get("easygoing"):
        adjustments.append("Feel free to stay flexible; easygoing kids adapt quickly.")
    if temperament.get("strong_willed"):
        adjustments.append("I'll suggest gentle limits while still honoring their will.")
    if not adjustments:
        return reply
    return f"{reply} {' '.join(adjustments)}"


def apply_activity_suggestions(reply: str, context: Dict[str, Any]) -> str:
    message = (context.get("latest_message_lower") or "").lower()
    if not any(trigger in message for trigger in ACTIVITY_TRIGGERS):
        return reply
    activities = context.get("activities") or {}
    favorites = [act for act in (activities.get("favorite_activities") or []) if act]
    tags = [tag for tag in (activities.get("tags") or []) if tag]
    suggestions: List[str] = []
    if favorites:
        snippet = ", ".join(favorites[:2])
        suggestions.append(f"Since they love {snippet}, weave that into a short, predictable play break.")
    elif tags:
        snippet = ", ".join(tags[:2])
        suggestions.append(f"Looks like {snippet} suits them; lean on that for today's play.")
    milestone_hint = _activity_milestone_hint(context.get("milestones") or {})
    if milestone_hint:
        suggestions.append(milestone_hint)
    if not suggestions:
        return reply
    return f"{reply} {' '.join(suggestions)}"


def apply_milestone_context(reply: str, context: Dict[str, Any]) -> str:
    message = (context.get("latest_message_lower") or "").lower()
    if not any(trigger in message for trigger in MILESTONE_TRIGGERS):
        return reply
    milestones = context.get("milestones") or {}
    stage_labels = []
    for field in MILESTONE_FIELDS:
        value = milestones.get(field)
        if value:
            stage_labels.append(_format_stage_label(value))
    if not stage_labels:
        return reply
    stage_sentence = f"It sounds like your child is {', '.join(stage_labels)}."
    next_steps = _format_milestone_next_steps(milestones)
    if next_steps:
        stage_sentence += f" Next, you may notice {next_steps}."
    return f"{reply} {stage_sentence}"


def _activity_milestone_hint(milestones: Dict[str, Any]) -> str | None:
    gross_motor = milestones.get("gross_motor")
    if gross_motor in {"crawling", "pulling_to_stand", "cruising"}:
        return "Creeping, cruising, or gentle climbs pair well with their favorite activities."
    fine_motor = milestones.get("fine_motor")
    if fine_motor in {"pincer_grasp", "stacking_blocks"}:
        return "Fine-motor progress means short, hands-on projects can be satisfying."
    return None


def _format_milestone_next_steps(milestones: Dict[str, Any]) -> str:
    suggestions: List[str] = []
    for field, values in MILESTONE_NEXT_STEP_HINTS.items():
        current = milestones.get(field)
        if current and values.get(current):
            suggestions.append(values[current])
    return " and ".join(suggestions) if suggestions else ""


def _format_stage_label(value: str) -> str:
    return value.replace("_", " ")
