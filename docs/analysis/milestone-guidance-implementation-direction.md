# Implementation Direction (Minimal Changes)

Goal: enable traceability + evalability without a big refactor.

## 1) Stable Context Builder (single entrypoint)
**Proposed change:** Add a new function `build_parenting_context` in `apps/api/app/context_builders.py` that returns:
- `child_age_months` (derived from `birth_date` / `due_date`)
- `milestone_band` (based on age months, or derived from `child_milestone_profile` if present)
- `memories` (IDs + keys from `knowledge_items` that matter for guidance)
- `context_packet` (compact JSON used for prompt injection)

**Minimal wiring:** call it from `capture_activity` in `apps/api/app/main.py` and pass to `generate_actions` as the `knowledge_context`.

## 2) Prompt Contract + versioning
**Proposed change:** add `PROMPT_VERSION = "milestone_guidance_v1"` in `apps/api/app/openai_client.py` and include it in:
- the system prompt header
- a new trace object (below)

**Minimal wiring:** no change to model output format; only pass through version metadata.

## 3) Trace object persisted per response
**Proposed change:** add a `response_traces` table in `apps/api/app/db.py` with:
- `id`, `conversation_id`, `assistant_message_id`
- `prompt_version`, `context_sources_used`, `memory_ids`, `milestone_ids`
- `red_flag_triggered`, `model`, `latency_ms`, `created_at`

**Minimal wiring:** add `record_response_trace(...)` helper and call it at the end of `capture_activity` in `apps/api/app/main.py` after the assistant message is saved.

## 4) Eval harness (smallest incremental step)
**Proposed change:** add a stub runner in `evals/parenting_guidance/run.py` that:
- loads `conversations.json`
- posts each conversation to `/api/v1/activities` (or a local function)
- evaluates `expected_attributes` with a lightweight heuristic

This enables quick regression checks without refactoring the model layer.

