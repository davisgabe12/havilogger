# Release: Phase 1 Telemetry Rollup Unification (March 9, 2026)

## User-facing change summary
- Chat quality monitoring now has a daily production telemetry rollup artifact with explicit alarms and status (`PASS/WARN/BLOCK`).
- Guidance quality reporting now uses one canonical telemetry threshold contract across scripts.
- Production smoke and GREEN evidence for this slice were refreshed after push to `main`.

## Why it matters
- Prevents drift between rollout metrics and release-quality reports.
- Makes production routing/fallback health visible every day with clear thresholds.
- Reduces risk of silent regressions in answer-first guidance behavior and route telemetry persistence.

## Validation status
- API targeted tests: PASS (`42 passed`)
- Phase0 + Phase1-v2 golden harness: PASS (`6 passed`)
- Production core smoke: PASS
- Production UI smoke gate (2 consecutive): PASS
- Production GREEN smoke (`PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green`): PASS
- Production telemetry rollup: WARN (low sample size; fallback source)

## Proof bundle
- `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-09-phase1-telemetry-rollup-unification/`

## Follow-up required
- Apply `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/supabase/012_chat_route_telemetry.sql` in production so rollups use full turn-level source (`chat_route_telemetry`) instead of sampled feedback metadata fallback.
