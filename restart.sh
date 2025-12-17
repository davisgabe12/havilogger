#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TMP_DIR="$ROOT_DIR/tmp"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PID_FILE="$TMP_DIR/backend.pid"
FRONTEND_PID_FILE="$TMP_DIR/frontend.pid"

mkdir -p "$LOG_DIR" "$TMP_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

wait_for_termination() {
  local pid="$1"
  local name="$2"
  local attempts=0
  while kill -0 "$pid" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 20 ]; then
      log "Force killing $name (PID $pid)"
      kill -9 "$pid" 2>/dev/null || true
      break
    fi
    sleep 0.25
  done
}

stop_service() {
  local name="$1"
  local pid_file="$2"
  local pattern="$3"
  local stopped=false

  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file")"
    if kill -0 "$pid" 2>/dev/null; then
      log "Stopping $name (PID $pid from $pid_file)..."
      kill "$pid" 2>/dev/null || true
      wait_for_termination "$pid" "$name"
      stopped=true
    fi
    rm -f "$pid_file"
  fi

  if [ "$stopped" = false ]; then
    while IFS= read -r pid; do
      [ -z "${pid:-}" ] && continue
      if kill -0 "$pid" 2>/dev/null; then
        log "Stopping $name (PID $pid matched pattern '$pattern')..."
        kill "$pid" 2>/dev/null || true
        wait_for_termination "$pid" "$name"
        stopped=true
      fi
    done < <(pgrep -f "$pattern" 2>/dev/null || true)
  fi

  if [ "$stopped" = true ]; then
    log "$name stopped."
  else
    log "No running $name process detected."
  fi
}

start_backend() {
  if [ ! -f "$ROOT_DIR/.venv/bin/activate" ]; then
    log "Python virtual environment not found at .venv. Aborting."
    exit 1
  fi
  local host="${HOST:-127.0.0.1}"

  log "Starting backend (uvicorn)..."
  echo "" >>"$BACKEND_LOG"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] --- Backend restart ---" >>"$BACKEND_LOG"
  nohup bash -c "
    set -euo pipefail
    source \"$ROOT_DIR/.venv/bin/activate\"
    cd \"$ROOT_DIR/apps/api\"
    exec uvicorn app.main:app --host \"$host\" --port 8000
  " >>"$BACKEND_LOG" 2>&1 &
  local backend_pid=$!
  echo "$backend_pid" >"$BACKEND_PID_FILE"
  log "Backend started (PID $backend_pid). Logs: $BACKEND_LOG"
}

start_frontend() {
  log "Starting frontend (Next.js dev server)..."
  echo "" >>"$FRONTEND_LOG"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] --- Frontend restart ---" >>"$FRONTEND_LOG"
  nohup bash -c "
    set -euo pipefail
    cd \"$ROOT_DIR/apps/web\"
    exec npm run dev
  " >>"$FRONTEND_LOG" 2>&1 &
  local frontend_pid=$!
  echo "$frontend_pid" >"$FRONTEND_PID_FILE"
  log "Frontend started (PID $frontend_pid). Logs: $FRONTEND_LOG"
}

log "Stopping backend if running..."
stop_service "backend" "$BACKEND_PID_FILE" "uvicorn app.main:app"

log "Stopping frontend if running..."
stop_service "frontend" "$FRONTEND_PID_FILE" "next dev"

start_backend
start_frontend

log "Restart complete."
