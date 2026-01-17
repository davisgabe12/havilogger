# Core Product Flows

This document connects user‑visible flows to specific endpoints and code paths.

## 1. Message → Intent → Log & Guidance

- **Endpoints**
  - `POST /api/v1/activities` – core chat endpoint.
- **Backend entrypoints**
  - `apps/api/app/main.py:capture_activity`
    - Resolves caregiver/child via `fetch_primary_profiles` / `ensure_default_profiles`.
    - Normalizes message and classifies intent:
      - `router.classify_intent`.
      - `message_symptom_tags`, `classify_question_category`.
    - Manages conversation:
      - `get_session`, `get_last_assistant_message`, `append_message`.
      - Catch‑up mode (`detect_catch_up_entry`, `detect_catch_up_exit`, `catch_up_mode_should_end`, `set_catch_up_mode`).
    - Handles special intents:
      - Memory save: `detect_memory_save_target`, `handle_memory_command` (uses `set_explicit_knowledge`).
      - Task request: `extract_task_title`, `extract_task_due_at`, `create_task`.
    - For logging/advice:
      - Calls `openai_client.generate_actions`.
      - Normalizes timestamps: `normalize_action_timestamps`.
      - Adjusts semantics: `apply_blowout_classification`, `infer_feed_method_from_message`, `determine_feed_pattern`, `annotate_feed_method`.
      - Persists logs: `persist_log`.
      - Writes timeline events: `_persist_timeline_events_for_actions` → `insert_timeline_event`.
      - Detects knowledge inferences: `inferences.detect_knowledge_inferences`.
      - Collects pending knowledge prompts: `filter_pending_for_prompt`, `knowledge_pending_prompts`.
      - Composes reply: `build_assistant_message`, `stage_guidance`, `summarize_actions`.
      - Applies child context: `build_child_context`, `apply_temperament_adjustments`, `apply_activity_suggestions`, `apply_milestone_context`.
- **Frontend entrypoints**
  - `apps/web/src/app/page.tsx`
    - `sendMessage`:
      - Sends `POST ${API_BASE_URL}/api/v1/activities` with `{ message, timezone, source, child_id, conversation_id }`.
      - Shows loading UX using `LOADING_MESSAGES` keyed by `question_category`.
      - Appends user + assistant chat entries to local state.
      - On non‑empty `actions`, increments `timelineRefreshKey` so the Timeline panel reloads.

## 2. Task Creation & Management

- **From chat**
  - Router: `apps/api/app/router.py:classify_intent`
    - Flags “remind me…”, “don’t forget…”, “I need to…” as `task_request`.
  - Chat handler: `capture_activity` in `apps/api/app/main.py`
    - When `intent_result.intent == "task_request"`:
      - Derives title: `extract_task_title`.
      - Derives due date/time: `extract_task_due_at`.
      - Creates a task via `db.create_task`.
      - Appends conversation messages with `intent="task_request"`.
      - Returns `ChatResponse` with confirmation (`assistant_message="Task added: …"`), no `actions`.
- **Task API**
  - `apps/api/app/routes/tasks.py`
    - `POST /api/v1/tasks` → `create_task_endpoint` – structured task creation.
    - `GET /api/v1/tasks` → `list_tasks_endpoint` – filters by `view` (`open|scheduled|completed`) and `child_id`.
    - `PATCH /api/v1/tasks/{task_id}` → `update_task_endpoint` – updates title, due date/time, status, assignee.
  - Persistence: `apps/api/app/db.py`
    - `create_task`, `list_tasks`, `update_task`, `update_task_status`, `get_task`.
- **Frontend**
  - `apps/web/src/app/page.tsx`
    - `loadTasks`:
      - Calls `GET ${API_BASE_URL}/api/v1/tasks?view=open|scheduled|completed[&child_id=…]`.
      - Merges results into a single `TaskItem[]`.
    - `handleCompleteTask`:
      - Optimistically toggles a task’s `status`, then `PATCH ${API_BASE_URL}/api/v1/tasks/{id}`.
    - `saveTaskDetails`:
      - Updates `title` and `due_at` via `PATCH ${API_BASE_URL}/api/v1/tasks/{id}`.
    - Tasks panel UI:
      - Filters by view (`open/scheduled/unscheduled/completed`) and assignee.

## 3. Timeline: Events & “Open in Chat”

- **Endpoints**
  - `GET /events?child_id={id}&start={iso}&end={iso}`.
- **Backend**
  - `apps/api/app/main.py`
    - During `capture_activity`, calls `_persist_timeline_events_for_actions`:
      - Uses `insert_timeline_event` to create `timeline_events` rows.
      - Normalizes to the child’s timezone, handles sleep durations and inferred times.
      - Stores `origin_message_id` for linking back to the chat.
  - `apps/api/app/db.py`
    - `insert_timeline_event`, `list_timeline_events`.
  - `apps/api/app/routes/events.py`
    - `list_events` handler:
      - Requires `child_id` by default; uses `list_timeline_events`.
      - Maps DB rows into `EventOut` Pydantic models returned to clients.
