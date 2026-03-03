# Havi Development Guidelines (Project-Wide)

These guidelines apply to **all work** in the Havi monorepo at:
`~/Desktop/projects/havilogger`

Feature‑specific docs (for example, `docs/canonical/chat-ui-dev-guidelines.md`) may add extra rules; in that case, follow both this file and the feature‑specific doc.

---

## Branching & Environments

- Never work directly on `main` or `develop`.
- For any change (feature, bugfix, or docs):
  1. Update local `develop`:
     - `git checkout develop`
     - `git pull`
  2. Create a feature branch:
     - `git checkout -b feature/<short-descriptive-name>`
- `main` is updated only from `develop`.

---

## Planning (Before Coding)

- Identify which **core use cases / flows** the change touches.
  - Examples: chat, tasks, timeline, knowledge review, sharing, settings, docs.
- Check existing docs/specs:
  - `docs/canonical/architecture.md`, `docs/canonical/core-flows.md`, `docs/canonical/testing.md`, and any feature‑specific docs.
- Write a short plan:
  - Files to change (paths).
  - What will change in each file.
  - Any edge cases (e.g., first‑time vs returning user, mobile vs desktop).
- If anything is unclear, ask up to a few **focused clarifying questions** before implementing.

---

## During Development

- Keep changes **small and focused**:
  - One logical change per commit where possible.
  - Avoid drive‑by refactors or unrelated cleanup in the same diff.
- Prefer clarity over cleverness:
  - Match existing patterns and style in the surrounding code.
  - Respect feature‑specific constraints (e.g., “Chat only; do not touch Home” when applicable).
- Update or add tests whenever behavior changes:
  - Backend: add/adjust pytest tests under `apps/api/tests/`.
  - Frontend: add/adjust Jest/RTL tests under `apps/web/src/**/__tests__`.
- Update relevant docs/specs:
  - If behavior changes, amend or create docs in `docs/` as part of the same feature.

---

## Testing & Linting

- Backend:
  - Run from `apps/api`:
    - `pytest`
  - If `pytest` is missing, set up the venv + deps (see `docs/canonical/testing.md`) and call that out in your notes.
- Frontend:
  - Run from `apps/web`:
    - `npm test`
    - `npm run lint` (even if there are known pre‑existing warnings; report them, don’t silently ignore).
- Before committing:
  - Review `git diff` to ensure only the intended files changed.
  - Confirm tests relevant to your change have been run and their results are documented.

---

## Commit Messages

- Use clear, descriptive messages:
  - `<area>: <what changed>`
  - Examples:
    - `chat: update first-system message copy`
    - `timeline: fix event timezone normalization`
    - `docs: add dev guidelines`
- Prefer multiple small commits over one large, mixed commit.

---

## Pull Requests

- Open PRs targeting `develop`:
  - `feature/<name>` → `develop`
- PR descriptions must include:
  - **Problem**: 1–2 sentences describing what this change solves.
  - **Affected flows**: which user flows / endpoints / components are impacted.
  - **Tests**: commands run + results (pass/fail with brief reason).
  - **Known limitations / follow‑ups**: anything intentionally left out or noted as tech debt.
- Keep PRs scoped:
  - Avoid mixing unrelated changes (e.g., chat tweaks + timeline refactor) in one PR.

---

## Review & Merge

- Address review feedback on the feature branch.
- Only merge when:
  - Relevant tests pass (or failures are understood and explicitly accepted).
  - Docs/specs covering the change are updated.
- After merge:
  - Delete the feature branch locally and remotely.
  - Sync `develop`:
    - `git checkout develop`
    - `git pull`

---

## Process Checklist (Per Change)

1. **Plan**
   - Identify scope, files, flows, and consult docs/specs.
2. **Clarify**
   - Ask targeted questions if something is ambiguous.
3. **Implement**
   - Apply the smallest diff that achieves the goal.
   - Respect feature‑specific constraints (e.g., “Chat only”).
4. **Test**
   - Run backend/frontend tests and lint as applicable.
   - Manually verify key flows affected by the change.
5. **Review & PR**
   - Ensure `git diff` matches the plan.
   - Write a clear PR description (problem, flows, tests, limitations).

By default, all future work in this repo should follow this `dev-guidelines.md` plus any additional constraints in feature‑specific docs. 
