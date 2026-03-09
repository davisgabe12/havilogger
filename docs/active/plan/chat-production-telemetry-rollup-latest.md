# Production Chat Telemetry Rollup

- Generated at: `2026-03-09T17:20:19Z`
- Window: last `24` hours
- Source: `message_feedback.route_metadata`
- Rows analyzed: `4`
- Overall status: `WARN`

## Metrics

- `route_disagreement_rate`: `0.0` (threshold <= `0.03`)
- `fallback_or_skip_rate`: `0.0` (threshold <= `0.2`)
- `telemetry_completeness_rate`: `1.0` (threshold >= `0.99`)

## Alarms

- [WARN/medium] sample_size: Sample size is low (4) for confident production conclusions (target >= 50).

## Notes

- chat_route_telemetry unavailable: 404: Supabase select failed (table=chat_route_telemetry): status=404, body={"code":"PGRST205","details":null,"hint":"Perhaps you meant the table 'public.routine_metrics'","message":"Could not find the table 'public.chat_route_telemetry' in the schema cache"}
