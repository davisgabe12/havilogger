# Context Sources for Parenting Answers

Each source below is actively used (or absent) in the current request path for `/api/v1/activities`.

| Source | Format | Owner | Freshness | Failure mode |
| --- | --- | --- | --- | --- |
| `knowledge_items` (memory store) | SQLite table with JSON `payload` | API (`apps/api/app/db.py`) | Updated on explicit save or inference confirmation | Missing profile → no items returned; empty context reduces personalization. |
| `inferences` (pending memory) | SQLite table with JSON `payload` | API (`apps/api/app/inferences.py`) | Updated during `detect_knowledge_inferences` | Pending items may be omitted if not linked to session or if inferred data is rejected. |
| `conversation_messages` | SQLite table | API (`apps/api/app/conversations.py`) | Real-time with each message | If session missing or budget trimmed, context is omitted or summarized. |
| Child profile fields | SQLite `children` table | API (`apps/api/app/db.py`) | Updated on settings save | Missing DOB/due date → no age-based stage guidance; timezone defaults to PT. |
| Caregiver profile fields | SQLite `users` table | API (`apps/api/app/db.py`) | Updated on settings save | Missing user info has limited effect (mostly UI labeling). |
| Milestone profile (from memory) | `knowledge_items` key `child_milestone_profile` | API (`apps/api/app/context_builders.py`) | Updated via inference or explicit confirmation | If absent, `apply_milestone_context` has no effect. |
| System prompt | Static string | API (`apps/api/app/openai_client.py`) | Build-time | If edited incorrectly, prompt behavior shifts globally. |
| Stage tips | In-code list `STAGE_TIPS` | API (`apps/api/app/main.py`) | Build-time | If child weeks out of range, stage tips fallback to generic text. |
| Runtime signals | In-memory: timezone, symptom tags, question category | API (`apps/api/app/main.py`) | Per request | If detection fails, guidance may be generic (no symptom or stage guidance). |
| External/static knowledge files | None found | N/A | N/A | Not available for retrieval. |

Notes:
- There is **no dedicated milestone datastore** separate from `knowledge_items` and `STAGE_TIPS` (not found).
- There is **no context trace object** stored with responses (not found).

