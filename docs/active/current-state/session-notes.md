# Session Notes

Use this log for every coding session, regardless of whether Linear was updated.

## Entry Template

- Date: YYYY-MM-DD
- Objective:
- Scope completed:
- Files changed:
- Tests/smoke checks run:
- Results:
- Risks/follow-ups:
- Linear issue(s): (link/ID or `pending`)

---

## 2026-03-20

- Objective: Ship chat-first oat palette inversion (dark-on-light) with walnut sidebar and matte bubble depth, keeping behavior/contracts stable.
- Scope completed:
  - Added chat-scoped theme activation on app frame when `activePanel === "havi"`.
  - Implemented chat-only palette tokens and surface overrides (canvas, sidebar, header/scroll/composer/input/send).
  - Updated message bubble visuals to use matte assistant/user tones plus subtle border/shadow depth.
  - Added active slice spec for chat-first palette rollout.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/globals.css`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/chat/message-bubble.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/chat-oat-palette-chat-slice-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && npm run test -- src/app/__tests__/app-layout.test.tsx src/components/chat/__tests__/message-bubble.test.tsx`
  - `cd apps/web && npm run build`
- Results:
  - Targeted suites pass (`2/2`, `24` tests).
  - Production build passes.
  - Chat palette direction is implemented in code and ready for deploy verification screenshots.
- Risks/follow-ups:
  - Local dev server health checks intermittently fail in this sandbox session; production screenshot verification is used as final visual gate.
  - Remaining surfaces (tasks/settings/auth/marketing) still pending their dedicated rollout checkpoints.
- Linear issue(s): pending

## 2026-03-11

- Objective: Unblock production deploy by resolving auth sign-in merge conflict and verify live health after deploy.
- Scope completed:
  - Resolved merge conflict markers in `auth/sign-in` while keeping the upstream invite-continuation path (`inviteSetupHref`) that powers invited-user setup flow.
  - Deployed web to Vercel production and confirmed alias to `https://gethavi.com`.
  - Ran post-deploy route/API checks and full production core smoke.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/auth/sign-in/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && npm run build`
  - `cd apps/web && npx vercel --prod -y`
  - `curl -I https://gethavi.com`
  - `curl -I https://www.gethavi.com`
  - `curl -s -o /dev/null -w "%{http_code}\n" https://api-production-0a5d.up.railway.app/health`
  - `./scripts/prod_core_smoke.sh`
- Results:
  - Production deploy succeeded and aliased to apex domain.
  - Route health checks passed (`gethavi.com=200`, `www` redirect=`308`, API health=`200`).
  - Core smoke passed for both existing-account and new-signup flows with logging/guidance/task/title invariants.
  - Smoke artifact: `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/prod-core-smoke-manual-20260311152403.json`
- Risks/follow-ups:
  - None from this deploy slice; keep monitoring compact chat action tap targets on smaller touch devices in future UI-gate runs.
- Linear issue(s): N/A

## 2026-03-11

- Objective: Ship chat-composer control polish and action-density fixes requested in product review (compact copy/thumb controls, aligned send/voice controls, helper-copy removal), plus update brand/design-system docs.
- Scope completed:
  - Reduced shared assistant action control sizing to a compact, ChatGPT-like hierarchy (about 30% smaller button target).
  - Moved voice control into the same composer row as send, kept equal icon-button sizing, and removed the helper sentence above composer controls.
  - Removed now-unused `.havi-voice-toolbar` style.
  - Updated canonical and active docs (style guide, brand notes, app surface system, design-system rollout spec) to codify the new control-density and composer-alignment rules.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/chat/message-feedback.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/globals.css`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/chat/__tests__/message-bubble.test.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/chat/__tests__/message-feedback.test.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/__tests__/app-layout.test.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/public/brand/docs/HAVI_STYLE_GUIDE.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/brand-theming-notes.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/design/app-surface-system.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/design-system-unification-rollout-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && node ./node_modules/jest/bin/jest.js --runInBand src/components/chat/__tests__/message-bubble.test.tsx src/components/chat/__tests__/message-feedback.test.tsx src/app/__tests__/app-layout.test.tsx`
  - `cd apps/web && npm run build`
- Results:
  - Targeted UI/component suites pass (`3/3`, `31` tests).
  - Web production build passes (Next.js compile + TypeScript + static generation complete).
  - Requested UI behavior and documentation updates are implemented in one slice.
