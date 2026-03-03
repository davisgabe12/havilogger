Status: current
Last updated: March 2, 2026

# Havi Bug Triage Log

This log is the staging source for Linear tickets when direct Linear integration is unavailable in-session.

## Ticket template

- Title:
- Severity: `P0` | `P1` | `P2` | `P3`
- Area: `auth` | `onboarding` | `chat` | `timeline` | `tasks` | `memory` | `deploy` | `docs`
- Repro steps:
- Expected:
- Actual:
- Hypotheses (ranked):
- Root cause:
- Fix summary:
- Tests added/run:
- Risks/follow-ups:
- Owner:
- Linear issue:

## TRIAGE-001: Guidance message misclassified as logging when no "?" (Fixed)

- Title: Implicit guidance prompts route to logging path
- Severity: `P1`
- Area: `chat`
- Repro steps:
  1. Open chat with an active child.
  2. Send: `what should i do if he is waking at night`
- Expected:
  - Guidance response with sleep advice.
  - No new activity log entry.
- Actual:
  - Message was treated as logging and got tracking-style reply.
  - Timeline received incorrect activity entry.
- Hypotheses (ranked):
  1. Question detector only recognized explicit `?` and narrow phrases.
  2. Sleep category detector missed `waking` phrasing.
- Root cause:
  - `_is_question` and `classify_question_category` in `apps/api/app/main.py` were too narrow.
- Fix summary:
  - Expanded implicit question phrase detection and question-leading verbs.
  - Expanded sleep category keywords to include `wake`, `waking`, and `night waking`.
- Tests added/run:
  - Added `apps/api/tests/test_question_detection.py` (3 tests).
  - Ran: `cd apps/api && ../../.venv/bin/pytest tests/test_question_detection.py -q` (pass).
- Risks/follow-ups:
  - Historical misclassified timeline records are not auto-corrected yet.
- Owner: CTO agent
- Linear issue: `SID-3` https://linear.app/diagonal-loop/issue/SID-3/harden-guidance-vs-tracking-intent-classification-and-reply

## TRIAGE-002: Historical misclassified timeline entries remain after intent fix

- Title: No remediation for previously misrouted guidance-as-activity events
- Severity: `P2`
- Area: `timeline`
- Repro steps:
  1. Trigger misclassification before fix (historical data).
  2. Apply routing fix and inspect timeline.
- Expected:
  - Incorrect historical events should be recoverable or editable.
- Actual:
  - Old wrong events remain as-is.
- Hypotheses (ranked):
  1. No migration/cleanup path exists for legacy bad entries.
  2. Timeline has no "convert/remove" user action tied to origin intent.
- Root cause:
  - System has prevention after fix but no backfill/correction workflow.
- Fix summary:
  - Not implemented yet.
- Tests added/run:
  - N/A
- Risks/follow-ups:
  - Caregiver trust risk if timeline shows advisory questions as activity events.
- Owner: unassigned
- Linear issue: `SID-4` https://linear.app/diagonal-loop/issue/SID-4/add-remediation-flow-for-historically-misclassified-timeline-events

## TRIAGE-003: Session cannot write directly to Linear despite user expectation

- Title: Linear integration unavailable in current Codex session
- Severity: `P2`
- Area: `deploy`
- Repro steps:
  1. Attempt to list MCP resources/templates for Linear.
  2. Attempt server-specific read with `server=\"linear\"`.
- Expected:
  - Available MCP server/resources for Linear issue creation.
- Actual:
  - `unknown MCP server 'linear'`, empty MCP resource lists.
- Hypotheses (ranked):
  1. Linear MCP connector not attached to this Codex session.
  2. Access update requires session restart/re-auth.
- Root cause:
  - Integration context unavailable to tools in this session.
- Fix summary:
  - Not implemented yet; requires environment integration fix.
- Tests added/run:
  - N/A
- Risks/follow-ups:
  - Issue tracking lag until connection is restored.
- Owner: unassigned
- Linear issue: pending (integration unavailable in session)

## TRIAGE-004: Launch auth risk when email confirmation is disabled

- Title: Launch-safe auth posture with confirm-email off
- Severity: `P1`
- Area: `deploy`
- Repro steps:
  1. Open Supabase auth settings.
  2. Verify `Confirm email` toggle is off.
- Expected:
  - Launch path remains low-friction while abuse controls are active.
- Actual:
  - Signup is frictionless but abuse controls are not yet fully verified in this run.
- Hypotheses (ranked):
  1. Growth-first auth config can be safe only with explicit rate limit and bot controls.
  2. Without abuse controls, disabled confirmation can attract automated signups.
- Root cause:
  - Current auth tradeoff favors speed; hardening controls need explicit implementation/verification.
- Fix summary:
  - Linear issue opened for launch controls and checklist gating.
- Tests added/run:
  - N/A
- Risks/follow-ups:
  - Abuse/spam risk on production signup until mitigations are active.
- Owner: unassigned
- Linear issue: `SID-5` https://linear.app/diagonal-loop/issue/SID-5/launch-safe-auth-posture-with-confirm-email-off-rate-limit-bot
