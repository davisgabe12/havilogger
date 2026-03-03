Status: active-plan
Last updated: March 2, 2026

# Havi Objective Execution Plan (Deploy + Core Reliability)

## Goal + success metrics

Goal:
- Ship a live, working `gethavi.com` flow where families can sign up/sign in, complete onboarding once, log events, ask guidance questions, manage tasks, and use timeline/memory without core regressions.

Success metrics:
- Domain live with TLS on `https://gethavi.com` and `www` redirect to apex.
- Auth works end-to-end (sign-up/sign-in/reset/invite accept).
- Chat handles tracking vs guidance correctly in core scenarios.
- Tracking messages persist to timeline; guidance messages do not pollute timeline as activity.
- Tasks create/list survives refresh.
- Core smoke checks pass locally and post-deploy.

## Assumptions + constraints

Assumptions:
- Target deploy stack remains Vercel (web) + Railway (API).
- Supabase is shared between dev/prod for now.
- Launch speed is prioritized over non-critical polish.

Constraints:
- Shared DB raises test-data and safety risk.
- Some stale docs and historical test records already exist.
- Production stability must be proven with explicit smoke checks after each large change.

## Milestones (dated)

1. March 2, 2026: Code readiness + canonical domain cleanup
- Completed: intent routing patch, regression tests, local E2E verification, doc reorganization baseline.
- In progress: deployment code cleanup (sitemap/robots/layout canonical metadata, API CORS production origins, invite URL default).

2. March 2, 2026: Git sync and deployment execution start
- Commit and push all repository changes.
- Execute deployment checklist (Vercel/Railway/Supabase/DNS) in order.

3. March 3, 2026: Post-deploy hardening
- Close high-priority launch issues (auth abuse controls, historical timeline remediation strategy, message composition follow-up).
- Re-run smoke and document residual risk.

## Workstreams

1. Core product reliability
- Chat intent + reply composition quality.
- Timeline/task persistence verification.
- Regression tests for critical message routing paths.

2. Deployment and domain
- Canonical metadata/domain URLs.
- API CORS/prod origin readiness.
- Host environment variable alignment.
- DNS cutover execution and verification.

3. Documentation and operations
- Active runbooks only for launch path.
- Clear smoke and triage workflows.
- Linear issue synchronization for all bugs/blockers.

## Dependencies + risks + mitigations

Dependencies:
- Vercel/Railway account access
- Squarespace DNS access
- Supabase project admin access

Risks:
- Shared dev/prod DB contamination
- Auth abuse risk with confirm-email disabled
- Hidden deployment misconfigurations (env mismatch, CORS mismatch)

Mitigations:
- Use test alias emails and explicit family naming convention.
- Gate launch with smoke checks and post-deploy verification.
- Track and prioritize hardening issues in Linear (`SID-3`, `SID-4`, `SID-5`).

## Next actions / open questions

Next actions:
1. Push all current repo changes to `main`.
2. Start deployment execution with Vercel project/environment validation.
3. Run post-change smoke (`havi-e2e-smoke`) and capture evidence.

Open questions requiring user input:
1. Confirm Vercel project ownership/team and whether I should create or link project from CLI.
2. Confirm Railway service status and deployment permissions.
3. Confirm Squarespace DNS update window for cutover.
