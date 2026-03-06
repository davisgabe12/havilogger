Status: implemented
Last updated: March 4, 2026

# SID-61 Spec-Driven Plan (Revised v2): Required Signup Profile Step + App-Use Guard

## Findings (first)

### Critical

1. `Priority 97/100` - Required caregiver profile is not collected in signup/onboarding.
   - Current state:
     - `/auth/sign-up` collects only email/password.
     - Caregiver first/last/email/phone are settings-era fields, not onboarding-required fields.
   - Impact: new users can reach product without required identity/contact profile.

2. `Priority 95/100` - Current guard gates route entry, not profile completeness.
   - Current state:
     - Guard checks auth + family membership + child presence.
     - It does not enforce required caregiver/child profile completeness before core feature use.
   - Impact: incomplete onboarding can enter `/app` and fail later through fallback flows.

3. `Priority 93/100` - Onboarding child path uses settings fallback transport.
   - Current state:
     - `onboarding/child` performs `GET /api/v1/settings` + `PUT /api/v1/settings` read/modify/write.
   - Impact: fragile first-session behavior and stale merge risk.

### High

4. `Priority 88/100` - Required field contract mismatches product requirement.
   - Required contract for this change:
     - Family care name.
     - Caregiver first/last/email/phone.
     - Child name (Unknown allowed), DOB or due date, birth weight, last known weight, timezone.
   - Current onboarding does not enforce this set.

5. `Priority 83/100` - Existing smoke tests do not lock this contract.
   - Current smoke paths tolerate settings fallback modal behavior.
   - Impact: incomplete onboarding regressions can slip.

## Goal + measurable success metrics

### Goal

Add a required profile step after family creation and before usable core app interaction, so required family/caregiver/child data is collected once and pre-populates settings.

### Success metrics

1. 100% of new accounts that can use core app features have persisted:
   - family care name
   - caregiver first/last/email/phone
   - child name, DOB or due date, birth weight, last known weight, timezone.
2. New-account flow reaches `/app` with no setup-settings fallback requirement.
3. If profile is incomplete for any reason, user may still land on `/app`, but core feature use is blocked until completion.
4. Inline validation appears on all required fields in onboarding profile step.

## Non-goals

1. No historical backfill/migration for legacy incomplete data.
2. No redesign of settings architecture.
3. No changes to guidance-vs-logging invariant or chat intent routing.
4. No auth provider changes.

## Assumptions + constraints

1. Timezone behavior should follow current pattern:
   - auto-detect on client via `Intl.DateTimeFormat().resolvedOptions().timeZone`,
   - prefill select,
   - editable by user,
   - no explicit “confirm timezone” interaction required.
2. Route resilience requirement:
   - users may still enter `/app` if step flow breaks,
   - but app-use guard prevents chat/tasks/timeline/actions until required profile is complete.
3. Keep first implementation small/reversible and compatible with existing settings edit flow.

## Current vs proposed user journey (screen-by-screen)

## Current (today)

1. Screen: `/auth/sign-up`
   - Fields: email, password.
2. Screen: `/app/onboarding/family`
   - Field: family name.
3. Screen: `/app/onboarding/child`
   - Fields: child name, DOB/due date, gender, birth weight (conditional), timezone.
   - Missing required contract: caregiver first/last/email/phone, last known weight.
4. Screen: `/app`
   - Can rely on setup fallback patterns if data missing.

## Proposed (v1)

1. Screen: `/auth/sign-up`
   - Keep email/password account creation.
2. Screen: `/app/onboarding/family`
   - Required field: family care name.
3. Screen: `NEW /app/onboarding/profile` (required profile step)
   - Part A: Primary caregiver.
   - Part B: Child profile.
4. Screen: `/app`
   - User can land here.
   - If profile complete: app usable.
   - If incomplete: guard lock prevents core use and routes user into completion CTA.

## Layout plan for `/app/onboarding/profile` (Jony Ive lens)

Design intent: reduce cognitive load through progressive disclosure, calm hierarchy, and single-purpose interactions.

1. Page structure
   - Centered card on clean background.
   - Clear step header with progress: `Step 2 of 2: Complete profile`.
   - One primary action per section.

2. Part A: “Primary caregiver”
   - Fields (required):
     - First name
     - Last name
     - Email (prefilled from auth email)
     - Phone
   - Copy: concise, plain language about why this is needed.
   - Interaction:
     - `Continue` button disabled until valid.
     - Inline errors directly below fields.