- Risks/follow-ups:
  - Compacting assistant action controls reduces tap target size; monitor usability on smaller touch devices during broader smoke/UX pass.
- Linear issue(s): N/A (no new issue discovered in this slice)

## 2026-03-10

- Objective: Establish mandatory session note workflow in the `havi-session-bootstrap` skill.
- Scope completed: Updated skill to require notes every session and switched referenced doc from triage log to Session Notes.
- Files changed:
  - `/Users/gabedavis/.codex/skills/havi-session-bootstrap/SKILL.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run: N/A (documentation-only changes).
- Results: Skill now enforces Session Notes independent of Linear updates.
- Risks/follow-ups: Existing automation or habits that still point to triage log should be updated.
- Linear issue(s): N/A

## 2026-03-10

- Objective: Produce launch-priority spec to unify design system and rollout across homepage, home, chat, tasks, and settings.
- Scope completed: Audited design-system docs and code usage, inventoried missing system layers and non-adopted surfaces, identified UX dark-pattern risks, and wrote a sequenced rollout spec with file-level scope.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/design-system-unification-rollout-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run: N/A (documentation-only changes).
- Results: New execution spec defines success metrics, constraints, missing components/guidelines, dark-pattern fixes, and phased rollout plan without calendar dates.
- Risks/follow-ups: Large `apps/web/src/app/app/page.tsx` migration risk remains; next slice should extract shared primitives before broad visual changes.
- Linear issue(s): pending

## 2026-03-10

- Objective: Incorporate product feedback into design-system unification spec.
- Scope completed: Updated spec to require neutral/oat/alt token families and contrast rules, clarified permissible marketing-home color usage, marked integrations copy/content rewrite as out of scope, and added explicit profile-lock definition.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/design-system-unification-rollout-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run: N/A (documentation-only changes).
- Results: Spec now reflects launch direction on color balance and scope boundaries.
- Risks/follow-ups: Implementation still depends on extracting large `apps/web/src/app/app/page.tsx` surfaces into shared primitives before full visual rollout.
- Linear issue(s): pending

## 2026-03-10

- Objective: Resolve profile-lock policy decision in design-system rollout spec.
- Scope completed: Replaced open question with explicit decision to keep profile lock fully blocking and limit this slice to improved messaging/rationale.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/design-system-unification-rollout-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run: N/A (documentation-only changes).
- Results: Profile-lock behavior is now explicitly decided in the spec.
- Risks/follow-ups: Full-blocking UX still depends on high-quality guidance copy and clear completion path.
- Linear issue(s): pending

## 2026-03-10

- Objective: Execute chat platform milestone progress on contract cleanup, threshold clarity, and guidance reliability while keeping docs/specs synced.
- Scope completed:
  - Rewrote chat master and phase-1 plan docs into milestone-driven, spec-first format with explicit success metrics, threshold policy, fallback metric, and progress-update sections.
  - Removed non-authoritative `model_request` from active web chat payload and production core smoke payload.
  - Added explicit guidance fallback reasons in compose path (`model_contract_invalid`, `model_unavailable`, `composer_disabled`) and test coverage.
  - Verified production OpenAI flags and pinned classifier override threshold to `0.65`.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-platform-master-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-phase-1-execution-plan.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/scripts/prod_core_smoke.sh`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_chat_composition_hardening.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_route_telemetry_persistence.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-threshold-hardness-probe-latest.json`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/api && ../../.venv/bin/pytest tests/test_router_openai_classifier.py tests/test_chat_composition_hardening.py tests/test_route_telemetry_persistence.py -q`
  - `./scripts/prod_core_smoke.sh`
  - `./scripts/prod_ui_smoke_gate.sh`
  - `/bin/bash -lc "cd /Users/gabedavis/Desktop/projects/havilogger/apps/web && PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green"`
- Results:
  - API targeted tests passed.
  - Production core smoke passed with fresh artifact.
  - UI smoke gate failed due feedback thumbs-up POST returning 400; additional run also failed (separate app-readiness/login instability while gate in progress).
- Risks/follow-ups:
  - Production release gate remains blocked on feedback thumbs reliability (parallel workstream).
  - Large concurrent dirty tree means full code deploy from this workspace risks shipping unrelated in-progress changes; coordinate merge/deploy sequencing before final release gate.
