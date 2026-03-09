# Production Chat Telemetry Rollup

- Generated at: `2026-03-09T22:21:34Z`
- Window: last `24` hours
- Source: `chat_route_telemetry`
- Rows analyzed: `7`
- Overall status: `BLOCK`

## Metrics

- `route_disagreement_rate`: `0.0` (threshold <= `0.03`)
- `fallback_or_skip_rate`: `1.0` (threshold <= `0.2`)
- `telemetry_completeness_rate`: `1.0` (threshold >= `0.99`)

## Alarms

- [BLOCK/high] fallback_or_skip_rate: fallback_or_skip_rate exceeded threshold (1.0000 > 0.2000)
- [WARN/medium] sample_size: Sample size is low (7) for confident production conclusions (target >= 50).
