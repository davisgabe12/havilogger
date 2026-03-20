Status: current
Last updated: March 20, 2026

# Havi Session Bootstrap

## User Job To Be Done (JTBD)

Parents and caregivers need one calm place to quickly capture what happened with their child, get trustworthy next-step guidance, and keep everyone aligned without carrying the full mental load alone.

Project profile source:
`/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/product/havi-project-profile.md`

## What Havi Does (High Level)

Havi is a parent/caregiver copilot that:

1. Captures child events (feeds, diapers, sleep, routines, symptoms).
2. Gives warm, practical guidance for parenting questions.
3. Keeps shared family context and memory persistent.
4. Coordinates action with tasks and reminders across caregivers.

## Core Product Surfaces

1. Auth + onboarding (`/auth/*`, family + child setup).
2. Main app chat (`/app`) for logging, guidance, tasks, and memory.
3. Timeline for persisted events.
4. Tasks for caregiver coordination.
5. Settings for caregiver/child profile and family context.

## Session Meaning (Product)

1. A session is a single chat thread for one child within one family.
2. `New chat` creates a clean conversation slate (empty transcript context).
3. Shared memory, timeline history, and tasks remain persistent across sessions.
4. Session title behavior:
   - Starts as `New chat`.
   - On first message only, auto-title becomes `snippet · Mon D, YYYY`.
   - Manual rename always wins and must not be overwritten.

## How Product Logic Works (Current)

1. Web sends chat input to `POST /api/v1/activities`.
2. API classifies intent and routes to one of: logging, guidance, task creation, memory save.
3. Logging path writes timeline/activity records and returns concise confirmation.
4. Guidance path returns advisory text and should not create activity timeline events.
5. Task path writes task records and confirms creation.
6. Memory path writes explicit memory when asked to save.

## Critical Invariants

1. Guidance messages must not be persisted as activity timeline events.
2. Logging confirmations must stay concise and deterministic.
3. Authenticated child-scoped routes require valid bearer token + child context.
4. `www.gethavi.com` must redirect to `https://gethavi.com`.
5. Session auto-title must run once on first message only when title is `New chat`.
6. Manual rename must remain stable after follow-up messages.
7. Production checks are not complete until smoke verification passes.

## Current Stack

1. Web: Next.js on Vercel (`gethavi.com`).
2. API: FastAPI on Railway (`api-production-0a5d.up.railway.app`).
3. Data/Auth: Supabase (shared dev/prod project for now).
4. Supabase is remote/shared in current setup; local runs do not use a local SQL database.

## Where Feature Work Happens

1. Feature coding happens in a dedicated git worktree on a feature branch (`codex/<feature-name>`).
2. Local `main` is used as a clean integration branch and should stay releasable.
3. Integrate feature work back to `main` only after tests and docs are updated and passing.
4. Keep each worktree scoped to one feature slice to reduce merge conflicts and rollback risk.
5. Use orchestrator script for deterministic setup:
   - `./scripts/havi_session_orchestrator.sh --feature "<feature-name>"`
6. Do not start coding until worktree dependency readiness passes:
   - `./scripts/worktree_bootstrap.sh --check-only`
   - If not ready, run `./scripts/worktree_bootstrap.sh` and re-check.
   - Bootstrap also syncs missing `apps/web/.env.local` and `apps/api/.env.local` from `/Users/gabedavis/Desktop/projects/havilogger`.

## Spec And Docs Lifecycle

1. Every feature starts with an active spec in `docs/active/specs/` with goal, acceptance criteria, and non-goals.
2. As implementation progresses, append `Progress Updates` to `docs/active/current-state/session-notes.md`.
3. When shipped, move the final spec snapshot to `docs/canonical/completed-specs/`.
4. Keep `docs/active/specs/` for in-flight work only, so open specs are not confused with shipped behavior.

## Fast Local Start

Preferred:

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
./restart.sh
```

Quick health:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/auth/sign-in
```

## Fast Validation

1. API focused tests (chat logic):

```bash
cd /Users/gabedavis/Desktop/projects/havilogger/apps/api
../../.venv/bin/pytest tests/test_chat_routing_logic.py tests/test_router.py tests/test_question_detection.py -q
```

2. Web build:

```bash
cd /Users/gabedavis/Desktop/projects/havilogger/apps/web
npm run build
```

3. Runtime smoke:

```bash
/Users/gabedavis/.codex/skills/havi-e2e-smoke/scripts/fast_start_smoke.sh --no-start
```

