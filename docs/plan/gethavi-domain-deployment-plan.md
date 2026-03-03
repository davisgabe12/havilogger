# gethavi.com rollout plan (pre-launch)

Status: active-plan
Last updated: March 2, 2026

## Current state check (March 2, 2026)

- Local web + API run successfully against Supabase envs.
- Sign-up and sign-in flows validated in browser.
- Core chat flow validated:
  - logging input persists to timeline
  - guidance input returns advisory response
- One chat classification bug (implicit guidance without `?`) was found and fixed in `apps/api/app/main.py`.
- Supabase `Confirm email` is currently disabled in tested environment (fastest launch path).

Launch recommendation for this week:

1. Keep `Confirm email` disabled through first production cutover to reduce signup friction.
2. Add abuse controls immediately (rate limits + bot protection/captcha) before traffic scale.
3. Re-evaluate enabling email confirmation after onboarding friction metrics are measured.

## Execution status (March 3, 2026)

Deployment execution was advanced from local terminal:

1. Vercel project linked (`gabes-projects-4207ce9b/web`) and required production env vars set.
2. Production web deploy completed successfully:
   - `https://web-iota-flame-17.vercel.app`
3. Railway API service `api` redeployed with:
   - explicit start command via `apps/api/railway.toml`
   - required Supabase/OpenAI env vars configured in Railway production
4. Railway API health confirmed:
   - `https://api-production-0a5d.up.railway.app/health` -> `200 {"status":"ok"}`
5. Vercel domains attached to project:
   - `gethavi.com`
   - `www.gethavi.com`
6. Live deployed smoke from Vercel domain passed for:
   - sign-up
   - family + child onboarding
   - chat guidance and tracking reply
   - timeline persistence for tracked event
   - task creation
7. Temporary pre-cutover CORS bridge applied:
   - Railway `HAVI_CORS_ORIGINS` includes current Vercel deployment domain(s)
   - remove this temporary allowance after `gethavi.com` DNS cutover is complete.
8. DNS cutover applied in Squarespace:
   - custom `A @ -> 76.76.21.21`
   - custom `A www -> 76.76.21.21`
9. Temporary CORS bridge removed after DNS update (`HAVI_CORS_ORIGINS` deleted in Railway).
10. Canonical host redirect enforced:
   - `www.gethavi.com` now returns `308` to `https://gethavi.com/`.
11. Post-cutover production smoke complete:
   - `GET /`, `GET /auth/sign-in`, `GET /auth/sign-up`, `GET /app` on `gethavi.com` all return `200`.
   - API health `200`.
   - authenticated API checks (`/api/v1/settings`, `/api/v1/conversations`, `/api/v1/tasks`) return `200`.

Current blocker to full public cutover:

- DNS at Squarespace/Google Domains still points to existing records and has not been switched to Vercel target IP.
- Vercel reports both domains are attached but not yet verified due DNS mismatch.

Immediate next fix (manual DNS step):

1. In DNS, point apex and `www` to Vercel target:
   - `A gethavi.com 76.76.21.21`
   - `A www.gethavi.com 76.76.21.21` (per current Vercel verification output)
2. Remove/replace conflicting Squarespace web A records and `www` CNAME for Squarespace.
3. Wait for propagation and verify domain in Vercel dashboard/CLI.
4. After `gethavi.com` is live, tighten Railway `HAVI_CORS_ORIGINS` to canonical domain(s) only.

## Summary
This plan is now explicit for **end-to-end deployment** across:
- production web,
- production API,
- local development.

Chosen direction (lowest friction given your accounts and preferences):
- **Web:** Vercel
- **API:** Railway
- **Canonical host:** `https://gethavi.com`
- **Redirect host:** `https://www.gethavi.com` -> `https://gethavi.com`
- **DNS TTL before cutover:** reduce from 4 hours to **30 minutes**

---

## Goal + success metrics

### Goal
Launch Havi publicly on `https://gethavi.com` with stable API connectivity, working Supabase auth, deterministic routing/canonical behavior, and minimal manual operations.

### Success metrics
- `https://gethavi.com` resolves over TLS.
- `https://www.gethavi.com` 301-redirects to apex.
- Core routes work:
  - `/`
  - `/pricing`
  - `/solutions/*`
  - `/app`
  - `/app/invite?token=...`
  - `/share/[token]`
