# Havi Invite User Flow Spec

Status: active  
Last updated: March 11, 2026

## Summary

This spec defines the end-to-end care-team invite flow for Havi: owner creates an invite, invitee joins the same family account, completes required setup, and reaches core app usage. It also defines truthful UX behavior when email delivery is not configured.

## Goals

1. A caregiver/parent can be invited into an existing family account.
2. Invitee can join using the invite URL even when invite-email delivery is not configured.
3. Invitee has first-class account credentials (email + password) and can sign in later.
4. After join, both users can collaborate in shared chat, timeline, and tasks.
5. Identity attribution is visible in UI:
   - chat message sender identity
   - timeline “Logged by …”
   - task assignee labels

## Non-goals

1. Redesign of full onboarding model beyond required existing fields.
2. Nickname/profile customization beyond first/last/phone/email.
3. Broad auth-system replacement.

## MVP Requirements

### Invite creation (owner side)

1. Owner opens Settings -> Care Team -> Invite.
2. Owner enters invitee email + role and clicks `Create invite`.
3. Backend creates `family_invites` row and returns:
   - `invite_url`
   - `email_enabled`
   - `email_status` (`sent` | `failed` | `skipped`)
4. UI must be truthful:
   - `sent`: “Invite email sent.”
   - `skipped` or `email_enabled=false`: “Invite created. Email delivery is not configured, so copy and share the link below.”
   - `failed`: “Invite created, but email send failed. Copy and share the link below.”

### Invite acceptance (invitee side)

1. Invitee opens invite URL:
   - `/app/invite?token=<token>&email=<email>`
2. If not signed in, invitee completes required fields:
   - first name
   - last name
   - phone
   - password
3. Invite flow calls `POST /api/v1/invites/complete-signup`.
4. System creates/updates auth user, upserts family membership, marks invite accepted.
5. Invitee is signed in and routed to `/app`.

### Auth-page guardrails in invite context

1. If invitee lands on `/auth/sign-in?next=/app/invite...`, page must clearly direct first-time invitees to set up account.
2. Invite flow must not imply a required email confirmation in link-join mode.

### Collaboration and identity

1. Invited user appears in Care Team members list.
2. Task assignment list includes both users.
3. Timeline shows recorder identity (`Logged by <Name>`).
4. Chat shows non-self sender identity using profile name/initials (not generic fallback when member name exists).

## Data and API Notes

### Core tables

1. `family_invites`:
   - `token`, `email`, `role`, `status`, `invited_by`, `expires_at`, `accepted_at`, `accepted_by_user_id`
2. `family_members`:
   - `user_id`, `family_id`, `first_name`, `last_name`, `email`, `phone`, `role`, `is_primary`
3. `conversation_messages`:
   - `session_id`, `user_id`, `role`, `content`, `created_at`

### Endpoints

1. `POST /api/v1/invites`
2. `POST /api/v1/invites/complete-signup`
3. `POST /api/v1/invites/accept`
4. `GET /api/v1/care-team`
5. `GET /api/v1/conversations/{id}/messages`

## Failure Modes and Expected UX

1. Email delivery not configured:
   - Invite creation still succeeds.
   - UI clearly says link-sharing is required.
2. Invite token invalid/expired:
   - Invite page shows explicit error.
3. Invite email/account mismatch:
   - Invite page asks user to sign out/switch account.
4. Missing required profile/child data after join:
   - App lock routes user to profile completion.
   - Missing fields must describe whether child or caregiver requirement is missing.

## Validation Plan

### Product validation (manual Playwright)

1. Owner creates invite in Settings.
2. Invitee opens link and joins with required fields.
3. Invitee reaches `/app`.
4. Cross-user checks:
   - owner and invitee both appear in care team
   - owner assigns task to invitee and vice versa
   - timeline shows `Logged by` identities for both
   - chat shows sender identity for other user

### Automated validation

1. API targeted tests:
   - invite lifecycle + schema fallback
   - message sender identity enrichment
   - timeline recorder attribution
2. Production gates:
   - `./scripts/prod_core_smoke.sh`
   - `./scripts/prod_release_gate.sh`

## Success Metrics

1. Invitee can join and reach core app without manual DB operations.
2. In production, invite e2e Playwright pass rate is stable.
3. Release gate (`prod_release_gate`) passes after deploy.
4. User-visible invite confusion tickets drop to near zero.

## Open Questions (follow-up)

1. Should caregiver users be blocked by child profile requirements (for example, missing child weight), or should only caregiver-required fields block access?
2. Should invite links support one-time use enforcement beyond accepted status?
3. Should SMTP configuration status be surfaced in admin settings for easier operations visibility?