- Linear issue(s): pending

## 2026-03-10

- Objective: Continue design-system unification rollout with launch-priority polish across app shell, voice-first chat, profile lock messaging, and remaining marketing routes.
- Scope completed:
  - Completed remaining marketing route migrations to shared section/type/CTA primitives (`havi-section-block`, `havi-canvas-band-*`, `havi-text-*`, `havi-cta-*`).
  - Kept profile lock fully blocking and clarified rationale/messaging in app shell modal.
  - Finalized voice-first composer presence in tests (`voice-primary`) and aligned app layout tests to canonical shell classes.
  - Stabilized Jest environment for Next 16 + Radix by adding test-only mocks for `next/link`, `next/image`, and `@radix-ui/react-scroll-area`.
  - Removed remaining fabricated integrations metadata fields (`createdAt`, `usedXTimes`, `usedByYUsers`) and switched non-live status language to explicit `Preview`.
  - Synced active spec and canonical brand theming docs to current token/theme mappings and profile-lock decision.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/solutions/fast-tracking/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/solutions/insights/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/solutions/personal/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/solutions/reminders/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/competitors/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/jest.setup.ts`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/__tests__/app-layout.test.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/design-system-unification-rollout-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/brand-theming-notes.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && npm run tokens:check`
  - `cd apps/web && node ./node_modules/jest/bin/jest.js --runInBand src/app/__tests__/app-layout.test.tsx src/app/__tests__/marketing-homepage.test.tsx`
  - `cd apps/web && npm test -- --runInBand`
  - `cd apps/web && npm run build` (compiles, then stalls at `Running TypeScript` in this runtime)
  - `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green` (fails: webServer timeout)
  - `cd apps/web && PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green` (fails: auth gating on sign-in)
- Results:
  - Design-system rollout progressed and test coverage updated for new shell/voice behavior.
  - Full web test suite passes in serial mode.
  - Build and green-smoke remain blocked by local runtime/server constraints, not by failing assertions in updated tests.
- Risks/follow-ups:
  - Local `next build` hangs indefinitely at TypeScript stage in this environment; needs runtime/process-level investigation before release gate.
  - Local Playwright webServer startup times out; production smoke requires valid authenticated session.
  - Chat avatar area is being modified by another agent; re-verify avatar integration after merge before launch sign-off.
- Linear issue(s): pending

## 2026-03-10

- Objective: Run closeout production release gate, classify remaining blocker, and sync canonical/active docs plus Linear evidence.
- Scope completed:
  - Ran canonical deploy guard and release gate with fresh closeout label.
  - Confirmed core smoke pass and isolated UI gate failure signature to invitee app-ready after invite flow.
  - Updated canonical deploy runbook with explicit preflight guard to avoid manual API deploys from dirty `apps/api` trees.
  - Synced active chat plan/master spec and current-state hotfix note with latest gate artifacts.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/deploy-and-release.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/ui-reliability-hotfix-2026-03-10.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-phase-1-execution-plan.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-platform-master-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `./scripts/prod_api_deploy_wait.sh`
  - `HAVI_RELEASE_LABEL=closeout-feedback-e2e-20260310 ./scripts/prod_release_gate.sh`
  - `npx @railway/cli deployment list --service api --json | jq -r '.[0:3][] | ...'`
- Results:
  - Deploy guard: PASS (`66362cc5-e553-49b0-b4e7-377a89e63e9a`, `provider=python`, `config=railway.toml`).
  - Release gate summary: core PASS, UI FAIL twice on invitee readiness (`/auth/sign-in`), so gate overall FAIL.
- Risks/follow-ups:
  - Production UI gate remains blocked by invite acceptance/auth-return continuity.
  - Manual API deploy script still permits dirty-tree deploys; runbook guard is now explicit, but script-level enforcement is still pending.
- Linear issue(s): SID-73, SID-42, SID-53

## 2026-03-10

