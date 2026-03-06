Status: draft
Last updated: March 5, 2026

# Homepage Apple-Bar Execution Spec (Draft)

## Summary

Raise homepage quality from "improved" to "premium and iconic" by enforcing stricter visual restraint, clearer brand hierarchy, sharper narrative progression, and credible proof.

This spec defines what must change in:
1. Homepage messaging and layout.
2. Design-system rules.
3. Canonical brand/design guidance.

## Goal + success metrics

### Goal

Deliver a homepage that communicates Havi’s value in one glance and feels deliberate, calm, and premium.

### Success metrics

1. First-view comprehension: users can answer "What is Havi?" in under 10 seconds during moderated checks.
2. Narrative clarity: users can distinguish "problem", "mechanism", and "outcome" without prompting.
3. Visual quality: internal design review passes all Apple-bar criteria (below) with zero critical misses.
4. Conversion proxy: hero-to-signup CTA click-through improves vs current baseline.

## Apple-bar criteria (release gate)

1. One dominant idea per section (no competing treatments).
2. One dominant frame per product visual (no stacked decorative borders).
3. Consistent type ladder and weight rhythm across all headline/body roles.
4. Visible whitespace rhythm that creates pacing, not density.
5. Brand lockup readable and intentional at first glance.
6. Proof feels specific and credible, not generic.

## Current-state assessment (from existing docs)

### What is working

1. Narrative order is already structured and testable (`hero -> problem -> comparison -> benefits -> close`).
2. Tokenized section contrast and reusable classes exist.
3. Copy now ties to concrete family actions better than earlier drafts.

### What is below bar

1. `docs/canonical/design/homepage-surface-system.md`
   - Notes CTA parity and hero frame depth as provisional; these are core polish blockers.
2. `docs/canonical/brand-theming-notes.md`
   - Strong implementation detail, but lacks explicit premium composition rules (restraint, spacing cadence, frame discipline).
3. Homepage visual language
   - Still too many competing card/frame treatments.
   - Product storytelling moments still read as "UI cards" more than hero moments.
4. Messaging system
   - Better than before, but some sections still overlap in meaning (repetition risk).
5. Proof
   - Trust line exists, but proof stack (testimonials/authority) is not fully integrated.

## Assumptions + constraints

1. Scope remains homepage + DS/canonical-doc updates only.
2. No backend/API changes.
3. Testimonials can be drafted in comps but require real-customer validation before production publish.
4. Existing route contracts remain (`/auth/sign-up`, `/stories`).

## What must change (required)

## A. Messaging framework changes

1. Lock section intent by unique question:
   - What is this?
   - Why now?
   - What changes with Havi?
   - What do I do with it daily?
   - Why trust this?
   - What do I do next?
2. Remove repeated claims across comparison, pillars, and closing copy.
3. Make mechanism explicit in hero subhead (conversation + shared memory + coordination).

## B. Visual/layout changes

1. Reduce graphic scale in comparison area and prioritize copy block.
2. Remove excess frame depth:
   - one media frame + subtle shadow max.
3. Increase whitespace bands between narrative beats.
4. Tighten header brand hierarchy:
   - larger/more legible wordmark lockup,
   - clear nav rhythm and CTA balance.
5. Unify CTA visual system:
   - same primary/secondary behavior and finish in header + in-page.

## C. Proof/testimonial system changes

1. Add `What parents say` module (2 to 4 short quotes).
2. Each quote must include:
   - specific outcome,
   - first name + city.
3. Include one trust anchor near testimonials:
   - expert-informed guidance + child-development grounding.

Draft quote set for design comps only (must be replaced/approved before final publish):
1. "We stopped repeating the same update in three chats. Now everyone sees the same story and we decide faster." — Nina, Brooklyn, NY
2. "I track things in seconds while I am in the moment, and Havi helps me connect what changed across the week." — Ethan, Austin, TX
3. "It feels like a calm teammate. I ask one question and get a clear next step instead of spiraling." — Marisol, San Diego, CA
4. "My partner, nanny, and I finally work from one thread. The handoffs are cleaner and mornings are less chaotic." — Priya, Chicago, IL

## D. Canonical guideline changes required

1. Update `docs/canonical/design/homepage-surface-system.md`:
   - Move CTA parity from provisional to locked pattern.
   - Move hero frame depth reduction from provisional to locked rule.
   - Add explicit "single dominant visual treatment per section" guardrail.
2. Update `docs/canonical/brand-theming-notes.md`:
   - Add premium composition rules:
     - whitespace cadence,
     - typographic rhythm,
     - frame restraint,
     - evidence-first proof usage.
3. Update active homepage copy spec:
   - lock final without/with rows and testimonial inclusion strategy.

## Milestones + workstreams (no dates by request)

1. Workstream A: Messaging lock
   - Finalize non-repetitive copy contract.
   - Finalize comparison row copy and close language.

2. Workstream B: Visual system lock
   - Simplify frame system.
   - Tune spacing, type hierarchy, and logo prominence.
   - Unify CTA treatment.

3. Workstream C: Proof stack
   - Add testimonial component and trust anchor placement.
   - Define publication rule for quote verification.

4. Workstream D: Canonicalization
   - Update canonical design/brand docs with locked rules.
   - Add regression checks for new copy/layout contracts.

## Dependencies + risks + mitigations

1. Dependency: approved final copy and testimonial policy.
   - Mitigation: use comp quotes now, production quotes only after approval.
2. Risk: over-designing visuals and reintroducing complexity.
   - Mitigation: one-frame rule and section-level restraint checklist.
3. Risk: CTA inconsistency across header/body.
   - Mitigation: unify through one DS variant contract.
4. Risk: docs drift from implementation.
   - Mitigation: treat canonical doc updates as required for merge.

## Test plan and invariants

### Invariants

1. Hero contains one headline, one mechanism subhead, one primary CTA.
2. Comparison module has exactly four rows and one visual companion.
3. Product visuals use a single dominant frame style.
4. Testimonials, if rendered, include outcome + name + city.
5. Heading hierarchy remains semantically correct on mobile and desktop.

### Validation

1. Unit/content tests
   - lock hero copy,
   - lock comparison rows,
   - lock pillar titles,
   - lock testimonial attribution format when enabled.
2. Visual QA pass
   - desktop/mobile screenshots,
   - spacing and frame-depth checklist.
3. Accessibility checks
   - contrast, heading order, readable line length.

## Next actions

1. Approve this execution spec as the quality bar.
2. Finalize testimonial publication policy (comp-only vs publish-ready).
3. Execute implementation in one focused homepage + DS pass.
4. Run content/visual regression checks and ship.
