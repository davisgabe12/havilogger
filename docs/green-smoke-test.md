# HAVI GREEN smoke test (local)

Goal: verify auth + onboarding + /app load with Supabase-backed settings.

## Prereqs
- API running on `http://127.0.0.1:8001`
- Web running on `http://localhost:3000`
- `apps/web/.env.local` has `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001`
- `SUPABASE_SERVICE_ROLE_KEY` set for the API process (required for invite acceptance).
- Optional (only if Supabase email confirmation is enabled):
  - `GREEN_EXISTING_EMAIL` + `GREEN_EXISTING_PASSWORD` (confirmed user)
  - `GREEN_INVITEE_EMAIL` + `GREEN_INVITEE_PASSWORD` (confirmed user)

## Commands
```bash
# One-command GREEN doctor (starts web + api, runs E2E, saves artifacts)
cd apps/web
npm run green:doctor

# From anywhere (no cd):
# npm --prefix /Users/gabedavis/Desktop/projects/havilogger/apps/web run green:doctor

# Terminal 1
cd apps/api
uvicorn app.main:app --reload --port 8001

# Terminal 2
cd apps/web
# If port 3001 is already in use:
#   lsof -iTCP:3001 -sTCP:LISTEN
#   kill -9 <PID>
npm run dev -- --port 3001

# Optional: automated GREEN flow + screenshots
cd apps/web
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npm run test:green
```
Smoke test source: `apps/web/tests/smoke/green.spec.ts`

## Troubleshooting
- If Playwright cannot bind to `localhost:3000` (EPERM/EADDRINUSE), stop any running dev server or set `PLAYWRIGHT_BASE_URL` to an already-running web server (this skips starting web/api servers) and rerun `npm run test:green`.

## What the smoke test proves
- Marketing `/` is unauthenticated and renders without app UI.
- Sign-up UI works in both instant and email-confirmation-required modes.
- Sign-in, sign-out, and forgot-password success state.
- Family onboarding (create family + child) with Supabase persistence.
- Multi-child creation and active-child switching with scoped tasks/timeline/chat.
- Invite flow (create invite link, accept as second user, access verified).
- Timeline events are stored with timezone-aware timestamps and render with timezone context.
- Memory lifecycle (suggested → confirm/reject → saved) and explicit memory save.
- Share links for conversation + memory render in a logged-out context.
- No console errors on the GREEN path (test fails if any console error).

## Sharing security pattern
Share links are served via the `public_share_by_token` RPC (security definer) and only accept a
random token. The web app never uses a service-role key; it calls `/api/v1/share/*` which in turn
creates a tokenized `share_links` row and resolves shared content via the RPC.

## What the smoke test does NOT prove (yet)
- Email confirmation flows cannot be completed without valid confirmed user credentials
  (`GREEN_EXISTING_EMAIL` / `GREEN_INVITEE_EMAIL`). If Supabase requires confirmation
  and these env vars are missing, the test aborts early with a clear error.

## Browser checklist (incognito)
1) Visit `/` → marketing only (no app UI).
2) `/auth/sign-up` → create account.
3) `/auth/sign-in` → sign in; lands at `/app`.
4) If no family → `/app/onboarding/family`:
   - Create family, redirects to `/app/onboarding/child`.
5) If no child → `/app/onboarding/child`:
   - Enter birth date OR due date.
   - Select gender.
   - If birth date used → enter birth weight.
   - Submit → redirects to `/app`.
6) Refresh `/app`:
   - No onboarding loop.
   - Settings show saved values.
7) Sign out → `/auth/sign-in`.
8) Signed out visiting `/app` → redirect to `/auth/sign-in`.

## API verification (devtools)
- All API calls hit `http://127.0.0.1:8001/api/v1/*`
- `/api/v1/settings` returns 200 when signed in
- Request includes `Authorization: Bearer <jwt>`

## Service-role safety check
- Confirm **no** `NEXT_PUBLIC_*` env var contains a service role key.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is only referenced in server-only API code (`apps/api/app/supabase.py`).

## Playwright artifacts
- Screenshots saved to `docs/green-proof/<timestamp>/` (GREEN doctor creates a timestamped folder).
- Logs and traces saved to `apps/web/test-results/`

GREEN doctor also writes `api.log`, `web.log`, `console-errors.log`, and `failure.txt` into the same
timestamped folder when failures occur.
