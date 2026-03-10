# Release: Feedback Reliability Compatibility Fix

## User-facing change summary
- Feedback thumbs save is now resilient across production schema variants.
- Mixed-route feedback remains captured even when the strict `ON CONFLICT` target is not available in the database.
- GREEN smoke now validates eventual successful feedback save behavior under retry conditions.

## Why it matters
- Removes a production-breaking path where feedback could fail with `400` due schema drift, causing UI reliability regressions.
- Keeps end-to-end release gates meaningful while reducing false-fail loops from transient feedback persistence errors.

## Validation status
- API deploy via guarded path: PASS.
- `HAVI_RELEASE_LABEL=after-feedback-compat-fix-20260310 ./scripts/prod_release_gate.sh`: PASS.
- Production core smoke: PASS.
- Production UI smoke gate (2 consecutive): PASS.

## Proof bundle path
- `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-10-feedback-reliability-compat-fix/`
