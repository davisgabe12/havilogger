# Havi Design System Unification Rollout Spec

Status: proposed
Owner: Product + Design + Frontend
Priority: launch-critical

## Summary
Unify Havi's brand and design system across marketing and product so the experience feels joyful, calm, and professional at every touchpoint. This spec defines the missing system pieces, inventories where the system is not applied, identifies trust-risk UX patterns, and sequences rollout from highest impact surfaces first: homepage, app home, chat, tasks, and settings. It also adds an explicit color-system expansion so the product is not overly green and can use calm neutral/oat/alt tones from system tokens.

## Goal And User Outcome
Parents and caregivers should feel immediate clarity and trust when moving from marketing into product. Visual language, spacing rhythm, interaction patterns, and copy tone should stay consistent and reduce cognitive load.

## Success Metrics
1. Visual consistency: high-priority surfaces use canonical tokens and shared primitives with no ad-hoc color/border/focus treatments.
2. Trust and UX quality: dark patterns and misleading affordances removed from product and homepage.
3. Interaction coherence: shared shell, card, form, action, and modal patterns across home/chat/tasks/settings.
4. Launch readiness: all high-priority surfaces pass regression tests and smoke checks after rollout.
5. Color and contrast quality: homepage and product use tokenized neutral/oat/alt surfaces (not green-only), with readable contrast in all core panels.

## Assumptions And Constraints
1. No timeline dates are included in this plan by request; execution is sequenced by dependency and impact.
2. Existing repo is dirty on `main`; rollout must be additive and avoid unrelated files.
3. Homepage copy is source-of-truth quality; non-home marketing pages currently contain placeholder or interim copy.
4. Current token source of truth remains `apps/web/src/styles/havi-tokens.source.json`.
5. Rollout must preserve critical product invariants (chat guidance/logging behavior, onboarding correctness, auth flow stability).

## Explicit Invariants
1. All core form controls use the shared field system (`Input`, `Select`, `Textarea`, `Field*` primitives).
2. Core app pages share one container and surface hierarchy; no per-panel width or spacing drift.
3. Design tokens are the only source for color, type, radius, elevation, and state semantics.
4. Disabled and "coming soon" UI states must be explicit and non-deceptive.
5. Claims and social proof shown in UI must be truthful and attributable.
6. Marketing homepage colors must come from approved design-system tokens/classes only.
7. Neutral/oat/alt token families must be available for use across marketing and product surfaces.

## Non-Goals
1. Rewriting placeholder marketing copy outside homepage in this phase.
2. Re-architecting backend behavior unrelated to UI systemization.
3. Building a separate theme mode beyond current Night Forest baseline.
4. Integrations feature copy/content rewrite in this phase.

## Current State Audit

### Existing System Assets (Good Foundation)
1. Brand and token docs exist:
   - `docs/canonical/brand-theming-notes.md`
   - `docs/canonical/design/form-field-system.md`
   - `docs/canonical/design/homepage-surface-system.md`
2. Token contract is in place with sync/check gates:
   - `apps/web/src/styles/havi-tokens.source.json`
   - `apps/web/src/styles/havi-tokens.css`
   - `apps/web/scripts/sync-havi-tokens.mjs`
   - `apps/web/package.json` scripts `tokens:sync` and `tokens:check`
3. Shared UI primitives exist for button/card/field/input/select/textarea.
4. Homepage uses an intentional surface and typography system.

### Missing Or Incomplete System Definitions
1. No canonical app-surface system doc for home/chat/tasks/settings (only homepage surface doc is mature).
2. No formal spacing scale contract wired into Tailwind utility usage (spacing exists in token source but is not standardized in component rules).
3. No elevation/layering scale guidance for cards, drawers, overlays, and modals.
4. No motion guidance for joyful-calm interactions (durations, easing, when to animate, when not to).
5. No semantic status/notification component standard (warning, error, success banners are repeated ad-hoc).
6. No trust-and-ethics guideline for social proof, availability badges, and "coming soon" disclosures.
7. No explicit neutral/oat/alt palette contract for product surfaces; current usage is overly green-heavy and constrains contrast.

### Color System Gaps (Critical)
1. Current token set is strong but operationally biased toward green surfaces for core product UI.
2. Homepage has some light-canvas usage, but product panels do not consistently consume neutral/oat surfaces from system primitives.
3. Designers/developers lack a canonical rule for when to use:
   - deep green base surfaces
   - neutral gray surfaces
   - oatmeal/light canvas surfaces
   - accent surfaces
4. Resulting risk: visual monotony and reduced contrast clarity in dense product flows.

