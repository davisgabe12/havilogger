#!/bin/bash
# Usage:
#   FORCE_RESTART=1 ./scripts/e2e_green.sh
#   API_PORT=8001 WEB_PORT=3002 ./scripts/e2e_green.sh
# Artifacts/logs:
#   Playwright: apps/web/test-results/** (trace.zip, error-context.md)
#   API log: /tmp/havi-api.log
#   Web log: /tmp/havi-web.log
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_CMD="$ROOT_DIR/apps/api/scripts/run_local.sh"
WEB_DIR="$ROOT_DIR/apps/web"

API_PID=""
WEB_PID=""
API_STARTED=0
WEB_STARTED=0

API_CANDIDATES=(8000 8001 8002 8010 8011 8100)
WEB_CANDIDATES=(3001 3002 3003 3010 3011 3100)
FORCE_RESTART="${FORCE_RESTART:-0}"
API_PORT="${API_PORT:-}"
WEB_PORT="${WEB_PORT:-}"
export GREEN_EXISTING_EMAIL="gdavis12+77@gmail.com"
export GREEN_EXISTING_PASSWORD="Lev2025"

usage_note() {
  echo "Usage: FORCE_RESTART=1 ./scripts/e2e_green.sh"
  echo "       API_PORT=8001 WEB_PORT=3002 ./scripts/e2e_green.sh"
}

cleanup() {
  if [[ "$WEB_STARTED" -eq 1 && -n "$WEB_PID" ]]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  if [[ "$API_STARTED" -eq 1 && -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":${port}" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[e2e] killing PID(s) ${pids} on port ${port}"
    kill -9 $pids 2>/dev/null || true
  fi
  for _ in {1..10}; do
    if [[ -z "$(lsof -ti ":${port}" 2>/dev/null || true)" ]]; then
      echo "[e2e] port ${port} is free"
      return 0
    fi
    sleep 0.5
  done
  echo "[e2e] timeout waiting for port ${port} to free" >&2
  return 1
}

pick_port() {
  local candidates=("$@")
  local port
  for port in "${candidates[@]}"; do
    if [[ -z "$(lsof -ti ":${port}" 2>/dev/null || true)" ]]; then
      echo "$port"
      return 0
    fi
  done
  echo ""
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts=0
  until curl -sf "$url" >/dev/null; do
    attempts=$((attempts + 1))
    if [[ $attempts -ge 60 ]]; then
      echo "[error] Timed out waiting for $label at $url" >&2
      return 1
    fi
    sleep 1
  done
}

print_logs_on_failure() {
  echo "---- /tmp/havi-api.log (last 100 lines) ----" >&2
  tail -n 100 /tmp/havi-api.log 2>/dev/null || true
  echo "---- /tmp/havi-web.log (last 100 lines) ----" >&2
  tail -n 100 /tmp/havi-web.log 2>/dev/null || true
}

if [[ -z "$API_PORT" ]]; then
  API_PORT="$(pick_port "${API_CANDIDATES[@]}")"
  if [[ -z "$API_PORT" ]]; then
    API_PORT="8000"
  fi
fi

if [[ -z "$WEB_PORT" ]]; then
  WEB_PORT="$(pick_port "${WEB_CANDIDATES[@]}")"
  if [[ -z "$WEB_PORT" ]]; then
    WEB_PORT="3001"
  fi
fi

API_STATUS="reused"
WEB_STATUS="reused"

if [[ -n "$(lsof -ti ":${API_PORT}" 2>/dev/null || true)" ]]; then
  if [[ "$FORCE_RESTART" -eq 1 ]]; then
    kill_port "$API_PORT"
    API_STATUS="restarted"
  else
    if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
      API_STATUS="reused"
    else
      kill_port "$API_PORT"
      API_STATUS="restarted"
    fi
  fi
else
  API_STATUS="restarted"
fi

if [[ -n "$(lsof -ti ":${WEB_PORT}" 2>/dev/null || true)" ]]; then
  if [[ "$FORCE_RESTART" -eq 1 ]]; then
    kill_port "$WEB_PORT"
    WEB_STATUS="restarted"
  else
    if curl -sf "http://127.0.0.1:${WEB_PORT}/" >/dev/null; then
      WEB_STATUS="reused"
    else
      kill_port "$WEB_PORT"
      WEB_STATUS="restarted"
    fi
  fi
else
  WEB_STATUS="restarted"
fi

echo "API: :${API_PORT} (${API_STATUS})"
echo "WEB: :${WEB_PORT} (${WEB_STATUS})"

if [[ "$API_STATUS" == "restarted" ]]; then
  (
    cd "$ROOT_DIR/apps/api"
    set -a
    source .env.local
    set +a
    python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port "$API_PORT"
  ) >/tmp/havi-api.log 2>&1 &
  API_PID=$!
  API_STARTED=1
  if ! wait_for_url "http://127.0.0.1:${API_PORT}/health" "api"; then
    print_logs_on_failure
    exit 1
  fi
fi

if [[ "$WEB_STATUS" == "restarted" ]]; then
  (
    cd "$WEB_DIR"
    PORT="$WEB_PORT" npm run dev -- --port "$WEB_PORT"
  ) >/tmp/havi-web.log 2>&1 &
  WEB_PID=$!
  WEB_STARTED=1
  if ! wait_for_url "http://127.0.0.1:${WEB_PORT}" "web"; then
    print_logs_on_failure
    exit 1
  fi
fi

cd "$WEB_DIR"
export PLAYWRIGHT_BASE_URL="http://127.0.0.1:${WEB_PORT}"
PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL}" \
  GREEN_EXISTING_EMAIL="${GREEN_EXISTING_EMAIL:-}" \
  GREEN_EXISTING_PASSWORD="${GREEN_EXISTING_PASSWORD:-}" \
  GREEN_INVITEE_EMAIL="${GREEN_INVITEE_EMAIL:-}" \
  GREEN_INVITEE_PASSWORD="${GREEN_INVITEE_PASSWORD:-}" \
  npx playwright test -g green --reporter=line
