Status: active-plan
Last updated: March 3, 2026

# SID-60 to SID-63 Spec-Driven Execution Plan

## Summary

This plan sequences four linked issues to reduce parent-facing failures first, then make release validation deterministic, then improve onboarding quality:

1. `SID-60` (onboarding/core app reliability)
2. `SID-63` (false-negative GREEN smoke race)
3. `SID-62` (deterministic post-deploy release gate)
4. `SID-61` (required onboarding profile UX/policy)

## Goals / Non-goals

Goals:
- Ensure new users can always reach core app after signup/onboarding.
- Remove false-negative smoke outcomes that slow delivery.
- Add a deterministic release gate that proves core flows on production.
- Move required caregiver/child profile collection into onboarding flow (not settings fallback).

Non-goals:
- Broad design-system refactors outside affected onboarding/chat/task surfaces.
- Historical data remediation for legacy misclassified timeline events.
- Large auth/security posture redesign beyond existing launch posture.

## User stories

- As a new parent, I can sign up, finish onboarding once, and immediately use chat/tasks.
- As a returning caregiver, app startup does not bounce me into stale setup guard states.
- As engineering, GREEN means real pass/fail signal and not environment race noise.
- As product, required family/child profile data is gathered before core app entry.

## Requirements (MVP vs later)

MVP (this execution window):
- `SID-60`: startup guard + active-child state are deterministic after setup save.
- `SID-63`: GREEN smoke no longer fails from `/app` redirect race during onboarding completion.
- `SID-62`: one deterministic post-deploy UI smoke path with saved artifact evidence.
- `SID-61`: onboarding collects required fields before core app; no hidden settings detour.

Later:
- Deeper onboarding UX polish for optional fields and progressive profiling.
- Expanded release matrix for browsers/locales/devices.
- Synthetic monitoring and scheduled production smoke automation.

## Proposed solution

### Workstream A: Reliability foundation (`SID-60`, `SID-63`)

- Consolidate app-entry guard behavior into a single deterministic state transition:
  - `unauthenticated -> onboarding-required -> setup-complete -> app-ready`
- On setup save:
  - persist family/child updates
  - rehydrate canonical settings payload
  - deterministically select active child in client state
  - clear setup-required modal and guard flags atomically
- Eliminate race-prone redirect timing in GREEN smoke by:
  - waiting for stable app-ready marker (DOM/test id)
  - asserting active-child selector populated before first send
  - making checks idempotent against transient route changes

### Workstream B: Release gate (`SID-62`)

- Add single canonical post-deploy script and report format:
  - `signup -> onboarding -> setup -> chat(log) -> chat(guidance) -> task create`
- Persist artifacts in `docs/active/green-proof/` with timestamp + label.
- Gate merge/release status on deterministic pass criteria and artifact presence.

### Workstream C: Onboarding product contract (`SID-61`)

- Move required caregiver/child fields to onboarding sequence and enforce before `/app`.
- Autofill child last name from family last name by default; keep editable.
- Keep settings for edits, not first-time required data capture.

## Alternatives considered

1. Build release gate first (`SID-62`) before fixing races.
- Tradeoff: faster process update, but keeps unstable signal.
- Rejected: validates flaky behavior instead of fixing it.

2. Do onboarding product changes (`SID-61`) before reliability fixes.
- Tradeoff: better UX shape early.
- Rejected: higher churn while core guard logic still unstable.

3. Address only `SID-60` and defer `SID-63`.
- Tradeoff: smaller immediate patch.
- Rejected: still slow and noisy validation loop after each change.

## Data / API / UX notes

- Data:
  - Required onboarding fields need explicit validation contract (client + API).
  - Active child id normalization must remain centralized and reused.
- API:
  - Setup/onboarding mutations should return canonical state needed to hydrate client.
  - No silent success without returned child context.
- UX:
  - If setup is incomplete, explain exactly which fields are required.
  - Do not route user to settings unexpectedly during first-run onboarding.
  - Keep chat composer disabled only with actionable reason + path to unblock.

## Risks / mitigations

- Risk: shared Supabase dev/prod data causes test contamination.
  - Mitigation: test account naming convention + deterministic cleanup notes in smoke report.
- Risk: GREEN still flakes due environment/runtime constraints.
  - Mitigation: add stable readiness assertions and explicit retry policy with bounded attempts.
- Risk: onboarding requirement changes introduce conversion friction.
  - Mitigation: keep required field set minimal and prefill known values.

## Milestones / rollout

Milestone 1 (March 3, 2026): `SID-60`
- Exit criteria:
  - new signup reaches app-ready state without manual refresh
  - active child selected after setup
  - chat send unblocked when setup complete

Milestone 2 (March 3, 2026): `SID-63`
- Exit criteria:
  - GREEN smoke no longer fails on guard redirect race in repeated runs
  - test output includes deterministic pass/fail reasons

Milestone 3 (March 3 to March 4, 2026): `SID-62`
- Exit criteria:
  - post-deploy smoke script is canonical and documented
  - artifact written for each run in `docs/active/green-proof/`

Milestone 4 (March 4, 2026): `SID-61`
- Exit criteria:
  - required onboarding fields collected before `/app`
  - settings no longer the first-run required-data fallback path

## Acceptance criteria by ticket

`SID-60`:
- From clean signup, user reaches core app with active child selected.
- No persistent "couldn’t verify your family" blocker after successful setup save.
- Core send path works with logging/guidance prompts.

`SID-63`:
- GREEN smoke passes consistently across at least 3 consecutive runs in same environment.
- Failures (if any) map to explicit failing assertion, not generic timeout/race.

`SID-62`:
- Release checklist includes deterministic post-deploy smoke command and artifact path.
- Deployment is not considered complete without smoke artifact evidence.

`SID-61`:
- Required caregiver and child profile fields blocked at onboarding until complete.
- Child last name defaults from caregiver/family last name and is editable.

## Priority ranking (0-100) with rationale

- `SID-60`: Priority 95
  - Parent-facing blocker to core app use; direct launch risk.
- `SID-63`: Priority 90
  - Engineering throughput and release confidence risk; causes repeated false alarms.
- `SID-62`: Priority 82
  - Prevents recurrence and scales verification; medium immediate user impact.
- `SID-61`: Priority 74
  - Important UX/data-quality improvement, but lower immediate outage risk.

## Open questions

- Should `SID-60` scope include the setup modal reappearance blocker tracked separately, or stay strict to active-child/guard flow?
- For `SID-61`, which exact profile fields are mandatory at launch versus optional post-launch?
- Do we require 3 consecutive GREEN passes in production or 1 pass plus artifact for each deploy?

## Test plan

- Unit/regression:
  - guard lifecycle + active-child selection helpers
  - onboarding required-field validation logic
- Integration:
  - onboarding save returns and hydrates required client state
- E2E/smoke:
  - existing account core smoke
  - new signup core smoke
  - post-deploy deterministic smoke artifact

