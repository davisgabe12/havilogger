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
  - Core colors: `--havi-bg`, `--havi-fg`, `--havi-fg-fog`, `--havi-fg-oat`, `--havi-moss`, surfaces 1–3.
  - Text: `--havi-text`, `--havi-text-muted`, `--havi-text-disabled`.
  - Borders: `--havi-border`, `--havi-border-strong`.
  - Actions:
    - Primary: `--havi-primary-bg`, `--havi-primary-fg`, `--havi-primary-hover`, `--havi-primary-active`.
    - Secondary: `--havi-secondary-bg`, `--havi-secondary-hover`, `--havi-secondary-active`.
    - Ghost: `--havi-ghost-hover`, `--havi-ghost-active`.
  - Focus: `--havi-ring`.
  - Tooltip: `--havi-tooltip-bg`, `--havi-tooltip-fg`, `--havi-tooltip-border`.
  - Status: `--havi-status-success`, `--havi-status-warning`, `--havi-status-destructive`.
  - Form fields:
    - Surfaces/text: `--havi-field-bg`, `--havi-field-text`, `--havi-field-placeholder`.
    - Borders/focus: `--havi-field-border`, `--havi-field-border-hover`, `--havi-field-border-focus`, `--havi-field-ring`.
    - Disabled: `--havi-field-disabled-bg`, `--havi-field-disabled-text`.
    - Field copy: `--havi-field-label`, `--havi-field-hint`.
  - Showcase surfaces (generic, not marketing-only):
    - Bands/surfaces: `--havi-surface-band-bg`, `--havi-surface-band-border`, `--havi-surface-elevated-bg`, `--havi-surface-elevated-strong`, `--havi-surface-hero-frame`.
    - Accent/glow: `--havi-accent-warm`, `--havi-accent-warm-soft`, `--havi-accent-sky`, `--havi-accent-coral`, `--havi-accent-mint`, `--havi-accent-sky-soft`, `--havi-accent-coral-soft`, `--havi-accent-mint-soft`, `--havi-glow-soft`.
    - Light canvas + feature framing: `--havi-canvas-soft`, `--havi-canvas-soft-border`, `--havi-canvas-paper`, `--havi-feature-frame-border`, `--havi-feature-shadow`.
    - Media surfaces (generic): `--havi-media-surface`, `--havi-media-border-soft`, `--havi-media-shadow-soft`.
    - Signal contrast tokens: `--havi-signal-positive-bg`, `--havi-signal-positive-border`, `--havi-signal-negative-bg`, `--havi-signal-negative-border`.
    - Compatibility aliases remain available for existing marketing classes:
      - `--havi-marketing-band-bg`, `--havi-marketing-band-border`, `--havi-marketing-elevated-bg`, `--havi-marketing-elevated-strong`.
      - `--havi-marketing-accent`, `--havi-marketing-accent-soft`, `--havi-marketing-glow`.
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
  - Oat/fog neutral swatch for softened foreground reference.
  - Real components using existing classes:
    - `Button` (primary / secondary / ghost, with live hover/active).
    - `Input` + `InputMessage` states (default, warning, error) using `havi-input` base styling.
    - Card with primary + muted text.
    - Tooltip-style block using `bg-popover`, `text-popover-foreground`.
    - Chips using `bg-muted`, `bg-secondary`.
  - Type samples for H1/H2/body/small/caption.

## Select / Dropdown Rules

- Native selects should use the shared HAVI select primitive:
  - Component: `apps/web/src/components/ui/select.tsx` (`Select`).
  - Base class: `havi-select`.
  - State model: `default`, `success`, `warning`, `error` via `status` prop, plus `aria-invalid` handling.
  - Maps to form-field tokens for surface, border, focus ring, and disabled treatment.
- Usage:
  - Timeline child selector (`timeline-panel.tsx`).
  - Settings dropdowns (relationship, weight units, timezone) in `app/page.tsx`.
  - Width (`w-full` vs auto) and font size (`text-xs` vs `text-sm`) can be applied per context on top of `havi-select`.

