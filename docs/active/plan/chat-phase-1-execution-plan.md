# HAVI Chat Phase 1 Execution Plan

## Summary
Phase 1 delivers a stable canonical chat runtime with OpenAI integrated for ambiguous intent classification and guidance composition, while deterministic logic remains the authority for all writes.

This plan is intentionally scoped to message/chat behavior only.

## Execution Status (Current Sprint)
1. Completed:
- `P1-A1` contract scaffolding landed:
  - structured route metadata contract added to chat response schema
  - route contract resolver helper added in API path
  - routing contract tests added
- `P1-B1` deterministic write-policy foundation landed:
  - explicit `route_kind -> persist_actions` policy function
  - explicit route execution plan object used in `capture_activity`
  - explicit route write policy object used in `capture_activity`
  - policy assertions added in routing test suite
- `P1-A2` partial orchestrator extraction landed:
  - route execution planning extracted from endpoint body
  - reply composition-by-route extracted into dedicated helper
  - composition helper coverage added in hardening tests
- `P1-E1` GREEN chat gate expansion landed:
  - end-to-end assertions added for ask/log/mixed route metadata in `test:green`
  - feedback thumbs up/down network path exercised in GREEN
  - explicit memory-save and inferred-memory log-shaped turns added to GREEN coverage
- `P1-F1` feedback persistence hardening landed:
  - feedback route now uses deterministic select/update-or-insert path (no failing supabase upsert conflict dependency)
  - supabase-backed feedback route tests added
- `P1-C1` initial OpenAI classifier hook landed:
  - ambiguous-intent OpenAI classifier adapter behind `ENABLE_OPENAI_INTENT_CLASSIFIER`
  - deterministic rules remain default and fallback
  - model-decision source now exposed via route metadata when override occurs
  - classifier override tests added
- `P1-D1` initial OpenAI guidance composer hook landed:
  - ask-route model composer adapter behind `ENABLE_OPENAI_GUIDANCE_COMPOSER`
  - deterministic guidance remains fallback when model output is unavailable
  - composition tests added for model-path + fallback-path behavior
- `P1-D1` mixed-route model guidance block landed:
  - mixed turns now compose deterministic logged confirmation + model guidance block when enabled
  - deterministic mixed composition remains fallback
- `P1-C2` initial classifier arbitration tuning landed:
  - model override confidence threshold is now env-configurable via `OPENAI_INTENT_OVERRIDE_CONFIDENCE`
  - threshold behavior is covered in classifier tests
- `P1-F2` telemetry and rollout controls landed:
  - route metadata now includes classifier override/reason/fallback and composer source/fallback
  - classifier rollout gating added via `OPENAI_INTENT_CLASSIFIER_TRAFFIC_PCT`
  - guidance composer rollout gating added via `OPENAI_GUIDANCE_COMPOSER_TRAFFIC_PCT`
  - feedback API now enriches persisted metadata with assistant intent/session context; web feedback component supports optional model version + route metadata payload fields
  - feedback API now defaults `model_version` to `havi-local` when omitted and derives `assistant_route_kind` from stored assistant intent
  - quality snapshot script added: [chat_quality_report.py](/Users/gabedavis/Desktop/projects/havilogger/scripts/chat_quality_report.py)
- `P1-F1` feedback client-state hardening landed:
  - Gemini-style terminal retry state machine added in web feedback UI (`idle`, `submitting`, `retry_wait`, `retrying`, `failed`)
  - explicit terminal error + manual retry CTA added to prevent stuck thumbs actions
  - component tests added for exhausted-retry terminal state and manual retry recovery
- `P1-F2` quality reporting baseline landed:
  - golden quality snapshot now includes segmentation by scenario class, age band, and family size
  - golden quality snapshot now includes route disagreement and classifier fallback/override summaries
  - coverage fields for age band/family size/classifier reasons are emitted from golden harness rows
- `P1-D2` guidance contract hardening landed:
  - model guidance output is now validated for structure before use
  - deterministic fallback is enforced when model guidance is unavailable or contract-invalid

2. In progress:
- release evidence pass for the latest slice (deploy + production core smoke + production UI smoke gate + proof bundle curation).

