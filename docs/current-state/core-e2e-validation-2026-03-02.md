Status: current
Last updated: March 2, 2026

# Core E2E Validation (Local)

## Goal

Validate that core product flow works locally against Supabase:

1. sign up / sign in
2. family + child setup
3. chat logging + guidance
4. timeline persistence

## Test data used

- Family: `Davis Test Family`
- Parents/caregivers: `Gabe`, `Talia` (variants used for test records)
- Children:
  - `Noah`, DOB `03-14-2024`, birth weight `6.7 lb`
  - `Lev`, DOB `09-23-2025`, due date `10-20-2025`, birth weight `6.9 lb`
- Email variants: `gdavis12+77@gmail.com` plus tagged aliases

## Results

### Auth + onboarding

- `/auth/sign-up` and `/auth/sign-in` load and complete successfully.
- Family guard works; app required family context and then allowed `/app` access.
- Settings save worked for caregiver + child profile updates.

### Core chat behavior

- Logging prompt: `baby pooped at 3pm`
  - Expected: tracking confirmation
  - Actual: tracked correctly and saved as diaper timeline event
- Guidance prompt: `what should i do if he is waking at night`
  - Initial bug: routed as logging when no `?`
  - Fix shipped on March 2, 2026 (see code changes below)
  - Current behavior: returns sleep guidance, no new timeline activity inserted

### Timeline persistence

- New logging prompt `baby pooped at 4pm` persisted as diaper event.
- Guidance prompt after fix did not create an activity entry.
- One older misclassified timeline entry remains from pre-fix testing history.

## Code changes tied to this validation

- `apps/api/app/main.py`
  - Expanded implicit question detection (`_is_question`) for prompts without `?`
  - Expanded sleep category detection in `classify_question_category` (`wake`, `waking`, `night waking`)
- `apps/api/tests/test_question_detection.py`
  - Added regression tests for:
    - implicit guidance question detection
    - non-question log detection
    - waking/sleep category detection

## Commands run

- `cd apps/api && ../../.venv/bin/pytest tests/test_question_detection.py -q`
- `cd apps/web && npm run build`

## Supabase auth setting note

- Supabase `Confirm email` is currently disabled in the tested environment.
- This enables faster launch signup flow but increases abuse risk; mitigation should include strict rate limits and bot protection on signup endpoints.
