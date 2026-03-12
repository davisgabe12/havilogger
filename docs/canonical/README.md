Status: current
Last updated: March 12, 2026

# Canonical Docs

This folder contains the current source of truth for Havi behavior.

## What belongs here

1. Architecture and flow definitions.
2. Operational runbooks used in active development.
3. Testing and local run instructions.
4. Current Supabase schema and migration references.
5. Production verification runbooks (for example, `ops/production-core-smoke.md`).
6. Deployment/release runbooks (for example, `ops/deploy-and-release.md`).
7. Completed shipped spec snapshots in `completed-specs/` (point-in-time implementation record).
8. Canonical project profile docs under `product/` (for example, `product/havi-project-profile.md`).

## What does not belong here

1. Draft plans with unresolved decisions.
2. Draft plans/specs with unresolved decisions.

If a canonical doc is no longer accurate, move it to `docs/archive/` or update it in the same change.

## Canonical Spec Types

1. Evergreen source-of-truth docs:
   - `design/`, `ops/`, `product/`, testing and architecture docs.
2. Completed shipped spec snapshots:
   - `completed-specs/` for "what we shipped at the time" records.
3. Promotion rule:
   - shipped feature specs move from `docs/active/specs/` to `docs/canonical/completed-specs/` in the same closeout slice.

## Design System Canonical Sources

1. Brand/theme tokens and mappings:
   - `docs/canonical/brand-theming-notes.md`
2. Homepage surface primitives and guardrails:
   - `docs/canonical/design/homepage-surface-system.md`
3. Homepage Phase A delivery constraints:
   - `docs/canonical/design/homepage-modernization-phase-a.md`
4. Form field system contract:
   - `docs/canonical/design/form-field-system.md`
