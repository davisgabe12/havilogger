Status: complete
Last updated: March 12, 2026

# Chat Runtime Contract Alignment Release

## Summary
This release aligns chat runtime contracts to the active master/phase-1 plan and ships production validation evidence before and after deployment.

## Shipped
1. ContextPackBuilder v1 in canonical `/api/v1/activities` flow.
2. Memory route contract support for `MEMORY_EXPLICIT` and `MEMORY_INFERRED`.
3. `ui_nudges` removed from `ChatResponse` API contract.
4. `model_request` removed from production core smoke payloads.

## Validation
- Pre-deploy core smoke: pass
- Pre-deploy UI smoke gate (2 consecutive): pass
- API production deploy: pass (`194a02ba-6e96-43b7-88d2-9a29fae02622`)
- Post-deploy core smoke: pass
- Post-deploy UI smoke gate (2 consecutive): pass

## Proof Bundle
- `docs/active/green-proof/releases/2026-03-12-chat-runtime-contract-alignment/`
