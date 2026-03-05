Status: current
Last updated: March 5, 2026

# HAVI Homepage Modernization (Phase A)

## Summary

Upgrade the homepage to a premium, modern marketing surface with stronger contrast, clearer hierarchy, and a more convincing value narrative while keeping scope limited to `/`.

Phase A is homepage-only. It does not refactor other marketing routes and does not change onboarding logic.

Canonical design-system reference for this phase:
- `docs/canonical/design/homepage-surface-system.md`

## Goals

1. Improve first impression quality on desktop and mobile.
2. Increase message clarity in first viewport.
3. Strengthen conversion intent with better CTA choreography.
4. Encode new marketing layout primitives into the design system (tokens + reusable classes).

## Non-goals

1. Rewriting `/about`, `/pricing`, `/resources`, `/partners`, `/solutions`, `/stories`.
2. Shipping a public "How it works" section.
3. Any API/backend contract changes.
4. Onboarding flow refactors (`SID-60`, `SID-61` workstream remains separate).

## Requirements

### MVP

1. Keep the locked hero copy:
   - H1: `Parenthood moves fast. Stay ahead and present with Havi.`
   - Subhead: `Havi captures what happens, remembers it, and keeps your care team aligned so you can focus on your child.`
2. Keep narrative order:
   - hero
   - problem
   - feature gallery
   - comparison
   - proof
   - benefits
   - closing CTA
3. Add visible visual hierarchy:
   - tonal section contrast
   - elevated hero object
   - stronger card/surface separation
4. Add mid-funnel CTA reinforcement (without adding new route destinations).
5. Add reusable DS utilities/tokens for homepage structure and contrast.

### Later

1. Render "How it works" section using pre-defined content seam.
2. Roll the same contrast/rhythm primitives into other marketing routes.

## Design System Additions

Full canonical list moved to:
- `docs/canonical/design/homepage-surface-system.md`

Phase A adds and validates:
1. Reusable homepage surface tokens (contrast bands, light canvas, media framing).
2. Reusable homepage primitives (header/nav, section rhythm, type ladder, comparison, product media).
3. Homepage-only adoption in this slice (`/`), with primitives intentionally generic for rollout to other surfaces later.

## External Pattern References

This phase borrowed structural patterns from current examples:

1. `oncactus.com`
   - Clear "before vs with product" contrast module.
2. `scoutout.ai`
   - Strong hero framing with crisp action hierarchy.
3. `buttoncomputer.com`
   - Distinct tonal section rhythm and modern surface layering.

Applied translation for HAVI:

1. Before/with comparison block near top of page.
2. Hero focal object with product-moment framing.
3. Stronger section contrast and reusable surface primitives.

## Homepage Content Contract

Keep a typed content object in `apps/web/src/app/page.tsx` with:

1. Problem section copy
2. Hero headline/subhead
3. Proof entries
4. Benefit entries
5. Closing CTA copy
6. Optional `howItWorks` array (not rendered in Phase A)

## UX Notes

1. Hero becomes a two-column layout on desktop with a visual "product moment" object.
2. Mobile keeps identical narrative order; hero object stacks beneath copy.
3. Proof section uses stronger contrast and concrete framing.
4. CTA appears in hero, proof section, and final close.

## Test Plan

1. Unit/regression (`marketing-homepage.test.tsx`):
   - Locked hero copy present.
   - Section order fixed.
   - CTA href targets unchanged.
   - Hero visual object renders.
2. Smoke (`tests/smoke/homepage.smoke.spec.ts`):
   - Hero heading visible.
   - Hero CTA navigates to `/auth/sign-up`.
   - Mobile hierarchy still contains required benefits.
3. Build:
   - `npm run build` must pass for `apps/web`.

## Acceptance Criteria

1. Homepage visibly improves contrast and hierarchy.
2. Locked hero copy and route contracts remain unchanged.
3. New styling is implemented via DS tokens/utilities, not one-off inline styling.
4. No non-homepage marketing route changes are required for Phase A.

## Jony Feedback Pass (Applied)

### Critique themes

1. Contrast felt too flat across sections and cards.
2. Hero lacked a focal object with product immediacy.
3. Layout rhythm needed stronger structure and pacing.
4. Proof needed to feel more concrete and directional.

### Changes applied

1. Increased section contrast with `plain`, `band`, and `spotlight` section treatments.
2. Introduced hero focal object system (`havi-marketing-hero-object` + row primitives).
3. Strengthened rhythm with reusable layout primitives (`content-block`, `content-stack`, `actions`, proof/benefit grids).
4. Reframed proof cards from generic descriptors to directional value framing.
5. Added proof-stage CTA reinforcement.

### Design-system enforcement

1. Added/used marketing tokens for band/elevated/accent contrast.
2. Migrated remaining homepage structural styling into reusable marketing classes.
3. Kept implementation homepage-only while making primitives reusable for later route adoption.