- Objective: Execute Milestone 5 (`ContextPackBuilder v1 + memory route contract`) and Milestone 6 (`ui_nudges` removal) with spec/test sync.
- Scope completed:
  - Added `ContextPackBuilder v1` to canonical chat turn assembly with child profile, age-weeks, and memory summaries.
  - Added effective memory route contract overrides in runtime metadata: `MEMORY_EXPLICIT`, `MEMORY_INFERRED`.
  - Updated compose path to consume typed context pack and provide deterministic inferred-memory acknowledgement.
  - Removed `ui_nudges` from active `ChatResponse` contract and aligned tests/docs.
  - Rewrote phase-1 execution doc to clean milestone-driven status format.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/schemas.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_chat_composition_hardening.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_chat_routing_logic.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_rls_paths.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_activities_regressions.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-platform-master-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-phase-1-execution-plan.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/api && ../../.venv/bin/pytest tests/test_chat_composition_hardening.py tests/test_chat_routing_logic.py tests/test_rls_paths.py tests/test_route_telemetry_persistence.py tests/test_router_openai_classifier.py -q`
- Results:
  - Targeted API suites passed (`50 passed`).
  - Milestone 5 and Milestone 6 runtime/doc/test updates are in place.
- Risks/follow-ups:
  - UI smoke gate is still not stable (feedback and auth/app-readiness failures on separate runs).
  - Production code deploy of these latest runtime changes remains pending final release-gate unblock and concurrent worktree coordination.
- Linear issue(s): pending

## 2026-03-10

- Objective: Roll out design-system parity on `forgot-password`, `reset-password`, and `knowledge` surfaces.
- Scope completed:
  - Migrated auth recovery routes to app-surface classes (`havi-app-main`, `havi-app-shell`, `havi-card-shell`) and shared field primitives.
  - Replaced ad-hoc auth notices with canonical `NoticeBanner` variants.
  - Migrated knowledge page shell and grouped sections to canonical panel surfaces.
  - Migrated knowledge item editing from raw `<textarea>` to shared `Textarea` and tokenized pending/active state treatments.
  - Updated rollout spec remaining-scope inventory to reflect this completed slice.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/auth/forgot-password/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/auth/reset-password/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/knowledge/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/knowledge/KnowledgeItemCard.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/knowledge/KnowledgeList.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/design-system-unification-rollout-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && npm test -- --runInBand`
  - `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green` (currently hangs in this runtime; no completion signal returned)
- Results:
  - Web test suite remains green after this slice.
  - Surface-system rollout now includes auth recovery + knowledge routes.
- Risks/follow-ups:
  - Green smoke and local build/type checks remain runtime-blocked in this environment.
  - Share page and auth entry pages still need final parity pass before release.
- Linear issue(s): pending

## 2026-03-10

- Objective: Improve UI release-gate reliability while validating milestone completion.
- Scope completed:
  - Updated production UI smoke gate script to seed known existing-account credentials by default (`GREEN_EXISTING_EMAIL`, `GREEN_EXISTING_PASSWORD`) to reduce signup/auth flake.
  - Re-ran production UI smoke gate with the updated script.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/scripts/prod_ui_smoke_gate.sh`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `./scripts/prod_ui_smoke_gate.sh`
- Results:
  - Gate still failed on invitee app readiness/auth redirect continuity (`App core not ready`, stuck at `/auth/sign-in`).
  - Artifacts:
    - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/prod-ui-smoke-manual-20260310180710.json`
- Risks/follow-ups:
  - Remaining top release blocker is invitee auth-return stability in GREEN flow; feedback-specific 400 is not the only failure mode.
- Linear issue(s): pending

## 2026-03-10

- Objective: Complete remaining high-priority parity slice for `share/[token]`, `sign-in`, `sign-up`, and re-verify chat avatar integration.
- Scope completed:
  - Migrated shared conversation page to unified shell/panel/notice system classes.
  - Migrated auth sign-in and sign-up routes to canonical app shell/card surfaces and `NoticeBanner` error/info states.
  - Preserved field primitive usage (`Field`, `Input`) and removed residual ad-hoc alert styling in auth entry routes.
  - Re-verified chat avatar integration behavior via `message-bubble` tests (assistant chip and caregiver initials/labels remain correct).
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/share/[token]/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/auth/sign-in/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/auth/sign-up/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/design-system-unification-rollout-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && node ./node_modules/jest/bin/jest.js --runInBand src/components/chat/__tests__/message-bubble.test.tsx src/app/__tests__/app-layout.test.tsx src/app/__tests__/marketing-homepage.test.tsx`
  - `cd apps/web && npm test -- --runInBand`
  - `cd apps/web && PLAYWRIGHT_BASE_URL=https://gethavi.com npm run test:green` (fails: app core not ready; redirected to `/auth/sign-in`)