- **Frontend**
  - `apps/web/src/components/timeline/timeline-panel.tsx`
    - `useTimelineEvents`:
      - Fetches `GET ${API_BASE_URL}/events?child_id=…&start=…&end=…`.
      - Maps API payload into `TimelineEvent` objects.
    - `TimelinePanel`:
      - Groups events by day, filters by type (`sleep`, `bottle`, `diaper`, `activity`, `growth`).
      - Renders an “Open in chat →” link per event:
        - Calls `onOpenInChat(event.originMessageId)` if provided.
  - `apps/web/src/app/page.tsx`
    - `handleOpenTimelineMessage`:
      - Sets `focusedMessageId` so the chat scrolls to the corresponding message (based on `data-message-id` attributes).

## 4. Knowledge & Inference Review

- **Inference creation**
  - `apps/api/app/inferences.py`
    - `detect_knowledge_inferences(message, actions, child_id, user_id, profile_id)`:
      - Heuristics for:
        - Care frameworks, feeding structure, activity preferences, milestones.
        - BPA‑free preferences, baby gear budget, outdoor time.
        - Prematurity, places of interest, family diet, solids profile.
      - Uses `create_inference` and `_persist_pending_knowledge` to:
        - Insert into `inferences` table.
        - Create or merge `knowledge_items` with `status=PENDING`.
- **Knowledge review API**
  - `apps/api/app/routes/knowledge.py`
    - `GET /api/v1/knowledge/review`:
      - Uses `_require_profile_id` → `fetch_primary_profiles`.
      - Loads items via `list_knowledge_items`.
      - Builds review DTOs via `build_review_item` in `knowledge_utils`.
    - `POST /api/v1/knowledge/{item_id}/confirm`:
      - Marks item `ACTIVE`, resets dismiss count, bumps confidence.
      - Calls `update_inferences_status` with `InferenceStatus.CONFIRMED`.
    - `POST /api/v1/knowledge/{item_id}/reject`:
      - Marks item `REJECTED`, increments dismiss count.
      - Calls `update_inferences_status` with `InferenceStatus.REJECTED`.
    - `POST /api/v1/knowledge/{item_id}/edit`:
      - Merges payload, may convert `INFERRED` → `EXPLICIT`.
      - Persists via `update_knowledge_item_payload` and `update_knowledge_item_type`.
- **Knowledge prompts in chat**
  - `apps/api/app/main.py`
    - After logging actions:
      - Collects pending inferences (`list_inferences`).
      - Filters via `filter_pending_for_prompt`.
      - Builds text prompts via `knowledge_pending_prompts`.
      - Marks items and inferences as prompted (`mark_knowledge_prompted`, `mark_inferences_prompted`).
      - Passes pending prompts into `build_assistant_message` context.
- **Frontend**
  - `/knowledge` page:
    - `apps/web/src/app/knowledge/page.tsx`
      - `fetchItems`:
        - `GET /api/v1/knowledge/review`.
        - Filters items with `status === "pending"`.
      - `handleConfirm`, `handleDismiss`, `handleEdit`:
        - `POST /api/v1/knowledge/{id}/confirm|reject|edit`.
      - Renders items using `KnowledgeList` and `KnowledgeItemCard`.
  - “Havi remembers” panel:
    - `apps/web/src/app/page.tsx` (Knowledge panel within the main page):
      - `loadInferences`:
        - `GET ${API_BASE_URL}/api/v1/inferences?child_id=…&status=pending`.
      - `handleInferenceAction`:
        - `POST ${API_BASE_URL}/api/v1/inferences/{id}/status`.

## 5. Sharing Conversations

- **Backend**
  - `apps/api/app/share.py`
    - `POST /api/v1/share/conversation` (`create_share`):
      - Validates that a `conversation_session` has messages (`session_has_messages`).
      - Calls `create_share_link` (`db`) with a generated `token`.
    - `GET /api/v1/share/{token}` (`fetch_share`):
      - Loads share link via `get_share_link`.
      - Validates expiry.
      - Loads session via `get_session` and messages via `list_conversation_messages`.
      - Returns `{ token, session_id, title, messages, expires_at }`.
- **Frontend**
  - `apps/web/src/app/share/[token]/page.tsx`
    - Derives `token` from the URL.
    - Fetches `GET ${API_BASE_URL}/api/v1/share/${token}`.
    - Renders:
      - Title (`data.title`).
      - Message list (`data.messages`) with role‑specific styling for `"user"` vs `"assistant"` vs `"caregiver"`.
