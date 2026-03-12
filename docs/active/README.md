Status: current
Last updated: March 12, 2026

# Active Docs

This folder contains in-progress planning and dated execution state.

## Subfolders

1. `plan/`: active plans and rollout checklists not yet fully completed.
2. `current-state/`: dated snapshots, validations, and triage logs.
3. `specs/`: in-progress feature/bug specs and spec-driven execution plans.

## Rules

1. Active docs can evolve quickly and may contain open questions.
2. Active docs should reference canonical docs for stable behavior.
3. Once an active doc is complete and stable:
   - promote evergreen behavior to `docs/canonical/` (for example `design/`, `ops/`), or
   - move shipped spec snapshots to `docs/canonical/completed-specs/`, or
   - archive if no longer relevant.
4. Use `specs/` for requirement-level docs (goals, non-goals, contracts, acceptance criteria).
5. Use `plan/` for execution sequencing docs (phases, rollout checklists, milestone choreography).
6. Before coding starts, ensure a matching active spec exists for the feature slice.
7. After ship, move finalized feature specs from `docs/active/specs/` to `docs/canonical/completed-specs/` so active specs only represent in-flight work.
