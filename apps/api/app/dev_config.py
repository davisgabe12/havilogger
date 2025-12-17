"""Development-time overrides for onboarding/child handling."""

# DEV ONLY — remove once onboarding ensures every authenticated user has at least one child.
ALLOW_ORPHAN_EVENTS = True

# TODO (onboarding v1):
# Once authenticated onboarding enforces child creation, set ALLOW_ORPHAN_EVENTS = False
# and require child_id for all timeline queries. The orphan event fallback can then be removed.
