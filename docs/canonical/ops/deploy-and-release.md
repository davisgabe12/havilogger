Status: current
Last updated: March 10, 2026

# HAVI Deploy And Release Runbook

Use this as the canonical checklist for shipping `main` to production and proving the release is safe.

## Platform topology (current)

1. Web: Vercel (`https://gethavi.com`)
2. API: Railway (`https://api-production-0a5d.up.railway.app`)
3. Data/Auth: Supabase

## Release flow

1. Confirm local branch and commit state

```bash
git branch --show-current
git status -sb
git log --oneline -n 5
```

2. Push release commits to `main`

```bash
git push origin main
```

3. Wait for production deploy propagation (Vercel + Railway) and run health checks

```bash
curl -I https://gethavi.com
curl -s -o /dev/null -w "%{http_code}\n" https://api-production-0a5d.up.railway.app/health
```

If API behavior does not match the pushed commit, verify Railway deployment metadata before running smoke gates:

```bash
npx @railway/cli deployment list --service api --json | jq -r '.[0:3][] | "\(.id) \(.status) providers=\(.meta.nixpacksProviders // []) config=\(.meta.configFile // "")"'
```

Expected latest deployment shape:
1. `providers=["python"]`
2. `config=railway.toml`
3. status eventually `SUCCESS`

If manual API deploy is needed, run from `apps/api` so Railway does not infer a Node root:

```bash
./scripts/prod_api_deploy_wait.sh
```

The helper script performs deploy + wait + provider/config verification (`python`, `railway.toml`) and fails fast on wrong-context or stuck rollouts.

4. Run canonical release gate (core + UI smoke, bounded retry)

```bash
HAVI_RELEASE_LABEL=after-<slice-name> ./scripts/prod_release_gate.sh
```

Default behavior:
1. Runs `./scripts/prod_core_smoke.sh` once with the release label.
2. Runs `./scripts/prod_ui_smoke_gate.sh` and, if the first full gate fails, retries once with a new derived label.
3. Writes one summary artifact:
`docs/active/green-proof/prod-release-gate-<label>.json`

You can tune retry budget:

```bash
HAVI_RELEASE_LABEL=after-<slice-name> HAVI_UI_GATE_EXTRA_ATTEMPTS=2 ./scripts/prod_release_gate.sh
```

5. Optional manual UI-only confirmation (if you need extra evidence beyond release gate)

```bash
HAVI_UI_SMOKE_LABEL=after-<slice-name>-manual ./scripts/prod_ui_smoke_gate.sh
```

6. Curate release proof bundle (required)

Create:
`docs/active/green-proof/releases/<YYYY-MM-DD>-<slice-name>/`

Include:
1. core smoke JSON report
2. GREEN pass artifact (txt/json/log)
3. 3-8 key screenshots
4. `README.md` with commit, commands, and pass/fail summary

7. Write release note

Create:
`docs/active/releases/<YYYY-MM-DD>-<slice-name>.md`

Minimum sections:
1. user-facing change summary
2. why it matters
3. validation status
4. proof bundle path

## Go/No-Go gate

Ship only when all are true:
1. `git push origin main` succeeds
2. production health endpoints are healthy
3. production release gate passes
5. release proof bundle is committed

## Rollback trigger and action

Rollback trigger examples:
1. core smoke fails on new-signup or existing-account flow
2. GREEN smoke fails in onboarding/chat/task critical path
3. production 5xx or auth breakage appears after deploy

Immediate response:
1. pause further merges
2. identify last known good commit on `main`
3. revert breaking commit(s) and push
4. rerun production core smoke + GREEN before closing incident

## Notes

1. Keep deploy/release commits separate from large unrelated local workspace changes.
2. Do not use raw iterative artifacts as release evidence; use curated bundle format.
3. Avoid repeated overlapping Railway deploy attempts; confirm one deployment reaches `SUCCESS` before starting another.