3. Next:
- maintain threshold stability from the new `phase1-v2` harness while widening model rollout carefully.
- monitor production telemetry threshold verdicts (`route_disagreement`, `fallback_or_skip`, `telemetry_completeness`) after each release slice.
- keep GREEN + prod smoke artifacts current for every behavior-affecting change.

## Execution Log (March 5, 2026)
1. Shipped:
- Commit `3aeaa00` on `main` shipped:
  - classifier/composer rollout telemetry and fallback metadata
  - guidance contract validation fallback
  - feedback metadata enrichment path
  - quality snapshot report script and current output artifact
- Commit `83c9843` on `main` shipped:
  - feedback UI terminal retry state machine + manual retry action
  - message feedback component tests for terminal-failure and recovery flows

2. Gate results:
- API targeted suite passed on March 5, 2026:
  - `cd apps/api && ../../.venv/bin/pytest tests/test_router_openai_classifier.py tests/test_feedback_route_supabase.py tests/test_chat_routing_logic.py tests/test_chat_composition_hardening.py tests/test_assistant_message.py tests/test_golden_phase0_harness.py -q`
  - Result: `34 passed`.
- GREEN smoke currently passing with onboarding hardening:
  - `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green`
  - Result: consecutive pass runs after caregiver-field revalidation fix.

3. Updated risk call:
- Current blocking risks for full Phase 1 completion are production telemetry rollup and final orchestrator cleanup, not feedback UI state handling.

4. Service/UI split note:
- The latest feedback hardening slice (`83c9843`) is UI + component-test only.
- Feedback service-layer changes remain in prior slice `a0de612` (`apps/api/app/routes/feedback.py` + supabase route tests).

## Immediate Next Slice
1. `P1-F2a` telemetry completion:
- finalize web chat entry wiring for route metadata/model propagation in the canonical chat page without bundling unrelated UI refactors.
- verify thumbs payload captures model/version/route metadata end-to-end in network assertions.

2. `P1-F2b` reporting:
- add disagreement-rate and fallback-rate aggregation from route metadata logs.
- publish segmented quality snapshot (age band, family size, scenario class) using the script output path.

3. `P1-A2b` orchestrator cleanup:
- complete extraction of remaining endpoint-inline branching so `/api/v1/activities` remains the single explicit orchestrator entry with no shadow behavior.

## Progress Update (March 5, 2026, later run)
1. `P1-E2a` completed:
- GREEN onboarding helper now re-validates caregiver field values before each continue attempt to prevent empty-email stalls.
- File: [green.smoke.spec.ts](/Users/gabedavis/Desktop/projects/havilogger/apps/web/tests/smoke/green.smoke.spec.ts)

2. Validation evidence:
- `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green` passed twice consecutively on March 5, 2026.
- Run results: `1 passed` then `1 passed`.
- `./scripts/prod_core_smoke.sh` passed on March 5, 2026 for both existing-account and new-signup flows.
- Artifact: [prod-core-smoke-manual-20260305073727.json](/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/prod-core-smoke-manual-20260305073727.json)
- GREEN now also asserts feedback request payload includes `model_version` and `response_metadata.route_metadata.route_kind` for thumbs actions.

3. Updated focus:
- Keep `P1-F2a` telemetry completion and production-side `P1-F2` reporting as active next slices.

## Progress Update (March 5, 2026, reporting baseline)
1. `P1-F2b` baseline reporting completed:
- Extended [chat_quality_report.py](/Users/gabedavis/Desktop/projects/havilogger/scripts/chat_quality_report.py) to include:
  - `scenario_class_distribution`
  - `age_band_distribution`
  - `family_size_distribution`
  - `route_disagreement`
  - `classifier` fallback/override summary
- Extended golden harness rows in [test_golden_phase0_harness.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_golden_phase0_harness.py) with `age_band`, `family_size`, `expected_route_kind`, and `classifier_reasons`.

2. Current artifact values:
- [chat-quality-report.json](/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-quality-report.json)
  - route disagreement: `0 / 11`
  - classifier override rate: `0.0`
  - classifier fallback/skip rate: `1.0`

3. Remaining work in this area:
- production telemetry ingestion and dashboards for disagreement/fallback rates.

