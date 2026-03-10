# Release: Deploy Loop Prevention Hardening

## User-facing change summary
- Production release validation now has a single canonical command that runs both core and UI gates and handles one bounded retry for transient UI gate failures.

## Why it matters
- Reduces repeated manual deploy checks and false-stop loops when production is healthy but a single UI gate attempt flakes.
- Keeps release evidence consistent through one machine-readable summary artifact.

## Validation status
- `HAVI_RELEASE_LABEL=post-loop-guard-release-gate-20260310 ./scripts/prod_release_gate.sh`: pass.
- Core smoke in same run: pass.
- UI smoke gate in same run (2 consecutive): pass.

## Proof bundle path
- `/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/releases/2026-03-10-release-gate-hardening/`
