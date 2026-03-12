Status: current
Last updated: March 12, 2026

# Active Specs

This folder holds in-progress specs that are still being validated.

## What belongs here

1. Spec-driven feature/bug docs with explicit contracts.
2. Docs that define MVP scope, requirements, invariants, and acceptance criteria.
3. Draft or actively iterated specs tied to tickets (for example, `SID-*`).
4. Use `_feature-spec-template.md` when a spec does not yet exist.

## What does not belong here

1. Stable long-term source-of-truth docs (move those to `docs/canonical/`).
2. Pure execution schedules/checklists without requirements (keep those in `docs/active/plan/`).

## Promotion rule

When a spec is implemented and behavior is stable:
1. Promote normative parts to canonical docs.
2. Move the finalized spec snapshot to `docs/canonical/completed-specs/` in the same closeout slice.
3. Keep `docs/active/specs/` focused on in-flight work only.