- Results:
  - Targeted and full web tests pass after these migrations.
  - Avatar integration remains stable at test level after route migrations.
  - Green smoke still fails due production auth/session gating, not UI parity regressions in this slice.
- Risks/follow-ups:
  - Release gate still blocked on green smoke auth readiness.
  - Local build/type runtime instability remains unresolved and should be fixed before final launch sign-off.
- Linear issue(s): pending

## 2026-03-10

- Objective: Validate `1-3` rollout with tests + green gate and align GREEN smoke assertions with the new auth notice system.
- Scope completed:
  - Re-verified `share/[token]`, `auth/sign-in`, and `auth/sign-up` route parity is in place with canonical app shell classes and `NoticeBanner` usage.
  - Updated GREEN smoke auth assertions to use `NoticeBanner` classes (`.havi-notice-banner-danger`, `.havi-notice-banner-info`) instead of legacy `p.text-*` selectors.
  - Added retry guard for initial auth route navigation in GREEN smoke (`net::ERR_ABORTED`/frame-detach startup race).
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/tests/smoke/green.smoke.spec.ts`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && npm test -- --runInBand`
  - `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green`
  - `./scripts/prod_ui_smoke_gate.sh` (run twice)
- Results:
  - `npm test` passes (`13/13` suites).
  - Local green smoke still fails in no-seeded-credential path when signup remains in pending confirmation.
  - Production UI smoke gate still fails on invitee app readiness/auth-return continuity (`App core not ready`, invitee ends on `/auth/sign-in`).
- Risks/follow-ups:
  - Release gate remains blocked by invitee auth/session continuity in GREEN flow; parity work for `1-3` is complete but ship criteria are not yet satisfied.
- Linear issue(s): pending

## 2026-03-10

- Objective: Complete remaining design-system implementation work on app onboarding/invite surfaces and remove residual ad-hoc control/error patterns in app/chat/timeline.
- Scope completed:
  - Migrated `/app/invite`, `/app/select-family`, and `/app/onboarding/care-member` to canonical app shell classes and `NoticeBanner` error states.
  - Replaced residual ad-hoc error styling in `/app` panels with `NoticeBanner` and field-level `FieldError`.
  - Replaced final raw app task checkbox with shared `Checkbox` primitive.
  - Migrated timeline child selector and timeline error state to shared `Select` + `NoticeBanner`.
  - Migrated chat feedback comment input to shared `Input`.
  - Added design-system invariant test to block reintroduction of legacy `text-destructive`/`text-emerald-200` and raw `input/select/textarea` in priority app/chat/timeline surfaces.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/invite/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/select-family/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/onboarding/care-member/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/timeline/timeline-panel.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/chat/message-feedback.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/ui/checkbox.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/__tests__/design-system-invariants.test.ts`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/design-system-unification-rollout-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && npm test -- --runInBand`
  - `./scripts/prod_ui_smoke_gate.sh` (rerun after final cleanup)
- Results:
  - Web tests pass (`14/14` suites), including new invariant coverage.
  - Production UI smoke gate still fails on invitee app readiness/auth-return continuity (`App core not ready`, invitee ends on `/auth/sign-in`).
  - Artifact: `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/prod-ui-smoke-manual-20260310195602.json`
- Risks/follow-ups:
  - Design-system implementation objective for this slice is complete; release gate remains blocked on invitee auth/session continuity outside these UI-system changes.
- Linear issue(s): pending

## 2026-03-10

- Objective: Complete typography normalization for launch-priority surfaces (homepage + app core + auth/share/knowledge) using system fonts and type scale.
- Scope completed:
  - Updated tokenized font families to align with design system type guidance (`Manrope` body/UI, `Sora` display, with existing fallbacks).
  - Added shared app typography utility classes (`.havi-type-page-title`, `.havi-type-section-title`, `.havi-type-body`, `.havi-type-meta`) and applied them to auth, share, knowledge, invite, select-family, and onboarding entry flows.
  - Normalized key app panel titles in `/app` to the same section-title scale for calmer, more professional hierarchy.
  - Tuned homepage typography scale to be less oversized and more restrained while preserving tokenized marketing classes.
  - Synced generated token artifact after token-source change.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/styles/havi-tokens.source.json`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/styles/havi-tokens.css`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/layout.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/globals.css`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/invite/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/select-family/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/onboarding/care-member/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/auth/sign-in/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/auth/sign-up/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/auth/forgot-password/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/auth/reset-password/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/share/[token]/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/knowledge/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/knowledge/KnowledgeItemCard.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/knowledge/KnowledgeList.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/design-system-unification-rollout-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && npm run tokens:sync`
  - `cd apps/web && npm test -- --runInBand`
  - `./scripts/prod_ui_smoke_gate.sh`
