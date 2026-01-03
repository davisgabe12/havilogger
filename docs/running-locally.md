# Running Havi Locally

This guide describes how to start the backend and frontend using only commands and scripts that live in this repo.

## 1. Backend API (FastAPI + SQLite)

- **Dependencies**
  - Python 3.11+.
  - Install backend dependencies:
    - `pip install -r apps/api/requirements.txt`
- **Configuration**
  - Copy the example config and set your OpenAI key:
    - `cp apps/api/config.example.json apps/api/config.json`
    - Edit `apps/api/config.json` and set `"openai_api_key"`.
- **Running the API**
  - Directly via uvicorn:
    - `cd apps/api`
    - `uvicorn app.main:app --reload --port 8000`
  - Or via the root helper script (expects a Python venv at `.venv`):
    - `./restart.sh`
    - This script:
      - Activates `.venv`.
      - Starts uvicorn as `uvicorn app.main:app --host "$HOST" --port 8000`.
      - Starts the frontend dev server (see below) in parallel.
  - Health check:
    - `GET http://127.0.0.1:8000/health` → handled by `apps/api/app/main.py:health`.

## 2. Frontend Web (Next.js)

- **Dependencies**
  - Node.js and npm.
  - Install frontend dependencies:
    - `cd apps/web`
    - `npm install`
- **Configuration**
  - The frontend reads `NEXT_PUBLIC_API_BASE_URL` to reach the API:
    - For local dev, use `http://127.0.0.1:8000` (default assumed in `page.tsx` when env is unset).
    - You can set this in a `.env.local` file or your shell environment.
- **Running the frontend**
  - From `apps/web`:
    - `npm run dev`
      - Proxies all client‑side fetches (e.g. `fetch(\`\${API_BASE_URL}/api/v1/activities\`)`) to your running FastAPI instance.
  - Or via the root script:
    - `./restart.sh`
      - Starts both backend and frontend together, logging output to `logs/backend.log` and `logs/frontend.log`.
- **Key entrypoints**
  - `apps/web/src/app/page.tsx`
    - Chat panel calls `POST ${API_BASE_URL}/api/v1/activities`.
    - Tasks panel calls `GET/PATCH ${API_BASE_URL}/api/v1/tasks`.
    - History panel calls `GET ${API_BASE_URL}/api/v1/sessions`.
    - Settings panel calls `GET/PUT ${API_BASE_URL}/api/v1/settings`.
  - `apps/web/src/components/timeline/timeline-panel.tsx`
    - Fetches `GET ${API_BASE_URL}/events` with `child_id`, `start`, `end`.
  - `apps/web/src/app/knowledge/page.tsx`
    - Calls `GET /api/v1/knowledge/review` and `POST /api/v1/knowledge/{id}/confirm|reject|edit`.
  - `apps/web/src/app/share/[token]/page.tsx`
    - Calls `GET ${API_BASE_URL}/api/v1/share/{token}`.

## 3. Useful Logs and Temporary Files

- `logs/backend.log`
  - Uvicorn/FastAPI logs when started via `./restart.sh`.
- `logs/frontend.log`
  - Next.js dev logs when started via `./restart.sh`.
- `tmp/backend.pid`, `tmp/frontend.pid`
  - PID files tracked by `restart.sh` and `stop.sh`.

