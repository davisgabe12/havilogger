# UI Reliability Hotfix Pass (March 10, 2026)

## Scope
Targeted production-facing UX fixes for settings, auth/invite flow, chat composer/actions, feedback capture, task datetime handling, and guidance fallback behavior.

## Completed fixes
- Settings save affordance:
  - Disable top `Save changes` action when nothing changed.
  - Normalize unsaved-change comparisons (trim/date/number normalization) to reduce false positives.
- Caregiver optional field behavior:
  - `caregiver email` and `caregiver phone` are no longer treated as required profile-lock fields.
- Sign out affordances:
  - Added sign out action in desktop sidebar and mobile side tray.
  - Added sign out/switch-account affordance on auth screens when an active session exists.
- Invite acceptance flow:
  - Preserve invite token through auth redirect via `next` path.
  - On invite/account mismatch, show `Sign out and switch account` path.
- Chat composer alignment:
  - Bottom-align mic/send controls with composer box.
- Negative feedback UX:
  - Pressing Enter in thumbs-down text input now immediately submits feedback.
  - Added transient `Saved` state so users get acknowledgement.
- Share tooltip/link lifecycle:
  - Share link + copied indicator now auto-dismiss after timeout.
- Task datetime fidelity:
  - Improved due-date parser for relative phrases like `tomorrow at 4pm`.
  - Strips relative datetime phrases from task title.
  - Task confirmation now includes due time when parsed.
  - Task due label in UI now includes time when present.
- Guidance fallback hardening:
  - Added rolling-over milestone guidance so queries like `my baby is not rolling over` avoid generic fallback.

## Validation run
- Web unit/regression:
  - `cd apps/web && CI=1 ./node_modules/.bin/jest --runInBand --watch=false src/app/__tests__/app-layout.test.tsx src/components/chat/__tests__/message-feedback.test.tsx`
  - Result: PASS (2 suites, 23 tests)
- Web build/typecheck:
  - `cd apps/web && npm run build`
  - Result: PASS
- GREEN smoke (prod URL):
  - `cd apps/web && PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green`
  - Result: PASS (1 test)
- API targeted tests:
  - `cd apps/api && python3 -m pytest -q tests/test_task_helpers.py tests/test_message_fallbacks.py -k "extract_task_due_at_relative_day_with_time or extract_task_title_strips_relative_datetime_phrase or rolling_over_question_returns_guidance_not_fallback"`
  - Result: PASS (3 tests)
  - `cd apps/api && python3 -m pytest -q tests/test_task_helpers.py tests/test_message_fallbacks.py -k "task_ or rolling_over_question_returns_guidance_not_fallback"`
  - Result: PASS (9 tests, 5 deselected)
  - `cd apps/api && python3 -m pytest -q tests/test_invites.py`
  - Result: PASS (2 tests)
  - `cd apps/api && python3 -m pytest -q tests/test_chat_routing_logic.py`
  - Result: PASS (11 tests)

## Known test-environment caveat
- Full `tests/test_message_fallbacks.py` run in this local runtime still fails in pre-existing setup paths due `/api/v1/conversations` boot failure in existing fixtures; targeted new assertions pass.

## Deployment and production verification update (March 10, 2026)
- Commit `1cd946a` was pushed to `main`.
- Follow-up commit `94f9744` pushed to `main` with canonical deploy runbook hardening + GREEN regression updates.
- Canonical release gates run (final):
  - production core smoke: pass (`prod-core-smoke-after-ui-reliability-hotfix-20260310-final.json`)
  - production UI smoke gate (2 consecutive): pass (`prod-ui-smoke-after-ui-reliability-hotfix-20260310-final.json`)
  - updated GREEN smoke suite: pass
- Direct production probe now returns timed-task acknowledgment with due time (`for Mar 11 at 4:00 PM`), confirming API deploy propagation.

## Follow-on hardening (March 10, 2026)
- GREEN smoke now asserts feedback visual state persistence after thumbs-up/thumbs-down actions (`aria-pressed=true`).
- Production core smoke now includes explicit-time tracking parity check so `baby pooped at 3pm` must persist at 3pm local in action timestamp.
- Verified on production:
  - `PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green` -> pass
  - `HAVI_SMOKE_LABEL=after-prod-core-time-parity-guard-20260310d ./scripts/prod_core_smoke.sh` -> pass

## Deploy-loop prevention hardening (March 10, 2026)
- Added canonical release gate script:
  - `scripts/prod_release_gate.sh`
  - Runs production core smoke first, then UI gate, with bounded full-gate retry (`HAVI_UI_GATE_EXTRA_ATTEMPTS`, default `1`).
  - Writes machine-readable summary:
    - `docs/active/green-proof/prod-release-gate-<label>.json`
- Updated canonical runbooks so release validation defaults to the single command:
  - `HAVI_RELEASE_LABEL=<label> ./scripts/prod_release_gate.sh`
- Production validation run:
  - `HAVI_RELEASE_LABEL=post-loop-guard-release-gate-20260310 ./scripts/prod_release_gate.sh`
  - Result: PASS
  - Release proof bundle:
    - `docs/active/green-proof/releases/2026-03-10-release-gate-hardening/`

## Feedback reliability compatibility fix (March 10, 2026)
- Root cause discovered during production gate:
  - feedback save returned `400` with Postgres code `42P10` (`no unique or exclusion constraint matching ON CONFLICT`) on environments without the expected `message_feedback` unique constraint shape.
- Fixes shipped:
  - API feedback route now attempts atomic upsert first and automatically falls back to legacy select/update/insert when `42P10` is encountered.
  - Feedback payload no longer sends `session_id` from the web client for authenticated feedback saves.
  - GREEN smoke feedback assertion now validates eventual successful save with retry awareness, while still failing when no `200` is observed.
- Production validation run:
  - `HAVI_RELEASE_LABEL=after-feedback-compat-fix-20260310 ./scripts/prod_release_gate.sh`
  - Result: PASS
  - Release proof bundle:
    - `docs/active/green-proof/releases/2026-03-10-feedback-reliability-compat-fix/`

## Closeout gate rerun and current blocker (March 10, 2026)
- Commands run:
  - `./scripts/prod_api_deploy_wait.sh`
  - `HAVI_RELEASE_LABEL=closeout-feedback-e2e-20260310 ./scripts/prod_release_gate.sh`
- Deploy guard result:
  - PASS on deployment `66362cc5-e553-49b0-b4e7-377a89e63e9a`
  - metadata: `provider=python`, `config=railway.toml`
- Release gate result:
  - Core smoke: PASS
    - `docs/active/green-proof/prod-core-smoke-closeout-feedback-e2e-20260310.json`
  - UI gate: FAIL (both attempts)
    - `docs/active/green-proof/prod-ui-smoke-closeout-feedback-e2e-20260310-ui-gate-1.json`
    - `docs/active/green-proof/prod-ui-smoke-closeout-feedback-e2e-20260310-ui-gate-2.json`
  - Failure signature:
    - `App core not ready. Current URL: https://gethavi.com/auth/sign-in`
    - thrown at invitee readiness step in `apps/web/tests/smoke/green.smoke.spec.ts` after invite flow.
- Conclusion:
  - Feedback save reliability is not the active blocker in this rerun.
  - Invite acceptance/auth-return readiness is the blocking production UI gate issue.
