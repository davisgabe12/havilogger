Status: current
Last updated: March 5, 2026

# Canonical Completed Specs

This folder stores shipped spec snapshots at the time of implementation.

## Purpose

1. Preserve what was planned and accepted when a shipped change was executed.
2. Keep traceability from ticket -> spec -> shipped behavior.
3. Distinguish historical implementation specs from evergreen system docs.

## What belongs here

1. Specs marked implemented/shipped (for example `SID-*`).
2. Requirement contracts and acceptance criteria used for a released change.
3. Point-in-time implementation decisions that were true at ship time.

## What does not belong here

1. Draft or unresolved specs (keep those in `docs/active/specs/`).
2. Ongoing policy/system docs (keep those in `docs/canonical/design/`, `ops/`, etc.).

## Usage rule

If current behavior diverges from a completed spec:
1. Keep the completed spec as historical record.
2. Update the relevant evergreen canonical docs to reflect current behavior.
3. Add a new active spec for the next change cycle when needed.
