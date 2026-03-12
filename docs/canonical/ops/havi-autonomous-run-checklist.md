Status: current
Last updated: March 12, 2026

# Havi Autonomous Run Checklist

Use this checklist for any autonomous Codex run (not only overnight).

## Objective

Ship meaningful progress safely with minimal user interruption, while keeping issue tracking current.

## Operating Loop

1. Confirm current objective and acceptance criteria from latest user direction.
2. Pull latest context from:
`docs/canonical/ops/havi-session-bootstrap.md`
`docs/active/current-state/triage-migration-2026-03-04.md`
3. Confirm there is an active spec under `docs/active/specs/` for the current feature.
4. Select one thin fix slice.
5. Implement root-cause fix (avoid broad unrelated refactors).
6. Run targeted tests for touched logic.
7. Run build/runtime smoke as needed.
8. Document outcome and residual risks.
9. Commit and push when the slice is stable.

## Feature Work Location (Required)

1. Keep local `main` as a clean integration branch, not a feature-coding branch.
2. Do feature work in a dedicated git worktree and feature branch (`codex/<feature-name>`).
3. Keep one feature slice per worktree to reduce merge conflicts.
4. Integrate back to `main` only after tests/docs are green.

## Quality Gates (Hard)

1. Do not mark complete without executable validation evidence.
2. Keep guidance vs logging invariant intact:
guidance must not create timeline activity events.
3. Keep deploy safety:
if production behavior changes, run production smoke before closeout.
4. For substantial changes, run production smoke twice:
`HAVI_RELEASE_LABEL=before-<change-name> ./scripts/prod_release_gate.sh`
`HAVI_RELEASE_LABEL=after-<change-name> ./scripts/prod_release_gate.sh`
and keep both release gate summaries under `docs/active/green-proof/`.
5. If Railway deploy via `npx @railway/cli` fails in sandbox with DNS errors, switch to cached Railway CLI binary and rerun with elevated permissions before retrying smoke gates.
6. If API deploy is required, use `./scripts/prod_api_deploy_wait.sh` to prevent mixed root-context deployments and ensure latest deployment is Python + `railway.toml` before running smoke gates.
7. Keep code, tests, and docs in sync in the same feature slice.
8. Keep docs in sync when behavior changes.

## Spec Lifecycle (Required)

1. Before first code edit, create or update a feature spec in `docs/active/specs/`.
2. During execution, append a `Progress Updates` section in `docs/active/current-state/session-notes.md` as work happens.
3. At ship time, move completed spec snapshots to `docs/canonical/completed-specs/` and leave active docs focused on unfinished work.
4. If scope is unfinished, keep the spec in `docs/active/specs/` with explicit remaining work and risks.

## QA Gate For User-Facing Features (Required)

1. Run targeted unit/integration tests for touched backend/frontend behavior.
2. Run deterministic app smoke for core user journey (`./scripts/e2e_green.sh` with seed reset when needed).
3. Run production release gate for deploy slices (`./scripts/prod_release_gate.sh` before/after labels).
4. If guidance quality or UX behavior fails, block release, file issue with repro + recommended fix, then rerun gate.

## Issue Discovery While Doing Other Work

If you discover a new issue while working on a different task:

1. Do not silently ignore it.
2. Classify severity:
`P0` blocks core flow or causes data corruption.
`P1` meaningful user-facing defect.
`P2` non-blocking but should be tracked.
3. Capture immediately:
title, repro, expected vs actual, likely root cause, impact/risk.
4. Create a Linear ticket if access is available.
5. If Linear is unavailable in-session, append a triage entry to:
`docs/active/current-state/triage-migration-2026-03-04.md`
and mark `Linear issue: pending`.
6. Continue current task unless discovered issue is P0.
7. If P0, stop and switch to containment/fix workflow first.

## Ticket Template (Minimum)

1. Title
2. Severity (`P0`/`P1`/`P2`)
3. Area (`chat`, `timeline`, `tasks`, `auth`, `deploy`, `docs`)
4. Repro steps
5. Expected vs actual
6. Hypothesis
7. Fix summary or proposed fix
8. Tests added/run
9. Risks/follow-ups

## End-Of-Run Output

1. Completed slices with commit SHAs.
2. Tests and smokes run with pass/fail.
3. New tickets created (or triage entries added).
4. Remaining highest-priority next action.
