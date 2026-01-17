# Milestone Guidance – Current State

## Where memory is stored
- **Primary store:** SQLite `knowledge_items` table created in `apps/api/app/db.py`.
  - Columns: `id`, `profile_id`, `key`, `type`, `status`, `payload`, `created_at`, `updated_at`, `last_prompted_at`, `last_prompted_session_id`.
  - Access helpers: `list_knowledge_items`, `create_knowledge_item`, `update_knowledge_item_payload`, `set_explicit_knowledge` in `apps/api/app/db.py`.
- **Inference store:** SQLite `inferences` table in `apps/api/app/db.py`.
  - Tracks inferred knowledge with `dedupe_key`, `last_prompted_at`, `status`.
  - Access helpers in `apps/api/app/inferences.py`.
- **Conversation history:** `conversation_messages` table in `apps/api/app/db.py`, accessed via `list_messages` / `append_message` in `apps/api/app/conversations.py`.

## Where childhood development guidance exists today
- **Prompt guidance for model:** `SYSTEM_PROMPT` in `apps/api/app/openai_client.py` includes milestone and adjusted-age instructions.
- **Rule-based guidance (non-LLM):**
  - `stage_guidance` in `apps/api/app/main.py` includes milestone guidance, a “week-based” tip system (`STAGE_TIPS`), and a special-case behavior response for hitting.
  - `apply_milestone_context` in `apps/api/app/knowledge_guidance.py` adds “next steps” milestone language when triggers are present.
- **No dedicated milestone store:** There is no separate milestone catalog or milestones table in the repository (not found).

## How the system composes context into a prompt (call graph)
**Primary API entrypoint:** `POST /api/v1/activities` → `capture_activity` in `apps/api/app/main.py`.

Call graph (simplified):
1. `capture_activity` → fetch profiles and knowledge: `fetch_primary_profiles`, `list_knowledge_items`.
2. `build_child_context` in `apps/api/app/context_builders.py` maps `KnowledgeItem` → structured child context (temperament, activities, milestones).
3. `build_message_context` in `apps/api/app/context_pack.py` builds a trimmed list of prior conversation messages.
4. `generate_actions` in `apps/api/app/openai_client.py`:
   - `_build_context_system_message` inserts child context into a system message.
   - `SYSTEM_PROMPT` + context messages + user message are sent to OpenAI (chat completions or responses API).
5. Post-processing in `capture_activity`:
   - `build_assistant_message` composes the final user-facing guidance.
   - `apply_temperament_adjustments`, `apply_activity_suggestions`, `apply_milestone_context` add guidance layers.

## What inputs are used
- **Child profile fields:** from `children` table via `fetch_primary_profiles` (birth_date, due_date, timezone, gender, weights, routine_eligible).
- **Age calculation:** `compute_child_weeks` in `apps/api/app/main.py` uses `birth_date` or `due_date` to compute weeks; no explicit month-based calculation for guidance.
- **User profile fields:** from `users` table via `fetch_primary_profiles` (first_name, last_name, relationship, etc.).
- **Memory / knowledge items:** `knowledge_items` table; `build_child_context` maps keys like `child_milestone_profile`, `child_temperament`, `child_activity_preferences`.
- **Prior chats:** `build_message_context` pulls `conversation_messages` and provides them as context messages to the model.
- **Runtime signals:** timezone resolution in `resolve_timezone`, symptom tags in `message_symptom_tags`, and question category in `classify_question_category`.

## What the model sees (final assembled prompt structure)
`generate_actions` in `apps/api/app/openai_client.py` builds:
1. **System prompt:** `SYSTEM_PROMPT` with the logging + guidance rules.
2. **Optional system context message:** `Here is known context about the child...` containing JSON serialized child context from `build_child_context`.
3. **Context messages:** recent chat history from `build_message_context`.
4. **User message:** the raw user input.

There is no explicit prompt contract versioning or trace object stored with the request.

## What the app returns and where it’s rendered
- API response: `ChatResponse` in `apps/api/app/schemas.py` containing `assistant_message`, `actions`, `intent`, `question_category`, etc.
- Web rendering: `apps/web/src/app/page.tsx` appends the assistant response to the chat feed and derives a fallback summary from actions when `assistant_message` is empty.

## Logging / telemetry
- **Server logs:** `capture_activity` logs child-scoped request metadata via `logger.info`.
- **Client-side telemetry:** `POST /api/v1/metrics/loading` records loading/error metrics in `loading_metrics` table (`apps/api/app/metrics.py`).
- **No request-level prompt trace:** No persisted record of prompt version, context sources, or memory IDs per response (not found).

## Sequence diagram (request to response)
```
User UI (apps/web/src/app/page.tsx)
  |  sendMessage()
  |  POST /api/v1/activities
  v
API (apps/api/app/main.py: capture_activity)
  |-- fetch_primary_profiles()
  |-- list_knowledge_items()
  |-- build_child_context()
  |-- build_message_context()
  |-- generate_actions() -> OpenAI
  |-- build_assistant_message()
  |-- apply_*_context() post-processing
  v
API response (ChatResponse)
  |
  v
UI renders assistant entry + timeline refresh
```

## Single request trace (UI → API → prompt → response → UI)
1. **UI action:** `sendMessage` in `apps/web/src/app/page.tsx` posts to `/api/v1/activities` with `message`, `timezone`, `child_id`, and `conversation_id`.
2. **API intake:** `capture_activity` in `apps/api/app/main.py` normalizes message, resolves timezone, reads child profile, pulls active knowledge items, and builds child context.
3. **Prompt assembly:** `generate_actions` in `apps/api/app/openai_client.py` creates the prompt with `SYSTEM_PROMPT`, the child context system message (JSON), and recent messages from `build_message_context`.
4. **Model response:** LLM returns JSON actions; actions are normalized and used to build the assistant reply with `build_assistant_message`, plus optional guidance post-processing.
5. **UI rendering:** UI appends `assistant_message` to the chat and refreshes timeline/history in `apps/web/src/app/page.tsx`.

