Status: current
Last updated: March 12, 2026

# Havi Project Profile

Use this as the single project-context brief for any new session.

## Customer Job To Be Done

Parents and caregivers need one calm place to quickly log child events, get practical next-step guidance, and keep the family aligned without carrying the full mental load alone.

## Primary Users

1. Parent or primary caregiver logging events and asking guidance questions.
2. Secondary caregiver/care-team member coordinating tasks and timeline updates.

## Product Scope (Current)

1. Auth and onboarding (`/auth/*`, family + child setup).
2. Chat (`/app`) for logging, guidance, tasks, and memory capture.
3. Timeline/event history.
4. Tasks and caregiver coordination.
5. Settings/profile.

## Critical Behavioral Invariants

1. Guidance responses must not create timeline activity events.
2. Logging messages must persist as events with concise confirmation.
3. Child/family-scoped routes require valid auth + context.
4. Session title auto-generation runs once on first message only; manual rename always wins.

## System Snapshot

1. Web: Next.js on Vercel.
2. API: FastAPI on Railway.
3. Data/Auth: Supabase.

## Quality Gates (Default)

1. Targeted tests for touched code paths.
2. Deterministic local smoke for core journey (`./scripts/e2e_green.sh`).
3. Production release gate for deploy slices (`./scripts/prod_release_gate.sh` with before/after labels).
4. Curated release proof bundle under `docs/active/green-proof/releases/`.

## Tools And Readiness Expectations

1. Linear MCP should be verified before issue triage/update work.
2. Playwright should be verified before UI-flow validation work.
3. Deploy/smoke scripts should be used instead of ad-hoc command chains when available.

## Default Session Contract

1. Work from a dedicated feature worktree (`codex/<feature-name>`).
2. Ensure active spec exists in `docs/active/specs/`; create one if missing.
3. Keep code/tests/docs in sync in the same slice.
4. Append progress during execution to `docs/active/current-state/session-notes.md`.
5. Move finalized spec snapshot to `docs/canonical/completed-specs/` at ship closeout.

## Generalizable Profile Contract (For Other Projects)

To reuse this operating model outside Havi, create one project profile doc with these fields:

1. Customer JTBD
2. Primary users
3. Product surfaces in scope
4. Critical invariants
5. System/deploy stack
6. Required quality gates
7. Tool readiness requirements
8. Session execution contract
