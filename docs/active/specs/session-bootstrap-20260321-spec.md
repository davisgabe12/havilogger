Status: active
Last updated: 2026-03-21

# session-bootstrap-20260321

## Summary

The logged-in app currently presents active-child selection as a full-width form control, which reads as data entry instead of focus context. This slice replaces that with a compact topbar pill that behaves like a context switcher. The pill is fixed at `90px`, left-aligns the child name, removes avatar chrome, and keeps existing child-selection behavior unchanged.

## Goals

1. Replace the full-width "Active child" select + label with a compact topbar pill.
2. Preserve existing child context behavior (`activeChildId`, localStorage, downstream child-scoped loading).
3. Keep interaction accessible with keyboard and screen-reader semantics.

## Non-Goals

1. No backend/API contract changes.
2. No redesign of child management flows in Settings.
3. No attempt to fit long names fully in pill; truncation at fixed width is accepted.

## Requirements

### MVP

1. Remove visible "Active child" label and legacy full-width select in logged-in app shell.
2. Add topbar pill with fixed `90px` width, dark walnut styling, left-aligned name, chevron indicator, no avatar.
3. Pill opens a selectable list of children; selecting an item uses existing `handleChildChange`.
4. Timezone context remains visible in the same topbar as secondary information.
5. Keyboard support includes open, arrow navigation, select, escape-close, and focus return to trigger.

### Later

1. Consider adaptive width model if product later prioritizes longer-name readability over fixed compact footprint.

## Proposed Solution

1. Introduce `ActiveChildPill` UI component (`apps/web/src/components/ui/active-child-pill.tsx`) using button + listbox popover semantics.
2. Replace top-of-main mobile-only bar and context row with a unified topbar in `app/page.tsx` that hosts menu button (mobile), active-child pill, and timezone text.
3. Add dedicated styling in `globals.css` for pill, popover, option states, and topbar placement while preserving existing app theme tokens.
4. Derive pill options from existing `childrenList` and map selection to current `handleChildChange` callback.

## Acceptance Criteria

1. `active-child-select` is not rendered in the app shell.
2. `active-child-pill` renders and is fixed-width (`90px`) with left-aligned truncated label text.
3. Clicking or keyboard-selecting a child from the pill list calls `handleChildChange` path with the selected ID.
4. Timezone helper text remains visible in topbar.
5. Keyboard interaction supports Arrow navigation, Enter/Space selection, and Escape close with focus returning to trigger.

## Test Plan

1. Add component tests for `ActiveChildPill` render/open/select/disabled/keyboard flow.
2. Update app layout tests to assert legacy select removal and new pill presence.
3. Run targeted web tests:
   - `npm run test -- src/app/__tests__/app-layout.test.tsx src/components/ui/__tests__/active-child-pill.test.tsx`
4. Run web build:
   - `npm run build`

## Risks And Mitigations

1. Fixed `90px` width may over-truncate long names -> accepted product tradeoff; apply clear truncation behavior.
2. Custom listbox interaction can regress accessibility -> explicit keyboard handling and focused component tests.
3. Existing worktree has unrelated modifications -> isolate edits to topbar/pill files and avoid reverting other changes.

## Rollout Plan

1. Implement and verify in local tests/build.
2. Capture visual review in app before broader UI rollout work.

## Progress Updates

- 2026-03-21: Defined locked UI constraints (`90px`, left-aligned, no avatar) and implementation/test strategy in active spec.

## Open Questions

1. None for this slice.
