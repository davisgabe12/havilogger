from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

PRODUCTION_THRESHOLDS = {
    "route_disagreement_rate": 0.03,
    "fallback_or_skip_rate": 0.20,
    "telemetry_completeness_rate": 0.99,
}

DEFAULT_MIN_SAMPLE_SIZE = 50


@dataclass(frozen=True)
class Alarm:
    metric: str
    severity: str
    status: str
    value: float
    threshold: float
    comparator: str
    message: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "metric": self.metric,
            "severity": self.severity,
            "status": self.status,
            "value": self.value,
            "threshold": self.threshold,
            "comparator": self.comparator,
            "message": self.message,
        }


def _as_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed:  # NaN guard
        return None
    return parsed


def normalize_telemetry_row(row: Dict[str, Any]) -> Dict[str, Any]:
    route_metadata = row.get("route_metadata")
    if not isinstance(route_metadata, dict):
        response_metadata = row.get("response_metadata")
        if isinstance(response_metadata, dict):
            candidate = response_metadata.get("route_metadata")
            if isinstance(candidate, dict):
                route_metadata = candidate
    route_metadata = route_metadata or {}

    route_kind = str(row.get("route_kind") or route_metadata.get("route_kind") or "").strip()
    expected_route_kind = str(
        row.get("expected_route_kind") or route_metadata.get("expected_route_kind") or ""
    ).strip()
    decision_source = str(
        row.get("decision_source") or route_metadata.get("decision_source") or ""
    ).strip()
    classifier_intent = str(
        row.get("classifier_intent") or route_metadata.get("classifier_intent") or ""
    ).strip()

    confidence = _as_float(row.get("confidence"))
    if confidence is None:
        confidence = _as_float(route_metadata.get("confidence"))

    classifier_fallback_reason = str(
        row.get("classifier_fallback_reason")
        or route_metadata.get("classifier_fallback_reason")
        or ""
    ).strip()
    composer_fallback_reason = str(
        row.get("composer_fallback_reason")
        or route_metadata.get("composer_fallback_reason")
        or ""
    ).strip()

    ambiguous_eligible_raw = row.get("ambiguous_eligible")
    if ambiguous_eligible_raw is None:
        ambiguous_eligible = (
            decision_source == "model"
            or bool(classifier_fallback_reason)
            or bool(composer_fallback_reason)
        )
    else:
        ambiguous_eligible = bool(ambiguous_eligible_raw)

    fallback_signal = bool(classifier_fallback_reason or composer_fallback_reason)

    complete = all(
        [
            bool(route_kind),
            bool(decision_source),
            bool(classifier_intent),
            confidence is not None,
        ]
    )

    return {
        "route_kind": route_kind,
        "expected_route_kind": expected_route_kind,
        "decision_source": decision_source,
        "classifier_intent": classifier_intent,
        "confidence": confidence,
        "classifier_fallback_reason": classifier_fallback_reason,
        "composer_fallback_reason": composer_fallback_reason,
        "ambiguous_eligible": ambiguous_eligible,
        "fallback_signal": fallback_signal,
        "complete": complete,
        "created_at": row.get("created_at"),
    }


def build_telemetry_rollup(
    rows: Iterable[Dict[str, Any]],
    *,
    min_sample_size: int = DEFAULT_MIN_SAMPLE_SIZE,
    thresholds: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    threshold_values = dict(PRODUCTION_THRESHOLDS)
    if thresholds:
        threshold_values.update(thresholds)

    normalized = [normalize_telemetry_row(row) for row in rows]
    total_turns = len(normalized)

    comparable = [row for row in normalized if row.get("expected_route_kind")]
    mismatches = [
        row
        for row in comparable
        if str(row.get("route_kind") or "") != str(row.get("expected_route_kind") or "")
    ]

    ambiguous_eligible = [row for row in normalized if bool(row.get("ambiguous_eligible"))]
    fallback_count = sum(1 for row in ambiguous_eligible if bool(row.get("fallback_signal")))
    complete_count = sum(1 for row in normalized if bool(row.get("complete")))

    disagreement_rate = (len(mismatches) / len(comparable)) if comparable else 0.0
    fallback_rate = (fallback_count / len(ambiguous_eligible)) if ambiguous_eligible else 0.0
    completeness_rate = (complete_count / total_turns) if total_turns else 0.0

    route_distribution = dict(
        Counter(str(row.get("route_kind") or "unknown") for row in normalized)
    )
    decision_source_distribution = dict(
        Counter(str(row.get("decision_source") or "unknown") for row in normalized)
    )

    alarms: List[Alarm] = []

    def maybe_alarm_le(metric: str, value: float, threshold: float) -> None:
        if value <= threshold:
            return
        alarms.append(
            Alarm(
                metric=metric,
                severity="high",
                status="BLOCK",
                value=round(value, 4),
                threshold=threshold,
                comparator="<=",
                message=f"{metric} exceeded threshold ({value:.4f} > {threshold:.4f})",
            )
        )

    def maybe_alarm_ge(metric: str, value: float, threshold: float) -> None:
        if value >= threshold:
            return
        alarms.append(
            Alarm(
                metric=metric,
                severity="high",
                status="BLOCK",
                value=round(value, 4),
                threshold=threshold,
                comparator=">=",
                message=f"{metric} below threshold ({value:.4f} < {threshold:.4f})",
            )
        )

    maybe_alarm_le(
        "route_disagreement_rate",
        disagreement_rate,
        float(threshold_values["route_disagreement_rate"]),
    )
    maybe_alarm_le(
        "fallback_or_skip_rate",
        fallback_rate,
        float(threshold_values["fallback_or_skip_rate"]),
    )
    maybe_alarm_ge(
        "telemetry_completeness_rate",
        completeness_rate,
        float(threshold_values["telemetry_completeness_rate"]),
    )

    if total_turns < max(1, min_sample_size):
        alarms.append(
            Alarm(
                metric="sample_size",
                severity="medium",
                status="WARN",
                value=float(total_turns),
                threshold=float(min_sample_size),
                comparator=">=",
                message=(
                    f"Sample size is low ({total_turns}) for confident production conclusions "
                    f"(target >= {min_sample_size})."
                ),
            )
        )

    overall_status = "PASS"
    if any(alarm.status == "BLOCK" for alarm in alarms):
        overall_status = "BLOCK"
    elif alarms:
        overall_status = "WARN"

    return {
        "overall_status": overall_status,
        "total_turns": total_turns,
        "comparable_count": len(comparable),
        "mismatch_count": len(mismatches),
        "route_disagreement_rate": round(disagreement_rate, 4),
        "ambiguous_eligible_count": len(ambiguous_eligible),
        "fallback_or_skip_count": fallback_count,
        "fallback_or_skip_rate": round(fallback_rate, 4),
        "telemetry_complete_count": complete_count,
        "telemetry_completeness_rate": round(completeness_rate, 4),
        "route_distribution": route_distribution,
        "decision_source_distribution": decision_source_distribution,
        "thresholds": threshold_values,
        "alarms": [alarm.to_dict() for alarm in alarms],
    }
