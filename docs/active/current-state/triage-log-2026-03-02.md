Status: current
Last updated: March 3, 2026

# Havi Bug Triage Log

This log is the staging source for Linear tickets when direct Linear integration is unavailable in-session.

## Ticket template

- Title:
- Severity: `P0` | `P1` | `P2` | `P3`
- Area: `auth` | `onboarding` | `chat` | `timeline` | `tasks` | `memory` | `deploy` | `docs`
- Repro steps:
- Expected:
- Actual:
- Hypotheses (ranked):
- Root cause:
- Fix summary:
- Tests added/run:
- Risks/follow-ups:
- Owner:
- Linear issue:

## TRIAGE-001: Guidance message misclassified as logging when no "?" (Fixed)

- Title: Implicit guidance prompts route to logging path
- Severity: `P1`
- Area: `chat`
- Repro steps:
  1. Open chat with an active child.
  2. Send: `what should i do if he is waking at night`
- Expected:
  - Guidance response with sleep advice.
  - No new activity log entry.
- Actual:
  - Message was treated as logging and got tracking-style reply.
  - Timeline received incorrect activity entry.
- Hypotheses (ranked):
  1. Question detector only recognized explicit `?` and narrow phrases.
  2. Sleep category detector missed `waking` phrasing.
- Root cause:
  - `_is_question` and `classify_question_category` in `apps/api/app/main.py` were too narrow.
- Fix summary:
  - Expanded implicit question phrase detection and question-leading verbs.
  - Expanded sleep category keywords to include `wake`, `waking`, and `night waking`.
- Tests added/run:
  - Added `apps/api/tests/test_question_detection.py` (3 tests).
  - Ran: `cd apps/api && ../../.venv/bin/pytest tests/test_question_detection.py -q` (pass).
- Risks/follow-ups:
  - Historical misclassified timeline records are not auto-corrected yet.
- Owner: CTO agent
- Linear issue: `SID-3` https://linear.app/diagonal-loop/issue/SID-3/harden-guidance-vs-tracking-intent-classification-and-reply

## TRIAGE-002: Historical misclassified timeline entries remain after intent fix

- Title: No remediation for previously misrouted guidance-as-activity events
- Severity: `P2`
- Area: `timeline`
- Repro steps:
  1. Trigger misclassification before fix (historical data).
  2. Apply routing fix and inspect timeline.
- Expected:
  - Incorrect historical events should be recoverable or editable.
- Actual:
  - Old wrong events remain as-is.
- Hypotheses (ranked):
  1. No migration/cleanup path exists for legacy bad entries.
  2. Timeline has no "convert/remove" user action tied to origin intent.
- Root cause:
  - System has prevention after fix but no backfill/correction workflow.
- Fix summary:
  - Not implemented yet.
- Tests added/run:
  - N/A
- Risks/follow-ups:
  - Caregiver trust risk if timeline shows advisory questions as activity events.
- Owner: unassigned
- Linear issue: `SID-4` https://linear.app/diagonal-loop/issue/SID-4/add-remediation-flow-for-historically-misclassified-timeline-events

## TRIAGE-003: Session cannot write directly to Linear despite user expectation

- Title: Linear integration unavailable in current Codex session
- Severity: `P2`
- Area: `deploy`
- Repro steps:
  1. Attempt to list MCP resources/templates for Linear.
  2. Attempt server-specific read with `server=\"linear\"`.
- Expected:
  - Available MCP server/resources for Linear issue creation.
- Actual:
  - `unknown MCP server 'linear'`, empty MCP resource lists.
- Hypotheses (ranked):
  1. Linear MCP connector not attached to this Codex session.
  2. Access update requires session restart/re-auth.
- Root cause:
  - Integration context unavailable to tools in this session.
- Fix summary:
  - Not implemented yet; requires environment integration fix.
- Tests added/run:
  - N/A
- Risks/follow-ups:
  - Issue tracking lag until connection is restored.
- Owner: unassigned
- Linear issue: pending (integration unavailable in session)

## TRIAGE-004: Launch auth risk when email confirmation is disabled

- Title: Launch-safe auth posture with confirm-email off
- Severity: `P1`
- Area: `deploy`
- Repro steps:
  1. Open Supabase auth settings.
  2. Verify `Confirm email` toggle is off.
- Expected:
  - Launch path remains low-friction while abuse controls are active.
- Actual:
  - Signup is frictionless but abuse controls are not yet fully verified in this run.
- Hypotheses (ranked):
  1. Growth-first auth config can be safe only with explicit rate limit and bot controls.
  2. Without abuse controls, disabled confirmation can attract automated signups.
