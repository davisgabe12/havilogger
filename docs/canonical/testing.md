# Testing & Linting

This document lists the test and lint commands that are defined in the repo and points to the main suites.

## Backend (FastAPI, Python)

- **Test command**
  - Tests are run via the app virtualenv:
    - `cd apps/api`
    - `./.venv/bin/python -m pytest`
- **Installing backend test dependencies**
  - If you see `No module named pytest`, your backend virtualenv is not set up yet.
  - From the repo root you can create a virtualenv and install dependencies:
    - `cd apps/api`
    - `python3 -m venv .venv`
    - `source .venv/bin/activate`
    - `pip install -r requirements.txt pytest`
  - Then run tests:
    - `cd apps/api && ./.venv/bin/python -m pytest`
- **Test suites**
  - Location: `apps/api/tests/`
  - Highlights:
    - Conversation and logging flows:
      - `test_conversation_cases.py` – scenario‑driven tests for `POST /api/v1/activities`.
      - `test_activities_regressions.py` – regression coverage for guidance vs logging intent.
      - `test_message_fallbacks.py` – error/fallback behavior and logging‑only responses.
      - `test_time_anchor.py` – time‑only messages anchored in child timezone.
      - `test_golden_phase0_harness.py` – Phase 0 golden-eval baseline harness (coverage over family size/age bands, route + memory signals + guidance contract scoring, and baseline report artifact at `/tmp/havi_phase0_golden_report.json`).
      - `test_golden_phase1_v2_harness.py` – Phase 1-v2 answer-first guidance harness (empathy + assumptions + plan steps + no redundant age question + next-turn invite checks, artifact at `/tmp/havi_phase1_v2_golden_report.json`).
      - `test_telemetry_rollup.py` – production telemetry rollup threshold and alarm-format logic.
      - `test_chat_quality_report.py` – verifies quality report production telemetry ingestion for both embedded rollup artifacts and raw turn telemetry fallbacks.
      - `test_route_telemetry_persistence.py` – verifies route telemetry persistence payloads, feature-flag disable behavior, and non-blocking insert failure handling.
    - Knowledge & inferences:
      - `test_knowledge_inference.py` – heuristics in `app.inferences.detect_knowledge_inferences`.
      - `test_inference_lifecycle.py` – inference status transitions.
      - `test_knowledge_review.py`, `test_knowledge_commands.py`, `test_knowledge_response.py` – `/api/v1/knowledge/*` endpoints and summaries.
    - Timeline & events:
      - `test_events.py` – `GET /events` behavior and timezone normalization.
      - `test_events_route_supabase.py` – `/api/v1/events` recorder identity enrichment + legacy fallback (including inference via `origin_message_id` when `recorded_by_user_id` column is missing).
      - `test_insight_engine.py` – `summaries_from_actions` and `expected_ranges`.
    - Tasks & router:
      - `test_task_helpers.py` – `extract_task_title` and `extract_task_due_at`.
      - `test_reminders.py` – due reminder selection and snooze acknowledgement.
      - `test_tasks_route_supabase.py` – assignee/creator display-name enrichment on task responses (admin-client fallback for member names under strict RLS).
      - `test_router.py` – `app.router.classify_intent` behavior.
    - Care-team + invites:
      - `test_invites.py` – invite create/accept lifecycle, complete-signup provisioning, invite email-config signaling (`email_enabled`), and legacy schema fallbacks.
      - `test_care_team_route.py` – `/api/v1/care-team` list resilience (legacy invite schema + invite-read failure isolation + member dedupe) and profile update validation.
    - Sharing:
      - `test_share.py` – share link creation/retrieval via `/api/v1/share/*`.

## Frontend (Next.js, TypeScript)

- **Test and lint commands**
  - Defined in `apps/web/package.json`:
    - `npm test`
      - Runs token drift gate (`npm run tokens:check`) and then Jest (`jest.config.js`, `jest.setup.ts`).
    - `npm run test:green`
      - Full Playwright GREEN smoke (`tests/smoke/green.smoke.spec.ts`).
    - `npm run test:green:invite`
      - Invite-only Playwright smoke (`tests/smoke/invite-join.smoke.spec.ts`) covering invite link join, shared-thread visibility, timeline recorder attribution, and cross-caregiver task assignment.
      - GREEN and invite-only smokes share invite auth-state handling via `tests/smoke/helpers/invite-flow.ts` to avoid branch drift in `/app/invite` and `/auth/sign-in` (`Continue to app` state).
    - `npm run lint`
      - Runs `eslint` per `eslint.config.mjs`.
       - At the time of writing, `npm run lint` fails because `apps/web/scripts/dev-safe.js` uses CommonJS `require()` imports, which violates the `@typescript-eslint/no-require-imports` rule. This is known tech debt and intentionally not addressed in this docs‑only change.
- **Test suites**
  - Location: `apps/web/src/components/timeline/__tests__/`
  - Current coverage:
    - `timeline-panel.test.tsx`
      - Renders `TimelinePanel` with provided events.
      - Asserts type filtering (e.g. Sleep vs Diaper) and “Open in chat” callback behavior.
    - `filterEventsByType.test.ts`
      - Unit tests for `filterEventsByType` exported from `timeline-panel.tsx`.

## Adding or Updating Tests

- **Backend**
  - Place new tests under `apps/api/tests/`.
  - Prefer:
    - FastAPI `TestClient` for endpoint‑level tests.
    - Reusing existing fixtures (e.g. `reset_state`, `seed_profile` from `test_conversation_cases.py`) to avoid duplicating DB setup logic.
  - Golden harness command:
    - `cd apps/api && ./.venv/bin/python -m pytest tests/test_golden_phase0_harness.py -q`
    - `cd apps/api && ./.venv/bin/python -m pytest tests/test_golden_phase1_v2_harness.py -q`
- **Frontend**
  - Add new Jest tests under `apps/web/src/**/__tests__`.
  - Use Testing Library patterns shown in `timeline-panel.test.tsx` (render, user interactions, assertions).

## Suggested End-to-End Smoke Tests

- **Reminder delivery + snooze**
  - Create a task with a reminder in the past, verify it appears in `GET /api/v1/reminders/due`, and acknowledge it with a snooze.
- **Task reminder from chat**
  - Send “Remind me tomorrow morning to call the pediatrician” and verify `remind_at` is populated and the task shows in the Tasks UI.
- **Reminder completion flow**
  - Acknowledge a reminder, mark the task done, and confirm it no longer appears in due reminders.
