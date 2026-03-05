Status: shipped
Date: March 5, 2026

# HAVI Release Note: Required Onboarding Profile Lock

## What changed for families
1. New families now complete a required profile step before core app usage.
2. Core app actions (chat, tasks, timeline) stay locked until required profile data is complete.
3. If users reach `/app` before completing profile, they see a clear `Complete profile` path.

## Why this matters
- Prevents confusing "app loads but breaks later" behavior.
- Improves first-session reliability for non-technical caregivers.
- Aligns onboarding data quality with downstream chat/task personalization needs.

## Technical summary
- Canonical step: `/app/onboarding/profile`
- Compatibility route: `/app/onboarding/child` redirects to `/app/onboarding/profile`
- Guard behavior updated to enforce profile-complete requirement before core interactions
- API onboarding + invite tests added/updated

## Evidence
- Canonical proof bundle:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-05-onboarding-profile-lock/`

## Validation status
1. API tests: pass (`6 passed`)
2. Production core smoke: pass (existing-account + new-signup)
3. Production GREEN smoke: pass (`1 passed`)

## Follow-on
1. Keep compatibility redirect for one release cycle.
2. Remove legacy `/app/onboarding/child` route after traffic confirms low/no usage.