## Progress Update (March 8, 2026, phase1-v2 gates + cleanup)
1. `P1-A2b` orchestrator cleanup completed:
- `/api/v1/activities` now runs through explicit helper stages in one canonical path:
  - terminal response finalizer
  - explicit memory handler
  - task handler
  - route-gated activity write persistence
- Primary file: [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py)

2. `P1-D2` stricter long/open-ended guidance quality gates completed:
- Added answer-first deterministic guidance shape for sleep/early-wake, behavior/hitting, and plan/routine asks:
  - empathy opening
  - assumptions block
  - 3+ concrete numbered steps
  - what-not-to-do section
  - reusable parent script
  - next-turn invite
- Hardened model guidance contract validator to require the same structure before model output is accepted.
- Primary file: [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py)

3. `P1-F2` production telemetry aggregation path completed:
- Production smoke now records per-turn route telemetry in `turn_telemetry`:
  - `route_kind`, `decision_source`, `classifier_intent`, `confidence`,
  - `classifier_fallback_reason`, `composer_source`, `composer_fallback_reason`,
  - plus `expected_route_kind` for disagreement-rate rollups.
- Quality report now supports dual-track eval (`phase0` + `phase1_v2`) and production telemetry thresholds with explicit `PASS/BLOCK` verdicts.
- Primary files:
  - [prod_core_smoke.sh](/Users/gabedavis/Desktop/projects/havilogger/scripts/prod_core_smoke.sh)
  - [chat_quality_report.py](/Users/gabedavis/Desktop/projects/havilogger/scripts/chat_quality_report.py)

4. New Phase1-v2 golden eval track added (Phase 0 preserved):
- Fixture:
  - [golden_chat_cases_phase1_v2.json](/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/fixtures/golden_chat_cases_phase1_v2.json)
- Harness:
  - [test_golden_phase1_v2_harness.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_golden_phase1_v2_harness.py)
- Contract checks include:
  - `has_empathy_opening`
  - `has_immediate_plan_steps`
  - `asks_age_only_when_missing_context`
  - `has_assumptions_when_uncertain`
  - follow-up question budget (`<=2`)
  - `has_next_turn_invite`
  - `starts_with_logged_confirmation` for mixed route

5. Latest validation (March 9, 2026):
- `cd apps/api && ../../.venv/bin/pytest tests/test_router_openai_classifier.py tests/test_feedback_route_supabase.py tests/test_chat_routing_logic.py tests/test_chat_composition_hardening.py tests/test_assistant_message.py tests/test_golden_phase0_harness.py tests/test_golden_phase1_v2_harness.py -q`
  - Result: `37 passed`
- Report generation:
  - `./.venv/bin/python scripts/chat_quality_report.py --golden-report /tmp/havi_phase0_golden_report.json --phase1-v2-report /tmp/havi_phase1_v2_golden_report.json --production-telemetry-report docs/active/green-proof/prod-core-smoke-manual-20260309085057.json --green-pass`
  - Artifact: [chat-quality-report.json](/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-quality-report.json)
- Production core smoke:
  - `./scripts/prod_core_smoke.sh`
  - Artifact: [prod-core-smoke-manual-20260309085057.json](/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/prod-core-smoke-manual-20260309085057.json)
- Production UI smoke gate:
  - `./scripts/prod_ui_smoke_gate.sh`
  - Final passing artifact: [prod-ui-smoke-manual-20260309091254.json](/Users/gabedavis/Desktop/projects/havilogger/docs/active/green-proof/prod-ui-smoke-manual-20260309091254.json)

## Goals
1. Canonical runtime ownership:
- `POST /api/v1/activities` executes through one orchestrator path only.

2. Safer model integration:
- OpenAI handles ambiguous classification and guidance drafting.
- Deterministic code remains write authority for timeline/activity/task/memory.

3. Context-grounded quality:
- Ask/mixed guidance follows evidence-first, context-filtered contract.

4. Production confidence:
- Golden eval gate and GREEN e2e gate are both required for rollout.

## Success Metrics
1. Golden routing accuracy (`ASK/LOG/MIXED/TASK/MEMORY_*`) meets gate threshold.
2. Incorrect timeline writes for ask/mixed turns do not regress from Phase 0 baseline.
3. Guidance contract compliance for target prompts meets gate threshold.
4. GREEN e2e suite passes consecutive runs from seeded state.
5. Production core smoke passes before widening feature-flag exposure.

