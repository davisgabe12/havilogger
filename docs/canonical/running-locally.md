Status: current
Last updated: March 3, 2026

# Running Havi Locally (Supabase Mode)

This project now runs against Supabase for auth and data. Local API + web should use the same env keys as production, pointed at your chosen Supabase project.

Important: Havi does not use a local SQL database in this mode. Supabase is remote, and this repo's local app processes connect to that remote project.

## Prerequisites

- Python virtualenv exists at `.venv` in repo root.
- Node modules installed in `apps/web`.
- Supabase project credentials available.

## 1. API env (`apps/api/.env.local`)

Required:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Optional but recommended:

- `HAVI_SITE_URL=http://127.0.0.1:3001` for local invite/share links
- SMTP invite delivery (optional; invite link still returned if unset):
  - `HAVI_SMTP_HOST`
  - `HAVI_SMTP_PORT`
  - `HAVI_SMTP_USERNAME`
  - `HAVI_SMTP_PASSWORD`
  - `HAVI_SMTP_FROM_EMAIL`
  - `HAVI_SMTP_USE_SSL` / `HAVI_SMTP_STARTTLS`

## 2. Web env (`apps/web/.env.local`)

Required:

- `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`
- `NEXT_PUBLIC_SUPABASE_URL` (same Supabase URL as API env)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same anon key as API env)

Optional:

- `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3001`

## 3. Start local stack

API:

```bash
cd apps/api
../../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Web:

```bash
cd apps/web
npm run dev -- --port 3001
```

If you use Codex sandboxed commands and see `operation not permitted`/`EPERM` on `127.0.0.1` bind:

1. Start services from your normal terminal (outside sandbox), or
2. Run Codex commands with elevated permissions, then rerun smoke checks.

## 4. Smoke checks

- API health: `http://127.0.0.1:8000/health` returns `{"status":"ok"}`
- Web auth pages load:
  - `http://127.0.0.1:3001/auth/sign-up`
  - `http://127.0.0.1:3001/auth/sign-in`
- App loads after sign-in: `http://127.0.0.1:3001/app`

## 5. Known local behavior

- If Supabase `Confirm email` is disabled, new sign-ups can sign in immediately.
- If `Confirm email` is enabled, sign-up succeeds but first sign-in requires email verification.
- The backend expects valid Supabase Bearer tokens on `/api/v1/*` routes.
- In constrained runtimes, frontend dev server may fail with `ETIMEDOUT` while starting. Rerun `npm run dev -- --port 3001`, then verify `/auth/sign-in` returns HTTP 200 before running full smoke.
- If `npm run build` fails with missing `.next/dev/types/cache-life.d.ts`, clear Next cache and retry:
  - `rm -rf apps/web/.next`
  - `cd apps/web && npm run build`

## 6. Build/test quick commands

```bash
cd apps/web && npm run build
cd apps/api && ./.venv/bin/python -m pytest tests/test_question_detection.py -q
cd apps/api && ./.venv/bin/python -m pytest tests/test_invites.py tests/test_care_team_route.py -q
```
