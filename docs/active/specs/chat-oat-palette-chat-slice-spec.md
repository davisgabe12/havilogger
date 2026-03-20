# Chat Oat Palette Chat Slice Spec

## Summary
Implement the approved chat-first color inversion and matte palette on the app chat surface, while preserving existing behavior and route contracts.

## Goals
- Move chat presentation from forest-dark ambient styling to warm dark-on-light styling.
- Apply matte warm-neutral surfaces with clear assistant/user bubble separation.
- Keep forest green reserved for interactive accents (send button, active states).
- Keep all existing chat functionality and tests passing.

## Non-goals
- Tasks, Settings, Auth, and marketing route palette rollout in this slice.
- Structural route flow changes or chat contract changes.

## Requirements (MVP)
- Chat canvas uses warm oat base (`#ede8de`) and removes dark ambient fill.
- Assistant bubble uses `#e3ddd3`; user bubble uses `#d6d0c5`.
- Sidebar shifts to warm dark walnut (`#2e2720`) for chat mode.
- Message bubbles gain subtle lift via border + low shadow.
- Chat-specific styles are scoped to chat panel and do not regress other panels.
- Targeted chat/app layout tests and production web build are green.

## Proposed solution
- Add a chat-scoped theme class on app frame when `activePanel === "havi"`.
- Define chat palette tokens in `globals.css` under `.havi-chat-theme`.
- Attach explicit class hooks for chat context row, header, scroll area, composer, input, and send button.
- Update message bubble classes to consume chat tokens with sensible fallbacks.

## Alternatives considered
- Global token flip for entire app immediately.
  - Rejected for this slice because it increases blast radius before checkpoint verification.
- One-off inline style overrides in component markup.
  - Rejected for maintainability and design-system drift risk.

## Data / API / UX notes
- No API shape, request contract, or persistence behavior changes.
- Visual updates are scoped to chat panel rendering only.

## Risks and mitigations
- Risk: chat-only overrides leak into other panels.
  - Mitigation: scope all overrides under `.havi-chat-theme` and only enable in chat panel.
- Risk: low-contrast regressions in metadata text.
  - Mitigation: explicit muted token for timestamps/secondary text and test snapshots.

## Success metrics
- Chat route renders with approved palette direction in deployed environment.
- `app-layout` and `message-bubble` suites pass.
- `npm run build` passes for `apps/web`.

## Rollout and test plan
1. Implement scoped chat palette classes and tokenized bubble styling.
2. Run targeted unit/integration tests for app layout + message bubbles.
3. Run production build gate.
4. Deploy and capture production chat screenshot for visual verification.

## Open questions
- Final exact walnut/green tint calibration for tasks/settings/auth rollout checkpoint.
