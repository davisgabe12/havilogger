# Chat UI / UX Development Guidelines

You are working in the Havi monorepo at:
`~/Desktop/projects/havilogger`

This guide applies to **Chat UI / UX changes only**. Home screen changes are explicitly **out of scope** and must not be touched when these guidelines are in effect.

---

## Goal

Polish the Chat experience by tightening copy, spacing, and controls to match Apple‑quality interaction standards. Changes must be minimal, focused, and reversible.

---

## Changes To Implement (Chat Only)

### 1) First Message Behavior (Chat Only)

- **New first system message**
  - When a user opens Chat with no prior input, show:
    > “Hi — I’m Havi.  
    > Ask a question, log a moment, or track anything about your family’s day.  
    > I’ll help you understand what’s normal and remember what matters.”
- **Display rules**
  - Should appear **only**:
    - On the **first‑ever** chat for a user.
  - Should **not** appear:
    - After the first user message.
    - In subsequent chats for returning users.

### 2) Chat Input Copy (Alignment + Focus)

- Update the chat input placeholder to exactly:
  - `Ask a question, log a moment, or track anything…`
- Remove or avoid any other explanatory copy in Chat.
- Chat should visually and cognitively point to **one** primary action: typing into the composer.

### 3) Copy Action (Icon + Tooltip)

- Replace the “Copy” text button for messages with an **icon‑only** control.
- On hover (desktop) or long‑press (mobile), show a tooltip with exactly:
  - `Copy`
- Do **not** change:
  - Copy behavior (what text is copied).
  - Placement of the control.
  - Any share behavior.

### 4) Share Icon (Modernization)

- Replace the current share icon with a **modern arrow‑style share icon** (similar to ChatGPT’s export/share affordance).
- Behavior remains unchanged; this is a **visual update only**.

### 5) Chat Header / Title Behavior

- Remove the generic `"Conversation"` label from Chat.
- Behavior should be:
  - Before first user message:
    - No title shown.
  - After the first meaningful exchange:
    - Show an auto‑generated title.
    - The title appears in the Chat header where `"Conversation"` previously appeared.
- The word `"Conversation"` must **never** appear in the Chat UI.

---

## Git + GitHub Workflow

Follow this workflow for every new feature or change in the Chat area.

### Branching

- Never work directly on `main` or `develop`.
- Create a feature branch off `develop`:
  - `feature/<short-descriptive-name>`

### Start Work

1. Ensure you are up to date:
   - `git checkout develop`
   - `git pull`
2. Create a feature branch:
   - `git checkout -b feature/<name>`

### Before Coding

- Identify which **core use cases / flows** this feature touches (e.g., chat, sharing, history).
- Reference the CORE_PLAYBOOK (or equivalent living doc).
- If behavior changes, update docs/specs first or alongside code.

### During Development

- Make small, focused commits (one logical change per commit).
- Add or update tests for any behavior change.
- Keep diffs scoped; avoid drive‑by refactors.

### Before Committing

- Run existing tests and lint where applicable.
- Review `git diff` to confirm only the intended files changed.

### Commit

- Use a clear, descriptive commit message:
  - `<area>: <what changed>`
  - Example: `guidance: add toddler hitting response flow`

### Push

- Push the feature branch:
  - `git push -u origin feature/<name>`

### Pull Request

- Open a PR targeting `develop`.
- PR description must include:
  - What problem this solves (1–2 sentences).
  - Which core use cases / flows are affected.
  - Tests run (pass/fail and why).
  - Any known limitations or follow‑ups.

### Review & Merge

- Address review feedback on the feature branch.
- Merge into `develop` only after tests pass and docs/specs are updated.

### After Merge

- Delete the feature branch locally and remotely.
- Sync local `develop`:
  - `git checkout develop`
  - `git pull`

### Rules

- `main` is updated only from `develop`.
- Every feature must reference core behaviors/use cases.
- Docs and tests are part of the feature, not optional.

---

## Process (Follow Strictly for Chat Changes)

### 0) Plan First (Do Not Code Yet)

- Identify the files/components responsible for:
  - Chat system message.
  - Chat input placeholder.
  - Message action buttons (copy/share).
  - Chat header/title rendering.
- Confirm which CORE_PLAYBOOK core flows are touched (chat, sharing, etc.).
- Propose a concise plan listing:
  - Files to change.
  - What will change in each.
  - Any edge cases (first‑time user vs returning user, tooltip behavior).

### 1) Ask Questions if Needed

- Ask up to 3 clarifying questions **only if required** to proceed safely.

### 2) Implement

- Make the smallest diff possible.
- Do not refactor or touch unrelated components.
- Do not touch Home screen code.

### 3) Test + Verify

- Run:
  - `cd apps/web && npm test`
- If lint is part of the repo workflow, run it and report results.
- Manually verify:
  - First message appears once only (first‑ever user only).
  - Placeholder text is correct.
  - Copy tooltip reads `Copy`.
  - Share icon renders correctly.
  - `"Conversation"` label never appears.

### 4) Wrap Up for PR

- Provide:
  - `git status`
  - Summary of changes
  - Tests run
  - Known limitations / follow‑ups

### Scope Guardrail

- If any scope creep is detected (e.g., changes leaking into Home screen or non‑Chat flows), **stop and ask** for clarification before proceeding.

