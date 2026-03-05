# HAVI Chat Platform Master Spec

## Summary
HAVI should run one canonical chat pipeline that is explicit, testable, and context-grounded on every turn.  
Core principle: use OpenAI in Phase 1 for interpretation and guidance quality, while deterministic code remains the authority for data writes and safety boundaries.

Execution companion:
- [chat-phase-1-execution-plan.md](/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-phase-1-execution-plan.md)

Program status and handoff:
- [chat-phase-0-1-implementation-plan.md](/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-phase-0-1-implementation-plan.md)

This spec is intentionally focused on message/chat behavior only:
- user message send
- routing
- parsing/time extraction
- reply composition
- session naming
- feedback
- prompt/runtime ownership
- memory/context retrieval used for composition

## Review Coverage and Boundaries
What was directly reviewed:
- Active web send flow: `/api/v1/activities` request path in [page.tsx](/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/app/app/page.tsx:2249).
- Active API turn path in [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py:760).
- Intent classifier and route logic in [router.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/router.py:63) and [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py:1768).
- Reply composition in [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py:3284).
- Session autotitle internals in [main.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/main.py:159).
- Feedback endpoint and UI in [feedback.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/routes/feedback.py:53) and [message-feedback.tsx](/Users/gabedavis/Desktop/projects/havilogger/apps/web/src/components/chat/message-feedback.tsx:82).
- Existing OpenAI client surface in [openai_client.py](/Users/gabedavis/Desktop/projects/havilogger/apps/api/app/openai_client.py:312).

What is constrained or incomplete:
- Full authenticated end-to-end production turn verification is limited in this environment.
- Some endpoint suites are stale vs current auth/UUID contracts (not a proof of production failure, but a confidence gap).
- Legacy local-db conversation helpers diverge from UUID/supabase path and should not be treated as canonical.

## Goals
1. One canonical chat runtime path with explicit ownership and contracts.
2. OpenAI integrated in Phase 1 for better classification and guidance quality.
3. Deterministic authority over timeline/activity/task/memory writes.
4. Replies consistently grounded in family/child context (age, milestones, known memory).
5. Stable feedback signal capture for model and policy iteration.

## Non-goals
1. Building browse/citation features in core stabilization.
2. Adding vector retrieval before contracts and evals are stable.
3. Rewriting the system end-to-end when targeted refactors are sufficient.

## Baseline to Target: New vs Refactor vs Fix
| Area | Current baseline | Type | Target change | Why |
|---|---|---|---|---|
| Runtime path | `/api/v1/activities` is de facto path | Refactor | Make it explicit canonical orchestrator | Remove ambiguity |
| OpenAI usage | Client exists; active turn mostly deterministic | New | Wire OpenAI classifier + guidance composer in canonical path | Better ambiguous intent handling and guidance quality |
| Routing | Heuristic ask/log/mixed/task | Fix | Introduce typed route contract with confidence and arbitration | Reduce misroutes and wrong writes |
| Writes | Mixed parsing/time can misbehave | Fix | Deterministic write guardrails; model never writes directly | Data integrity |
| Context usage | Context exists but is uneven in composition | Fix | Mandatory context pack in interpretation/composition | Consistent personalization |
| Prompt ownership | Frontend `model_request` + backend prompts coexist | Refactor | Single backend prompt/model adapter owner | Stop drift and confusion |
| Legacy/partial code paths | Dead/partial paths still present | Refactor | Deprecate and remove after parity gates | Lower operational complexity |
| Feedback | Endpoint/UI contract is partially brittle | Fix | Align payload/UUID/auth/tests and add telemetry tags | Trustworthy quality signal |

## Requirements

### MVP (Phase 0 + Phase 1)
1. Golden scenario evaluation harness exists and gates all chat behavior changes.
2. Canonical `ChatOrchestrator` owns turn lifecycle for `/api/v1/activities`.
3. `ContextPackBuilder` runs every turn and provides typed context to router/composer.
4. `IntentRouter` returns strict output schema:
   - `route_kind`: `ASK | LOG | MIXED | TASK | MEMORY_EXPLICIT | MEMORY_INFERRED`
   - `confidence`: `0..1`
   - `decision_source`: `rule | model | arbitration`
   - `log_segments[]`, `question_segments[]`, `memory_candidate`
5. OpenAI-powered classification is enabled for ambiguous turns only.
6. OpenAI-powered guidance composition is enabled for `ASK` and guidance section of `MIXED`.
7. Deterministic parser remains sole authority for timeline/activity writes.
8. Memory policy is explicit:
   - explicit memory save -> `ACTIVE`
   - inferred memory -> `PENDING`
