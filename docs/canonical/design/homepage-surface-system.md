Status: current
Last updated: March 5, 2026

# HAVI Homepage Surface System

## Purpose

Define the deliberate, reusable design-system primitives introduced through homepage modernization, so they can be reused consistently on other surfaces.

This is a system doc, not a page spec.

## Canonical Pieces

1. Tokens
   - File: `apps/web/src/styles/havi-tokens.css`
   - Surface and contrast:
     - `--havi-surface-band-bg`
     - `--havi-surface-band-border`
     - `--havi-surface-elevated-bg`
     - `--havi-surface-elevated-strong`
     - `--havi-surface-hero-frame`
   - Light canvas:
     - `--havi-canvas-paper`
     - `--havi-canvas-ivory`
     - `--havi-canvas-ivory-strong`
     - `--havi-ink-dark`
     - `--havi-ink-muted`
   - Media framing:
     - `--havi-media-surface`
     - `--havi-media-border-soft`
     - `--havi-media-shadow-soft`
   - Signal contrast:
     - `--havi-signal-positive-bg`
     - `--havi-signal-positive-border`
     - `--havi-signal-negative-bg`
     - `--havi-signal-negative-border`

2. Base utility classes
   - File: `apps/web/src/app/globals.css`
   - Header/navigation:
     - `havi-marketing-header`
     - `havi-marketing-header-inner`
     - `havi-marketing-brand-link`
     - `havi-marketing-nav`
     - `havi-marketing-nav-link`
     - `havi-marketing-header-actions`
     - `havi-marketing-header-signin`
     - `havi-marketing-header-cta`
     - `havi-marketing-mobile-panel`
   - Brand mark:
     - `havi-brand-wordmark`
     - `havi-brand-wordmark-mark`
     - `havi-brand-wordmark-text`
   - Section rhythm and contrast:
     - `havi-section-block`
     - `havi-section-compact`
     - `havi-section-plain`
     - `havi-canvas-band-light`
     - `havi-canvas-band-soft`
   - Type roles:
     - `havi-problem-title`
     - `havi-text-hero`
     - `havi-text-title`
     - `havi-text-subhead`
     - `havi-text-body`
     - `havi-marketing-card-title`
     - `havi-marketing-card-body`
     - `havi-marketing-proof-value`
     - `havi-marketing-proof-label`
     - `havi-marketing-proof-detail`
   - Story and comparison:
     - `havi-content-block-problem`
     - `havi-comparison-columns-head`
     - `havi-comparison-column-title`
     - `havi-problem-grid`
     - `havi-signal-list`
     - `havi-signal-pill`
     - `havi-comparison-layout`
     - `havi-comparison-rows`
     - `havi-comparison-row`
     - `havi-comparison-companion`
     - `havi-comparison-item`
     - `havi-comparison-item-without`
     - `havi-comparison-item-with`
     - `havi-comparison-item-label`
     - `havi-comparison-item-copy`
     - `havi-comparison-grid`
     - `havi-comparison-card`
     - `havi-comparison-card-without`
     - `havi-comparison-card-with`
     - `havi-comparison-label`
     - `havi-comparison-list`
   - Product media:
     - `havi-section-feature-gallery`
     - `havi-product-shot-grid`
     - `havi-product-figure`
     - `havi-product-shot-media`
     - `havi-product-shot-media-hero`
     - `havi-feature-focus`
     - `havi-feature-crop`
     - `havi-feature-crop-chat`
     - `havi-feature-crop-timeline`
     - `havi-feature-crop-task`
     - `havi-hero-product-stage`
   - Evidence and testimonials:
     - `havi-proof-evidence-grid`
     - `havi-testimonials-grid`
     - `havi-testimonial-meta`

3. Homepage composition reference
   - File: `apps/web/src/app/page.tsx`
   - Sections:
     1. `home-section-hero`
     2. `home-section-problem`
     3. `home-section-comparison`
     4. `home-section-benefits`
     5. `home-section-evidence`
     6. `home-section-testimonials`
     7. `home-section-closing`

## Deliberate Patterns (Locked)

1. Problem + comparison module
   - Use one high-contrast problem statement and a dedicated before/with comparison section with paired rows.
   - Keep comparison labels uppercase and short.

2. Tonal section rhythm
   - Alternate deep/neutral surface bands to break long green runs.
   - Use `havi-canvas-band-light` and `havi-canvas-band-soft` instead of page-specific background values.

3. Product feature figures
   - Show a focused product crop per feature with one media shell and short title/body copy.
   - Avoid decorative nested wrappers around each image.

4. Typography ladder
   - Display font: major headlines only (`havi-problem-title`, `havi-text-hero`, `havi-text-title`).
   - Sans font: navigation, cards, proof labels, and body copy.

## Provisional (Not Yet Locked)

1. CTA parity
   - Header CTA currently uses base `Button` + `havi-marketing-header-cta`.
   - In-page CTAs use `havi-cta-primary` / `havi-cta-secondary`.
   - Next system pass should unify CTA treatment into one deliberate variant set.

2. Hero frame depth
   - Hero still layers section frame + object frame + media frame.
   - Next system pass should reduce border-depth to one dominant frame plus optional shadow.

## Guardrails

1. Do not add one-off color mixes in page components when a token/class exists.
2. Add new homepage visual language through tokens + reusable classes in `globals.css`.
3. Keep copy blocks short and action-led; avoid long, abstract marketing lines in cards.
4. Keep design docs synchronized when class names or token semantics change.
