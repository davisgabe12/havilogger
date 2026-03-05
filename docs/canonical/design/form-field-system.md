Status: current
Last updated: March 5, 2026

# HAVI Form Field System

## Purpose

Define one reusable field system for all text/select/textarea experiences across auth, onboarding, settings, and app workflows.

## Canonical Pieces

1. Tokens
   - File: `apps/web/src/styles/havi-tokens.css`
   - Field tokens:
     - `--havi-field-bg`
     - `--havi-field-text`
     - `--havi-field-placeholder`
     - `--havi-field-border`
     - `--havi-field-border-hover`
     - `--havi-field-border-focus`
     - `--havi-field-ring`
     - `--havi-field-disabled-bg`
     - `--havi-field-disabled-text`
     - `--havi-field-label`
     - `--havi-field-hint`

2. Base classes
   - File: `apps/web/src/app/globals.css`
   - Classes:
     - `havi-input`
     - `havi-select`
     - `havi-field-label`
     - `havi-field-hint`

3. UI primitives
   - `apps/web/src/components/ui/field.tsx`
     - `Field`
     - `FieldLabel`
     - `FieldHint`
     - `FieldMessage`
     - `FieldError`
     - `fieldControlVariants`
     - `fieldMessageVariants`
   - `apps/web/src/components/ui/input.tsx`
     - `Input`
     - `InputMessage`
   - `apps/web/src/components/ui/textarea.tsx`
     - `Textarea`
   - `apps/web/src/components/ui/select.tsx`
     - `Select` (native select wrapper)

## State Model

Every field control supports:

1. `default`
2. `success`
3. `warning`
4. `error`
5. `disabled`

Implementation rules:

1. Use `status` for visual state.
2. Use `aria-invalid="true"` for validation failures.
3. Show errors inline with `FieldError`/`FieldMessage status="error"`.
4. Keep top-level banners for form-level failures only.

## Layout Rules

1. Use `Field` as the wrapper around label/control/message.
2. Use `FieldLabel required` for required inputs.
3. Keep one control per field wrapper unless explicitly grouped (for example value + unit select).
4. Use single-column stacking by default for onboarding/auth on mobile and desktop.

## Timezone Rule

Timezone should follow existing HAVI behavior:

1. Auto-detect from browser timezone.
2. Prefill the select.
3. User may edit.
4. No explicit confirmation click is required.

## Applied In This Slice

Updated screens:

1. `/auth/sign-up`
2. `/auth/sign-in`
3. `/app/onboarding/family`
4. `/app/onboarding/child`
5. `/brand` artifact page (state demos for input/select/textarea)

## Follow-on Rollout Targets

Apply the same primitives and state rules next to:

1. `/app/onboarding/profile` (new step in SID-61 implementation)
2. `/app` settings forms (caregiver/child/new child)
3. Invite forms (`/app` modal + `/app/invite`)
4. Task detail modal forms
5. Reset-password and forgot-password auth forms

## Guardrails

1. Do not introduce ad-hoc per-screen border/focus color classes for standard fields.
2. Add new field states by extending `fieldControlVariants`, not by local one-off classes.
3. Keep docs synchronized when token names or state behavior changes.