## Scope
In scope:
1. Orchestrator, contracts, and telemetry.
2. Context pack enforcement.
3. OpenAI intent classifier (ambiguous turns).
4. OpenAI guidance composer for `ASK` and guidance block in `MIXED`.
5. Deterministic write guardrails.
6. Feedback metadata alignment.
7. GREEN e2e suite updates and hard gate wiring.

Out of scope:
1. Browse + citations.
2. Vector retrieval (semantic/episodic).
3. Broad proactive behavior.

## Assumptions and Constraints
1. Phase 0 golden harness and baseline are already in place:
- [golden_chat_cases_phase0.json](/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/fixtures/golden_chat_cases_phase0.json)
- [test_golden_phase0_harness.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_golden_phase0_harness.py)
- [chat-phase0-golden-baseline.json](/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-phase0-golden-baseline.json)

2. Active production smoke script is the before/after runtime gate:
- [prod_core_smoke.sh](/Users/gabedavis/Desktop/projects/havilogger/scripts/prod_core_smoke.sh)

3. Existing codebase has parallel/legacy surfaces; Phase 1 must reduce ambiguity, not expand it.

## Workstreams and Ticket Slices

### P1-A: Canonical Orchestrator and Contracts
`Objective`: unify runtime ownership and make route/compose/write contracts explicit.

1. `P1-A1` Contract schema and typed interfaces
- Deliverables:
  - route contract
  - composition contract
  - write policy contract
- Primary files:
  - [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py)
  - [schemas.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/schemas.py)
- Acceptance:
  - all turns emit typed route metadata and decision source.

2. `P1-A2` Orchestrator integration in `/api/v1/activities`
- Deliverables:
  - `ChatOrchestrator` call flow in canonical endpoint
- Primary files:
  - [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py)
- Acceptance:
  - no alternate active turn path bypasses orchestrator.

3. `P1-A3` Runtime telemetry
- Deliverables:
  - turn-level telemetry for route source, confidence, fallback reason
- Acceptance:
  - telemetry present in logs for all golden and e2e runs.

### P1-B: Deterministic Write Guardrails
`Objective`: prevent model output from mutating persistent state directly.

1. `P1-B1` Route-gated write policy module
- Deliverables:
  - explicit policy:
    - `ASK`: no timeline/activity writes
    - `LOG/MIXED`: writes only from deterministic parsed logging segments
    - `MEMORY_EXPLICIT`: `ACTIVE`
    - `MEMORY_INFERRED`: `PENDING`
- Primary files:
  - [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py)

2. `P1-B2` Guardrail tests
- Deliverables:
  - tests proving forbidden writes do not occur
- Primary tests:
  - [test_golden_phase0_harness.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_golden_phase0_harness.py)
  - [test_chat_routing_logic.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_chat_routing_logic.py)
  - [test_chat_composition_hardening.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/tests/test_chat_composition_hardening.py)
- Acceptance:
  - no write-side regression vs Phase 0 baseline.

### P1-C: OpenAI Intent Classification
`Objective`: improve ambiguous routing while preserving deterministic fallback safety.

1. `P1-C1` Classifier adapter
- Deliverables:
  - model adapter for ambiguous intent cases
- Primary files:
  - [openai_client.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/openai_client.py)
  - [router.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/router.py)

2. `P1-C2` Arbitration and fallback
- Deliverables:
  - confidence thresholds
  - deterministic override rules
  - fallback reason logging
- Acceptance:
  - ambiguous-case routing improves without increasing write errors.

### P1-D: OpenAI Guidance Composition
`Objective`: produce guidance responses in required product format.

1. `P1-D1` Guidance composer adapter (`ASK`, `MIXED` guidance block)
- Deliverables:
  - model draft generation using context pack
- Primary files:
  - [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py)
  - [openai_client.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/openai_client.py)

2. `P1-D2` Deterministic guidance wrapper
- Deliverables:
  - enforce evidence-first -> context-filtered structure
  - length/safety/style constraints
  - max 3 targeted follow-up questions
- Acceptance prompts:
  - hitting
  - sleep disruption
  - toddler schedule
  - feeding concern
- Acceptance:
  - format compliance score meets threshold in golden suite.

