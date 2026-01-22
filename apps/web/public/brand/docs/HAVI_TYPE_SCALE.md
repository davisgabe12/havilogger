# HAVI Type Scale (v1)

Principle: calm, legible, restrained. Default to system fonts.

## Typeface
- Primary: system-ui stack
  - apple-system, BlinkMacSystemFont, "SF Pro", "Segoe UI", Roboto, Helvetica, Arial, sans-serif
- Optional later: Inter (only if needed for cross-platform consistency)

## Color pairing
- Default text uses the softened foreground token (`--havi-text`) to keep contrast calm.
- Use fog/oat variants for large type, hero, or headline moments when a softer glow is desired.

## Sizes (px) + usage
- 32: Page title / hero (rare)
- 24: Section title
- 18: Card title / key UI emphasis
- 16: Default body / primary UI text
- 14: Secondary UI text (labels, helper)
- 12: Meta (timestamps, captions)

## Line heights
- Headings: 1.2
- Body/UI: 1.4
- Dense tables: 1.3

## Weight
- Default: 400
- Emphasis: 500
- Avoid heavy bold unless absolutely necessary