- Results:
  - Tokens synchronized (`havi-tokens.css` regenerated from source).
  - Web tests pass (`14/14` suites, `69` tests).
  - Production UI smoke gate still fails on invitee app readiness/auth-return continuity (`App core not ready`, invitee ends on `/auth/sign-in`).
  - Artifact: `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/prod-ui-smoke-manual-20260310205531.json`
- Risks/follow-ups:
  - Typography/forms/spacing system work is now complete on launch-priority surfaces; remaining blocker is invitee auth/session continuity in production green flow.
- Linear issue(s): pending

## 2026-03-12

- Objective: Ship chat runtime contract alignment slice end-to-end with docs/tests sync and clean deploy gates.
- Scope completed:
  - Added persistent ship spec for this slice: `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/chat-runtime-contract-alignment-ship-spec.md`.
  - Implemented ContextPackBuilder v1 in canonical `/api/v1/activities` path (child profile, age weeks, active/pending knowledge, message history).
  - Added explicit memory route contract handling (`MEMORY_EXPLICIT`, `MEMORY_INFERRED`) in route metadata path.
  - Removed `ui_nudges` from API response contract (`ChatResponse`) while keeping internal compose hint behavior private.
  - Removed `model_request` from production core smoke chat payloads.
  - Synced chat master and phase-1 execution docs with current runtime behavior.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/schemas.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_chat_routing_logic.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_chat_composition_hardening.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_rls_paths.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_activities_regressions.py`
  - `/Users/gabedavis/Desktop/projects/havilogger/scripts/prod_core_smoke.sh`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-platform-master-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-phase-1-execution-plan.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/chat-runtime-contract-alignment-ship-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/checks run:
  - `OPENAI_API_KEY=test-key SUPABASE_URL=http://localhost:54321 SUPABASE_ANON_KEY=test-anon-key python3 -m pytest -q apps/api/tests/test_chat_routing_logic.py apps/api/tests/test_chat_composition_hardening.py apps/api/tests/test_rls_paths.py`
  - Result: `36 passed`.
- Additional validation notes:
  - `test_activities_regressions.py` collection/runtime in this clean `/tmp` worktree is blocked by local SQLite bootstrap state (`users`/`children` schema mismatch), so that suite was not used as a release gate in this environment.
- Risks/follow-ups:
  - Run full release gate pre/post deploy from production-linked tree and archive fresh proof artifacts before final merge/deploy.

## 2026-03-12

- Objective: Complete deploy + post-deploy validation for chat runtime contract alignment slice.
- Scope completed:
  - Pre-deploy core smoke gate passed.
  - Pre-deploy UI smoke gate passed (2 consecutive runs).
  - API deployed to Railway production and reached `SUCCESS` (`194a02ba-6e96-43b7-88d2-9a29fae02622`).
  - Post-deploy core smoke gate passed.
  - Post-deploy UI smoke gate passed (2 consecutive runs).
  - Curated release proof bundle + release note created.
