Status: active
Owner: CTO
Last updated: March 12, 2026

# Chat Runtime Contract Alignment Ship Spec

## Summary
Ship the agreed chat runtime and contract alignment changes so Havi provides a stable, helpful, end-to-end parent chat experience in production.

## Goal
Ship the scoped chat alignment changes to production with passing quality gates and verified end-to-end behavior.

## Success Criteria
1. Production chat runtime uses `ContextPack` with explicit memory route kinds in the contract path: `MEMORY_EXPLICIT`, `MEMORY_INFERRED`.
2. `ui_nudges` is removed from the API response contract and is not emitted from `/api/v1/activities`.
3. `model_request` is removed from production core smoke payloads.
4. Chat plan docs, runtime behavior, and tests are synchronized (no spec/runtime drift for this scope).
5. Release gates pass with fresh evidence before and after deploy, and production chat flow works end-to-end.

## In Scope
1. ContextPackBuilder v1 wiring in chat runtime.
2. Memory route contract extension (`MEMORY_EXPLICIT`, `MEMORY_INFERRED`) in route metadata path.
3. API contract cleanup: remove `ui_nudges` from response schema/output.
4. Smoke harness cleanup: remove `model_request` payload from `scripts/prod_core_smoke.sh`.
5. Docs sync for chat plan master + phase 1 + session progress updates.
6. Tests and validation for route metadata, context usage, and response contract.

## Out of Scope
1. Voice toolbar or composer visual/layout changes.
2. Feedback thumb UI workstream currently handled by another coding agent.
3. Backlog cleanup unrelated to the scoped runtime/contract changes.

## Implementation Plan
1. Isolate on clean branch from latest `origin/main` and carry only scoped changes.
2. Replace `ContextBundle` usage with typed `ContextPack` in `/api/v1/activities` flow.
3. Emit memory route kinds where applicable and preserve deterministic write policy.
4. Remove `ui_nudges` from API response contract surface.
5. Remove `model_request` from production core smoke request payloads.
6. Update tests first-order around route logic, response shape, and context behavior.
7. Update chat master and phase-1 plan docs to match shipped behavior.
8. Append execution checkpoints to `docs/active/current-state/session-notes.md` as work happens.
9. Run pre-deploy gate, deploy, run post-deploy gate, then collect proof artifacts.

## Test Plan
1. API contract test: `/api/v1/activities` response does not contain `ui_nudges`.
2. Route contract test: explicit and inferred memory paths emit `MEMORY_EXPLICIT` / `MEMORY_INFERRED`.
3. Context test: ContextPack carries age/memory context used in composition path.
4. Smoke script test: core smoke payload omits `model_request` and script remains green.
5. End-to-end production test: parent chat login/message/guidance path remains working.

## Risks and Mitigations
1. Route-kind compatibility risk in telemetry and feedback flows.
- Mitigation: keep non-memory route kinds backward-compatible and add focused tests.
2. Context retrieval overfetch risk.
- Mitigation: bounded queries and small memory/message limits.
3. Drift risk between docs and runtime.
- Mitigation: docs updates are part of done criteria, not a post-step.

## Progress Updates
- [March 12, 2026] Spec created and locked before implementation.