## Input Field Rules

- Canonical text input + textarea style:
  - Class: `havi-input` (defined in `apps/web/src/app/globals.css`).
  - Status model source: `apps/web/src/components/ui/field.tsx` (`fieldControlVariants`, `fieldMessageVariants`).
  - Component wrappers:
    - `Input` + `InputMessage` in `apps/web/src/components/ui/input.tsx`
    - `Textarea` in `apps/web/src/components/ui/textarea.tsx`
    - `Select` in `apps/web/src/components/ui/select.tsx`
  - Applies to:
    - Chat composer textarea (`Textarea` component in `components/ui/textarea.tsx`).
    - Settings form fields (`EditableField` in `app/page.tsx`).
    - Task detail modal inputs (title, date, time) in `app/page.tsx`.
    - Invite caregiver modal email field in `app/page.tsx`.
    - Brand artifact input on `/brand`.
- Visual behavior:
  - Full-width, rounded, calm surface backed by field tokens (`--havi-field-*`).
  - Consistent hover, focus, invalid, and disabled states across input/select/textarea.
  - Placeholder text uses `--havi-field-placeholder`.
- Usage rules:
  - Do: compose spacing (`mt-1`, grid gaps) outside the input via parent layout.
  - Do: use `havi-input` for all primary text inputs and textareas unless a component has a very specific visual spec.
  - Don’t: hand-apply per-field padding, borders, or focus colors for standard forms.

## Form Composition Primitives

- Use `apps/web/src/components/ui/field.tsx` primitives for standard form composition:
  - `Field` (layout wrapper),
  - `FieldLabel`,
  - `FieldHint`,
  - `FieldMessage`,
  - `FieldError`.
- This keeps label tone, helper copy, and error message spacing consistent without per-screen custom classes.

## Form State Rules

For every text/select/textarea field:
1. `default`: tokenized surface + border + focus ring.
2. `success`: status border/ring + success helper text where useful.
3. `warning`: caution border/ring + warning helper text.
4. `error`: destructive border/ring + explicit inline error text.
5. `disabled`: non-interactive cursor + disabled surface/text token treatment.

Preferred usage:
- Set `status` for deliberate state styling.
- Set `aria-invalid="true"` when validation fails to guarantee assistive semantics.
- Keep field-level errors inline instead of only top-of-form banners.

## Primary App Container Rules

- Canonical app shell:
  - Class: `havi-app-shell` (defined in `apps/web/src/app/globals.css`).
  - Applied to `<main>` in `apps/web/src/app/page.tsx`.
  - Layout:
    - Centered column, `max-w-[390px]`, `min-h-screen`, `w-full`.
    - Horizontal + vertical padding (`px-4 py-6`) with consistent gap between sections.
- Primary content cards:
  - Class: `havi-card-shell`.
  - Applied to `Card` components for:
    - Chat panel (`activePanel === "havi"`).
    - Timeline, Tasks, History, Knowledge, Settings panels in `app/page.tsx`.
  - Visuals:
    - Uses `bg-card/70` with subtle backdrop blur for calm containment.
    - No per-panel background overrides; hierarchy comes from card vs background, not page-specific hacks.
- Usage rules:
  - Do: place primary app routes inside `havi-app-shell` and primary panels inside `havi-card-shell`.
  - Do: keep container width and padding consistent so navigation between Chat / History / Settings does not resize the frame.
  - Don’t: introduce page-specific max-widths or padding for these core panels unless explicitly called out in specs.

## Layout + Navigation Rules (Phase 1 Stabilization)

### Canonical app frame
- The ONLY canonical content container is `.havi-app-shell` (max width + padding).
- All panels (Chat/Timeline/Tasks/History/Knowledge/Integrations/Settings) must render inside `.havi-app-shell`.
- Do not add per-panel max-width or horizontal padding; keep spacing inside the shared shell.