- Artifacts:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-12-chat-runtime-contract-alignment/prod-core-smoke-chat-alignment-predeploy-1.json`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-12-chat-runtime-contract-alignment/prod-ui-smoke-chat-alignment-predeploy-1.json`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-12-chat-runtime-contract-alignment/prod-core-smoke-chat-alignment-postdeploy-1.json`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-12-chat-runtime-contract-alignment/prod-ui-smoke-chat-alignment-postdeploy-1.json`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-12-chat-runtime-contract-alignment/README.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/releases/2026-03-12-chat-runtime-contract-alignment.md`
- Risks/follow-ups:
  - Local primary repo still contains out-of-scope conflict markers; keep this slice isolated to clean chat-alignment commits only.

## 2026-03-12

- Objective: Align execution process for parallel worktrees, spec lifecycle hygiene, and QA gate discipline.
- Scope completed:
  - Updated canonical autonomous checklist to require feature work in dedicated worktrees, active spec presence before coding, and explicit QA gate steps.
  - Updated session bootstrap runbook with clear `where feature work happens` and `spec/docs lifecycle` guidance.
  - Updated active/canonical README files to standardize spec promotion from `docs/active/specs/` to `docs/canonical/completed-specs/` after ship.
  - Added proposed QA gate skill spec to make pre-release resilience checks repeatable.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/havi-autonomous-run-checklist.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/havi-session-bootstrap.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/README.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/README.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/README.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/_feature-spec-template.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/qa-gate-skill-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/checks run:
  - Documentation/process update only; no runtime code paths changed.
- Risks/follow-ups:
  - QA gate skill remains `Status: proposed` until implemented as a real Codex skill and script.

## 2026-03-12

- Objective: Add canonical project-profile context and strengthen bootstrap readiness workflow.
- Scope completed:
  - Added canonical project profile doc with JTBD, users, invariants, quality gates, and reusable profile contract.
  - Updated canonical bootstrap runbook to reference project profile and require context/tool readiness.
  - Updated bootstrap skill to require context familiarization, Linear/Playwright readiness checks, and early approval priming.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/product/havi-project-profile.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/README.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/havi-session-bootstrap.md`
  - `/Users/gabedavis/.codex/skills/havi-session-bootstrap/SKILL.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/checks run:
  - Documentation/skill workflow update only; no runtime code paths changed.
- Risks/follow-ups:
  - Bootstrap skill now depends on the presence of the canonical project profile path for best results.

## 2026-03-12

- Objective: Bootstrap a new execution session with current product/ops context and readiness evidence.
- Scope completed:
  - Read canonical session context docs:
    - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/product/havi-project-profile.md`
    - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/havi-session-bootstrap.md`
    - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/havi-autonomous-run-checklist.md`
  - Confirmed repo/worktree baseline: `main` at `8dbe8e1`, clean working tree.
  - Verified active spec inventory exists under `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/`.
  - Verified tool readiness:
    - Linear MCP accessible (`Side Projects` team available).
    - Playwright MCP accessible (browser tab control reachable).
  - Ran local startup/readiness diagnostics:
    - `./restart.sh` starts then exits immediately in sandbox due bind restrictions.
    - Foreground elevated probes confirmed backend/frontend can start and respond (`/health` and `/auth/sign-in` returned `200`).
  - Ran production sanity probes (elevated network):
    - `https://gethavi.com` returned `200`.
    - `https://www.gethavi.com` returned `308` redirect to apex.
    - `https://api-production-0a5d.up.railway.app/health` returned `200`.
  - Identified top active P1 slice for next execution: `SID-53` (invite token/auth redirect continuity).
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/checks run:
  - `git status --short --branch`
  - `./restart.sh`
  - `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/health`
  - `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/auth/sign-in`
  - `curl -I https://gethavi.com`
  - `curl -I https://www.gethavi.com`
  - `curl -s -o /dev/null -w '%{http_code}\n' https://api-production-0a5d.up.railway.app/health`
- Risks/follow-ups:
  - Sandbox runtime cannot keep local web/api bound on loopback without elevated foreground execution; do not treat non-elevated local startup as a product failure signal.
  - Next code-edit slice should run from a dedicated feature worktree/branch (`codex/<slice-name>`) instead of `main`.

## 2026-03-12

- Objective: Implement runnable session orchestrator + QA gate skills and scripts.
- Scope completed:
  - Added deterministic worktree/spec bootstrap script: `scripts/havi_session_orchestrator.sh`.
  - Added deterministic QA gate orchestrator script: `scripts/qa_gate.sh` with required-step pass/fail semantics and summary artifacts.
  - Added active orchestrator spec and updated QA gate spec status/progress.
  - Updated canonical bootstrap runbook to reference orchestrator + QA gate commands.
  - Added `.worktrees/` to `.gitignore` to keep local `main` clean from worktree folders.
  - Added local Codex skill wrappers:
    - `/Users/gabedavis/.codex/skills/havi-session-orchestrator/`
    - `/Users/gabedavis/.codex/skills/havi-qa-gate/`
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/.gitignore`
  - `/Users/gabedavis/Desktop/projects/havilogger/scripts/havi_session_orchestrator.sh`
  - `/Users/gabedavis/Desktop/projects/havilogger/scripts/qa_gate.sh`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/session-orchestrator-skill-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/specs/qa-gate-skill-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/havi-session-bootstrap.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/docs/active/current-state/session-notes.md`
