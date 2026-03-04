# HAVI Chat Behavior: Current State (March 4, 2026)

## Evidence and scope notes
- Scope is strictly message/chat behavior: send, route, parse/time extraction, compose, session naming, feedback, prompt/runtime ownership, and memory/context used for composition.
- Facts are tied to file+line hints.
- Runtime evidence used in this doc:
  - R1: `cd apps/api && ../../.venv/bin/pytest tests/test_chat_routing_logic.py tests/test_chat_composition_hardening.py tests/test_assistant_message.py -q` -> `15 passed`.
  - R2: `cd apps/api && ../../.venv/bin/pytest tests/test_activities_regressions.py tests/test_time_anchor.py tests/test_message_feedback.py tests/test_conversation_cases.py -q` -> `18 failed`, primarily auth-gated (`401`) or helper mismatch.
  - R3: Python runtime probes of routing/composition helpers in `app.main`/`app.router` showed actual route kinds and assistant outputs for required scenarios.
  - R4: `ChatRequest.model_validate({... , model_request: ...})` drops `model_request` (ignored field).
  - R5: Playwright at `https://gethavi.com/app` showed setup-required modal, no active child, and console `AbortError` entries; send interaction is blocked by modal overlay.
  - R6: Local `apps/web` dev server start failed with `EPERM` bind on `127.0.0.1:3001`, so full local browser+API chat flow was not runnable in this environment.
- Assumptions (explicit, limited):
  - Production-authenticated chat send could not be exercised in-browser from this session; authenticated expectations are inferred from code paths and auth-aware helper behavior.
  - Endpoint tests currently failing with `401` are treated as harness/contract mismatch signals, not proof that authenticated runtime paths fail in production.

## 1) Executive summary (plain English)
What chat does today:
- The active chat path is deterministic rule-based routing and composition, not LLM-driven generation in the `/api/v1/activities` flow.
- Frontend sends one POST to `/api/v1/activities`; backend classifies Ask/Log/Mixed/Task/Memory, writes conversation messages, may write timeline+activity logs, then composes a single assistant reply string.
- Feedback is message-level thumbs up/down with optional down-comment, persisted via `/api/v1/messages/feedback`.

Why users feel inconsistency/risk today:
- Multiple prompt/composition systems exist, but only one is active for this route. Frontend builds `model_request` prompt payload that backend ignores.
- Some helper paths look richer (timestamp normalization, OpenAI action generation, auto-title, memory command handlers) but are currently unwired from active chat.
- Endpoint-level tests for chat/feedback are currently out of sync with auth and ID contracts, reducing confidence in runtime regressions.

## 2) Current state (facts only, no future bias)
### User sends a message in chat — what happens now?
1. Web input and send trigger:
- `sendMessage` reads text, checks offline state, validates child/conversation context, appends local user echo, then POSTs `/api/v1/activities`.
- Evidence: `apps/web/src/app/app/page.tsx:2214`, `apps/web/src/app/app/page.tsx:2241`, `apps/web/src/app/app/page.tsx:2298`.

2. Web request payload:
- Payload includes `message`, `timezone`, `source`, `child_id`, `conversation_id`, and `model_request`.
- Evidence: `apps/web/src/app/app/page.tsx:2304`.

3. Web auth/header behavior:
- `apiFetch` injects `Authorization`, `X-Havi-Family-Id`, and optional `X-Havi-Child-Id`. Without token on `/api/v1/*`, it returns synthetic `401` from client wrapper.
- Evidence: `apps/web/src/lib/api.ts:47`, `apps/web/src/lib/api.ts:58`, `apps/web/src/lib/api.ts:64`, `apps/web/src/lib/api.ts:67`, `apps/web/src/lib/api.ts:76`.

4. API entry point and session bootstrap:
- Backend handles POST `/api/v1/activities`.
- If no `conversation_id`, it creates a conversation (`title` starts as `New chat`).
- It loads conversation messages into a context bundle but currently uses only `has_prior_messages` for logging.
- Evidence: `apps/api/app/main.py:603`, `apps/api/app/main.py:617`, `apps/api/app/main.py:623`, `apps/api/app/main.py:416`, `apps/api/app/main.py:626`, `apps/api/app/main.py:638`.

5. Routing and intent:
- `classify_intent` gives a classifier intent.
- `_route_decision_for_message` derives `route_kind` (`log`, `ask`, `mixed`, `task`) using question detection and mixed log-segment extraction.
- Evidence: `apps/api/app/router.py:63`, `apps/api/app/main.py:656`, `apps/api/app/main.py:1601`.

