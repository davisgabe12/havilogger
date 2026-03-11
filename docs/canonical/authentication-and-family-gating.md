# Authentication and Family Gating

This document explains how authentication, family membership, and active family
selection work together to keep the app in a valid state.

## 1. Authentication Overview
- Users authenticate via Supabase Auth.
- `auth.uid()` is the authenticated user's UUID in Supabase.
- "Logged in" means there is a valid Supabase session available to the client.

## 2. Family Membership Model
- A family is a shared context that groups caregivers and children.
- Users relate to families through rows in `family_members`.
- A user may belong to multiple families at the same time.

## 3. Active Family Concept (Core)
- The active family is the single family the app is currently scoped to.
- The app always operates in exactly one active family to avoid cross-family
  data leakage and ambiguous API scoping.
- The active family is stored in an HTTP-only cookie:
  `havi_active_family_id`.
- It is set in two ways:
  - Auto-selected when the user has exactly one family membership.
  - Explicitly selected on `/select-family`.
- If the cookie is missing or invalid (user is not a member), it is cleared
  and the user is redirected to select or create a family.

## 4. Onboarding + Abandonment Behavior
- If a user logs in with zero families, they are sent to `/app/onboarding/family`.
- If a user has a family but no child profile, they are sent to `/app/onboarding/profile`.
- If a user has a complete child profile but missing caregiver-required fields, they are sent to `/app/onboarding/care-member`.
- `/app/onboarding/profile` collects required fields:
  - caregiver: first name, last name, email, phone
  - child: name (Unknown allowed), DOB or due date, birth weight, last known weight, timezone
- `/app/onboarding/care-member` collects caregiver-required fields only:
  - first name, last name, email, phone
- Timezone follows existing behavior: auto-detected, editable, no separate confirmation interaction.
- If onboarding is abandoned mid-flow, the guard resumes the next required step
  on the next login.
- There is no separate onboarding state table; state is derived from
  memberships, the active family cookie, and child presence.

App-use lock fallback:
- Users can still land on `/app` if route flow degrades.
- Core app usage is locked until required profile fields are complete.
- Lock CTA routes to:
  - `/app/onboarding/care-member` when child profile is complete and caregiver fields are missing.
  - `/app/onboarding/profile` otherwise.

## 5. Route Gating Rules
Protected routes only load when the user is ready to use the product.

State machine (high level):
- Not logged in -> `/auth/sign-in`
- Logged in, 0 families -> `/app/onboarding/family`
- Logged in, 1 family, no cookie -> set cookie -> allow
- Logged in, N>1 families, no cookie -> `/app/select-family`
- Cookie set, not a member -> clear cookie -> `/app/select-family` (or
  `/app/onboarding/family` if memberships = 0)
- Active family set, 0 children -> `/app/onboarding/profile`
- Active family set, child exists, caregiver required fields missing -> `/app/onboarding/care-member`
- Otherwise -> allow request

Public routes remain accessible:
- `/auth/*`
- `/app/onboarding/*`
- `/app/select-family`
- `/app/invite` (invite token and logged-out invite setup)

## 6. Interaction with RLS
- Supabase RLS restricts data access to rows where the user belongs to the
  family via `family_members`.
- Active family selection is required before API-backed pages so all queries
  can be scoped to a single family.
- Together, gating and RLS prevent cross-family reads or writes.

## 7. Invariants
- The app never runs without an active family.
- Required profile fields are completed before core app use.
- The API never 500s due to missing family or child context.
- DB constraints define truth for required child dates.
- Guards resume incomplete onboarding deterministically based on data.
- Invite acceptance adds invitee account to target family membership before app core access.
- Invite-context auth screens must clearly direct first-time invitees to set up account credentials (password + required profile fields) before sign-in attempts.
- Care-team identity surfaces (chat, tasks, timeline) must not regress to self-only views when RLS is stricter than expected; API routes fall back to admin-scoped member lookup where needed.
