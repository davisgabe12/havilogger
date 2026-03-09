# Release Proof: Phase1-v2 + A2b/F2/D2

## Commits
- `3ce3070` - Phase1-v2 golden guidance gates and orchestrator telemetry cleanup
- `47b69cd` - GREEN smoke stabilization (wait by `assistant_message_id`)

## Commands Run
1. API gates:
- `cd apps/api && ../../.venv/bin/pytest tests/test_router_openai_classifier.py tests/test_feedback_route_supabase.py tests/test_chat_routing_logic.py tests/test_chat_composition_hardening.py tests/test_assistant_message.py tests/test_golden_phase0_harness.py tests/test_golden_phase1_v2_harness.py -q`
- Result: `37 passed`

2. Production health:
- `curl -I https://gethavi.com`
- `curl -s -o /dev/null -w "%{http_code}\n" https://api-production-0a5d.up.railway.app/health`
- Result: `200` for web and API health.

3. Production core smoke:
- `./scripts/prod_core_smoke.sh`
- Result: pass, report at `prod-core-smoke-manual-20260309085057.json`.

4. Production UI smoke gate (2 consecutive):
- `./scripts/prod_ui_smoke_gate.sh`
- Initial run failed (`manual-20260309090810`) due chat-message render wait timing.
- After GREEN wait hardening + deploy, rerun passed (`manual-20260309091254`) with 2/2 consecutive passes.

5. Quality report regeneration:
- `./.venv/bin/python scripts/chat_quality_report.py --golden-report /tmp/havi_phase0_golden_report.json --phase1-v2-report /tmp/havi_phase1_v2_golden_report.json --production-telemetry-report docs/active/green-proof/prod-core-smoke-manual-20260309085057.json --green-pass`
- Result: phase1_v2 and production telemetry threshold verdicts are `PASS`.

## Evidence Files
- `prod-core-smoke-manual-20260309085057.json`
- `prod-ui-smoke-manual-20260309091254.json`
- `prod-ui-run-1.log`
- `prod-ui-run-2.log`
- `chat-quality-report.json`
- `screenshot-homepage.png`
- `screenshot-sign-in.png`
- `screenshot-sign-up.png`

## Caveats
- One pre-fix production UI gate attempt failed before commit `47b69cd`; final gate status is based on the post-fix passing run (`manual-20260309091254`).
