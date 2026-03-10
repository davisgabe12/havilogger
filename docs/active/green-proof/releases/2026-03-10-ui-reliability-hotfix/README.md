# Release Proof Bundle: UI Reliability Hotfix (March 10, 2026)

## Commit
- `1cd946a` (`main`)

## Scope
- Settings save-state clarity and optional caregiver fields consistency.
- Sign-out affordances (side tray + auth screens).
- Invite-token auth return path hardening.
- Chat composer control alignment.
- Negative feedback Enter-submit acknowledgment.
- Share-link toast auto-dismiss.
- Task datetime parsing/ack fidelity (`tomorrow at 4pm`).
- Rolling-over guidance fallback hardening.

## Commands run
1. `git push origin main`
2. `curl -I https://gethavi.com`
3. `curl -s -o /dev/null -w "%{http_code}\n" https://api-production-0a5d.up.railway.app/health`
4. `HAVI_SMOKE_LABEL=after-ui-reliability-hotfix-20260310 ./scripts/prod_core_smoke.sh`
5. `HAVI_UI_SMOKE_LABEL=after-ui-reliability-hotfix-20260310 ./scripts/prod_ui_smoke_gate.sh` (initially failed due missing local Playwright browser binary)
6. `cd apps/web && CI=1 npx --yes playwright install chromium`
7. `HAVI_UI_SMOKE_LABEL=after-ui-reliability-hotfix-20260310-rerun ./scripts/prod_ui_smoke_gate.sh`

## Results
- Production core smoke: `PASS`.
- Production UI smoke gate (2 consecutive): `PASS` on rerun after browser install.
- Production health: `PASS` (site + API).

## Included artifacts
- `prod-core-smoke-after-ui-reliability-hotfix-20260310.json`
- `prod-ui-smoke-after-ui-reliability-hotfix-20260310-rerun.json`
- `run-1.log`
- `run-2.log`
- `screenshots/`:
  - `01-sign-in.png`
  - `02-select-family.png`
  - `03-chat-home.png`

## Caveats
- A stricter GREEN assertion for timed chat-created tasks (`tomorrow at 4pm`) was added after this gate and is intended to be re-run once the latest API deploy is fully propagated.