6. DB writes (always + conditional):
- Always inserts user message into `conversation_messages`.
- For memory command phrases (`save this/that`), inserts `knowledge_items` and assistant message, returns early.
- For task intent, inserts `tasks` and assistant message, returns early.
- For log/mixed logging segments, parses actions and writes:
  - `timeline_events` (per action)
  - `activity_logs` (batch JSON)
- Then inserts assistant message and updates `conversation_sessions.last_message_at`.
- Evidence: `apps/api/app/main.py:675`, `apps/api/app/main.py:689`, `apps/api/app/main.py:736`, `apps/api/app/main.py:805`, `apps/api/app/main.py:820`, `apps/api/app/main.py:880`, `apps/api/app/main.py:889`.

7. Parsing/time extraction:
- Segmenting uses sentence/conjunction split (`.?!`, `and`, `then`, `;`, newline).
- Mixed extraction drops question clauses and keeps logging clauses.
- Timestamp parsing uses `dateparser.search_dates` with `PREFER_DATES_FROM=future`; fallback is `now(UTC)` if parse fails.
- Evidence: `apps/api/app/main.py:1422`, `apps/api/app/main.py:1437`, `apps/api/app/main.py:1447`, `apps/api/app/main.py:2358`, `apps/api/app/main.py:2347`, `apps/api/app/main.py:2466`.

8. Reply composition:
- `build_assistant_message` is the core composer.
- `intent=logging`: short `Logged: ...` confirmation path.
- `intent=mixed`: prepend logging confirmation, then stage/guidance text.
- Ask/guidance path builds stage+symptom/fallback text; fallback is explicit catch-all sentence.
- Returns optional `ui_nudges`.
- Evidence: `apps/api/app/main.py:3117`, `apps/api/app/main.py:3142`, `apps/api/app/main.py:3158`, `apps/api/app/main.py:3216`.

9. Response and UI rendering:
- API returns `assistant_message`, `actions`, message IDs, intent, optional `ui_nudges`.
- Web maps API response to assistant chat bubble and updates local message IDs.
- Web `ApiResponse` type currently does not include `ui_nudges`; no `ui_nudges` handling in page path.
- Evidence: `apps/api/app/schemas.py:90`, `apps/web/src/app/app/page.tsx:240`, `apps/web/src/app/app/page.tsx:2355`, `apps/web/src/app/app/page.tsx:2365`.

## 3) Canonical vs non-canonical paths
### Canonical active runtime path
- Web `sendMessage` -> `/api/v1/activities` -> route decision -> action parsing/time extraction -> DB writes -> `build_assistant_message` -> response rendered in chat.
- Evidence: `apps/web/src/app/app/page.tsx:2214`, `apps/api/app/main.py:603`, `apps/api/app/main.py:655`, `apps/api/app/main.py:780`, `apps/api/app/main.py:842`, `apps/api/app/main.py:891`.

### Non-canonical / dead / partially wired paths
- Legacy endpoints disabled:
  - `/api/v1/messages` and `/api/v1/chat_messages` return `410`.
  - Evidence: `apps/api/app/main.py:1289`, `apps/api/app/main.py:1297`.
- OpenAI client path exists but is not wired into `capture_activity`.
  - Evidence of existence: `apps/api/app/openai_client.py:312`.
  - No usage in active API path by repository search.
- Auto-title helper exists but appears unused in active send flow.
  - Evidence: `apps/api/app/main.py:103`; no call sites found in app code.
- Richer memory/timestamp/timeline helper paths exist but are currently unwired from `/api/v1/activities`:
  - `handle_memory_command`, `normalize_action_timestamps`, `record_timeline_events`.
  - Evidence: `apps/api/app/main.py:2752`, `apps/api/app/main.py:2844`, `apps/api/app/main.py:3437`.
- Frontend builds and sends `model_request`, but `ChatRequest` has no such field and drops extras.
  - Evidence: `apps/web/src/app/app/page.tsx:2286`, `apps/web/src/app/app/page.tsx:2310`, `apps/api/app/schemas.py:77`, runtime R4.

Risk of leaving these paths in place:
- Engineers and tests can target non-active logic and produce false confidence.
- Prompt ownership and behavior expectations drift because inactive prompt stacks still exist.
- Debugging time increases because multiple plausible but non-canonical execution paths coexist.

## 4) Current limits/challenges (message/chat)
### Routing limits (Ask/Log/Mixed)
- Mixed detection depends on limited comma+question-word split and question heuristics; nuanced mixed phrasing can be mis-segmented.
- Evidence: `apps/api/app/main.py:1431`, `apps/api/app/main.py:1544`, `apps/api/app/main.py:1601`, runtime R3.

