# HAVI Brand & Theming Notes (Current State)

This file documents the HAVI brand assets, design tokens, and UI/theming changes made in the current iteration. It is intentionally concise and implementation-focused.

## Brand Assets (Source of Truth)

- Style guide: `apps/web/public/brand/docs/HAVI_STYLE_GUIDE.md`
- Type scale: `apps/web/public/brand/docs/HAVI_TYPE_SCALE.md`
- Palette (Night Forest UI tokens, JSON): `apps/web/public/brand/palette/night-forest-ui-tokens.json`
- Logo / nest mark SVGs:
  - `apps/web/public/brand/logos/havi-icon-dark.svg`
  - `apps/web/public/brand/logos/havi-logo-master.svg`
  - `apps/web/public/brand/logos/havi-logo-transparent.svg`

## Design Tokens

- Core HAVI tokens (CSS): `apps/web/src/styles/havi-tokens.css`
  - Core colors: `--havi-bg`, `--havi-fg`, `--havi-moss`, surfaces 1–3.
  - Text: `--havi-text`, `--havi-text-muted`, `--havi-text-disabled`.
  - Borders: `--havi-border`, `--havi-border-strong`.
  - Actions:
    - Primary: `--havi-primary-bg`, `--havi-primary-fg`, `--havi-primary-hover`, `--havi-primary-active`.
    - Secondary: `--havi-secondary-bg`, `--havi-secondary-hover`, `--havi-secondary-active`.
    - Ghost: `--havi-ghost-hover`, `--havi-ghost-active`.
  - Focus: `--havi-ring`.
  - Tooltip: `--havi-tooltip-bg`, `--havi-tooltip-fg`, `--havi-tooltip-border`.
  - Status: `--havi-status-success`, `--havi-status-warning`, `--havi-status-destructive`.
  - Destructive semantics: `--havi-destructive-bg`, `--havi-destructive-fg`.
  - Charts: `--havi-chart-1` … `--havi-chart-5`.

## Theme Bridge (Semantic Mapping)

- Theme bridge file: `apps/web/src/styles/havi-theme.css`
  - Imports `havi-tokens.css`.
  - Defines `.dark { ... }` mappings from semantic variables to HAVI tokens.
  - Key mappings (Night Forest, default):
    - Surfaces:
      - `--background` → `--havi-bg`
      - `--foreground` → `--havi-text`
      - `--card` → `--havi-surface-2`
      - `--card-foreground` → `--havi-text`
      - `--popover` → `--havi-surface-1`
      - `--popover-foreground` → `--havi-text`
    - Actions:
      - `--primary` → `--havi-primary-bg`
      - `--primary-foreground` → `--havi-primary-fg`
      - `--secondary` → `--havi-secondary-bg`
      - `--secondary-foreground` → `--havi-text`
      - `--muted` → `--havi-surface-1`
      - `--muted-foreground` → `--havi-text-muted`
      - `--accent` → `--havi-secondary-bg`
      - `--accent-foreground` → `--havi-text`
    - Lines / focus:
      - `--border` → `--havi-border`
      - `--input` → `--havi-border`
      - `--ring` → `--havi-ring`
    - Status + charts:
      - `--destructive` → `--havi-destructive-bg`
      - `--chart-1` … `--chart-5` → `--havi-chart-1` … `--havi-chart-5`.
- Global CSS entry point: `apps/web/src/app/globals.css`
  - Imports: `tailwindcss`, `tw-animate-css`, and `../styles/havi-theme.css`.
  - Keeps `:root` light theme and sidebar defaults unchanged for now.
  - Base layer still drives border and body colors via semantic vars.

## Identity & Chat UI Changes

- Assistant identity:
  - Conversational name is always `HAVI` (all caps) in UI.
  - Assistant sender names in chat and shared views use `"HAVI"`.
- Chat avatar:
  - Assistant bubble gutter shows a small chip labeled `HAVI` (no bare `"H"`; no nest mark alone).
- Wordmark component:
  - `apps/web/src/components/brand/HaviWordmark.tsx`
  - Renders nest mark (`/brand/logos/havi-logo-transparent.svg`) + HAVI label together.
- Headers using wordmark:
  - Main chat page: `apps/web/src/app/page.tsx`
  - Knowledge page: `apps/web/src/app/knowledge/page.tsx`
  - Shared conversation page: `apps/web/src/app/share/[token]/page.tsx`
  - All use `<HaviWordmark />` in their top headers.

## Brand Artifact Page

- Path: `/brand`
- File: `apps/web/src/app/brand/page.tsx`
- Purpose:
  - Visual smoke test for Night Forest theme, tokens, and type scale.
- Shows:
  - HAVI wordmark.
  - Swatches for `background`, `card`, `muted`, `border`, `primary`, `secondary`, `destructive`, `ring`.
  - Real components using existing classes:
    - `Button` (primary / secondary / ghost, with live hover/active).
    - Input + focus ring (`border-input`, `ring-ring`).
    - Card with primary + muted text.
    - Tooltip-style block using `bg-popover`, `text-popover-foreground`.
    - Chips using `bg-muted`, `bg-secondary`.
  - Type samples for H1/H2/body/small/caption.

## Select / Dropdown Rules

- Native selects should use the shared HAVI select style:
  - Class: `havi-select`
  - Maps to:
    - Surface: `bg-popover`, `text-popover-foreground`.
    - Border: `border-border/60`.
    - Hover: `bg-muted`.
    - Focus: `ring-2 ring-ring`, `outline-none`.
- Usage:
  - Timeline child selector (`timeline-panel.tsx`).
  - Settings dropdowns (relationship, weight units, timezone) in `app/page.tsx`.
  - Width (`w-full` vs auto) and font size (`text-xs` vs `text-sm`) can be applied per context on top of `havi-select`.

## Test / Lint Status (After Changes)

- Tests: `cd apps/web && npm test`
  - Status: **pass** (timeline tests; no regressions observed).
- Lint: `cd apps/web && npm run lint`
  - Status: **fails** due to pre-existing issues:
    - `apps/web/scripts/dev-safe.js` uses CommonJS `require()` (3 errors).
    - Several `react-hooks/exhaustive-deps` and `no-unused-vars` warnings in `apps/web/src/app/page.tsx` and `apps/web/src/components/timeline/timeline-panel.tsx`.
  - No new lint categories introduced by the brand/theming work.
