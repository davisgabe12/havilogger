Status: current
Last updated: March 4, 2026

# Triage Migration to Linear

This file is the active index for triage status.

- Source of truth going forward: Linear (team `SID` / Side Projects).
- Archived historical staging log:
  - `docs/archive/legacy/triage-log-2026-03-02.md`

## Mapping for Former "pending" Entries

1. `TRIAGE-003` -> `SID-2`
   - https://linear.app/diagonal-loop/issue/SID-2/map-havi-projectteam-in-linear-for-reliable-triage
   - Note: tool/session integration context; no duplicate ticket created.
2. `TRIAGE-005` -> `SID-10` (parent `SID-56`)
   - https://linear.app/diagonal-loop/issue/SID-10/implement-early-asklogmixed-intent-fork-and-routing-guards-in-api
   - Note: already covered by chat routing workstream; no duplicate ticket created.
3. `TRIAGE-006` -> no new ticket
   - Note: sandbox/runtime EPERM bind context, documented operational workaround.
4. `TRIAGE-007` -> no new ticket
   - Note: non-default webpack path is mitigated/de-scoped; reopen only if it returns in active workflow.
5. `TRIAGE-010` -> `SID-65`
   - https://linear.app/diagonal-loop/issue/SID-65/e2e-tasks-panel-race-created-task-not-visible-after-successful-post-in
   - Note: direct match; no duplicate ticket created.

## Operational Rule

When new issues are discovered:

1. Create/update Linear issue first.
2. Use `docs/active/current-state/` only for short-lived run notes.
3. Move stale run notes to `docs/archive/legacy/`.
