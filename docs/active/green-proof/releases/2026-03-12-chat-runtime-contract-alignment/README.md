Status: complete
Last updated: March 12, 2026

# Chat Runtime Contract Alignment Release Proof

## Scope
- ContextPackBuilder v1 runtime wiring
- memory route contract alignment (`MEMORY_EXPLICIT`, `MEMORY_INFERRED`)
- remove `ui_nudges` from API response contract
- remove `model_request` from production core smoke payloads

## Deploy
- Railway API deployment id: `194a02ba-6e96-43b7-88d2-9a29fae02622`
- Status: `SUCCESS`
- Provider/config: `python` / `railway.toml`

## Gate Evidence
1. Pre-deploy core smoke: `prod-core-smoke-chat-alignment-predeploy-1.json`
2. Pre-deploy UI smoke gate (2 runs): `prod-ui-smoke-chat-alignment-predeploy-1.json`
3. Post-deploy core smoke: `prod-core-smoke-chat-alignment-postdeploy-1.json`
4. Post-deploy UI smoke gate (2 runs): `prod-ui-smoke-chat-alignment-postdeploy-1.json`