- Root cause:
  - Current auth tradeoff favors speed; hardening controls need explicit implementation/verification.
- Fix summary:
  - Linear issue opened for launch controls and checklist gating.
- Tests added/run:
  - N/A
- Risks/follow-ups:
  - Abuse/spam risk on production signup until mitigations are active.
- Owner: unassigned
- Linear issue: `SID-5` https://linear.app/diagonal-loop/issue/SID-5/launch-safe-auth-posture-with-confirm-email-off-rate-limit-bot

## TRIAGE-005: Core guidance routing depended too much on explicit question detection (Fixed)

- Title: Guidance/advice statements without `?` could route through logging behavior
- Severity: `P1`
- Area: `chat`
- Repro steps:
  1. Send `my toddler hits sometimes` or similar advice-seeking statement without `?`.
  2. Observe response quality and routing.
- Expected:
  - Guidance-style response with behavior coaching.
  - No logging-style acknowledgement when user intent is advice.
- Actual:
  - Router and response path relied heavily on `_is_question`, so non-question phrasing could take logging path.
  - Composition path did not consistently use the richer guidance composer.
- Hypotheses (ranked):
  1. Routing gate used `is_question` as primary branch condition.
  2. Intent names were inconsistent (`log` vs `logging`) across code paths.
  3. Guidance composer path had latent NameError risk (`knowledge_pending_prompts` import missing).
- Root cause:
  - Branching in `capture_activity` used explicit question detection instead of intent-aware guidance routing.
  - Composition logic was partially bypassed and contained stale assumptions/imports.
- Fix summary:
  - Added `_should_route_to_guidance` to route by either explicit question or guidance-classified intent.
  - Standardized logging intent usage to `logging`.
  - Switched both logging and guidance response text generation to `build_assistant_message`.
  - Added missing `knowledge_pending_prompts` import and made composer avoid implicit fallback reads when `recent_actions` is explicitly provided.
  - Expanded router health/sleep intent keywords for aggression phrasing and stabilized chit-chat confidence to avoid fallback misclassification.
- Tests added/run:
  - Added `apps/api/tests/test_chat_routing_logic.py`.
  - Updated `apps/api/tests/test_assistant_message.py` and `apps/api/tests/test_router.py`.
  - Ran: `cd apps/api && ../../.venv/bin/pytest tests/test_chat_routing_logic.py tests/test_router.py tests/test_question_detection.py tests/test_assistant_message.py -q` (pass).
- Risks/follow-ups:
  - Several older integration tests still assume pre-auth endpoint access; they need dedicated harness migration.
- Owner: CTO agent
- Linear issue: pending (Linear not available in this session)

## TRIAGE-006: Local smoke false-negatives when Codex runtime blocks localhost bind

- Title: Local startup/smoke fails with EPERM bind errors in constrained runtime
- Severity: `P2`
- Area: `deploy`
- Repro steps:
  1. Run `./restart.sh` or `/Users/gabedavis/.codex/skills/havi-e2e-smoke/scripts/fast_start_smoke.sh` from constrained Codex runtime.
  2. Observe API/web startup behavior.
- Expected:
  - API binds to `127.0.0.1:8000` and web binds to `127.0.0.1:3001`.
  - Smoke checks return 200 for health/auth routes.
- Actual:
  - Runtime intermittently returns `operation not permitted` / `EPERM` when binding localhost ports.
  - Smoke checks report `000` even when app code is unchanged.
- Hypotheses (ranked):
  1. Runtime sandbox policy blocks bind/listen operations.
  2. Background process lifecycle in tooling creates false negatives for startup checks.
- Root cause:
  - Environment/runtime constraint, not a deterministic application logic regression.
- Fix summary:
  - Documented workaround in canonical runbooks:
    - run startup/smoke from normal terminal, or
    - rerun commands with elevated permissions.
- Tests added/run:
  - Ran multiple smoke/startup attempts and captured log signatures (`EPERM`, `operation not permitted`).
- Risks/follow-ups:
  - Can mask real regressions unless smoke is run in a known-good runtime.
- Owner: CTO agent
- Linear issue: pending

## TRIAGE-007: Webpack-specific build path no longer used (Mitigated)

- Title: Avoid webpack build path that fails with `MinifyPlugin is not a constructor`
- Severity: `P2`
- Area: `deploy`
- Repro steps:
  1. Run `cd apps/web && npm run build -- --webpack`.
- Expected:
  - Next.js production build succeeds.
- Actual:
  - Build fails with `TypeError: MinifyPlugin is not a constructor`.
- Hypotheses (ranked):
  1. Webpack/minifier plugin mismatch with current Next.js 16 toolchain.
  2. Lockfile or dependency skew across root/app lockfiles.
