# HAVI Chat Phase 1 Execution Plan

## Summary
Phase 1 delivers a stable canonical chat runtime with OpenAI integrated for ambiguous intent classification and guidance composition, while deterministic logic remains the authority for all writes.

This plan is intentionally scoped to message/chat behavior only.

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

2. `P1-F2` Quality reporting
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
