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
cd apps/api
npx @railway/cli up . --service api --detach --path-as-root
```

4. Run production core smoke gate

```bash
HAVI_SMOKE_LABEL=after-<slice-name> ./scripts/prod_core_smoke.sh
```

5. Run production GREEN smoke gate

```bash
cd apps/web
PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green
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
3. production core smoke passes
4. production GREEN smoke passes
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