9. Reply contracts are explicit by route type (`LOG`, `ASK`, `MIXED`, `FALLBACK`).
10. Feedback pipeline records rating and route/model metadata for evaluation.

### Later (after core stability)
1. Phase 2:
- persistent memory retrieval across sessions
- multi-child disambiguation and context ranking
- session naming and feedback UX hardening
- architecture seams for browse/vector readiness

2. Phase 3+:
- browse + citation architecture
- semantic + episodic vector retrieval
- safe proactive behavior with triggering/confidence guardrails

## Phasing Alignment (Master vs Phase Plans)
Master sequencing is authoritative and aligned to execution docs:
1. Phase 0 (complete): golden harness + baseline gates.
2. Phase 1 (active): canonical runtime + OpenAI classifier/composer + deterministic write guardrails + GREEN e2e gate.
3. Phase 2 (next): memory retrieval and context-quality hardening before new external capabilities.
4. Phase 3+: browse/citations, vector retrieval, and proactive features.

Sync rule:
1. If any phase scope changes, update this master spec and [chat-phase-1-execution-plan.md](/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-phase-1-execution-plan.md) in the same commit.
2. Rollout gates remain: golden eval + GREEN e2e + production smoke.

## Implementation Snapshot (Current)
1. Route metadata contract is now emitted from `/api/v1/activities` responses.
2. Route execution + write policy helpers are active in the canonical chat path.
3. OpenAI classifier hook is wired behind `ENABLE_OPENAI_INTENT_CLASSIFIER` and only evaluates ambiguous rule results.
4. OpenAI ask-route guidance hook is wired behind `ENABLE_OPENAI_GUIDANCE_COMPOSER` with deterministic fallback.
5. Mixed-route model guidance can now append to deterministic log confirmation when composer flag is enabled.
6. Deterministic rules remain default authority, with model override only when classifier confidence passes threshold (`OPENAI_INTENT_OVERRIDE_CONFIDENCE`) and optional rollout percentage (`OPENAI_INTENT_CLASSIFIER_TRAFFIC_PCT`).
7. Guidance composer now has optional rollout percentage control (`OPENAI_GUIDANCE_COMPOSER_TRAFFIC_PCT`) and contract validation fallback.
8. Feedback write path no longer depends on supabase upsert conflict support, uses select/update-or-insert logic, and enriches metadata with assistant intent/session context.
9. Web feedback components now support optional route metadata + model version submission fields for downstream quality segmentation.
10. GREEN smoke now asserts chat route metadata behavior (ask/log/mixed), feedback thumbs network path, and chat persistence sanity checks.
11. Quality snapshot report script is available at [chat_quality_report.py](/Users/gabedavis/Desktop/projects/havilogger/scripts/chat_quality_report.py), with latest output in [chat-quality-report.json](/Users/gabedavis/Desktop/projects/havilogger/docs/active/plan/chat-quality-report.json).

## Proposed Solution

### Canonical Components
1. `ChatOrchestrator`
- Entry point for every message turn.
- Calls each subsystem in fixed order and emits structured telemetry.

2. `ContextPackBuilder`
- Pulls family/child profile, active child stage, milestones, active memory, pending memory, recent messages.
- Emits typed context with missing-field annotations.

3. `IntentRouter`
- Deterministic hard rules first (task, explicit save, clear log directives).
- OpenAI classifier for ambiguous turns.
- Arbitration policy for final route.

4. `ActionParser` (deterministic)
- Parses only logging segments.
- Applies segmentation and timestamp anchoring.
- Emits structured actions and parser diagnostics.

5. `MemoryEngine`
- Explicit save commands to `ACTIVE`.
- Inferred memory candidates to `PENDING`.
- Dedupe/TTL/review policy.

6. `ReplyComposer`
- `LOG`: deterministic confirmation.
- `ASK`: model guidance + deterministic policy wrapper.
- `MIXED`: deterministic log confirmation + model guidance block.
- `FALLBACK`: deterministic intent-clarifying response.

7. `PersistenceWriter`
- Route-gated writes:
  - `ASK`: no timeline/activity writes.
  - `LOG/MIXED`: timeline/activity from deterministic actions only.
  - `TASK`: task writes.
  - `MEMORY_*`: memory writes by policy.

8. `FeedbackTelemetry`
- Message-level thumbs with route/model/version metadata.

### Turn Flow
1. Receive user message.
2. Build context pack.
3. Route intent (rules, then model if needed, then arbitration).
4. Parse logging segments (if `LOG` or `MIXED`).
5. Compose reply with route contract.
6. Persist route-gated writes.
7. Persist assistant message + telemetry.
8. Return typed response payload.

## OpenAI Integration Contract (Phase 1)
OpenAI is used for:
1. Ambiguous intent classification.
2. Ask/mixed guidance drafting.

