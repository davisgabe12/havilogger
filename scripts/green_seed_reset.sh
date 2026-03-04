#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV_FILE="${ROOT_DIR}/apps/api/.env.local"
WEB_ENV_FILE="${ROOT_DIR}/apps/web/.env.local"
REPORT_DIR="${ROOT_DIR}/docs/active/green-proof"

MODE="${1:-reset}"
GREEN_MARKER="${GREEN_MARKER:-[GREEN-SEED]}"
GREEN_SEED_OWNER_EMAIL="${GREEN_SEED_OWNER_EMAIL:-gdavis12+greenowner@gethavi.test}"
GREEN_SEED_INVITEE_EMAIL="${GREEN_SEED_INVITEE_EMAIL:-gdavis12+greeninvitee@gethavi.test}"
GREEN_SEED_APPLY="${GREEN_SEED_APPLY:-0}"
GREEN_ALLOW_SHARED_DB="${GREEN_ALLOW_SHARED_DB:-0}"
GREEN_SEED_RUN_ID="${GREEN_SEED_RUN_ID:-$(date -u +%Y%m%d%H%M%S)}"

SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [[ "$MODE" != "reset" && "$MODE" != "seed" && "$MODE" != "reset-seed" ]]; then
  echo "[green-seed-reset] Usage: ./scripts/green_seed_reset.sh [reset|seed|reset-seed]"
  exit 1
fi

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    local trimmed="${line#${line%%[![:space:]]*}}"
    [[ -z "$trimmed" || "${trimmed:0:1}" == "#" ]] && continue
    [[ "$trimmed" != *=* ]] && continue
    local key="${trimmed%%=*}"
    local raw="${trimmed#*=}"
    key="${key%%[[:space:]]*}"
    raw="${raw%$'\r'}"
    raw="${raw#\"}"
    raw="${raw%\"}"
    raw="${raw#\'}"
    raw="${raw%\'}"
    if [[ -z "${!key:-}" ]]; then
      export "$key=$raw"
    fi
  done < "$file"
}

load_env_file "$API_ENV_FILE"
load_env_file "$WEB_ENV_FILE"

SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if ! command -v jq >/dev/null 2>&1; then
  echo "[green-seed-reset] jq is required"
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "[green-seed-reset] curl is required"
  exit 1
fi
if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "[green-seed-reset] Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  exit 1
fi

if [[ "$MODE" != "reset" ]]; then
  echo "[green-seed-reset] Mode '$MODE' is not implemented in slice 1. Use 'reset'."
  exit 2
fi

if [[ "$GREEN_SEED_APPLY" == "1" && "$GREEN_ALLOW_SHARED_DB" != "1" ]]; then
  echo "[green-seed-reset] Refusing to mutate shared Supabase without GREEN_ALLOW_SHARED_DB=1"
  echo "[green-seed-reset] Re-run with GREEN_SEED_APPLY=1 GREEN_ALLOW_SHARED_DB=1 after review."
  exit 3
fi

mkdir -p "$REPORT_DIR"
REPORT_FILE="${REPORT_DIR}/green-seed-reset-${GREEN_SEED_RUN_ID}.json"

SUPABASE_BASE="${SUPABASE_URL%/}"
REST_BASE="${SUPABASE_BASE}/rest/v1"

supabase_select_raw() {
  local table="$1"
  shift
  local -a params=("$@")
  local -a args=(
    -sS
    -G
    "${REST_BASE}/${table}"
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  )
  local p
  for p in "${params[@]}"; do
    args+=(--data-urlencode "$p")
  done
  curl "${args[@]}"
}

supabase_delete_by_filter() {
  local table="$1"
  local filter="$2"
  curl -sS -X DELETE "${REST_BASE}/${table}?${filter}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Prefer: return=minimal" \
    >/dev/null
}

collect_ids() {
  local table="$1"
  shift
  local payload
  payload="$(supabase_select_raw "$table" "select=id" "$@")"
  jq -r '.[].id // empty' <<<"$payload"
}

join_csv() {
  local IFS=,
  echo "$*"
}

