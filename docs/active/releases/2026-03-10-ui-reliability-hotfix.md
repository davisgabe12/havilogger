# Release: UI Reliability Hotfix

## User-facing change summary
- Settings now avoids misleading save affordances when nothing changed.
- Sign-out actions were added to side tray and auth account-switch flows.
- Caregiver phone/email optional labeling now matches form lock behavior.
- Chat feedback UX now supports Enter-submit with a saved acknowledgment.
- Invite token handoff through auth redirects was hardened.
- Chat guidance fallback was hardened for rolling-over milestone questions.
- Task datetime parsing/ack path was improved for prompts like `tomorrow at 4pm`.

## Why it matters
- Removes multiple trust-breaking UX defects in core daily usage.
- Reduces dead-ends in auth/invite/account-switch paths.
- Improves reliability of guidance and task creation outcomes from plain-language chat.

## Validation status
- Commit pushed to `main`: `1cd946a` on March 10, 2026.
- Follow-up validation/docs commit pushed to `main`: `94f9744` on March 10, 2026.
- Direct production probe for timed task acknowledgment (`tomorrow at 4pm`): pass.
- Updated GREEN smoke suite (includes rolling-over guidance and timed-task assertions): pass.
- Production core smoke (final): pass (`prod-core-smoke-after-ui-reliability-hotfix-20260310-final.json`).
- Production UI smoke gate (final, 2 consecutive): pass (`prod-ui-smoke-after-ui-reliability-hotfix-20260310-final.json`).

## Proof bundle path
- `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-10-ui-reliability-hotfix/`