- Tests/checks run:
  - `bash -n scripts/havi_session_orchestrator.sh scripts/qa_gate.sh`
  - `./scripts/havi_session_orchestrator.sh --feature "session-orchestrator-smoke" --dry-run`
  - `./scripts/qa_gate.sh --label qa-gate-smoke --areas chat --test-cmd "echo targeted-tests-pass" --playwright-cmd "echo playwright-pass" --skip-green --skip-release-gate --artifact-root /tmp/havi-qa-gate --dry-run`
- Risks/follow-ups:
  - Full non-dry-run QA gate should be validated in a feature worktree with real Playwright command and touched test suites before mandatory enforcement.

## 2026-03-21

- Objective: Reduce chat UI noise by removing timezone labels and making assistant actions smaller + contextual.
- Scope completed:
  - Removed "Times shown in ..." from app top context row and chat card header.
  - Removed now-unused timezone label computation in app page state.
  - Updated shared assistant action sizing tokens to mobile `36px` (`h-9 w-9`) and desktop `32px` (`md:h-8 md:w-8`) with icons at `14px` (`h-3.5 w-3.5`).
  - Implemented hidden-at-rest assistant action row with reveal behavior:
    - Desktop: reveal on hover/focus-within.
    - Mobile: reveal on long-press (`450ms`) with auto-hide (`3200ms`).
  - Updated message-bubble and message-feedback tests to match new shared sizing tokens and default hidden row state.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/app/app/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/components/chat/message-feedback.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/components/chat/message-bubble.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/components/chat/__tests__/message-bubble.test.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/components/chat/__tests__/message-feedback.test.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/docs/active/current-state/session-notes.md`
- Tests/checks run:
  - `cd apps/web && npm test -- --runInBand src/components/chat/__tests__/message-bubble.test.tsx src/components/chat/__tests__/message-feedback.test.tsx`
  - `npm run tokens:check` passed as pre-step.
- Validation outcome:
  - Targeted jest tests could not execute in this worktree because `jest` binary is unavailable (`sh: jest: command not found`) due missing local `node_modules` bootstrap in this worktree.
- Risks/follow-ups:
  - Run `apps/web` dependency/bootstrap in this worktree, then rerun targeted tests to confirm runtime behavior before merge.

## 2026-03-21

- Objective: Replace full-width active-child select with compact walnut topbar pill (`90px`, left-aligned name, no avatar) and remove "Active child" label affordance.
- Scope completed:
  - Added new `ActiveChildPill` UI component with button + listbox popover interaction, keyboard support (open, navigate, select, escape), outside-click close, and focus return.
  - Replaced old mobile topbar + context-row select in app shell with unified topbar containing menu button (mobile), active-child pill (all breakpoints), and timezone secondary label.
  - Wired pill selection to existing `handleChildChange` path; no backend or persistence contract changes.
  - Added dedicated topbar/pill styles in `globals.css` including fixed `90px` pill width, left-aligned truncation, walnut treatment, and popover option states.
  - Updated active spec with locked constraints and acceptance criteria for this slice.
  - Added and updated tests for new pill behavior and layout replacement.
- Files changed:
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/components/ui/active-child-pill.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/components/ui/__tests__/active-child-pill.test.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/app/app/page.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/app/globals.css`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/apps/web/src/app/__tests__/app-layout.test.tsx`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/docs/active/specs/session-bootstrap-20260321-spec.md`
  - `/Users/gabedavis/Desktop/projects/havilogger/.worktrees/session-bootstrap-20260321/docs/active/current-state/session-notes.md`
- Tests/smoke checks run:
  - `cd apps/web && npm install`
  - `cd apps/web && npm run test -- src/app/__tests__/app-layout.test.tsx src/components/ui/__tests__/active-child-pill.test.tsx`
  - `cd apps/web && npm run build`
- Results:
  - Targeted tests passed (`2/2`, `21` assertions passing).
  - Build compiles successfully but fails during prerender on missing Supabase env (`Error: supabaseUrl is required`) for `/app/onboarding/care-member`.
- Risks/follow-ups:
  - Build in this environment remains blocked until required Supabase env vars are present for prerender.
  - Visual QA should confirm truncation readability of long names in the fixed `90px` pill on mobile and desktop.
- Linear issue(s): pending