- API calls from web succeed with no browser CORS errors.
- Supabase auth flows work (sign up, sign in, reset password, invite accept).
- Generated invite/share URLs use canonical domain.
- `robots.txt` + `sitemap.xml` return canonical URLs.

---

## Assumptions + constraints

### Assumptions
- No production deployment exists yet.
- Supabase project is active and production-real.
- Squarespace is authoritative DNS.
- You prefer lowest configuration overhead.

### Constraints
- DNS still points to Squarespace defaults and must be changed.
- Current TTL is 4h; you can reduce to 30m.
- Code has domain placeholders/localhost defaults that require production envs.

---

## Platform decision: Vercel + Railway vs Vercel-only vs Railway-only

## Recommended: **Vercel for web + Railway for API**

Why this split is best here:
1. Next.js on Vercel is the least-risk path (first-party runtime behavior).
2. Railway is strong for the FastAPI service and simple env management.
3. Keeps each workload on a platform that fits it naturally.
4. Still low-touch once Git auto-deploy is configured.

## Why not Vercel for API too?
Vercel can run Python functions, but for this FastAPI backend it is usually a worse operational fit than Railway because:
- Vercel Python is function-oriented (serverless), while this API is structured as a full ASGI service.
- Serverless constraints (timeouts/cold starts/runtime behavior) can create avoidable risk for API endpoints.
- Railway gives a more natural always-on service model for FastAPI with simpler parity to local `uvicorn` behavior.

Bottom line: using Vercel for both sounds simpler on paper, but for this stack it generally increases backend deployment complexity/risk.

## Vercel-only (web + API) option
Possible, but not recommended for MVP unless there is a strict single-vendor requirement.

## Railway-only (web + API) option
Possible, but I do **not** recommend it as first choice for this repo because:
- Next.js deployment on non-Vercel hosts can have more adapter/runtime nuance.
- You may spend more time on framework-specific deployment details.

## Cost/free-tier note
Free-tier limits change often and are plan/account specific. I cannot guarantee which is cheaper long-term without live pricing checks in your account. Pragmatic recommendation:
- Use **Vercel free** for web,
- Use **Railway free/trial** for API,
- Reassess after first real usage month.

---

## DNS info extracted from your Squarespace screenshot

### Current web records
- `@ A 198.49.23.144`
- `@ A 198.49.23.145`
- `@ A 198.185.159.145`
- `@ A 198.185.159.144`
- `www CNAME ext-sq.squarespace.com`
- `@ HTTPS` Squarespace-managed HTTPS record

### Other records shown
- `_domainconnect CNAME _domainconnect.domains.squarespace.com`
- `_domainkey TXT ...`
- `_dmarc TXT ...`
- `@ TXT v=spf1 -all`

### Planned DNS change policy
- Before cutover: set TTL to **30 minutes**.
- Replace/remove Squarespace web records with Vercel-required records.
- Keep non-web records unless email strategy changes.
- Keep `_domainconnect` unless platform docs require removal.

---

## End-to-end architecture and routing

### Production architecture
1. Browser -> `https://gethavi.com` (Vercel Next.js app)
2. Next.js frontend -> API at Railway URL via `NEXT_PUBLIC_API_BASE_URL`
3. API -> Supabase (DB/auth/storage as configured)

### Host routing
- Primary: `gethavi.com`
- Redirect: `www.gethavi.com` -> `https://gethavi.com/:path*`

### App canonicalization updates
- Ensure sitemap and robots emit `https://gethavi.com`
- Set layout metadata canonical base to `https://gethavi.com`

### API-origin + CORS
- Set `NEXT_PUBLIC_API_BASE_URL` to Railway API origin.
- Add `https://gethavi.com` and (temporarily if needed) `https://www.gethavi.com` to API CORS allowlist.

---

## Milestones + workstreams

## Milestone 1 — Deploy API to Railway

### Workstreams
1. Create Railway project/service for `apps/api`.
2. Configure start command for FastAPI.
3. Set API environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `HAVI_SITE_URL=https://gethavi.com`
4. Deploy and confirm health endpoint.

### Output
- Stable production API URL on Railway.

---

## Milestone 2 — Deploy web to Vercel

### Workstreams
1. Create Vercel project from this repo.
2. Set root directory to `apps/web`.
3. Set web environment variables:
   - `NEXT_PUBLIC_API_BASE_URL=<railway_api_url>`
   - `NEXT_PUBLIC_SUPABASE_URL=<supabase_url>`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>`
   - optional `NEXT_PUBLIC_SITE_URL=https://gethavi.com`
