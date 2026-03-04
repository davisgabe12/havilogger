Status: current
Last updated: March 3, 2026

# Havi Autonomous Run Checklist

Use this checklist for any autonomous Codex run (not only overnight).

## Objective

Ship meaningful progress safely with minimal user interruption, while keeping issue tracking current.

## Operating Loop

1. Confirm current objective and acceptance criteria from latest user direction.
2. Pull latest context from:
`docs/canonical/ops/havi-session-bootstrap.md`
`docs/active/current-state/triage-migration-2026-03-04.md`
3. Select one thin fix slice.
4. Implement root-cause fix (avoid broad unrelated refactors).
5. Run targeted tests for touched logic.
6. Run build/runtime smoke as needed.
7. Document outcome and residual risks.
8. Commit and push when the slice is stable.

## Quality Gates (Hard)

1. Do not mark complete without executable validation evidence.
2. Keep guidance vs logging invariant intact:
guidance must not create timeline activity events.
3. Keep deploy safety:
if production behavior changes, run production smoke before closeout.
4. For substantial changes, run production smoke twice:
`HAVI_SMOKE_LABEL=before-<change-name> ./scripts/prod_core_smoke.sh`
`HAVI_SMOKE_LABEL=after-<change-name> ./scripts/prod_core_smoke.sh`
and keep both reports under `docs/active/green-proof/`.
5. If Railway deploy via `npx @railway/cli` fails in sandbox with DNS errors, switch to cached Railway CLI binary and rerun with elevated permissions before retrying smoke gates.
6. Keep docs in sync when behavior changes.

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