chunked_delete_ids() {
  local table="$1"
  shift
  local -a ids=("$@")
  local total=0
  local idx=0
  local chunk_size=40

  while [[ $idx -lt ${#ids[@]} ]]; do
    local -a chunk=("${ids[@]:idx:chunk_size}")
    local csv
    csv="$(join_csv "${chunk[@]}")"
    local filter
    filter="id=in.(${csv})"
    supabase_delete_by_filter "$table" "$filter"
    total=$((total + ${#chunk[@]}))
    idx=$((idx + chunk_size))
  done

  echo "$total"
}

found_family_invites=0
found_tasks=0
found_timeline_events=0
found_conversation_sessions=0
found_conversation_messages_by_marker=0
found_conversation_messages_by_session=0

deleted_family_invites=0
deleted_tasks=0
deleted_timeline_events=0
deleted_conversation_sessions=0
deleted_conversation_messages_by_marker=0
deleted_conversation_messages_by_session=0

invite_ids=($(
  collect_ids "family_invites" \
    "or=(email.eq.${GREEN_SEED_OWNER_EMAIL},email.eq.${GREEN_SEED_INVITEE_EMAIL})"
))
found_family_invites="${#invite_ids[@]}"

task_ids=($(
  collect_ids "tasks" \
    "title=ilike.*${GREEN_MARKER}*"
))
found_tasks="${#task_ids[@]}"

timeline_ids=($(
  collect_ids "timeline_events" \
    "or=(title.ilike.*${GREEN_MARKER}*,detail.ilike.*${GREEN_MARKER}*)"
))
found_timeline_events="${#timeline_ids[@]}"

session_ids=($(
  collect_ids "conversation_sessions" \
    "title=ilike.*${GREEN_MARKER}*"
))
found_conversation_sessions="${#session_ids[@]}"

message_marker_ids=($(
  collect_ids "conversation_messages" \
    "content=ilike.*${GREEN_MARKER}*"
))
found_conversation_messages_by_marker="${#message_marker_ids[@]}"

message_session_ids=()
if [[ ${#session_ids[@]} -gt 0 ]]; then
  session_csv="$(join_csv "${session_ids[@]}")"
  message_session_ids=($(
    collect_ids "conversation_messages" \
      "session_id=in.(${session_csv})"
  ))
fi
found_conversation_messages_by_session="${#message_session_ids[@]}"

if [[ "$GREEN_SEED_APPLY" == "1" ]]; then
  if [[ ${#message_marker_ids[@]} -gt 0 ]]; then
    deleted_conversation_messages_by_marker="$(chunked_delete_ids "conversation_messages" "${message_marker_ids[@]}")"
  fi
  if [[ ${#message_session_ids[@]} -gt 0 ]]; then
    deleted_conversation_messages_by_session="$(chunked_delete_ids "conversation_messages" "${message_session_ids[@]}")"
  fi
  if [[ ${#session_ids[@]} -gt 0 ]]; then
    deleted_conversation_sessions="$(chunked_delete_ids "conversation_sessions" "${session_ids[@]}")"
  fi
  if [[ ${#timeline_ids[@]} -gt 0 ]]; then
    deleted_timeline_events="$(chunked_delete_ids "timeline_events" "${timeline_ids[@]}")"
  fi
  if [[ ${#task_ids[@]} -gt 0 ]]; then
    deleted_tasks="$(chunked_delete_ids "tasks" "${task_ids[@]}")"
  fi
  if [[ ${#invite_ids[@]} -gt 0 ]]; then
    deleted_family_invites="$(chunked_delete_ids "family_invites" "${invite_ids[@]}")"
  fi
fi

APPLY_BOOL=false
if [[ "$GREEN_SEED_APPLY" == "1" ]]; then
  APPLY_BOOL=true
fi

NOW_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
  --arg run_id "$GREEN_SEED_RUN_ID" \
  --arg generated_at "$NOW_UTC" \
  --arg mode "$MODE" \
  --arg supabase_url "$SUPABASE_URL" \
  --arg marker "$GREEN_MARKER" \
  --arg owner_email "$GREEN_SEED_OWNER_EMAIL" \
  --arg invitee_email "$GREEN_SEED_INVITEE_EMAIL" \
  --argjson apply "$APPLY_BOOL" \
  --argjson allow_shared_db "$([[ "$GREEN_ALLOW_SHARED_DB" == "1" ]] && echo true || echo false)" \
  --argjson invites_found "$found_family_invites" \
  --argjson invites_deleted "$deleted_family_invites" \
  --argjson tasks_found "$found_tasks" \
  --argjson tasks_deleted "$deleted_tasks" \
  --argjson timeline_found "$found_timeline_events" \
  --argjson timeline_deleted "$deleted_timeline_events" \
  --argjson sessions_found "$found_conversation_sessions" \
  --argjson sessions_deleted "$deleted_conversation_sessions" \
  --argjson messages_marker_found "$found_conversation_messages_by_marker" \
  --argjson messages_marker_deleted "$deleted_conversation_messages_by_marker" \
  --argjson messages_session_found "$found_conversation_messages_by_session" \
  --argjson messages_session_deleted "$deleted_conversation_messages_by_session" \
  '{
    run_id: $run_id,
    generated_at: $generated_at,
    mode: $mode,
    apply: $apply,
    guardrails: {
      allow_shared_db: $allow_shared_db,
      marker: $marker
    },
    scope: {
      seed_owner_email: $owner_email,
      seed_invitee_email: $invitee_email
    },
    supabase: {
      url: $supabase_url
    },
    tables: {
      family_invites: { found: $invites_found, deleted: $invites_deleted },
      tasks: { found: $tasks_found, deleted: $tasks_deleted },
      timeline_events: { found: $timeline_found, deleted: $timeline_deleted },
      conversation_sessions: { found: $sessions_found, deleted: $sessions_deleted },
      conversation_messages_by_marker: { found: $messages_marker_found, deleted: $messages_marker_deleted },
      conversation_messages_by_session: { found: $messages_session_found, deleted: $messages_session_deleted }
    }
  }' > "$REPORT_FILE"

echo "[green-seed-reset] mode=${MODE} apply=${GREEN_SEED_APPLY} marker=${GREEN_MARKER}"
echo "[green-seed-reset] report=${REPORT_FILE}"

if [[ "$GREEN_SEED_APPLY" != "1" ]]; then
  echo "[green-seed-reset] dry-run only. To apply deletes set GREEN_SEED_APPLY=1 GREEN_ALLOW_SHARED_DB=1"
fi
