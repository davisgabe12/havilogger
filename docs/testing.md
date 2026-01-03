# Testing & Linting

This document lists the test and lint commands that are defined in the repo and points to the main suites.

## Backend (FastAPI, Python)

- **Test command**
  - Tests are run directly with `pytest`:
    - `cd apps/api`
    - `pytest`
- **Installing backend test dependencies**
  - If you see `pytest: command not found`, it means your Python environment for the backend is not set up yet.
  - From the repo root you can create a virtualenv and install dependencies:
    - `python3 -m venv .venv`
    - `source .venv/bin/activate`
    - `pip install -r apps/api/requirements.txt`
  - Then run tests:
    - `cd apps/api && pytest`
- **Test suites**
  - Location: `apps/api/tests/`
  - Highlights:
    - Conversation and logging flows:
      - `test_conversation_cases.py` – scenario‑driven tests for `POST /api/v1/activities`.
      - `test_activities_regressions.py` – regression coverage for guidance vs logging intent.
      - `test_message_fallbacks.py` – error/fallback behavior and logging‑only responses.
      - `test_time_anchor.py` – time‑only messages anchored in child timezone.
    - Knowledge & inferences:
      - `test_knowledge_inference.py` – heuristics in `app.inferences.detect_knowledge_inferences`.
      - `test_inference_lifecycle.py` – inference status transitions.
      - `test_knowledge_review.py`, `test_knowledge_commands.py`, `test_knowledge_response.py` – `/api/v1/knowledge/*` endpoints and summaries.
    - Timeline & events:
      - `test_events.py` – `GET /events` behavior and timezone normalization.
      - `test_insight_engine.py` – `summaries_from_actions` and `expected_ranges`.
    - Tasks & router:
      - `test_task_helpers.py` – `extract_task_title` and `extract_task_due_at`.
      - `test_router.py` – `app.router.classify_intent` behavior.
    - Sharing:
      - `test_share.py` – share link creation/retrieval via `/api/v1/share/*`.

## Frontend (Next.js, TypeScript)

- **Test and lint commands**
  - Defined in `apps/web/package.json`:
    - `npm test`
      - Runs Jest with `jest.config.js` and `jest.setup.ts`.
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
- **Frontend**
  - Add new Jest tests under `apps/web/src/**/__tests__`.
  - Use Testing Library patterns shown in `timeline-panel.test.tsx` (render, user interactions, assertions).