### Composition limits (guidance/logging/mixed/fallback)
- Single monolithic composer function handles divergent contracts; behavior varies by `context.intent` string conventions.
- `ui_nudges` can be generated server-side but are not consumed in web chat path.
- Evidence: `apps/api/app/main.py:3117`, `apps/api/app/main.py:3171`, `apps/web/src/app/app/page.tsx:240`.

### Parser/time limits
- `dateparser` configured with future preference can produce future timestamps for historical-style logs.
- Normalization helper that would anchor/clamp inferred times exists but is not applied in active flow.
- Evidence: `apps/api/app/main.py:2351`, `apps/api/app/main.py:2466`, `apps/api/app/main.py:2844`, runtime R3.

### Session title limits
- Conversation creation starts at `New chat`; active send path does not call auto-title helper.
- UI states “auto-titled by HAVI,” but active backend call path for this is not visible in current code.
- Evidence: `apps/api/app/main.py:463`, `apps/api/app/main.py:103`, `apps/web/src/app/app/page.tsx:3898`.

### Feedback state limits
- Feedback requires auth + UUID IDs at API layer.
- UI retries failed saves briefly, but there is no strong user-facing failure state beyond transient “Retrying…”.
- Existing endpoint tests are stale against current auth/identifier contracts.
- Evidence: `apps/api/app/routes/feedback.py:27`, `apps/api/app/routes/feedback.py:53`, `apps/web/src/components/chat/message-feedback.tsx:74`, `apps/api/tests/test_message_feedback.py:21`, runtime R2.

### Prompt ownership ambiguity
- Three prompt/runtime surfaces exist:
  - Frontend `HAVI_SYSTEM_PROMPT` + `model_request` payload.
  - Backend `openai_client.SYSTEM_PROMPT` (inactive for active chat route).
  - Active deterministic backend composition in `build_assistant_message`.
- Evidence: `apps/web/src/lib/havi-model-request.ts:1`, `apps/web/src/app/app/page.tsx:2310`, `apps/api/app/openai_client.py:29`, `apps/api/app/main.py:3117`.

## 5) Scenario matrix (expected vs actual + evidence)
| Scenario | Expected (product intent) | Actual now | Evidence refs |
|---|---|---|---|
| Short logging message (`"woke at 3am"`) | Route to log, persist event, concise logged confirmation | Routes to `log`; assistant string starts `Logged:`; runtime probe showed parsed time can be normalized oddly (`12:00 AM PST` in probe context) | `apps/api/app/main.py:1601`, `apps/api/app/main.py:3142`, runtime R3, tests in `apps/api/tests/test_chat_routing_logic.py:66` |
| Short guidance question (`"is loud breathing normal at night?"`) | Route to ask/guidance, no logging side effects | Route goes to `ask` due question detection even when classifier label may be weak (`chit_chat` in probe); guidance text produced | `apps/api/app/main.py:1595`, `apps/api/app/main.py:1601`, runtime R3 |
| Mixed intent (`"woke at 3am, is that normal?"`) | Log clause persisted + guidance in same reply | Routes `mixed`; extracts logging segment and composes reply starting with `Logged:` plus guidance block | `apps/api/app/main.py:1447`, `apps/api/app/main.py:1608`, `apps/api/app/main.py:3158`, runtime R3, `apps/api/tests/test_chat_composition_hardening.py:29` |
| Long open-ended guidance question | Ask path with coherent guidance and no logging insert | Routes ask; produces long stage/guidance response from composer, no log actions in probe | `apps/api/app/main.py:1601`, `apps/api/app/main.py:3160`, runtime R3 |
| Multi-event with times (`"1am diaper, 3am feed..."`) | Split into multiple event actions with anchored times | Current splitter produced coarse segments; runtime probe showed 2 segments and potentially surprising inferred timestamps | `apps/api/app/main.py:1422`, `apps/api/app/main.py:2466`, runtime R3 |
| Thumbs feedback action | Assistant-message feedback persisted per conversation/message | UI posts `conversation_id + message_id + rating (+optional comment)` and retries failures; API requires auth and UUID IDs; endpoint tests currently fail under old assumptions | `apps/web/src/components/chat/message-feedback.tsx:108`, `apps/api/app/routes/feedback.py:27`, `apps/api/app/routes/feedback.py:53`, runtime R2 |

