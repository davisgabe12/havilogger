# HAVI Chat Phase 0 + Phase 1 Implementation Plan

## Goal
Deliver a stable, context-aware chat core with OpenAI integrated safely in the canonical path, while preserving deterministic data integrity for logs, timeline, tasks, and memory writes.

## Success Metrics
1. Golden scenario routing accuracy (`ASK/LOG/MIXED/TASK/MEMORY_*`) >= target threshold.
2. Incorrect timeline writes from ask/mixed turns <= target threshold.
3. Replies missing required child/family context when available <= target threshold.
4. Feedback persistence success >= target threshold.
5. Canonical chat regression suite remains green for continuous runs.

## Assumptions and Constraints
1. Canonical entry remains `POST /api/v1/activities`.
2. OpenAI is included in Phase 1, but deterministic code remains write authority.
3. Explicit memory saves produce `ACTIVE`; inferred memory produces `PENDING`.
4. Browse/citations and vector retrieval are out of scope for Phases 0 and 1.
5. Work should be incremental and reversible; avoid broad rewrites.

## Current-State Constraints That Affect Execution
1. Active path is deterministic route + compose in [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py:760).
2. OpenAI client exists but is not the canonical active turn path in [openai_client.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/openai_client.py:312).
3. Frontend sends `model_request` that is not authoritative in active backend request schema:
- send payload in [page.tsx](/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/page.tsx:2310)
- request schema in [schemas.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/schemas.py:77)
4. Existing context-pack and conversation helper tests include non-canonical local-int assumptions and must not be treated as canonical gates.

## Phase 0: Golden Evaluation Foundation (first)

### Objective
Create a reliable evaluation harness before behavior changes so all Phase 1 decisions are measured and gated.

### Scope
1. Build a canonical golden scenario dataset for chat turns.
2. Build runner/assertions for route, write side effects, reply contract, and context usage.
3. Add scorecard outputs by age band and family structure.
4. Add baseline reports for current behavior to compare against Phase 1.

### Out of Scope
1. Changing live routing/composition logic.
2. Introducing browse/citations/vector retrieval.

### Deliverables
1. `golden_chat_cases` dataset with tagged scenarios.
2. `golden_chat_runner` with assertion modules:
- route assertion
- write-side-effect assertion
- composition-shape assertion
- context-grounding assertion
- feedback flow assertion
3. Baseline report artifact for current main branch behavior.
4. CI job target that runs golden suite and outputs machine-readable summary.

### Golden Scenario Matrix Design
Minimum profile coverage:
1. Family size:
- one-child household
- two-child household
- three-child household
2. Child age bands:
- newborn
- young infant
- older infant
- toddler
- early preschool

Minimum scenario classes per profile slice:
1. Short log
2. Short ask
3. Mixed ask+log
4. Long open-ended ask
5. Multi-event with times
6. Explicit memory save
7. Inferred memory candidate
8. Task/reminder request
9. Feedback thumbs up/down
10. Guidance-format compliance cases (for high-frequency caregiver asks)

### Required Example Cases (must be in golden set)
1. `Noah likes a longer second nap.`
- Expected route: `MEMORY_INFERRED`
- Expected write: pending memory candidate

2. `save this: Noah likes a longer second nap`
- Expected route: `MEMORY_EXPLICIT`
- Expected write: active memory

3. `my baby is hitting, what to do`
- Expected route: `ASK`
- Expected write: no timeline/activity write
- Expected response contract:
  - evidence-first developmental framing
  - age-specific personalization
  - structured “what works” steps
  - “what not to do”
  - short reusable script
  - <= 3 targeted follow-up questions

4. `i want a schedule for my toddler, he is on 2 naps. make one.`
- Expected route: `ASK`
- Expected response shape: structured plan format

5. `woke at 3am, is that normal?`
- Expected route: `MIXED`
- Expected write: logging segment persisted

6. Multi-child disambiguation case:
- `Noah slept at 1, Emma woke at 2, is that normal?`
- Expected: no cross-child write contamination, clear child resolution path

### Exit Criteria
1. Golden runner executes in CI with stable output artifact.
2. Baseline metrics produced for all profile slices.
3. Threshold gates defined and enforced for Phase 1 merges.

---

## Phase 1: Canonical Pipeline + OpenAI Integration

### Objective
Integrate OpenAI into core chat where it adds user value, while preserving deterministic write safety and clear route/composition contracts.

### Scope
1. Implement `ChatOrchestrator` in canonical `/api/v1/activities` path.
2. Implement typed `ContextPackBuilder` for every turn.
3. Add `IntentRouter` arbitration:
- deterministic hard rules first
- OpenAI classifier for ambiguous turns
- strict route output schema
4. Add `ReplyComposer` contract:
- `LOG` deterministic confirmation
- `ASK` model-guided guidance with deterministic wrapper
- `MIXED` deterministic log confirmation + model-guided guidance
- `FALLBACK` deterministic clarification
5. Keep deterministic `ActionParser` and write policy as sole source of persistence decisions.
6. Align feedback metadata for route/model-aware quality analysis.
7. Deprecate non-canonical prompt/runtime surfaces from active path.