### High Priority Surface Inventory (Homepage + Product Core)
1. Homepage (`apps/web/src/app/page.tsx`): largely aligned with system.
   - Gap: CTA parity still provisional (header vs in-page CTA styles).
2. App shell + navigation (`apps/web/src/app/app/page.tsx`): partially aligned.
   - Gap: canonical `.havi-app-shell` is defined but not used in app routes.
   - Evidence: `havi-app-shell` usage count in app routes is 1 (definition only), while main layout uses custom spacing and nested max-width containers.
3. Home panel (`apps/web/src/app/app/page.tsx`): card-level consistency exists, but section blocks use repeated ad-hoc utility mixes (`rounded-md border border-border/40 bg-background/60 ...`).
4. Chat panel (`apps/web/src/app/app/page.tsx`, `apps/web/src/components/chat/message-bubble.tsx`, `apps/web/src/components/chat/message-feedback.tsx`): strong base, but action row/timestamp/meta and bubble variants are still hard-coded at file scope instead of shared message-surface primitives.
5. Tasks panel (`apps/web/src/app/app/page.tsx`): mixed system adoption.
   - Evidence: raw controls remain in critical flows (5 raw `<input>` and 11 raw `<select>` in this file).
   - Two select controls still use non-canonical field styles (`rounded-md border border-border/40 bg-background/60 p-2 text-sm`).
6. Settings panel (`apps/web/src/app/app/page.tsx`): high-value but fragmented.
   - Uses `havi-input/havi-select` in many places, but still has one-off labels, message copy, and spacing blocks instead of full `Field` composition.

### Product-Wide System Usage Gaps
1. Knowledge and shared pages (`apps/web/src/app/knowledge/page.tsx`, `apps/web/src/components/knowledge/KnowledgeItemCard.tsx`, `apps/web/src/app/share/[token]/page.tsx`) use custom textarea and repeated card wrappers, not standardized form/message surface primitives.
2. Auth reset/forgot pages (`apps/web/src/app/auth/forgot-password/page.tsx`, `apps/web/src/app/auth/reset-password/page.tsx`) use block label wrappers instead of `Field` primitives.
3. Marketing pages outside homepage are all legacy layout style and do not use homepage surface classes.
   - Legacy pages: `about`, `partners`, `pricing`, `resources`, `resources/blog`, `stories`, `solutions`, and all solution detail pages.

## UX Dark Pattern And Trust Risk Inventory

### P0 Trust Risks (Fix Immediately)
1. Synthetic social proof and usage metrics in Integrations panel.
   - File: `apps/web/src/app/app/page.tsx`
   - Evidence: hard-coded `usedXTimes`, `usedByYUsers`, `createdAt`, and status badges imply real usage.
   - Risk: misleading evidence undermines trust at launch.
   - Fix: remove fabricated metrics and unverifiable metadata; keep integrations copy/content changes out of scope.
2. "Coming soon" cards are interactive and appear productized.
   - File: `apps/web/src/app/app/page.tsx`
   - Risk: bait-like affordance if cards behave as selectable product surfaces without true availability.
   - Fix: switch to non-deceptive preview states and no pseudo-engagement metrics.

### P1 Friction And Coercion Risks
1. Profile lock modal blocks core use without clear progressive path.
   - File: `apps/web/src/app/app/page.tsx`
   - Risk: perceived coercion if users do not understand why access is blocked.
   - Fix: keep full blocking behavior, but add transparent rationale, explicit missing-field messaging, and direct completion CTA.
2. Repeated warning/error visual language is inconsistent.
   - Risk: users cannot quickly distinguish urgency versus informational states.
   - Fix: canonical `NoticeBanner` variants and usage guidelines.

## Proposed Solution

### Workstream A: System Foundations
1. Add an app-surface system document and corresponding CSS primitives for:
   - shell structure
   - section spacing
   - panel density tiers
   - modal/drawer layers
   - notice states
2. Extend token model (source + generated outputs) with:
   - spacing steps used in product layouts
   - elevation and overlay semantics
   - motion timing tokens
   - semantic status surface tokens
   - neutral/oat/alt surface families for contrast-balanced composition
   - explicit contrast pair mappings (text/background/border per surface family)

### Workstream B: Shared UI Primitives
1. Introduce reusable app primitives:
   - `AppShell`
   - `PanelSection`
   - `PanelHeader`
   - `NoticeBanner`
   - `DrawerPanel`
   - `ChipGroup` (for tabs/filter pills)
2. Normalize message/chat primitives:
   - assistant/self/caregiver bubble surface variants
   - action row/timestamp layout
   - feedback state badges