### P1-E: GREEN End-to-End Test Suite Update (Required Gate)
`Objective`: ensure real runtime behavior remains stable, not just unit semantics.

1. `P1-E1` GREEN suite scope updates
- Include:
  - existing-account and new-signup flow
  - tracking vs guidance write invariants
  - session title behavior
  - feedback up/down persistence flow
  - memory explicit/inferred behaviors
  - multi-child scoped behavior

2. `P1-E2` Deterministic harness hardening
- Deliverables:
  - seeded setup/reset before GREEN runs
  - deterministic assertions
  - run artifacts (json/screenshots/logs)

3. `P1-E3` Gate policy wiring
- Deliverables:
  - phase gate requires:
    - golden pass
    - GREEN e2e pass
    - production smoke pass
- Reference test docs:
  - [green-smoke-test.md](/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/green-smoke-test.md)
  - [production-core-smoke.md](/Users/gabedavis/Desktop/projects/havilogger/docs/canonical/ops/production-core-smoke.md)

### P1-F: Feedback and Observability
`Objective`: make quality issues diagnosable and trackable.

1. `P1-F1` Feedback payload enrichment
- Add route/model/version metadata for each rating.
- Primary files:
  - [feedback.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/routes/feedback.py)
  - [message-feedback.tsx](/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/chat/message-feedback.tsx)

2. `P1-F1b` Feedback client-state machine hardening
- Deliverables:
  - explicit terminal retry state in thumbs flow
  - manual retry control when persistence fails after retry budget
  - stable optimistic/terminal UI transitions for thumbs up/down
- Primary files:
  - [message-feedback.tsx](/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/chat/message-feedback.tsx)
  - [message-feedback.test.tsx](/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/chat/__tests__/message-feedback.test.tsx)

3. `P1-F2` Quality reporting
- Deliverables:
  - scorecard segmentation by age band, family size, scenario class
  - classifier fallback rate and disagreement rate tracking

## Test and Release Gates
Required commands before Phase 1 rollout expansion:
1. Golden harness:
- `cd apps/api && ../../.venv/bin/pytest tests/test_golden_phase0_harness.py -q`
2. Core chat unit/regression:
- `cd apps/api && ../../.venv/bin/pytest tests/test_chat_routing_logic.py tests/test_chat_composition_hardening.py tests/test_assistant_message.py -q`
3. GREEN e2e:
- `cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green`
4. Production smoke:
- `HAVI_SMOKE_LABEL=after-phase1-<slice> ./scripts/prod_core_smoke.sh`

Rollout rule:
1. No feature-flag widening unless all four gates pass.

## Dependencies, Risks, Mitigations
1. Dependency: stable context pack for model composer.
- Mitigation: ship context schema and validations before `P1-D`.

2. Risk: model misroutes degrade writes.
- Mitigation: deterministic override + confidence threshold + `P1-B` write policy.

3. Risk: guidance quality drifts from required format.
- Mitigation: format compliance assertions in golden suite and GREEN checks.

4. Risk: hidden legacy behavior remains active.
- Mitigation: explicit deprecation and runtime execution-path telemetry.

## Next Actions
1. Create implementation branch and land `P1-A1` + `P1-B1` first.
2. Add `P1-E1` test updates before enabling model-driven paths.
3. Land `P1-C` and `P1-D` behind feature flags.
4. Run full gates and compare to Phase 0 baseline before rollout decision.

## Phase 2 Outline (Next Phase)
Phase 2 follows only after Phase 1 gates are stable.

Goals:
1. Strengthen persistent memory retrieval across sessions.
2. Improve multi-child disambiguation and context ranking.
3. Harden session naming and feedback UX behavior.
4. Prepare architecture seams for later browse/citation and vector retrieval.

Scope candidates:
1. Retrieval ranking layer for active and pending memory in compose path.
2. Cross-session context recall policies with guardrails.
3. Memory review UX hooks tied to inferred-memory confidence.
4. Session title and `ui_nudges` contract cleanup in UI.

Out of scope for Phase 2:
1. Public browse/citation response mode.
2. Vector store activation in production.

Exit criteria:
1. Cross-session personalization quality improves against a Phase 2 golden set.
2. Memory precision/recall metrics meet agreed thresholds.
3. No regression on Phase 1 gates.