4. Validate preview deployment.

### Output
- Working preview + production-ready web deployment.

---

## Milestone 3 — Code/domain cleanup

### Workstreams
1. Replace hardcoded `havi.ai` values in:
   - `apps/web/src/app/sitemap.ts`
   - `apps/web/src/app/robots.ts`
2. Add canonical metadata base in `apps/web/src/app/layout.tsx`.
3. Confirm backend invite links read from `HAVI_SITE_URL`.
4. Confirm API CORS list includes production host(s).

### Output
- Domain-correct metadata and links.

---

## Milestone 4 — Supabase alignment

### Workstreams
1. Supabase Auth Site URL -> `https://gethavi.com`.
2. Redirect URLs:
   - `https://gethavi.com/auth/sign-in`
   - `https://gethavi.com/auth/reset-password`
   - temporary `www` variants only if needed.
3. Validate password reset and invite acceptance end-to-end.

### Output
- Auth callbacks and links fully aligned.

---

## Milestone 5 — DNS cutover in Squarespace

### Workstreams
1. Set TTL to 30 minutes.
2. Add `gethavi.com` + `www.gethavi.com` in Vercel domains.
3. Copy Vercel-required DNS records into Squarespace.
4. Remove conflicting Squarespace web defaults.
5. Wait for verification and TLS.
6. Set apex as primary and enforce `www` redirect.

### Output
- Public domain live.

---

## Milestone 6 — Validation + runbook

### Workstreams
1. Verify key routes, auth, invite/share flows.
2. Verify robots/sitemap/canonical URLs.
3. Check browser console for CORS errors.
4. Publish deployment runbook docs.

### Output
- Repeatable operating procedure documented.

---

## Local development setup (explicit)

1. **API local env**
   - Create `apps/api/.env.local` with required Supabase envs.
2. **Run API locally**
   - Use existing local run instructions/scripts in repo.
3. **Web local env**
   - `apps/web/.env.local` should include:
     - `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`
     - `NEXT_PUBLIC_SUPABASE_URL=...`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
4. **Run web locally** and verify app works against local API.

This keeps local parity with production variable names.

---

## Security best practices (practical baseline)

1. Never share secrets in chat.
2. Never commit secrets to repo.
3. Use host-managed env vars only (Vercel/Railway/Supabase dashboards).
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only (API only).
5. Keep `NEXT_PUBLIC_*` vars limited to non-sensitive public values.
6. Protect main branch and require PR checks before production merges.

---

## Clear step-by-step actions required from you

## Phase A — one-time account setup
1. Confirm Railway project is available for API deployment.
2. Confirm Vercel project is connected to this repository.
3. Decide branch strategy for auto-deploy (recommended: previews on PR, prod on `main`).

## Phase B — provide required values (in dashboards, not chat)
4. In Railway, set API env vars:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `HAVI_SITE_URL=https://gethavi.com`
5. In Vercel, set web env vars:
   - `NEXT_PUBLIC_API_BASE_URL=<Railway API URL>`
   - `NEXT_PUBLIC_SUPABASE_URL=<Supabase URL>`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase anon key>`

## Phase C — Supabase dashboard changes
6. Set Auth Site URL to `https://gethavi.com`.
7. Add Auth Redirect URLs for sign-in and reset-password pages.

## Phase D — DNS cutover in Squarespace
8. Lower TTL from 4h to 30m.
9. Add/replace records exactly as Vercel domain setup instructs.
10. Remove old Squarespace web A/CNAME/HTTPS records that conflict.

## Phase E — verify
11. Confirm TLS valid on `gethavi.com`.
12. Confirm `www` redirects to apex.
13. Run auth + invite + share flow checks.
14. Confirm no CORS errors.

---

## Test plan

### Pre-cutover tests
- Railway API deploy healthy.
- Vercel preview build healthy.
- Web can call Railway API in preview.

### Post-cutover tests
- Apex domain resolves + TLS.
- `www` redirects.
- robots/sitemap canonical URLs are correct.
- Invite/reset flows complete.
- One write/read user flow succeeds.

---

## Open questions

1. Do you want me to implement Milestone 3 code cleanup next (sitemap/robots/layout metadata + CORS updates)?

## Confirmed next actions from your feedback

1. `docs/deployment.md` runbook: **approved** (will do after you confirm plan is final).
2. Keep planning scope focused for now; postpone additional implementation changes until plan sign-off.