### Workstream C: Priority Surface Rollout
1. Homepage parity fixes (CTA and section rhythm consistency).
2. Homepage color compliance pass:
   - verify all homepage color usage resolves through approved tokenized classes
   - remove non-permissible color usage patterns
3. Product color rebalance pass for home/chat/tasks/settings using neutral/oat/alt system surfaces where appropriate.
4. App shell standardization for home/chat/tasks/settings.
5. Tasks/settings control and spacing normalization with `Field` primitives.
6. Dark pattern cleanup in integrations and profile-lock experiences (copy/content rewrite remains out of scope).

### Workstream D: Secondary Surface Rollout
1. Knowledge and shared pages.
2. Auth reset/forgot pages.
3. Legacy marketing pages (structure only, copy can remain placeholder where intended).

### Workstream E: Governance And Quality Gates
1. Add linting/policy checks for ad-hoc control styles in product routes.
2. Expand component and route tests for shell/panel/notice invariants.
3. Add visual regression snapshots for homepage + app core panels.

## Implementation Status (Current)

### Completed In This Rollout Slice
1. Homepage color usage remains tokenized through approved system classes (`havi-canvas-band-*`, `havi-cta-*`, `havi-text-*`).
2. Remaining legacy marketing pages were moved to shared section/type/CTA primitives:
   - `about`, `partners`, `pricing`, `resources`, `resources/blog`, `stories`, `solutions`, all solution detail pages, and `competitors`.
3. Core app route (`apps/web/src/app/app/page.tsx`) now uses:
   - canonical shell classes (`havi-app-sidebar`, `havi-app-main`, `havi-app-mobile-topbar`, `havi-app-shell`),
   - canonical notice banners,
   - voice-first primary control in composer,
   - full-blocking profile-lock modal with clearer rationale.
4. Integrations dark-pattern cleanup now removes fabricated usage/adoption/date metrics and uses explicit preview language.
5. Test coverage updated for shell and voice-first behavior.
6. Invite and onboarding entry routes now use canonical app shell/card/notice primitives:
   - `apps/web/src/app/app/invite/page.tsx`
   - `apps/web/src/app/app/select-family/page.tsx`
   - `apps/web/src/app/app/onboarding/care-member/page.tsx`
7. Remaining ad-hoc destructive/error and raw-control usage was removed from app core surfaces:
   - `apps/web/src/app/app/page.tsx` now uses shared `NoticeBanner`/`FieldError` patterns and shared `Checkbox`.
   - `apps/web/src/components/timeline/timeline-panel.tsx` now uses shared `Select` and `NoticeBanner`.
   - `apps/web/src/components/chat/message-feedback.tsx` now uses shared `Input`.
8. Added an explicit invariant test to block regressions in priority routes/panels:
   - `apps/web/src/app/__tests__/design-system-invariants.test.ts`
9. Typography contract is now consistently applied across priority auth/share/knowledge/app surfaces:
   - token font families now align to design-system type guidance (`Manrope` UI body, `Sora` display with existing fallbacks),
   - shared app typography utilities were added and applied (`.havi-type-page-title`, `.havi-type-section-title`, `.havi-type-body`, `.havi-type-meta`),
   - key card titles/body/meta copy were normalized to the same scale in app and auth flows.

### Remaining Before Ship
1. Full build/smoke release gates must complete green in an environment where local build/type and Playwright webServer can run to completion.
2. Final avatar pass must be re-checked once parallel avatar branch changes are merged to main.

## Milestones (Sequence, No Dates)

### Milestone 1: Design System Completion (Docs + Tokens + Primitives)
Goal:
Complete the missing design system layers needed for full rollout.

Planned file changes:
1. `docs/canonical/design/app-surface-system.md` (new)
2. `docs/canonical/design/trust-and-ux-ethics.md` (new)
3. `docs/canonical/brand-theming-notes.md` (extend permissible palette guidance)
4. `apps/web/src/styles/havi-tokens.source.json` (extend tokens)
5. `apps/web/src/styles/havi-tokens.css` (generated)
6. `apps/web/src/styles/havi-theme.css` (semantic mappings if required)
7. `apps/web/src/app/globals.css` (new app primitives, layered classes)
8. `apps/web/src/components/ui/*` (new primitives listed above)

Acceptance criteria:
1. New docs define shell, spacing, motion, layer, and trust rules.
2. No direct ad-hoc design decisions required to build home/chat/tasks/settings.
3. Token sync/check passes.
4. System includes neutral/oat/alt palette tokens and documented permissible usage for marketing + product.
5. Contrast pair guidance is defined for core panel densities and message surfaces.

