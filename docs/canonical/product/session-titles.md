Status: current
Last updated: March 4, 2026

# Havi Session Title Behavior (Canonical)

## Purpose

Conversation titles should help caregivers quickly find the right thread while preserving a clean-slate option.

## Definitions

1. Session: one chat thread for one child in one family.
2. Clean slate: a new session starts with title `New chat` and no prior transcript context.

## V1 Rules

1. Auto-title eligibility:
   - no prior messages in the session
   - current title is exactly `New chat`
   - `HAVI_AUTOTITLE_ENABLED` is not `0`
2. Title format:
   - `<snippet> · <Mon D, YYYY>`
   - example: `Baby pooped 3pm · Mar 4, 2026`
3. Snippet generation:
   - use first clause before `, . ! ? ;`
   - normalize whitespace
   - tokenize using `[A-Za-z0-9][A-Za-z0-9'’-]*`
   - strip leading question scaffolding words (`what`, `how`, `should`, etc.)
   - remove lightweight stopwords (`a`, `an`, `the`, `and`, `or`, `to`, `for`, `of`, `in`, `on`, `at`)
   - choose first 5 tokens (optionally 6 when short and compact)
   - fallback to `Chat` if weak signal
4. Date suffix:
   - absolute date in child timezone when available
   - else request timezone
   - else UTC
5. Uniqueness:
   - scope is `family_id + child_id`
   - collisions append ` · 2`, ` · 3`, etc.
6. Precedence:
   - manual rename must never be auto-overwritten
7. Failure handling:
   - title update failures are fail-open; chat response must still succeed

## Product Invariants

1. Guidance messages do not create timeline events.
2. Tracking messages create timeline events.
3. Session title does not change after first-message auto-title unless manually renamed.
4. Manual renamed title stays unchanged on follow-up messages.

## Verification

1. API tests:
   - `tests/test_session_titles.py`
   - `tests/test_rls_paths.py`
   - `tests/test_conversation_titles.py`
2. Production before/after smoke:
   - `scripts/prod_core_smoke.sh`
   - verify report fields: `auto_title`, `renamed_title`, `title_after_follow_up`

