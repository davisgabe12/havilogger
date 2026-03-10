# Release Proof Bundle: UI Reliability Hotfix (March 10, 2026)

## Commits
- `1cd946a` - core UI/API reliability fixes
- `94f9744` - deploy runbook hardening + GREEN regression coverage + release evidence/docs sync

## Scope
- Settings save-state clarity and optional caregiver fields consistency.
- Sign-out affordances (desktop side tray, mobile side tray, auth switch-account path).
- Invite-token auth return path hardening.
- Chat composer control alignment.
- Negative feedback Enter-submit acknowledgment.
- Share-link toast auto-dismiss.
- Task datetime parsing/ack fidelity (`tomorrow at 4pm`).
- Rolling-over guidance fallback hardening.

## Canonical deploy/runbook sequence executed
1. `git push origin main`
2. `curl -I https://gethavi.com`
3. `curl -s -o /dev/null -w "%{http_code}\n" https://api-production-0a5d.up.railway.app/health`
4. `HAVI_SMOKE_LABEL=after-ui-reliability-hotfix-20260310 ./scripts/prod_core_smoke.sh`
5. `HAVI_UI_SMOKE_LABEL=after-ui-reliability-hotfix-20260310 ./scripts/prod_ui_smoke_gate.sh`
6. `cd apps/web && CI=1 npx --yes playwright install chromium`
7. `HAVI_UI_SMOKE_LABEL=after-ui-reliability-hotfix-20260310-rerun ./scripts/prod_ui_smoke_gate.sh`
8. `cd apps/api && npx @railway/cli up . --service api --detach --path-as-root`
9. direct probe: `/tmp/havi_deploy_probe.sh` (verifies timed-task ack includes due time)
10. `cd apps/web && PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green`
11. `HAVI_SMOKE_LABEL=after-ui-reliability-hotfix-20260310-final ./scripts/prod_core_smoke.sh`
12. `HAVI_UI_SMOKE_LABEL=after-ui-reliability-hotfix-20260310-final ./scripts/prod_ui_smoke_gate.sh`

## Final results
- Production health: `PASS`.
- Direct production probe (timed task): `PASS`.
- Production core smoke (final): `PASS`.
- Production UI smoke gate (final, 2 consecutive): `PASS`.
- Updated GREEN smoke (includes rolling-over guidance + timed-task assertions): `PASS`.

## Included artifacts
- `prod-core-smoke-after-ui-reliability-hotfix-20260310-final.json`
- `prod-ui-smoke-after-ui-reliability-hotfix-20260310-final.json`
- `run-1-final.log`
- `run-2-final.log`
- `screenshots/`:
  - `01-sign-in.png`
  - `02-select-family.png`
  - `03-chat-home.png`
