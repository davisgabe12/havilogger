Status: current
Last updated: March 10, 2026

# HAVI App Surface System

## Purpose

Define one canonical layout and surface system for authenticated product routes (`/app/*`) that works on mobile and desktop and stays consistent with HAVI brand tokens.

Primary design direction:
calm and focused, with the restraint of Apple Reminders and Google Notes.

## Canonical Layout

1. Outer app shell uses `.havi-app-main` + `.havi-app-shell`.
2. Desktop uses persistent left sidebar (`.havi-app-sidebar`) and right content column.
3. Mobile uses top bar + overlay nav drawer.
4. Core panels (Home, Chat, Timeline, Tasks, History, Memory, Settings) use `.havi-card-shell` or `AppPanel`.

## Surface Families (Tokenized)

Use only token-backed surfaces:

1. Deep base surfaces:
   - `--havi-bg`, `--havi-surface-1..3`
2. Neutral dark surfaces:
   - `--havi-neutral-1..3`
3. Light oat/ivory surfaces:
   - `--havi-oat-1..3`
   - `--havi-canvas-paper`, `--havi-canvas-ivory`, `--havi-canvas-ivory-strong`
4. App semantic surfaces:
   - `--havi-app-panel-bg`, `--havi-app-panel-bg-soft`, `--havi-app-inset-bg`, `--havi-app-inset-bg-alt`
5. Notices:
   - `--havi-app-notice-info-*`, `--havi-app-notice-warning-*`, `--havi-app-notice-danger-*`

## Composition Rules

1. Avoid green-only compositions across long product flows.
2. Use neutral and oat surfaces to reset contrast and reduce visual fatigue.
3. Keep one dominant panel surface and one inset surface per section.
4. Do not add one-off `bg-*`/`border-*` utility mixes if a system class exists.

## Accessibility And Contrast Rules

1. Primary body text must remain readable on all panel and inset surfaces.
2. Warning and error notices must be distinguishable by color and border.
3. Disabled controls must be visually distinct but still legible.
4. Color is never the only state signal; support with icon/text/label when needed.

## Voice-First Rule

Voice input is first-class in chat:

1. A visible primary voice control must exist in the composer area on mobile and desktop.
2. Recording and transcribing states must be explicit in control text and visual state.
3. Voice controls must be reachable without opening secondary menus.