OpenAI is not used for:
1. Direct persistence decisions.
2. Timeline/activity write authority.
3. Safety-critical write permissions.

Fallback behavior:
1. On model failure/timeouts, route and compose via deterministic fallback.
2. Writes continue only under deterministic contracts.

## Guidance Response Contract (Ask/Mixed Guidance Block)
For guidance-style prompts (example: `my child is hitting`), assistant output must follow a stable, readable structure.

Required composition order:
1. Evidence-first framing:
- State whether behavior is common/expected for the relevant age band.
- Use probabilistic framing (common/less common, patterns over one-off events).
- Keep this concise.

2. Context-pack filter:
- Apply known child age/stage directly in plain language.
- Apply household context when available (siblings, newborn in house, caregiver setup).
- If key context is missing, state assumption once and continue.

3. Action plan section:
- Clear numbered steps with short scripts parents can reuse.
- Immediate boundary, replacement behavior, redirection, language coaching, positive reinforcement.

4. Avoidances section:
- Short list/table of what not to do and why.

5. Reusable script section:
- 1 practical script template in 2-4 lines.

6. Pattern watch section:
- 1-2 high-value patterns to track (who, when, emotional state, triggers).

7. Follow-up questions:
- Maximum 3 targeted questions.
- Questions should directly select among intervention options.
- No generic or repetitive questions.

Formatting requirements:
1. Use Markdown headings and short sections.
2. Use tables when explaining causes/avoidances.
3. Keep scan-friendly spacing and concise bulleting.
4. Do not produce wall-of-text responses.

Safety/quality requirements:
1. No shaming language.
2. No overclaiming certainty.
3. No contradiction with age/stage context.
4. Guidance must be actionable in under 1 minute of reading.

## User Value: Sample Message Outcomes
1. `Noah likes a longer second nap.`
- Route: `MEMORY_INFERRED`
- Write: pending memory candidate
- Reply: confirms it noticed and will hold as pending
- Value: natural memory capture without forcing command syntax

2. `save this: Noah likes a longer second nap`
- Route: `MEMORY_EXPLICIT`
- Write: active memory
- Reply: explicit confirmation
- Value: deterministic reliability for explicit command

3. `my baby is hitting, what to do`
- Route: `ASK`
- Reply: contextual guidance grounded in age/stage/milestones
- Value: stronger practical guidance quality

4. `i want a schedule for my toddler, he is on 2 naps. make one.`
- Route: `ASK` (planning subtype)
- Reply: structured schedule plan
- Value: actionable output, less generic advice

5. `woke at 3am, is that normal?`
- Route: `MIXED`
- Write: log segment persisted deterministically
- Reply: logged confirmation + guidance
- Value: both logging and help in one turn

## Data, API, and UX Notes
1. API should return route metadata in `ChatResponse` for eval/debug visibility.
2. Frontend should stop owning effective prompt behavior (`model_request` currently not authoritative).
3. `ui_nudges` contract must be either consumed in web UI or removed from response contract.
4. Session naming behavior should be explicitly defined and tested in canonical path.
5. Feedback write path should include stable route/model/version metadata for analysis.

## Risks and Mitigations
1. Model misclassification risk.
- Mitigation: confidence thresholds, deterministic overrides, golden scenario gates.

2. Legacy path drift risk.
- Mitigation: deprecation markers, parity tests, staged removal.

3. Multi-child context confusion risk.
- Mitigation: child-resolution policy + dedicated multi-child golden scenarios.

4. Prompt drift and hidden behavior risk.
- Mitigation: single backend prompt owner with versioned configs.

## Success Metrics
1. Routing accuracy on golden scenarios.
2. Incorrect timeline writes for ask/mixed messages.
3. Context-grounding coverage in replies.
4. Feedback persistence success rate.
5. Regression suite stability for canonical flow.
6. Guidance format compliance rate for target templates (for example: toddler hitting guidance).

## Rollout and Test Plan
1. Build/lock golden eval baseline first.
2. Ship OpenAI integration behind feature flag with shadow eval logging.
3. Enable for a controlled cohort, compare quality/write error deltas.
4. Promote after gate thresholds are met across age/family slices.
5. Add guidance-format contract tests for high-frequency asks (sleep, hitting, schedule, feeding concerns).
6. Require GREEN e2e pass and production smoke pass alongside golden eval gates before rollout expansion.

## Open Questions
1. Should inferred memory confirmations be visible inline every time, or bundled via UI nudges?
2. What is the minimum required context pack for a valid ask reply?
3. Which model/version is default for classifier vs composer, and are they split?
4. Should session titles include date by default, or be content-only?
