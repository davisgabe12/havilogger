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
- Canonical release gates run:
  - production core smoke: pass (`prod-core-smoke-after-ui-reliability-hotfix-20260310.json`)
  - production UI smoke gate (2 consecutive): pass on rerun after Playwright browser install (`prod-ui-smoke-after-ui-reliability-hotfix-20260310-rerun.json`)
- Additional GREEN regression was added to lock timed-task acknowledgment contract (`tomorrow at 4pm` should include due time in assistant reply).
- Direct production probe currently still returns old task acknowledgment text without due time, indicating API deploy propagation mismatch that remains in progress.
