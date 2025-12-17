# HaviLogger

Mobile-first playground for logging baby activities from natural language to a structured schema via OpenAI.

## Tech stack
- **Frontend:** Next.js 16 (App Router, TypeScript), Tailwind v4 + shadcn dark theme, Lucide icons
- **Backend:** FastAPI + Uvicorn, SQLite persistence, OpenAI Responses API
- **Shared:** Git monorepo with `/apps/web` (frontend) and `/apps/api` (backend)

## Core action schema
The OpenAI prompt normalizes messages into one of these action types. Each action includes `timestamp`, `note`, metadata, and `is_core_action`.

- `bath`
- `growth` (weight/height/head circumference)
- `dirty_diaper_poop`
- `dirty_diaper_pee`
- `dirty_diaper_pee_and_poop`
- `medication`
- `sleep`
- `activity`
- `custom` (requires `custom_action_label`)

Metadata captures optional structured values (amount, unit, measurement fields, durations, outcome, extra free-form map).

## Project layout
```
apps/
  api/                # FastAPI service
    app/
      config.py       # loads config.json (OpenAI key, model, DB path)
      main.py         # FastAPI app + routes
      openai_client.py
      schemas.py
      db.py
    config.example.json
    data/havilogger.db # SQLite dev store (now seeds users/children/care team)
    requirements.txt
  web/                # Next.js frontend
    src/app/page.tsx  # Mobile mock interface
    src/components/ui # shadcn components
    .env.example
```

## Backend setup
1. Ensure Python 3.11+ is available.
2. Copy the config template and add your OpenAI key/model (default `gpt-4o-mini` works well):
   ```bash
   cp apps/api/config.example.json apps/api/config.json
   # edit apps/api/config.json and set "openai_api_key"
   ```
3. (Optional) Create and activate a virtual environment.
4. Install dependencies:
   ```bash
   pip install -r apps/api/requirements.txt
   ```
5. Start the API (runs on port 8000 by default):
   ```bash
   uvicorn app.main:app --reload --app-dir apps/api --port 8000
   ```

### API quick start
- `POST /api/v1/activities` with `{ "message": "Just had a bath and ate 4 oz of formula" }`.
- Returns structured actions plus latency + model metadata.
- Every call is persisted to SQLite at `apps/api/data/havilogger.db`.

## Frontend setup
1. Install Node 20+ / npm 10+.
2. Copy the env template (points to the local FastAPI server by default):
   ```bash
   cd apps/web
   cp .env.example .env.local
   npm install
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`. The viewport is capped to iPhone 14 width (390px) but can be previewed in any desktop browser.

## Dev workflows
- Frontend consumes `NEXT_PUBLIC_API_BASE_URL` so you can point it at staging later without rebuilds.
- The response card shows the raw JSON while future UX is still under design.
- Enter sends on click or `Enter` (Shift+Enter for newline). Button locks during in-flight requests.
- Backend tests (planned) will replay a library of canonical user inputs to ensure schema stability, milestone logic, and inference defaults don’t regress.
- Tone and hospitality guidelines live in `docs/tone_and_examples.md` so every prompt/response stays on-brand.
- Knowledge graph scaffolding lives behind `/api/v1/inferences` (create/list/update) so we can start recording caregiver + child insights and drive the swipe-confirm UI later.
- Insight endpoints (`/api/v1/insights/compare` and `/api/v1/insights/expected`) now power the frontend “Insights” card, letting you fetch stage expectations or quick day-over-day comparisons without writing custom scripts.
- Chat history + knowledge cards: the frontend can now fetch `/api/v1/sessions` for a history drawer and `/api/v1/inferences` for the “Havi remembers” deck so caregivers can confirm/reject inferred facts.

## Inferred defaults & stage context (roadmap)
- Event logs will store both the raw model timestamp and an adjusted timestamp derived from each caregiver’s typical logging lag.
- Newborn-to-toddler milestones (per week/month) drive default assumptions: e.g., week‑1 diapers default to yellow stool/light urine unless the caregiver specifies otherwise.
- Caregiver replies will adopt a “warm pediatric nurse + Ritz-Carlton hospitality” tone, mixing encouragement (“Great, captured!”) with stage-aware prompts (“Newborns usually have ~6 poops a day—have there been others?”).
- Sleep events now track type (sleep/nap), start & end moods, and locations so future analytics/UX can display richer context.

## Next ideas
- Store both normalized actions and raw events for analytics.
- Add historical views/graphs and planning flows referenced in the brief.
- Consider shared protobuf/JSON schema package if multiple clients consume the API later.