### Responsive shell
- Desktop (`md+`): 2-column layout
  - Left: persistent sidebar (fixed ≈240px) with vertical nav list.
  - Right: main content with `.havi-app-shell` inside.
- Mobile (`<md`): no sidebar; use header + hamburger + overlay sheet.

### Mobile overlay hard rules
- Overlay + backdrop MUST be fully unmounted when `navOpen === false`.
- Overlay closes on:
  - selection
  - outside click (backdrop)
  - ESC
- When closed, there must be no invisible element intercepting taps.

### Desktop nav hard rules
- No horizontal/top nav on desktop.
- Brand (HAVI wordmark/logo) is the primary top-left anchor in the sidebar.
- Any “Menu” label should be removed or visually demoted.

### Padding rules (non-negotiable)

**Desktop (`md+`)**
- Outer layout:
  - Use `flex min-h-screen flex-col md:flex-row`.
  - Sidebar: `hidden md:flex md:w-60 md:flex-col md:sticky md:top-0 md:h-screen border-r bg-card/95 p-3`.
  - Main column outer padding: `px-4 md:px-6 lg:px-8`.
- Inner content frame:
  - Always wrap panel content in `.havi-app-shell`.
  - `.havi-app-shell` remains the ONLY max-width constraint (currently `max-w-[390px]`).
  - No additional per-panel horizontal padding.

**Mobile (`<md`)**
- Sidebar: hidden (`hidden md:flex`).
- Header + hamburger: visible (`md:hidden`).
- Inner content frame:
  - `.havi-app-shell` defines horizontal padding (currently `px-4`).
  - Panels must not remove or override this padding.
- Mobile overlay sheet:
  - Appears on top of content (absolute/fixed) and MUST NOT resize layout.
  - Backdrop must cover the viewport and MUST fully unmount when closed.

### Tests required
- Add/maintain regression tests in `apps/web/src/app/__tests__/app-layout.test.tsx`:
  1. Panels render inside the canonical frame wrapper (`data-testid="app-frame"`).
  2. Backdrop/overlay unmount when `navOpen` becomes `false`.
  3. Desktop padding rules: sidebar wrapper includes `md:w-60 p-3 border-r`, main wrapper includes `px-4 md:px-6 lg:px-8`.
  4. Mobile padding + overlay: `app-frame` remains mounted when overlay opens; closing overlay removes sheet + backdrop while keeping frame/child panel intact.

## Test / Lint Status (After Changes)

- Tests: `cd apps/web && npm test`
  - Status: **pass** (timeline tests; no regressions observed).
- Lint: `cd apps/web && npm run lint`
  - Status: **fails** due to pre-existing issues:
    - `apps/web/scripts/dev-safe.js` uses CommonJS `require()` (3 errors).
    - Several `react-hooks/exhaustive-deps` and `no-unused-vars` warnings in `apps/web/src/app/page.tsx` and `apps/web/src/components/timeline/timeline-panel.tsx`.
  - No new lint categories introduced by the brand/theming work.

## Homepage Contract (Phase A)

Canonical sources:
1. System primitives, tokens, guardrails:
   - `docs/canonical/design/homepage-surface-system.md`
2. Phase scope and delivery constraints:
   - `docs/canonical/design/homepage-modernization-phase-a.md`

Contract summary:
1. Scope remains homepage-only (`apps/web/src/app/page.tsx`) for Phase A.
2. Narrative order remains fixed:
   - `home-section-hero`
   - `home-section-problem`
   - `home-section-comparison`
   - `home-section-benefits`
   - `home-section-evidence`
   - `home-section-testimonials`
   - `home-section-closing`
3. Locked hero copy:
   - `Parenthood moves fast. Stay ahead and present with Havi.`
   - `Track sleep, feeding, diapers, behavior, and routines in one shared thread. Talk with Havi like a partner to decide what to do next.`
4. CTA routes are fixed:
   - primary: `/auth/sign-up`
   - secondary: `/stories`
5. `howItWorks` content seam remains non-rendered in Phase A.