## 6) Future-direction requirements (separate from current-state facts)
- Robust Ask/Log/Mixed architecture with explicit contract boundaries and deterministic precedence.
- Clear composition contracts for guidance, logging, mixed, and fallback (including output shape and length constraints).
- Browse + citations support with source-quality and citation-format guarantees.
- Explicit handling strategy for long, open-ended guidance prompts (decomposition, follow-up policy).
- Proactive behavior support with confidence thresholds and guardrails.
- Persistent memory retrieval across sessions for composition context.
- Combined semantic + episodic memory architecture.
- Vector retrieval readiness (indexing, freshness, relevance, safety filtering).

## 7) Gap analysis: current vs desired
### What exists
- Deterministic routing/composition path in API.
- Chat persistence primitives: conversation sessions/messages, activity logs, timeline events.
- Message-level feedback endpoint + UI controls.
- Basic mixed-intent extraction and tests for routing/composition helpers.

### What’s missing
- Single canonical prompt/runtime owner for chat behavior.
- Active use of rich context retrieval in composition (prior conversation, knowledge memory in active path).
- Explicit browse/citation architecture in current chat execution path.
- Reliable end-to-end chat test harness aligned with auth and UUID contracts.
- Clear/active session auto-title path in current backend send flow.

### Undefined or weak contracts
- Exact output contract by route kind (`ask`, `log`, `mixed`) and UI rendering expectations.
- Time anchoring contract for relative/time-only historical entries in active parser path.
- Contract for how `ui_nudges` should be consumed (currently server emits, web ignores in send path).

## 8) Architecture questions (ranked, focused)
### P1
1. How does HAVI route Ask/Log/Mixed today, and is it robust enough?
- Why it matters: Incorrect route means wrong DB writes and wrong assistant behavior.
- Default assumption if unanswered: Keep `_route_decision_for_message` as canonical and treat mixed extraction as heuristic-risky.

2. Is composition contract clear for guidance, logging, mixed, and fallback?
- Why it matters: UI and evals need stable output expectations by intent.
- Default assumption if unanswered: `build_assistant_message` is canonical, and any additional composer path is non-authoritative.

3. How are long/open-ended guidance prompts handled today, and is behavior explicit?
- Why it matters: High-frequency caregiver usage; poor structure increases perceived quality variance.
- Default assumption if unanswered: Current guidance is single-pass templated text with no explicit decomposition layer.

4. What prompt path is actually used today? What should be canonical?
- Why it matters: Multiple inactive prompt stacks create ownership confusion and regression risk.
- Default assumption if unanswered: Active prompt behavior is backend deterministic composer, not frontend `model_request` nor `openai_client` prompt.

5. Is browse+citation architecture clearly structured now?
- Why it matters: Trust, safety, and auditability of advice quality.
- Default assumption if unanswered: No active browse/citation architecture in current message path.

6. Is memory persistence/retrieval architecture ready for cross-session composition?
- Why it matters: Longitudinal personalization requires retrieval in the active compose path, not just storage.
- Default assumption if unanswered: Storage exists, retrieval wiring into `/api/v1/activities` composition is partial/inactive.

7. Is architecture ready for episodic + semantic memory and vector retrieval?
- Why it matters: Needed for scalable high-quality context grounding.
- Default assumption if unanswered: Not ready; current path lacks vector retrieval integration and explicit relevance contracts.

### P2
8. Is architecture ready for safe proactive behavior (triggering, confidence, guardrails)?
- Why it matters: Proactive actions can create trust and safety risks without strict controls.
- Default assumption if unanswered: Not ready for broad proactive actions beyond current deterministic nudges.

## 9) Inputs for execution planning
### What can be parallelized later
- Routing contract hardening (Ask/Log/Mixed) and dedicated unit-eval expansion.
- Composition contract formalization + web render contract (`ui_nudges`, fallback display rules).
- Feedback contract alignment (API auth/UUID expectations + tests + UX error-state handling).
- Prompt ownership cleanup (remove or clearly gate non-canonical prompt paths).

### What must remain sequential
- Decide single canonical runtime path first (routing+composition ownership).
- Then align data contracts (`ChatRequest`/`ChatResponse`, frontend payload/handling).
- Then migrate tests/evals to that contract.
- Then expand memory retrieval and browse/citation features on top of stable contracts.

### Eval/test harness additions needed before implementation
- Auth-aware endpoint tests for `/api/v1/activities` and `/api/v1/messages/feedback` with UUID IDs and family/child headers.
- Golden scenario tests for required matrix cases (short log, short ask, mixed, long ask, multi-event times, feedback).
- Time-anchoring regression evals that assert no future drift for historical-style logs unless explicitly future-intent.
- Web integration checks that verify:
  - `ui_nudges` handling contract,
  - setup modal gating behavior,
  - feedback retry/failure UX,
  - session title update source of truth.
