Status: active-plan
Last updated: March 5, 2026

# SID-43 Plan: Deterministic GREEN Seed/Reset Harness

## Implementation Progress (March 5, 2026)

1. Slice 1 completed:
   - `scripts/green_seed_reset.sh` reset mode + guardrails + JSON reporting.
2. Slice 2 completed:
   - `seed` and `reset-seed` implemented with deterministic fixtures and auth-user provisioning.
3. Slice 3 in progress:
   - optional harness integration into `scripts/e2e_green.sh` and `scripts/green-doctor.mjs` via `GREEN_USE_SEED`.

## Goal + Success Metrics

Goal:
1. Make local GREEN runs deterministic with one explicit prep command and no hidden prior-state dependency.

Success metrics:
1. `./scripts/green_seed_reset.sh reset-seed` completes under 60 seconds on a typical local run.
2. Two consecutive GREEN runs from seeded state produce identical pass/fail outcomes.
3. Reset flow removes only GREEN-tagged fixtures and never removes non-GREEN family data.
4. Docs include exact startup, seed, smoke, and troubleshooting commands.

## Assumptions + Constraints

Assumptions:
1. Shared Supabase project is used by both dev and production workflows.
2. GREEN fixtures can be safely namespaced with unique markers.
3. Existing GREEN scripts (`scripts/e2e_green.sh`, `scripts/green-doctor.mjs`) remain the primary entrypoints.

Constraints:
1. No schema migrations in SID-43.
2. No broad destructive cleanup.
3. Harness must be idempotent and rerunnable.

## Milestones (March 4, 2026) and Workstreams

Milestone A (spec lock and guardrails):
1. Finalize deterministic identity namespace and cleanup safety rules.
2. Define required proof artifacts and command outputs.

Milestone B (reset/seed harness):
1. Add `scripts/green_seed_reset.sh` with modes: `reset`, `seed`, `reset-seed`.
2. Implement preflight checks and strict marker-based cleanup.
3. Emit JSON reports to `docs/active/green-proof/green-seed-reset-<timestamp>.json`.

Milestone C (GREEN integration):
1. Update `scripts/e2e_green.sh` to run `reset-seed` by default unless `GREEN_SKIP_SEED=1`.
2. Update `scripts/green-doctor.mjs` to run deterministic prep when `GREEN_USE_SEED=1` (default on).
3. Ensure GREEN smoke specs use seeded identities unless explicitly overridden.

Milestone D (verification and closeout):
1. Run two consecutive deterministic local GREEN runs and compare outcomes.
2. Save artifacts and command logs.
3. Update SID-43 with commit hashes, artifact paths, and pass/fail evidence.

Workstreams:
1. Data safety and scoped deletion.
2. Seed fixture creation and idempotency.
3. Script/wrapper integration.
4. Validation, docs, and ticket closeout.

## Dependencies + Risks + Mitigations

Dependencies:
1. Valid Supabase and app env vars locally.
2. Existing GREEN test scripts remain operational.
3. Linear issue SID-43 is active and owned for execution tracking.

Risks:
1. Shared project cleanup risk.
2. Env drift and false-negative failures.
3. Invite/task fixtures diverge from test expectations.

Mitigations:
1. Delete only rows carrying explicit GREEN marker patterns and seeded emails.
2. Hard preflight with actionable errors before any mutation.
3. Seed canonical baseline fixtures used by smoke tests and log resulting IDs.

## Safety and Determinism Guardrails

1. Mutation interlock:
   - destructive reset requires `GREEN_SEED_APPLY=1`
   - default behavior is dry-run report only
2. Shared DB interlock:
   - if running against shared Supabase, mutation requires `GREEN_ALLOW_SHARED_DB=1`
3. Single fixture source:
   - seed inputs must come from one canonical fixture source used by both harness and GREEN tests
4. Run-scoped traceability:
   - every run writes `run_id` and artifact metadata for audit/replay
5. Proof report schema (minimum):
   - `run_id`, `generated_at`, `mode`, `apply`, `supabase.url`, table-level `found/deleted` counts
6. Test gate split:
   - `test:green` remains fast smoke
   - `test:green:full` validates full matrix flows
7. Post-run invariants:
   - verify seeded rows exist where expected
   - verify non-GREEN rows were not mutated
8. Platform hardening follow-up:
   - explicit milestone to split dev from shared production Supabase project

## Proposed Solution (MVP Scope)

1. Add deterministic fixture namespace:
   - `GREEN_SEED_OWNER_EMAIL` default `gdavis12+greenowner@gethavi.test`
   - `GREEN_SEED_INVITEE_EMAIL` default `gdavis12+greeninvitee@gethavi.test`
   - family name `GREEN E2E Family`
   - child names `River Green` and `Skye Green`
   - marker prefix `[GREEN-SEED]` for tasks/messages/titles
2. Build `scripts/green_seed_reset.sh`:
   - `reset`: remove only GREEN-tagged fixtures for seeded identities
   - `seed`: ensure deterministic baseline entities exist
   - `reset-seed`: run both sequentially
3. Integrate into GREEN runners:
   - `scripts/e2e_green.sh`
   - `scripts/green-doctor.mjs`
4. Update canonical docs:
   - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/green-smoke-test.md`
   - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/havi-session-bootstrap.md`
   - new `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/testing/green-seed-reset.md`

## Acceptance Criteria (Release Blocking)

1. `reset-seed` is idempotent across two consecutive runs.
2. Deterministic baseline includes family, two children, seeded conversation, seeded task.
3. Non-GREEN data remains untouched after reset.
4. Local GREEN runs pass with deterministic prep enabled.
5. Docs are updated and match actual command behavior.

## Must-Pass Flow Matrix (From Product Requirements)

1. New account flow:
   - sign up with new account
   - complete setup by adding caregiver/user and child data
   - create one timeline log
   - ask one guidance question
   - trigger one fallback reply
   - create one task
   - edit that task
2. Existing account flow:
   - sign in with existing account
   - create one timeline log
   - ask one guidance question
   - submit one multi-event logging message
   - create one task
   - edit task details
   - set task reminder
   - edit reminder
3. PASS condition:
   - each action returns success response
   - expected records persist in Supabase
   - chat/thread remains usable after each action
   - no unhandled frontend/server errors in the flow

## Next Actions / Open Questions

Next actions:
1. Implement first slice: `green_seed_reset.sh` preflight + `reset` mode only.
2. Add JSON report with deleted counts by table.
3. Validate against existing data safety rules and store first artifact.
4. Post SID-43 progress comment with proof path and next slice scope.

Open question:
1. Keep seeded default emails as `@gethavi.test`, or switch to your `gdavis12+...@gmail.com` aliases to match real auth-provider behavior in local GREEN.