If running inside a sandboxed Codex runtime and localhost bind fails (`EPERM`/`operation not permitted`), run smoke from a normal terminal or rerun with elevated permissions.

Deterministic GREEN prep (slice 1 reset mode):

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
./scripts/green_seed_reset.sh reset
```

Deterministic GREEN run (seed + smoke):

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
GREEN_USE_SEED=1 GREEN_SEED_APPLY=1 GREEN_ALLOW_SHARED_DB=1 ./scripts/e2e_green.sh
```

Runbook:
`/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/testing/green-seed-reset.md`

4. Production before/after release gate (required for substantial changes):

```bash
HAVI_RELEASE_LABEL=before-<change-name> ./scripts/prod_release_gate.sh
HAVI_RELEASE_LABEL=after-<change-name> ./scripts/prod_release_gate.sh
```

This wraps core + UI gate and includes one bounded retry for transient first-run UI failures.

Deployment + release checklist (canonical):
`/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/deploy-and-release.md`

5. Railway deploy fallback for sandboxed sessions:
If `npx @railway/cli ...` fails with DNS (`ENOTFOUND`) in sandboxed Codex runs, use a cached CLI binary and run with elevated network permissions.

```bash
RAILWAY_CLI="$(find /Users/gabedavis/.npm/_npx -path '*/node_modules/.bin/railway' -type f 2>/dev/null | head -n1)"
"$RAILWAY_CLI" up . --service api --detach --path-as-root
"$RAILWAY_CLI" deployment list --service api --json | head -c 2000
```

Preferred deterministic deploy path (prevents root-context drift):

```bash
cd /Users/gabedavis/Desktop/projects/havilogger
./scripts/prod_api_deploy_wait.sh
```

This command deploys from `apps/api`, waits for completion, and validates the latest deployment metadata (`provider=python`, `config=railway.toml`) before continuing to smoke gates.

6. Deterministic feature QA gate (recommended before ship):

```bash
./scripts/qa_gate.sh --label <slice-name> --areas <csv> --playwright-cmd "<playwright-command>"
```

For `--deploy-scope web` or `--deploy-scope both`, QA gate also requires mobile Chrome side-tray proof and will run:

```bash
cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green:mobile-nav
```

## Context And Tool Readiness (Session Start)

1. Context familiarization:
   - scan relevant code/docs for current slice (`rg`, targeted file reads).
2. Worktree dependency readiness:
   - run `./scripts/worktree_bootstrap.sh --check-only` from the feature worktree before running tests/build.
   - if Jest is missing under `apps/web/node_modules/.bin/jest`, run `./scripts/worktree_bootstrap.sh`.
3. Linear readiness:
   - verify MCP access before triage/ticket updates; if unavailable, mark `Linear issue: pending` in session notes.
4. Playwright readiness:
   - verify Playwright path before UI-flow validation so browser checks do not block late.
5. Approval priming:
   - request narrowly scoped reusable approvals early for expected commands/tools to reduce mid-flow interruptions.

## Production Smoke Minimum

1. `https://gethavi.com` returns 200.
2. `https://www.gethavi.com` returns redirect to apex.
3. API health endpoint returns 200.
4. Auth flow + onboarding works.
5. One tracking message logs to timeline.
6. One guidance message returns advice and does not log timeline activity.
7. One task can be created and persisted.
8. First message auto-titles conversation (`!= New chat`).
9. Manual renamed title remains unchanged after follow-up message.

## Cofounder CTO Mode (Execution Standard)

1. Prioritize user trust and core flow correctness over feature breadth.
2. Ship small, reversible fixes with tests tied to regressions.
3. Validate end-to-end after each substantial change.
4. Keep docs current and archive stale guidance quickly.
5. Own outcomes: do not declare complete without runtime evidence.

## First 20 Minutes In A New Session

1. Read this file and `docs/active/current-state/triage-migration-2026-03-04.md`.
2. Read `docs/canonical/ops/havi-autonomous-run-checklist.md` when running autonomously.
3. Check git status + latest commit context.
4. Create/reuse the feature worktree via `./scripts/havi_session_orchestrator.sh --feature "<feature-name>"`.
5. From the worktree root, run `./scripts/worktree_bootstrap.sh --check-only` and fix readiness if needed.
6. Confirm active feature spec exists under `docs/active/specs/` (or create it).
7. Run local or production smoke depending on task scope.
8. Confirm top P0/P1 items and pick first fix slice.
9. Implement -> test -> deploy (if needed) -> smoke -> document outcome.