### Out of Scope
1. Browse/citations runtime behavior.
2. Vector semantic/episodic retrieval.
3. Broad proactive assistant triggers.

### Phase 1 Workstreams

#### Workstream 1: Orchestrator and Contracts
Deliverables:
1. `ChatOrchestrator` interface and lifecycle.
2. Typed route/composition/write contracts.
3. Structured telemetry per turn.

Acceptance criteria:
1. Every turn emits route metadata and decision source.
2. No alternate runtime path can bypass orchestrator.

#### Workstream 2: Context Pack Enforcement
Deliverables:
1. Context schema with required/optional fields.
2. Missing-context annotations.
3. Context-grounding checks in composer.

Acceptance criteria:
1. `ASK` and `MIXED` replies fail contract checks if required context is omitted without fallback language.

#### Workstream 3: OpenAI Intent Classifier (Ambiguous Turns)
Deliverables:
1. Model adapter API for intent classification.
2. Confidence threshold policy and deterministic fallback.
3. Shadow logging mode for classifier diagnostics.

Acceptance criteria:
1. High-confidence model routes improve ambiguous-case accuracy in golden suite.
2. Low-confidence routes fall back deterministically.

#### Workstream 4: OpenAI Guidance Composer (Ask/Mixed Guidance Block)
Deliverables:
1. Guidance draft call with context-pack input.
2. Deterministic policy wrapper (tone, safety, length, structure).
3. Structured reply contract validation.

Acceptance criteria:
1. `ASK` guidance quality improves on golden quality rubric.
2. `MIXED` replies always preserve logging confirmation first.
3. High-frequency guidance prompts pass format compliance checks:
- “my child is hitting”
- sleep-disruption ask
- toddler schedule ask
- feeding concern ask

#### Workstream 5: Deterministic Write Guardrails
Deliverables:
1. Route-gated write policy module.
2. Assertions that prevent non-log timeline/activity writes.
3. Memory status policy checks (`ACTIVE` vs `PENDING`).

Acceptance criteria:
1. No model output can directly write timeline/activity/task/memory.
2. Golden write-side-effect tests pass across all profile slices.

#### Workstream 6: Feedback and Observability Alignment
Deliverables:
1. Feedback payload includes route/model/version metadata.
2. Dashboards for route quality and user feedback by scenario tags.
3. Error-budget tracking for model fallbacks.
4. Guidance-format compliance metric in evaluation dashboard.

Acceptance criteria:
1. Feedback persistence and retrieval pass canonical endpoint tests.
2. Scorecards can segment by age band and family size.

### User Value Delivered in Phase 1
1. Better handling of ambiguous natural language.
2. More useful and contextual ask responses.
3. No regression in logging/timeline reliability.
4. Better quality loop through usable feedback telemetry.

### Example Value Cases for Phase 1
1. Message: `Noah likes a longer second nap.`
- Before: inconsistent interpretation.
- After: consistent inferred-memory handling with pending status.
- User value: less manual re-entry and better personalization.

2. Message: `my baby is hitting, what to do`
- Before: variable guidance detail.
- After: evidence-first + context-filtered response with structured steps and reusable script.
- User value: faster, clearer caregiver support.

3. Message: `i want a schedule for my toddler, he is on 2 naps. make one.`
- Before: risk of generic response.
- After: structured plan output tied to context.
- User value: actionable plan in one turn.

4. Message: `woke at 3am, is that normal?`
- Before: risk of mixed parsing errors.
- After: deterministic logging + contextual guidance in one response.
- User value: trust that both tasks are handled correctly.

---

## Parallelization and Critical Path

### Can run in parallel
1. Golden dataset authoring and rubric design.
2. Context-pack schema implementation.
3. Feedback telemetry schema updates.
4. Observability dashboards.

### Must stay sequential
1. Lock Phase 0 golden gates before enabling model-based routing/composition in production.
2. Finalize route/write contracts before broad Phase 1 integration.
3. Enforce write guardrails before any rollout of model-guided guidance.

### Critical path
1. Phase 0 gates and baseline.
2. Orchestrator + route/write contracts.
3. OpenAI classifier/composer behind flags.
4. Golden gate pass across all profile slices.
5. Controlled rollout.

## Definition of Done

### Phase 0 Done
1. Golden harness exists, runs in CI, and emits baseline report.
2. Coverage includes multiple ages and family sizes (1/2/3 kids).
3. Gate thresholds are defined and enforced.

### Phase 1 Done
1. OpenAI classifier and guidance composer are active behind canonical orchestrator.
2. Deterministic write guardrails are enforced and tested.
3. Context-grounded composition contract passes golden suite.
4. Feedback telemetry is reliable and queryable for quality analysis.

## Next Actions
1. Create Phase 0 task list from this plan (dataset schema, runner, assertion modules, CI target).
2. Create Phase 1 task list from this plan (orchestrator, router adapter, composer adapter, guardrails, telemetry).
3. Map each task to acceptance tests before implementation starts.
