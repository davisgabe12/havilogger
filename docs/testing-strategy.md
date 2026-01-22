# Testing Strategy (Solo Developer, Production‑Grade Mindset)

This plan is written for a **single developer** running a **small‑user‑base app**, but it borrows the discipline used by teams at Dropbox/Meta and the lean pragmatism of YC‑style startups. The goal is to **catch regressions early** without drowning in process.

## Plain‑English Summary

- **We prioritize the highest‑risk paths first** (logging, timeline accuracy, and safety).
- **We keep the “test pyramid” small and sharp**: lots of fast unit tests, fewer end‑to‑end tests.
- **We add lightweight monitoring** so real‑world failures show up quickly.

## Quick Diagram (How the Test Pyramid Fits)

```mermaid
flowchart TD
  A[Fast Unit Tests
(helpers, intent routing)] --> B[Service Tests
(API endpoints)]
  B --> C[Integration Tests
(DB + AI stubs)]
  C --> D[Minimal E2E
(critical user flows)]
```

## Questions to Confirm (Plain English)

These help tailor the plan to how you actually ship and use the app:

1. **How often do you plan to release?** (daily/weekly/monthly)
2. **Do you plan to keep a staging environment?**
3. **Which failures are most painful today?** (e.g., missing timeline events, wrong knowledge items, bad reminders)
4. **How much of the AI output should be deterministic?** (fixed fixtures vs. tolerant assertions)
5. **Do you want to block deploys on tests?** (strict vs. advisory)

## The Plan (Jeff‑Dean‑Style, Pragmatic + High Leverage)

### 1) Guard the “Core Loop” First
**Why:** If logging fails, the product fails.

- **Core Loop:** message in → intent → actions → timeline + reply out.
- **High‑value tests:**
  - Intent classification for common phrases.
  - Action parsing & timeline projection for sleep/feeding/diaper.
  - “Logging‑only” response behavior (short + confirm).

### 2) Make AI Safer with Contract Tests
**Why:** Most bugs come from prompt drift or schema mismatch.

- Validate the AI response against a **stable Action schema**.
- Keep **golden test cases** with saved JSON outputs.
- Fail fast if AI output breaks the schema.

### 3) Keep Integration Tests Small, Surgical
**Why:** You need confidence that DB + API still work, but don’t want slow tests.

- One “happy‑path” test per major endpoint:
  - `/api/v1/activities`
  - `/api/v1/knowledge/*`
  - `/api/v1/events`
  - `/api/v1/tasks`
- Each test should set up a clean DB and verify the response plus DB state.

### 4) Limit E2E Tests to the Most Valuable Flow
**Why:** E2E tests are expensive to maintain.

- Only **1–2 E2E tests**:
  - “Log a sleep event → appears on timeline.”
  - “Ask a question → response includes guidance.”

### 5) Add Lightweight Monitoring (Small‑Team Friendly)
**Why:** Production is the ultimate test.

- Log errors with **context + request IDs**.
- Track **response time spikes** and **AI failures**.
- Add a simple **daily report**: number of logs, errors, and failed actions.

## Recommended Phased Rollout (Low‑Effort, High Value)

1. **Week 1: Core loop tests + AI contract checks.**
2. **Week 2: Endpoint integration tests.**
3. **Week 3: Minimal E2E flows + monitoring dashboard.**

## Risks & Trade‑Offs (Plain English)

- **Too many tests slow you down.** Keep the suite small and fast.
- **AI output can be fuzzy.** Use schema validation + tolerant matching for text.
- **E2E tests can be flaky.** Keep them limited to the most important flows.

## Tasks to Execute (Actionable Checklist)

1. **Define “core loop” scenarios** (sleep, feeding, diaper, task).
2. **Add schema validation tests** for AI action payloads.
3. **Create 4–6 integration tests** for key endpoints.
4. **Add 1–2 E2E tests** for the most valuable flows.
5. **Set up a small monitoring view** (errors, response time, AI failures).

## Where This Fits in the Repo

- **Existing test suites:** `apps/api/tests/`
- **Test commands:** See `docs/testing.md`
- **Key code paths:** `apps/api/app/main.py`, `apps/api/app/router.py`, `apps/api/app/openai_client.py`
