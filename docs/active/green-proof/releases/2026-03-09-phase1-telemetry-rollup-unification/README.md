# Release Proof Bundle: 2026-03-09 Phase1 Telemetry Rollup Unification

## Commit
- `0f08fd5` - Add production telemetry rollup, quality gates, and release evidence

## Scope
1. Added canonical production telemetry rollup module + script.
2. Unified quality report production telemetry math to shared rollup contract.
3. Added regression tests for rollup ingestion and telemetry persistence.
4. Updated Phase 1/master/docs for migration sequencing and live telemetry ops.

## Commands Run
1. `cd apps/api && ../../.venv/bin/pytest tests/test_router_openai_classifier.py tests/test_chat_routing_logic.py tests/test_chat_composition_hardening.py tests/test_golden_phase0_harness.py tests/test_golden_phase1_v2_harness.py tests/test_telemetry_rollup.py tests/test_chat_quality_report.py tests/test_route_telemetry_persistence.py -q`
2. `cd apps/api && ../../.venv/bin/pytest tests/test_golden_phase0_harness.py tests/test_golden_phase1_v2_harness.py -q`
3. `./.venv/bin/python scripts/chat_quality_report.py --golden-report /tmp/havi_phase0_golden_report.json --phase1-v2-report /tmp/havi_phase1_v2_golden_report.json --production-telemetry-report docs/active/plan/chat-production-telemetry-rollup-latest.json --green-pass`
4. `HAVI_SMOKE_LABEL=after-p1-f2-rollup-unification-20260309 ./scripts/prod_core_smoke.sh`
5. `HAVI_UI_SMOKE_LABEL=after-p1-f2-rollup-unification-20260309 ./scripts/prod_ui_smoke_gate.sh`
6. `/bin/bash -lc "cd /Users/gabedavis/Desktop/projects/havilogger/apps/web && PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green"`
7. `./.venv/bin/python scripts/production_chat_telemetry_rollup.py --window-hours 24 --fallback-production-report docs/active/green-proof/prod-core-smoke-after-p1-f2-rollup-unification-20260309.json`

## Pass/Fail Summary
- API targeted suite: PASS (`42 passed`)
- Phase0 + Phase1-v2 harness: PASS (`6 passed`)
- Production core smoke: PASS
- Production UI smoke gate (2 consecutive): PASS
- Production GREEN smoke: PASS (`1 passed`)
- Production telemetry rollup: WARN (low sample size, fallback source)

## Known Remaining Risk
- Migration was applied and rollup source is now `chat_route_telemetry`.
- Current blocker shifted to fallback-rate activation:
  - production fallback/skip rate is `1.0` (BLOCK) while OpenAI flags are pending activation.
  - flags were set (`ENABLE_OPENAI_INTENT_CLASSIFIER=1`, `ENABLE_OPENAI_GUIDANCE_COMPOSER=1`) but Railway deploys are currently paused by incident, so redeploy could not be completed.
