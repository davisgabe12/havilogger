Status: draft
Last updated: March 5, 2026

# Homepage Brand Positioning Copy Spec (Draft)

## Summary

Define the homepage messaging contract so new visitors understand what Havi is in seconds: an AI partner for parents that reduces mental load, keeps context in one place, and helps families decide what to do next.

This spec covers copy strategy and message hierarchy for homepage brand positioning.

## Goals / Non-goals

### Goals

1. Make Havi immediately legible as a parent partner, not a generic tracking tool.
2. Tie emotional value (presence, calm, confidence) to concrete product actions.
3. Standardize homepage narrative so design, copy, and CTA flow are coherent.
4. Provide a copy contract that can be reused in signup and adjacent marketing pages.

### Non-goals

1. Full visual redesign spec for all marketing routes.
2. Pricing, packaging, or offer strategy changes.
3. Onboarding flow logic changes.

## User stories

1. As a first-time visitor, I can quickly understand what Havi does and why it is different.
2. As a busy parent, I can see both practical utility (tracking, reminders, coordination) and emotional outcome (being more present).
3. As a prospective user, I can trust that guidance quality is grounded in real expertise.

## Requirements (MVP vs later)

### MVP

1. Hero messaging
   - Headline: `Parenthood moves fast. Stay ahead and present with Havi.`
   - Subhead: `The partner parents have been waiting for.`
2. Core value section with four pillars (exactly four cards/blocks).
3. Trust/proof line included and visible near product explanation.
4. Product explanation line connecting tracking + conversational partner behavior.
5. Copy tone: plain, warm, direct, credible.
6. CTA language stays action-oriented and low-friction.

### Later

1. Persona-targeted variants (new parents, co-parents, caregivers).
2. A/B headline and subhead variants.
3. Channel-specific copy adaptations for paid/social.

## Proposed solution

Use a five-part narrative structure on homepage:

1. Hero
   - `Parenthood moves fast. Stay ahead and present with Havi.`
   - `The partner parents have been waiting for.`

2. What Havi does (4 pillars)
   - `Track everything in one place`
     - `Sleep, feeding, diapers, behavior, routines, and notes stay in one thread.`
   - `Get support through every phase`
     - `From sleepless nights to wild mornings, Havi stays with your family.`
   - `Get guidance tailored to your child`
     - `From tantrums to transitions, get next steps shaped to your child and context.`
   - `Keep your village in sync`
     - `Share updates, reminders, and plans so everyone knows what’s happening and what’s next.`

3. Trust line
   - `Built on child-development literature and expert-informed guidance.`

4. Expanded product explanation
   - `Track sleep, feeding, diapers, behavior, and daily moments in one shared place. Then talk with Havi like a partner to capture insights, expertise from others, and decide what to do next.`

5. CTA close
   - Reinforce present-focused outcome and prompt signup.

## Alternatives considered

1. Generic productivity framing
   - Rejected: does not communicate parenting-specific value.
2. Purely emotional brand language without concrete utility
   - Rejected: weak conversion trust for practical decision makers.
3. Feature list only
   - Rejected: misses partner narrative and emotional payoff.

## Data / API / UX notes

1. No API or backend changes required.
2. UX dependency:
   - Four pillars should be visually scannable in one section.
   - Trust line should sit near proof/product explanation, not buried in footer.
3. CTA destination remains `/auth/sign-up` unless changed by growth strategy.

## Risks / mitigations

1. Risk: Copy feels broad and not product-specific.
   - Mitigation: keep concrete nouns and actions in every pillar.
2. Risk: Tone becomes too marketing-heavy.
   - Mitigation: plain language guardrail, short sentence structure.
3. Risk: Trust claim appears unsubstantiated.
   - Mitigation: add linked supporting proof sources in later phase.

## Success metrics

1. Visitors can correctly answer "What is Havi?" in first-session user tests.
2. Improved homepage-to-signup click-through rate.
3. Reduced bounce from homepage first viewport.
4. Qualitative feedback indicates stronger clarity on value and differentiation.

## Milestones / rollout

1. Phase 1: Copy lock and homepage implementation.
2. Phase 2: Consistency pass across signup and key marketing pages.
3. Phase 3: Experimentation pass (headline/pillar emphasis tests).

## Test plan

1. Content contract checks
   - Hero headline and subhead render exactly as specified.
   - Four pillar headings and descriptions render exactly once.
   - Trust line and product explanation line are present.
2. UX checks
   - Mobile and desktop preserve narrative order.
   - Primary CTA remains visible above the fold and in closing section.
3. Regression checks
   - Existing homepage route and CTA links remain valid.

## Open questions

1. Should subhead remain short (`The partner parents have been waiting for.`) or include a concrete verb phrase?
2. Do we want a secondary trust proof block (expert names, citations, or badges) in this phase?
3. Should "village" terminology be mirrored in onboarding/signup copy now or in the next consistency pass?
