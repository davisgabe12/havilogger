# HaviLogger

HaviLogger is a AI‑assisted parenting logger and assistant. It turns short, natural‑language inputs into structured, queryable data (feeds, diapers, sleep, tasks, milestones) and returns concise, stage‑aware guidance.

## Tech Stack

- **Backend**
  - FastAPI + Uvicorn.
  - SQLite persistence (single dev DB at `apps/api/data/havilogger.db`).
  - OpenAI SDK for structured action generation.
- **Frontend**
  - Next.js (App Router, TypeScript).
  - Tailwind v4 + shadcn‑style components.
  - Lucide icons.
- **Monorepo layout**
  - `apps/api` – FastAPI service and SQLite data layer.
  - `apps/web` – Next.js web UI.

## Project Layout (high level)

- `apps/api`
  - `app/main.py` – FastAPI app, chat endpoint, sessions, settings, insights.
  - `app/openai_client.py` – OpenAI integration and JSON‑schema prompt.
  - `app/schemas.py` – core `Action`, `ChatRequest`, `ChatResponse`, `Task`, `KnowledgeItem` models.
  - `app/db.py` – SQLite schema + helpers for logs, tasks, timeline, knowledge, inferences, conversations.
  - `app/inferences.py`, `app/knowledge_utils.py`, `app/context_builders.py` – knowledge graph + inference logic.
  - `app/routes/tasks.py`, `app/routes/events.py`, `app/routes/knowledge.py` – REST sub‑routers.
  - `app/share.py` – share link creation and retrieval.
  - `config.example.json` → `config.json` – API key, model, DB path.
  - `requirements.txt` – Python dependencies.
- `apps/web`
  - `src/app/page.tsx` – main mobile experience (chat, timeline, tasks, history, knowledge, settings, integrations).
  - `src/app/knowledge/page.tsx` – detailed knowledge review.
  - `src/app/share/[token]/page.tsx` – read‑only shared conversation view.
  - `src/components/timeline/*` – timeline UI and tests.
  - `src/components/knowledge/*` – knowledge review UI.
  - `src/components/ui/*` – shadcn‑style primitives.
  - `package.json` – `dev`, `build`, `start`, `lint`, `test` scripts.
- `docs`
  - `architecture.md` – deeper architecture map.
  - `running-locally.md` – end‑to‑end dev setup.
  - `testing.md` – how to run backend/frontend tests and what they cover.
  - `core-flows.md` – key product flows and code entrypoints.
  - `conversation_scenarios.md`, `tone_and_examples.md` – tone and UX examples.
- Root scripts:
  - `restart.sh` – stop existing dev processes and start FastAPI + Next dev servers.
  - `stop.sh` – stop backend and frontend dev processes.

## Skills

- `SKILLS.md` – local Codex skill index for this repo.
- Refresh with `scripts/update-skills-index.py`.
- Or run `make skills-index`.

## Getting Started

For detailed setup instructions, see:

- `docs/running-locally.md` – backend and frontend dev commands.
- `docs/architecture.md` – how the pieces fit together.
- `docs/core-flows.md` – how a message flows from UI → intent → logs → guidance.

Quick outline:

1. **Configure the backend**
   - `cp apps/api/config.example.json apps/api/config.json`
   - Edit `apps/api/config.json` and set `"openai_api_key"`.
2. **Install dependencies**
   - Backend: `pip install -r apps/api/requirements.txt`
   - Frontend: `cd apps/web && npm install`
3. **Run services**
   - Option A (manual):
     - Backend: `cd apps/api && uvicorn app.main:app --reload --port 8000`
     - Frontend: `cd apps/web && npm run dev`
   - Option B (scripted, expects `.venv`):
     - From repo root: `./restart.sh`

- Once both services are running:
- 
- Open `http://localhost:3001` to use the Havi UI.
- The chat panel sends requests to `POST /api/v1/activities` and displays structured responses.

## Testing

- Backend tests:
  - `cd apps/api`
  - `pytest`
- Frontend tests:
  - `cd apps/web`
  - `npm test`
- Frontend lint:
  - `cd apps/web`
  - `npm run lint`

See `docs/testing.md` for a breakdown of what each suite covers.

### Playwright E2E (GREEN smoke)

- One-command run:
  - `./scripts/e2e_green.sh`
- Or from web:
  - `cd apps/web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npx playwright test -g green --reporter=line`
- Artifacts:
  - Playwright output and traces live in `apps/web/test-results` (see `apps/web/test-results/report.json`).

### Running backend tests in a venv (recommended)

If `pytest` is missing, create a local venv once and reuse it:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/api/requirements.txt
cd apps/api && python -m pytest -k rls_paths -q
```

## Core Action Schema (Backend)

The OpenAI prompt in `apps/api/app/openai_client.py` normalizes messages into `Action` objects defined in `apps/api/app/schemas.py`:

- `CoreActionType`
  - `bath`
  - `growth` (weight/height/head circumference)
  - `dirty_diaper_poop`
  - `dirty_diaper_pee`
  - `dirty_diaper_pee_and_poop`
  - `medication`
  - `sleep`
  - `activity`
  - `custom` (requires `custom_action_label`)
- `ActionMetadata`
  - Optional structured values such as:
    - `amount_value`/`amount_unit`
    - `measurement_type`/`measurement_unit`
    - `duration_minutes`
    - `sleep_type`, `sleep_location`, `sleep_method`, mood fields
    - `extra` map for inferred details

These actions are persisted via `persist_log` and projected into the timeline via `insert_timeline_event`. They are the primary system‑of‑record representation of caregiver logs.
