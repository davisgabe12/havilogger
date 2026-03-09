Status: current
Last updated: March 9, 2026

# Chat Production Telemetry Rollup

Use this runbook to generate a daily quality/alarm snapshot from production chat route telemetry.

## Objective

Track the live thresholds for:
1. `route_disagreement_rate` (target <= `0.03`)
2. `fallback_or_skip_rate` (target <= `0.20`)
3. `telemetry_completeness_rate` (target >= `0.99`)

## Command

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
./.venv/bin/python scripts/production_chat_telemetry_rollup.py --window-hours 24
```

Optional fallback input when live telemetry is unavailable:

```bash
./.venv/bin/python scripts/production_chat_telemetry_rollup.py \
  --window-hours 24 \
  --fallback-production-report docs/active/green-proof/prod-core-smoke-<label>.json
```

## Outputs

- JSON artifact:
  - `docs/active/plan/chat-production-telemetry-rollup-latest.json`
- Markdown summary:
  - `docs/active/plan/chat-production-telemetry-rollup-latest.md`

## Data-source precedence

1. `chat_route_telemetry` table (preferred; full turn-level live source)
2. `message_feedback.response_metadata.route_metadata` (fallback sample)
3. local fallback production report (emergency fallback only)

## Alarm format

Each alarm contains:
- `metric`
- `status` (`WARN` / `BLOCK`)
- `severity`
- `value`
- `threshold`
- `comparator`
- `message`

Overall report status:
- `PASS`: no alarms
- `WARN`: warnings only (for example, low sample size)
- `BLOCK`: at least one threshold breach

## Deployment dependency

To enable source #1, apply:
- `docs/canonical/supabase/012_chat_route_telemetry.sql`

Without this migration, rollups are feedback-sampled and can produce low-sample warnings.
