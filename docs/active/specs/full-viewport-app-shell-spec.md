Status: active
Last updated: 2026-03-20

# full-viewport-app-shell

## Summary

The current app uses a carded chat container with fixed message height that leaves unused canvas space on large monitors and causes inconsistent scroll behavior across panels. This slice converts the app to a true viewport shell so sidebar/topbar/content/composer fill the full viewport, removes the fixed-height chat wrapper, and ensures Chat, Timeline, Tasks, Memory, and History use consistent `flex: 1` + internal scrolling.

## Goals

1. Replace page-style scrolling with a full-viewport shell (`100dvh`) for the main app surface.
2. Remove fixed-height chat message container and make message area flex to remaining vertical space.
3. Ensure core panels (Chat, Timeline, Tasks, Memory, History) consume available shell height with internal panel scrolling.

## Non-Goals

1. Redesigning visual styling/theme tokens for cards, backgrounds, or typography.
2. Refactoring `apps/web/src/app/app/page.tsx` into smaller components in this slice.
3. Changing chat/message/task/timeline business logic.

## Requirements

### MVP

1. App shell uses viewport-constrained flex layout; no orphaned blank canvas below active content on large displays.
2. Chat view has no fixed-height message container; message region uses `flex-1 min-h-0 overflow-y-auto`.
3. Conversation header sits below topbar; composer sits at bottom edge of shell flow.
4. Timeline, Tasks, Memory, and History render inside `flex-1` containers and scroll internally.

### Later

1. Extract app shell and panel primitives from monolithic `app/page.tsx` for maintainability.
2. Add dedicated layout regression tests for panel-height behavior and viewport overflow invariants.

## Proposed Solution

1. Update root app frame classes to `h-dvh` + `overflow-hidden`, and make `main` + inner shell explicit `flex-col min-h-0`.
2. Promote target panel cards to `flex min-h-0 flex-1 flex-col`; set panel content areas to `flex-1 overflow-y-auto`.
3. Replace chat `Card` wrapper with direct shell sections and replace `ScrollArea` fixed height (`h-[360px]`) with `flex-1 min-h-0`.

## Acceptance Criteria

1. In Chat, message viewport grows/shrinks with available space and no longer uses fixed `h-[360px]`.
2. In Timeline/Tasks/History/Memory, active panel stretches to fill available shell height; overflow is panel-local.
3. No page-level vertical scrollbar appears in normal desktop usage for these core views.
4. Existing navigation, mobile side tray, and chat composer behavior remain functional.

## Test Plan

1. Run targeted layout test: `src/app/__tests__/app-layout.test.tsx`.
2. Run web build: `npm run build`.
3. Run mobile-nav smoke to confirm app-shell nav behavior remains intact.

## Risks And Mitigations

1. Risk: Nested flex + overflow interactions regress panel scrolling. -> Mitigation: enforce `min-h-0` on shell ancestors and validate each target panel manually.
2. Risk: Chat section markup changes break tests/selectors. -> Mitigation: retain existing test ids and run app layout tests.
3. Risk: Worktree dependency drift blocks test execution. -> Mitigation: install/sync dependencies before final merge validation.

## Rollout Plan

1. Slice 1: Shell/flex architecture and chat fixed-height removal.
2. Slice 2: Validation pass (unit + build + smoke), then iterate on any spacing/overflow regressions.

## Progress Updates

- 2026-03-20: Implemented shell + chat refactor in `app/page.tsx` and `globals.css`; removed fixed chat height and moved core panels to viewport-filling flex contracts.
- 2026-03-20: Added worktree dependency bootstrap guardrails (`scripts/worktree_bootstrap.sh`, orchestrator integration, canonical docs, and skill updates), then validated with app-layout tests and production build.

## Open Questions

1. Should Home/Settings/Integrations also be migrated to full-height panel contracts in the same pass, or remain as-is for now?