3. Part B: “Child profile”
   - Fields (required):
     - Child name (allow `Unknown`)
     - DOB or due date (segmented mode: `Born` / `Expected`)
     - Birth weight
     - Last known weight
     - Timezone (prefilled, editable, no explicit confirmation tap)
   - Date mode behavior:
     - `Born`: require DOB.
     - `Expected`: require due date.
     - Due date optional when DOB is provided.
   - Weight behavior:
     - If child is expected, allow `Unknown` text entry for weight values.
   - Interaction:
     - Persistent progress context.
     - Final action: `Finish setup`.

4. Mobile/desktop behavior
   - Mobile: single-column stacked fields.
   - Desktop: still single-column for clarity (avoid split attention).

## Proposed solution

### Recommendation

Use a dual strategy for v1:

1. Add required profile step in onboarding flow.
2. Add app-use guard lock in `/app` so users can enter route but cannot use core features until profile completion.

Why this is better for v1:

1. More resilient to flow breakage (route entry still possible).
2. Lower risk than hard redirect-only gating.
3. Clearer recovery path for partially onboarded users.

## Exact file-level change plan (expected diffs)

### Web

1. `apps/web/src/app/app/onboarding/family/page.tsx`
   - Validate non-empty family care name.
   - Redirect to `/app/onboarding/profile` after success.

2. `apps/web/src/app/app/onboarding/profile/page.tsx` (new)
   - Implement 2-part progressive form (caregiver then child).
   - Field-level inline validation.
   - Timezone prefill/edit behavior matching current logic.
   - Submit to new onboarding API endpoint.
   - Persist selected child ID locally before routing to `/app`.

3. `apps/web/src/app/app/page.tsx`
   - Add app-use guard lock when profile incomplete:
     - block chat send,
     - block task creation/actions,
     - block timeline/task/history navigation interactions,
     - show focused completion panel/CTA to onboarding profile screen.
   - Keep current route rendering for resilience.

4. `apps/web/src/lib/guards/family-guard.ts`
   - Keep existing auth/family/child routing decisions.
   - Optionally add explicit signal type for `profileIncomplete` if needed by app shell.

5. `apps/web/src/lib/guards/use-family-guard.ts`
   - Fetch profile completeness inputs alongside current checks.
   - Expose completeness state to app shell (without mandatory route redirect).

6. `apps/web/src/lib/guards/__tests__/family-guard.test.ts`
   - Add/adjust tests for completeness signal behavior.

7. `apps/web/src/app/app/onboarding/child/page.tsx`
   - Convert to compatibility redirect to `/app/onboarding/profile` or remove from primary path.

8. `apps/web/tests/smoke/green.smoke.spec.ts`
9. `apps/web/tests/smoke/green.spec.ts`
   - Update flow to complete new profile step.
   - Add assertions:
     - app-use lock appears if profile incomplete,
     - app-use lock absent after completion.

### API

10. `apps/api/app/main.py`
    - Add `POST /api/v1/onboarding/profile`.
    - Validate required family/caregiver/child contract.
    - Upsert caregiver and child fields.
    - Return settings-compatible payload + `selected_child_id`.

11. `apps/api/tests/test_onboarding_profile.py` (new)
    - Success path.
    - Required-field failure cases.
    - `Unknown` child name acceptance.
    - Timezone default/edit acceptance.

### Docs

12. `docs/canonical/authentication-and-family-gating.md`
    - Document app-use guard model:
      - route entry may occur,
      - core app interactions locked until profile completion.

13. `docs/canonical/green-smoke-test.md`
    - Update onboarding flow and app-use lock expectations.

14. `docs/active/current-state/core-e2e-validation-2026-03-02.md` (or new dated note)
    - Record evidence for new flow.

## API/data contract impact

1. New endpoint:
   - `POST /api/v1/onboarding/profile`
2. Existing endpoints:
   - Keep `PUT /api/v1/settings` for subsequent edits.
3. Data writes:
   - `family_members`: caregiver first/last/email/phone
   - `children`: name, DOB/due date, birth weight, latest_weight (last known), timezone.

## Required field contract (authoritative for this change)

1. Family
   - Family care name: required.
2. Primary caregiver (account owner)
   - first name: required
   - last name: required
   - email: required
   - phone: required
