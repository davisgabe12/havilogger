Status: draft
Last updated: March 5, 2026

# Homepage Imagery + Copy Execution Spec (Codex-Ready)

## Summary

Upgrade homepage imagery to App Store/Apple-level clarity and align every image to a specific copy promise.

This spec is written for direct Codex execution: explicit files, exact changes, acceptance gates, and test commands.

## Goal

When a new visitor lands on `/`, they can instantly see:
1. What Havi does.
2. How it works in real family moments.
3. Why they should trust it.

## Scope

In scope:
1. Homepage imagery quality and layout hierarchy.
2. Homepage copy-to-image alignment.
3. Testimonial module with draft quotes.
4. Regression tests for copy/image contracts.

Out of scope:
1. Other marketing routes.
2. Onboarding flow logic.
3. API/backend changes.

## Current -> Proposed (Impact Summary)

| Impact | Area | Current | Proposed |
|---|---|---|---|
| High | Hero visual | Broad dark crop, mixed frame depth | One hyper-focused chat thread moment with readable text |
| High | Copy-image alignment | Generic feature screenshots | Each image maps to one specific copy promise |
| High | Contrast/brightness | Green-heavy and visually dense | Brighter paper canvas + restrained dark anchors |
| High | Narrative focus | Many equal-weight visuals | One dominant hero visual + two supporting proofs |
| Medium | Comparison clarity | Good copy, visual weight still heavy | Tighter row matrix + smaller companion graphic |
| Medium | Proof credibility | Trust line only | Add testimonial module with specific outcomes + name/city |

## Final copy contract (to implement)

### Hero

1. Headline:
   - `Parenthood moves fast. Stay ahead and present with Havi.`
2. Subhead:
   - `Track sleep, feeding, diapers, behavior, and routines in one shared thread. Talk with Havi like a partner to decide what to do next.`

### Problem

1. Title:
   - `The hardest part isn’t caring. It’s carrying every detail.`
2. Body:
   - `When updates live across texts, apps, and memory, families spend energy reconstructing what happened instead of deciding what to do next.`

### Without/With rows (exactly 4)

1. Without: `Updates are scattered across chats and notes.`
   - With: `Sleep, feeding, diapers, behavior, and routines stay in one thread.`
2. Without: `Parents repeat the same context over and over.`
   - With: `Havi remembers key details so everyone starts aligned.`
3. Without: `Questions pile up at the worst moment.`
   - With: `Ask in conversation and get next steps tailored to your child.`
4. Without: `Plans drift between partners and helpers.`
   - With: `Reminders, updates, and tasks stay in sync across your village.`

### Pillars heading

1. `What parents do with Havi every day`

### Trust line

1. `Built on child-development literature and expert-informed guidance.`

### Close

1. `Now parents can be present. Havi handles the mental load.`

## Visual production spec (imagery)

## Asset set (replace/add)

Directory:
- `apps/web/public/brand/product/`

Files:
1. `hero-chat-thread.png`
2. `proof-pattern-clarity.png`
3. `proof-task-coordination.png`
4. `comparison-companion.png`

## Capture direction per asset

1. `hero-chat-thread.png`
   - Show a real thread sequence:
     - Parent logs multiple events in one message.
     - HAVI summarizes and suggests next step.
   - Exclude side navigation.
   - Prioritize bubble readability at first glance.

2. `proof-pattern-clarity.png`
   - Show timeline/pattern signal becoming obvious across days.
   - One strong chart/list area in focus.

3. `proof-task-coordination.png`
   - Show task/reminder generated from conversational context.
   - Include assignee or timing cue.

4. `comparison-companion.png`
   - Small supporting visual for without/with section.
   - Must not compete with row copy.

## Image treatment rules

1. No heavy dark overlays on screenshots.
2. No stacked decorative borders.
3. Use one media frame style:
   - radius: consistent,
   - border: subtle,
   - shadow: soft, single-level.
4. Hyper-focus crop:
   - maximize legibility of key UI text and interaction.

## Layout/spacing system changes

1. Comparison block:
   - text matrix is primary.
   - companion graphic is secondary (`~32%` to `40%` desktop width).
2. Hero:
   - one dominant product visual only.
3. Whitespace:
   - increase section spacing cadence.
   - avoid stacked dense card clusters.

## Testimonials module (draft copy for comps)

Section title:
1. `What parents say`

Cards:
1. `“We stopped repeating the same update in three chats. Now everyone sees the same story and we decide faster.”`
   - `Nina, Brooklyn, NY`
2. `“I track things in seconds while I’m in the moment, and Havi helps me connect what changed across the week.”`
   - `Ethan, Austin, TX`
3. `“It feels like a calm teammate. I ask one question and get a clear next step instead of spiraling.”`
   - `Marisol, San Diego, CA`

Publishing rule:
1. Draft quotes allowed in design/dev environments.
2. Production publish requires approved real-user quotes and consent.

## Codex implementation plan (file-level)

## 1) Homepage content and section composition

Edit:
- `apps/web/src/app/page.tsx`

Tasks:
1. Replace hero/problem/comparison/close copy with final contract above.
2. Update product image references to new asset names.
3. Add testimonial data model:
   - quote
   - name
   - city
4. Render testimonial section after trust/proof and before closing CTA.
5. Keep route contracts unchanged:
   - primary CTA -> `/auth/sign-up`
   - secondary CTA -> `/stories`

## 2) Visual layer and media styling

Edit:
- `apps/web/src/app/globals.css`
- `apps/web/src/styles/havi-tokens.css` (only if new semantic tokens are needed)

Tasks:
1. Reduce frame depth in hero and media containers.
2. Lower visual noise from multiple gradients on same section.
3. Normalize one media frame treatment for all homepage product images.
4. Ensure comparison companion graphic renders smaller than text matrix.
5. Keep color usage token-based (no one-off inline values in component files).

## 3) Header brand clarity

Edit:
- `apps/web/src/components/brand/HaviWordmark.tsx`
- `apps/web/src/app/globals.css` (wordmark classes)

Tasks:
1. Increase brand lockup legibility:
   - stronger wordmark size/weight,
   - tighter tracking.
2. Keep lockup visually dominant vs nav text.

## 4) Test contracts

Edit:
- `apps/web/src/app/__tests__/marketing-homepage.test.tsx`
- `apps/web/tests/smoke/homepage.smoke.spec.ts`

Add/update assertions:
1. Hero headline/subhead exact match.
2. Comparison row count equals 4.
3. Testimonial section renders with 3 quotes and attribution format.
4. New image alt text presence checks for updated assets.
5. CTA href contracts unchanged.

## Acceptance criteria (binary)

1. Hero image clearly shows a real readable conversation thread.
2. Each major homepage image maps to one copy promise.
3. Without/With section has exactly 4 rows with non-repetitive behavior shifts.
4. Companion comparison visual is intentionally smaller than row copy block.
5. Testimonial module is present with outcome-driven quotes and name/city attribution.
6. Header brand lockup is more legible and visually prioritized.
7. Copy + layout tests pass.
8. Build passes.

## Verification commands

1. `cd apps/web && npm test -- marketing-homepage.test.tsx --runInBand`
2. `cd apps/web && npm run lint`
3. `cd apps/web && npm run build`
4. `cd apps/web && npx playwright test tests/smoke/homepage.smoke.spec.ts`

## Rollback plan

1. Revert homepage copy constants and testimonial section in `page.tsx`.
2. Restore prior product image references.
3. Revert changed media/hero frame classes in `globals.css`.
4. Revert tests to previous locked contract.
