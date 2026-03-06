Status: complete
Release date: March 6, 2026

# Homepage Brand Refresh Release Proof

## Scope
- Homepage narrative + visual refresh.
- New homepage section structure, copy contract, and product imagery.
- Canonical design docs/spec sync for homepage phase.

## Code references
- Commit: `9ae1c92` (`homepage: ship brand refresh, imagery, and canonical specs`)
- Branch pushed: `main` -> `origin/main`

## Validation commands and outcomes
1. Build gate:
   - Command: `cd apps/web && npm run build`
   - Result: pass
2. Production core smoke:
   - Command: `./scripts/prod_core_smoke.sh`
   - Result: pass for existing-account and new-signup
   - Artifact: `prod-core-smoke-after-homepage-brand-refresh-2026-03-06.json`
3. Production GREEN smoke:
   - Command: `cd apps/web && PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green`
   - Result: failed (onboarding redirect timeout, non-homepage path)
   - Artifact: `prod-green-smoke-20260306.txt`
4. Live homepage content verification:
   - Command: `curl -s https://gethavi.com | rg ...`
   - Result: pass for hero copy, comparison section, testimonials, and new image URLs.

## Included artifacts
- `prod-core-smoke-after-homepage-brand-refresh-2026-03-06.json`
- `prod-green-smoke-20260306.txt`
- `screenshots/`:
  - `01-homepage-desktop.png` (captured homepage surface)
  - `02-hero-thread-asset.png` (deployed hero visual)
  - `03-comparison-companion-asset.png` (deployed comparison visual)

## Notes
- Homepage slice is validated for deploy/render and core platform stability.
- GREEN failure is tracked as onboarding-path instability and should be triaged separately from homepage release quality.