3. Child
   - name: required (`Unknown` accepted)
   - DOB or due date: at least one required
   - if DOB is present, due date optional
   - birth weight: required (allow `Unknown` token for expected-path fallback)
   - last known weight: required (allow `Unknown` token for expected-path fallback)
   - timezone: required, auto-detected + editable, no explicit confirm click.

## Explicit test matrix

### Unit/logic

1. Onboarding-profile form validation tests.
2. App-use guard lock behavior tests (locked vs unlocked).
3. Guard completeness signal tests.

### API integration

1. `cd apps/api && ../../.venv/bin/pytest tests/test_onboarding_profile.py -q`
2. `cd apps/api && ../../.venv/bin/pytest tests/test_knowledge_inference.py -q`

### Web smoke/E2E

1. `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green`
2. `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green:full`
3. Assertions:
   - required profile step appears after family creation,
   - inline validation present,
   - `/app` is unusable when profile incomplete,
   - `/app` becomes usable after completion.

### Production gate (if deployed)

1. `HAVI_SMOKE_LABEL=before-sid61-profile-step-v1 ./scripts/prod_core_smoke.sh`
2. `HAVI_SMOKE_LABEL=after-sid61-profile-step-v1 ./scripts/prod_core_smoke.sh`

## Rollout + rollback

### Rollout

1. Add API endpoint + tests.
2. Add onboarding profile screen.
3. Add app-use lock behavior in app shell.
4. Update smoke tests and run local GREEN.
5. Run before/after production smoke if shipped.
6. Update canonical docs.

### Rollback

1. Disable onboarding-profile route usage from family step.
2. Disable app-use lock branch in app shell.
3. Keep API endpoint inactive if frontend rollback is needed.

## Risks + mitigations

1. Risk: too-strict lock blocks users unexpectedly.
   - Mitigation: route still accessible; explicit completion CTA and deterministic validation copy.
2. Risk: conflicting “Unknown” semantics for weights.
   - Mitigation: normalize to explicit null/flag server-side and document exact persistence rule.
3. Risk: complexity in app page lock conditions.
   - Mitigation: centralize completeness predicate in one helper with unit tests.
4. Risk: docs drift.
   - Mitigation: docs update required in acceptance gate.

## Acceptance criteria (binary)

1. New account flow includes required profile step after family creation.
2. Required fields exactly match the contract above.
3. Timezone follows current behavior (auto-detect + editable), no explicit confirmation action required.
4. Users may still enter `/app`, but cannot use core app interactions until profile is complete.
5. Completed profile pre-populates settings; no duplicate required re-entry in settings.
6. New-account smoke passes on updated flow.

## Implementation outcome (March 4, 2026)

### Shipped in code

1. New required profile step route is live in web:
   - `/app/onboarding/profile`
   - progressive two-part form (caregiver then child)
   - required inline validation and explicit field messaging
2. Family onboarding now routes to `/app/onboarding/profile`.
3. Legacy `/app/onboarding/child` now compatibility-redirects to `/app/onboarding/profile`.
4. New API endpoint added:
   - `POST /api/v1/onboarding/profile`
   - validates required caregiver + child fields
   - persists caregiver + child profile and returns settings payload
5. App-use guard behavior added:
   - `/app` can still load
   - core use is blocked by profile lock modal until required fields are complete
   - CTA routes to `/app/onboarding/profile`
6. Guard routing updated:
   - no-child redirect target changed to `/app/onboarding/profile`
7. Smoke flows updated for new onboarding path and lock behavior.
8. Canonical docs updated:
   - `docs/canonical/authentication-and-family-gating.md`
   - `docs/canonical/green-smoke-test.md`

### Validation evidence

1. API tests: `cd apps/api && ../../.venv/bin/pytest tests/test_onboarding_profile.py -q`
   - Result: 4 passed
2. Web build: `cd apps/web && npm run build`
   - Result: passed
3. GREEN smoke: `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green`
   - Result: passed

### Residual gaps

1. Local Jest baseline issue remains unrelated to SID-61 code:
   - `Cannot find module './util/iterationDecorator'` from `aria-query`
2. Full GREEN suite (`test:green:full`) currently fails on an existing chat assertion path; core SID-61 onboarding smoke path is green.
7. Guidance vs logging invariants remain intact.

## Recommended first implementation slice

1. Add `POST /api/v1/onboarding/profile` with required-field validation + tests.
2. Add `/app/onboarding/profile` form with two-part layout and inline validations.
3. Add app-use lock in `/app` for incomplete profile state.
4. Update GREEN smoke onboarding path and lock/unlock assertions.
