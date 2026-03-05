Status: complete
Release date: March 5, 2026

# Onboarding Profile Lock Release Proof

## Scope
- Enforce required onboarding profile completion before core app usage (chat/tasks/timeline).
- Keep `/app/onboarding/child` as compatibility redirect to `/app/onboarding/profile`.

## Code references
- Commit: `c8d3dc4` (`onboarding: enforce required profile lock before core app usage`)
- Branch pushed: `main` -> `origin/main`

## Validation commands and outcomes
1. API contract tests:
   - Command: `cd apps/api && ../../.venv/bin/pytest tests/test_onboarding_profile.py tests/test_invites.py -q`
   - Result: `6 passed`
2. Production core smoke:
   - Command: `./scripts/prod_core_smoke.sh`
   - Result: pass for existing-account and new-signup flows
   - Artifact: `prod-core-smoke-manual-20260305103115.json`
3. Production GREEN smoke:
   - Command: `cd apps/web && PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green`
   - Result: `1 passed`
   - Artifact: `prod-green-smoke-20260305.txt`

## Included artifacts
- `prod-core-smoke-manual-20260305103115.json`
- `prod-green-smoke-20260305.txt`
- `screenshots/`:
  - `02-auth-sign-in.png`
  - `04-onboarding-family.png`
  - `05-onboarding-profile.png`
  - `07-chat-messages.png`
  - `09-task-created.png`
  - `12b-timeline-persisted.png`
  - `14-memory-saved.png`

## Notes
- This folder is the canonical release evidence bundle for this rollout.
- Raw intermediate screenshots/logs from iterative runs are intentionally excluded.