### Milestone 2: Priority Product Rollout (Homepage + Home/Chat/Tasks/Settings)
Goal:
Apply the unified system where launch impact is highest.

Planned file changes:
1. `apps/web/src/app/page.tsx`
2. `apps/web/src/components/marketing/MarketingLayout.tsx`
3. `apps/web/src/app/app/page.tsx`
4. `apps/web/src/components/chat/message-bubble.tsx`
5. `apps/web/src/components/chat/message-feedback.tsx`
6. `apps/web/src/components/ui/action-buttons.tsx`
7. `apps/web/src/components/timeline/timeline-panel.tsx` (if touched by shared panel primitives)

Acceptance criteria:
1. App main frame uses canonical shell and section primitives.
2. Tasks/settings forms use canonical form primitives only.
3. Integrations panel no longer presents fabricated social proof.
4. Profile-lock path is transparent and less coercive.
5. Homepage and app feel visually cohesive in spacing/layer hierarchy.
6. Homepage and core product panels use a balanced mix of deep/neutral/oat system surfaces with readable contrast.

### Milestone 3: Remaining Product And Marketing Adoption
Goal:
Eliminate remaining legacy patterns and finalize system adoption across product.

Planned file changes:
1. `apps/web/src/app/knowledge/page.tsx`
2. `apps/web/src/components/knowledge/KnowledgeItemCard.tsx`
3. `apps/web/src/app/share/[token]/page.tsx`
4. `apps/web/src/app/auth/forgot-password/page.tsx`
5. `apps/web/src/app/auth/reset-password/page.tsx`
6. Marketing legacy pages under `apps/web/src/app/{about,partners,pricing,resources,stories,solutions,...}`

Acceptance criteria:
1. Legacy pages use shared section, type, and card primitives.
2. Product routes avoid custom raw form control styling.
3. Cross-route visual language is consistently joyful, calm, and professional.

## Dependencies
1. Product approval on trust disclosures for not-live capabilities.
2. Design sign-off on spacing/elevation/motion scales.
3. Design sign-off on neutral/oat/alt palette additions and contrast thresholds.
4. Engineering sign-off on lint/test gates to enforce system usage.

## Risks And Mitigations
1. Risk: introducing broad CSS changes causes regressions.
   - Mitigation: ship in thin slices by surface and validate each before continuing.
2. Risk: migration churn in `apps/web/src/app/app/page.tsx` due file size.
   - Mitigation: extract focused subcomponents first, then swap usage incrementally.
3. Risk: placeholder marketing pages consume time without launch impact.
   - Mitigation: prioritize structure/system adoption only; leave non-home copy edits out of scope.
4. Risk: trust fixes conflict with growth messaging.
   - Mitigation: enforce truthful disclosure policy and remove unverifiable claims from UI.

## Validation And Test Plan
1. Unit/component tests:
   - `apps/web/src/app/__tests__/marketing-homepage.test.tsx`
   - `apps/web/src/app/__tests__/app-layout.test.tsx`
   - chat/timeline/settings-specific tests as surfaces migrate.
2. Frontend gate:
   - `cd apps/web && npm test` (includes token drift check)
3. Build gate:
   - `cd apps/web && npm run build`
4. Smoke gate:
   - `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green`
5. Manual UX pass:
   - Desktop + mobile checks for spacing rhythm, hierarchy, and control states on homepage, home, chat, tasks, settings.

## Rollback Notes
1. Keep rollout changes segmented by surface so any regression can be reverted without discarding whole-system progress.
2. Do not bundle dark-pattern removals with unrelated visual refactors.

## Next Actions
1. Approve Milestone 1 primitive set and trust policy language.
2. Implement Milestone 1 in one thin PR slice.
3. Start Milestone 2 with `apps/web/src/app/app/page.tsx` extraction to shared panel primitives.
4. Run dedicated homepage color-compliance pass against design-system token rules before broader marketing rollout.

## Open Questions
None.

## Term Definition: Profile Lock
Profile lock is the blocking state in the app shell when required caregiver/child profile fields are incomplete. In `apps/web/src/app/app/page.tsx`, it is derived from `profileIncomplete` and stored as `profileAccessLocked`; when active, chat/tasks/timeline actions are disabled and a modal prompts users to complete profile details before continuing full usage.

## Decision Log
1. Profile lock remains fully blocking for incomplete required profile data.
2. Scope of this slice is messaging clarity and rationale improvement only (no partial read-only access mode).