- Root cause:
  - Webpack-specific build path in current Next.js toolchain is unstable in this repo/runtime.
- Fix summary:
  - Removed forced webpack usage from local startup script (`apps/web/scripts/dev-safe.js`).
  - Updated canonical local runbook to use default Next 16 startup/build flow.
  - Validation now relies on `npm run build` (default `next build`) and route-level smoke checks.
- Tests added/run:
  - `cd apps/web && npm run build` (pass, run with elevated permissions in this session).
- Risks/follow-ups:
  - If a future workflow requires webpack build explicitly, this issue may recur and should be reopened.
- Owner: CTO agent
- Linear issue: pending

## TRIAGE-008: Production UI onboarding can stall even when backend family/child writes succeed

- Title: New signup can authenticate but app stays in "couldn’t verify your family" state and blocks chat send
- Severity: `P1`
- Area: `auth`
- Repro steps:
  1. Create new account on production (`/auth/sign-up`) and land on `/app`.
  2. Observe banner: `We couldn’t verify your family yet. Some data may be missing.`
  3. Attempt family onboarding (`/app/onboarding/family`) and child onboarding (`/app/onboarding/child`).
  4. UI buttons can remain in `Creating...` / `Saving...` with repeated `AbortError: signal is aborted without reason` console errors.
  5. Return to `/app` and send `Baby pooped at 3pm` -> blocked: `Select an active child before sending.`
- Expected:
  - Family + child onboarding completes, active child is selected, chat send works from UI.
- Actual:
  - UI remains blocked in no-active-child state despite successful auth.
- Hypotheses (ranked):
  1. Family guard async effect can continue after cleanup and still call `router.replace(...)`, causing stale redirects back into onboarding.
  2. Settings save path does not reliably rehydrate/select an active child from API response when child creation happens during setup.
  3. Onboarding pages depend on `apiFetch` chain and can surface `AbortError` without resilient recovery messaging.
- Root cause:
  - Confirmed frontend orchestration bugs:
    - Lifecycle race in `useFamilyGuard` allowed stale async runs to redirect.
    - Child-selection hydration after setup was brittle (id normalization + immediate active-child assignment gaps).
    - Onboarding requests needed explicit auth/family headers and stronger error handling for interrupted requests.
- Fix summary:
  - Hardened `useFamilyGuard` to prevent stale/unmounted runs from navigating.
  - Added child-id normalization + deterministic active-child selection helper and wired it into app settings hydration.
  - Updated onboarding family/child pages to use explicit auth/family headers and robust `AbortError` handling.
  - Added unit tests for id normalization and active-child selection helper.
- Tests added/run:
  - `cd apps/web && npm run build` (pass).
  - `HAVI_SMOKE_LABEL=after-sid60-hydration-20260303 ./scripts/prod_core_smoke.sh` (pass).
  - `HAVI_SMOKE_LABEL=after-guard-racefix-20260303 ./scripts/prod_core_smoke.sh` (pass).
  - Production browser repro on March 3, 2026 still confirms issue on currently deployed build until this fix is deployed.
- Risks/follow-ups:
  - Deploy to production and rerun browser GREEN smoke; current production still reflects pre-fix frontend bundle.
- Owner: CTO agent
- Linear issue: `SID-60` https://linear.app/diagonal-loop/issue/SID-60/prod-onboarding-flow-stalls-before-active-child-selection-blocking

## TRIAGE-009: Onboarding should collect required profile data before core app

- Title: Require caregiver/child profile fields in onboarding and autofill shared values
- Severity: `P2`
- Area: `onboarding`
- Repro steps:
  1. New signup reaches `/app` with incomplete profile.
  2. User is redirected to settings fallback to complete required data.
  3. Optional field defaults (for example child last name) create incomplete profile states.
- Expected:
  - Onboarding itself should require key caregiver and child profile data before core app.
  - Shared fields should be autofilled where appropriate and editable.
- Actual:
  - Required data collection can be deferred into settings fallback and is less explicit.
- Hypotheses (ranked):
  1. Onboarding and settings responsibilities are blurred.
  2. Required-field policy is not enforced consistently at onboarding boundary.
- Root cause:
  - Product flow/design gap in onboarding sequencing and field requirements.
- Fix summary:
  - Logged requirement and acceptance criteria in Linear for implementation planning.
- Tests added/run:
  - N/A (requirements tracking issue).
- Risks/follow-ups:
  - Increased onboarding confusion and risk of incomplete family/child context at first chat.
- Owner: CTO agent
- Linear issue: `SID-61` https://linear.app/diagonal-loop/issue/SID-61/onboarding-collect-required-caregiverchild-profile-fields-before-core
