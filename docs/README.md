# Documentation Index and Lifecycle

This directory uses an active-vs-archive model so execution docs stay accurate during rapid shipping.

## Status model

Use one status near the top of every document:

- `Status: current` for runbooks/specs that match live behavior.
- `Status: active-plan` for in-progress plans.
- `Status: archive` for historical context only.

## Active docs (source of truth)

- `docs/running-locally.md`
- `docs/architecture.md`
- `docs/core-flows.md`
- `docs/testing.md`
- `docs/green-smoke-test.md`
- `docs/ops/havi-session-bootstrap.md`
- `docs/brand-theming-notes.md`
- `docs/plan/gethavi-domain-deployment-plan.md`
- `docs/plan/havi-objective-execution-plan-2026-03-02.md`
- `docs/current-state/core-e2e-validation-2026-03-02.md`

## Legacy docs (review for archive)

- Most files under `docs/analysis/`
- Older notes in `docs/current-state/` not updated in 2026
- One-off exploration files in `docs/` root that do not include a status header

## Folder intent

- `docs/plan/`: execution plans and rollout checklists.
- `docs/current-state/`: dated state snapshots and validation records.
- `docs/supabase/`: schema, RLS, and migration SQL artifacts.
- `docs/ops/`: operational runbooks and session bootstrap guides.
- `docs/archive/`: deprecated docs moved out of active paths.

## Update rules

1. Any behavior-changing code PR updates at least one active doc.
2. If a doc is stale and cannot be fixed in the same PR, mark it `Status: archive`.
3. Prefer updating a single source-of-truth doc over creating parallel duplicates.
4. Use absolute dates (for example, `March 2, 2026`) in rollout/state notes.
