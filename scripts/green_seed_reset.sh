#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV_FILE="${ROOT_DIR}/apps/api/.env.local"
WEB_ENV_FILE="${ROOT_DIR}/apps/web/.env.local"
REPORT_DIR="${ROOT_DIR}/docs/active/green-proof"

MODE="${1:-reset}"
GREEN_MARKER="${GREEN_MARKER:-[GREEN-SEED]}"
GREEN_SEED_OWNER_EMAIL="${GREEN_SEED_OWNER_EMAIL:-gdavis12+greenowner@gethavi.test}"
GREEN_SEED_OWNER_PASSWORD="${GREEN_SEED_OWNER_PASSWORD:-Lev2025!}"
GREEN_SEED_INVITEE_EMAIL="${GREEN_SEED_INVITEE_EMAIL:-gdavis12+greeninvitee@gethavi.test}"
GREEN_SEED_INVITEE_PASSWORD="${GREEN_SEED_INVITEE_PASSWORD:-Lev2025!}"
GREEN_SEED_FAMILY_NAME="${GREEN_SEED_FAMILY_NAME:-GREEN E2E Family [GREEN-SEED]}"
GREEN_SEED_APPLY="${GREEN_SEED_APPLY:-0}"
GREEN_ALLOW_SHARED_DB="${GREEN_ALLOW_SHARED_DB:-0}"
GREEN_SEED_RUN_ID="${GREEN_SEED_RUN_ID:-$(date -u +%Y%m%d%H%M%S)}"

SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}"
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
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if ! command -v jq >/dev/null 2>&1; then
  echo "[green-seed-reset] jq is required"
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "[green-seed-reset] curl is required"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "[green-seed-reset] python3 is required"
  exit 1
fi
if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "[green-seed-reset] Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  exit 1
fi
if [[ "$MODE" != "reset" && -z "$SUPABASE_ANON_KEY" ]]; then
  echo "[green-seed-reset] Missing SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY for seed modes"
  exit 1
fi

if [[ "$MODE" == "seed" || "$MODE" == "reset-seed" ]]; then
  if [[ "$GREEN_SEED_APPLY" != "1" ]]; then
    echo "[green-seed-reset] Seed modes are mutating operations. Re-run with GREEN_SEED_APPLY=1"
    exit 3
  fi
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
AUTH_BASE="${SUPABASE_BASE}/auth/v1"

now_iso() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

iso_plus_hour() {
  python3 - <<'PY'
from datetime import datetime, timezone, timedelta
print((datetime.now(timezone.utc) + timedelta(hours=1)).replace(microsecond=0).isoformat().replace('+00:00','Z'))
PY
}

urlencode() {
  python3 - <<'PY' "$1"
import sys
from urllib.parse import quote
print(quote(sys.argv[1], safe=''))
PY
}

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

supabase_insert() {
  local table="$1"
  local payload="$2"
  curl -sS -X POST "${REST_BASE}/${table}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    --data "$payload"
}

supabase_upsert() {
  local table="$1"
  local on_conflict="$2"
  local payload="$3"
  curl -sS -X POST "${REST_BASE}/${table}?on_conflict=$(urlencode "$on_conflict")" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=representation" \
    --data "$payload"
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

auth_admin_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local -a args=(
    -sS
    -X "$method"
    "${AUTH_BASE}/admin${path}"
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}"
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
  )
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  curl "${args[@]}"
}

assert_json_array_or_exit() {
  local payload="$1"
  local label="$2"
  if ! jq -e . >/dev/null 2>&1 <<<"$payload"; then
    echo "[green-seed-reset] Invalid JSON response from Supabase for ${label}" >&2
    exit 4
  fi
  local t
  t="$(jq -r 'type' <<<"$payload")"
  if [[ "$t" != "array" ]]; then
    echo "[green-seed-reset] Supabase query failed for ${label}: $(jq -c . <<<"$payload")" >&2
    exit 4
  fi
}

collect_ids() {
  local table="$1"
  shift
  local payload
  payload="$(supabase_select_raw "$table" "select=id" "$@")"
  assert_json_array_or_exit "$payload" "table=${table}"
  jq -r '.[].id // empty' <<<"$payload"
}

collect_family_ids_for_reset_scope() {
  local marker_payload name_payload
  marker_payload="$(supabase_select_raw "families" "select=id" "name=ilike.*${GREEN_MARKER}*")"
  assert_json_array_or_exit "$marker_payload" "table=families marker scope"
  name_payload="$(supabase_select_raw "families" "select=id" "name=eq.${GREEN_SEED_FAMILY_NAME}")"
  assert_json_array_or_exit "$name_payload" "table=families name scope"
  {
    jq -r '.[].id // empty' <<<"$marker_payload"
    jq -r '.[].id // empty' <<<"$name_payload"
  } | awk 'NF' | sort -u
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
    local csv filter
    csv="$(join_csv "${chunk[@]}")"
    filter="id=in.(${csv})"
    supabase_delete_by_filter "$table" "$filter"
    total=$((total + ${#chunk[@]}))
    idx=$((idx + chunk_size))
  done

  echo "$total"
}

find_auth_user_id_by_email() {
  local email="$1"
  local page=1
  local per_page=200
  while [[ $page -le 10 ]]; do
    local payload
    payload="$(auth_admin_request "GET" "/users?page=${page}&per_page=${per_page}")"
    if ! jq -e . >/dev/null 2>&1 <<<"$payload"; then
      echo ""
      return 0
    fi
    local id
    id="$(jq -r --arg email "$email" '.users[]? | select((.email // "") | ascii_downcase == ($email | ascii_downcase)) | .id' <<<"$payload" | head -n1)"
    if [[ -n "$id" ]]; then
      echo "$id"
      return 0
    fi
    local count
    count="$(jq -r '(.users // []) | length' <<<"$payload")"
    if [[ "$count" -lt "$per_page" ]]; then
      break
    fi
    page=$((page + 1))
  done
  echo ""
}

ensure_auth_user() {
  local email="$1"
  local password="$2"
  local role_hint="$3"
  local user_id
  user_id="$(find_auth_user_id_by_email "$email")"

  if [[ -z "$user_id" ]]; then
    local create_payload create_resp
    create_payload="$(jq -n --arg email "$email" --arg password "$password" --arg role_hint "$role_hint" '{email:$email,password:$password,email_confirm:true,user_metadata:{green_seed:true,role_hint:$role_hint}}')"
    create_resp="$(auth_admin_request "POST" "/users" "$create_payload")"
    user_id="$(jq -r '.id // empty' <<<"$create_resp")"
    if [[ -z "$user_id" ]]; then
      echo "[green-seed-reset] Failed to create auth user ${email}: $(jq -c . <<<"$create_resp")" >&2
      exit 4
    fi
  fi

  local update_payload update_resp
  update_payload="$(jq -n --arg password "$password" '{password:$password,email_confirm:true}')"
  update_resp="$(auth_admin_request "PUT" "/users/${user_id}" "$update_payload")"
  local updated_id
  updated_id="$(jq -r '.id // empty' <<<"$update_resp")"
  if [[ -z "$updated_id" ]]; then
    echo "[green-seed-reset] Failed to update auth user ${email}: $(jq -c . <<<"$update_resp")" >&2
    exit 4
  fi
  echo "$updated_id"
}

found_family_invites=0
found_tasks=0
found_timeline_events=0
found_conversation_sessions=0
found_conversation_messages_by_marker=0
found_conversation_messages_by_session=0
found_children=0
found_family_members=0
found_families=0

deleted_family_invites=0
deleted_tasks=0
deleted_timeline_events=0
deleted_conversation_sessions=0
deleted_conversation_messages_by_marker=0
deleted_conversation_messages_by_session=0
deleted_children=0
deleted_family_members=0
deleted_families=0

seed_owner_user_id=""
seed_invitee_user_id=""
seed_family_id=""
seed_child_primary_id=""
seed_child_secondary_id=""
seed_session_id=""
seed_task_id=""
seed_invite_id=""
family_scope_filter=""

run_reset_scope_collection() {
  family_ids=()
  for id in $(collect_family_ids_for_reset_scope); do
    family_ids+=("$id")
  done

  invite_ids_email=()
  for id in $(collect_ids "family_invites" "or=(email.eq.${GREEN_SEED_OWNER_EMAIL},email.eq.${GREEN_SEED_INVITEE_EMAIL})"); do
    invite_ids_email+=("$id")
  done

  message_marker_ids=()
  for id in $(collect_ids "conversation_messages" "content=ilike.*${GREEN_MARKER}*"); do
    message_marker_ids+=("$id")
  done

  task_ids=()
  timeline_ids=()
  session_ids=()
  message_session_ids=()
  child_ids=()
  invite_ids_family=()
  family_ids_rows=()
  family_scope_filter=""
  found_family_members=0

  if [[ ${#family_ids[@]} -gt 0 ]]; then
    family_csv="$(join_csv "${family_ids[@]}")"
    family_scope_filter="family_id=in.(${family_csv})"
    for id in $(collect_ids "tasks" "family_id=in.(${family_csv})"); do
      task_ids+=("$id")
    done
    for id in $(collect_ids "timeline_events" "family_id=in.(${family_csv})"); do
      timeline_ids+=("$id")
    done
    for id in $(collect_ids "conversation_sessions" "family_id=in.(${family_csv})"); do
      session_ids+=("$id")
    done
    for id in $(collect_ids "children" "family_id=in.(${family_csv})"); do
      child_ids+=("$id")
    done
    family_members_payload="$(supabase_select_raw "family_members" "select=user_id" "family_id=in.(${family_csv})")"
    assert_json_array_or_exit "$family_members_payload" "table=family_members"
    found_family_members="$(jq -r 'length' <<<"$family_members_payload")"
    for id in $(collect_ids "family_invites" "family_id=in.(${family_csv})"); do
      invite_ids_family+=("$id")
    done
    for id in $(collect_ids "families" "id=in.(${family_csv})"); do
      family_ids_rows+=("$id")
    done

    if [[ ${#session_ids[@]} -gt 0 ]]; then
      session_csv="$(join_csv "${session_ids[@]}")"
      for id in $(collect_ids "conversation_messages" "session_id=in.(${session_csv})"); do
        message_session_ids+=("$id")
      done
    fi
  fi

  conversation_message_ids=()
  while IFS= read -r id; do
    [[ -n "$id" ]] && conversation_message_ids+=("$id")
  done < <(printf "%s\n" "${message_marker_ids[@]-}" "${message_session_ids[@]-}" | awk 'NF' | sort -u)

  invite_ids=()
  while IFS= read -r id; do
    [[ -n "$id" ]] && invite_ids+=("$id")
  done < <(printf "%s\n" "${invite_ids_email[@]-}" "${invite_ids_family[@]-}" | awk 'NF' | sort -u)

  found_family_invites="${#invite_ids[@]}"
  found_tasks="${#task_ids[@]}"
  found_timeline_events="${#timeline_ids[@]}"
  found_conversation_sessions="${#session_ids[@]}"
  found_conversation_messages_by_marker="${#message_marker_ids[@]}"
  found_conversation_messages_by_session="${#message_session_ids[@]}"
  found_children="${#child_ids[@]}"
  found_families="${#family_ids_rows[@]}"
}

run_reset_scope_delete() {
  if [[ "$GREEN_SEED_APPLY" != "1" ]]; then
    return
  fi

  if [[ ${#conversation_message_ids[@]} -gt 0 ]]; then
    deleted_conversation_messages_by_session="$(chunked_delete_ids "conversation_messages" "${conversation_message_ids[@]}")"
    deleted_conversation_messages_by_marker="$deleted_conversation_messages_by_session"
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
  if [[ ${#session_ids[@]} -gt 0 ]]; then
    deleted_conversation_sessions="$(chunked_delete_ids "conversation_sessions" "${session_ids[@]}")"
  fi
  if [[ ${#child_ids[@]} -gt 0 ]]; then
    deleted_children="$(chunked_delete_ids "children" "${child_ids[@]}")"
  fi
  if [[ -n "$family_scope_filter" && "$found_family_members" -gt 0 ]]; then
    supabase_delete_by_filter "family_members" "$family_scope_filter"
    deleted_family_members="$found_family_members"
  fi
  if [[ ${#family_ids_rows[@]} -gt 0 ]]; then
    deleted_families="$(chunked_delete_ids "families" "${family_ids_rows[@]}")"
  fi
}

run_seed_scope_create() {
  seed_owner_user_id="$(ensure_auth_user "$GREEN_SEED_OWNER_EMAIL" "$GREEN_SEED_OWNER_PASSWORD" "owner")"
  seed_invitee_user_id="$(ensure_auth_user "$GREEN_SEED_INVITEE_EMAIL" "$GREEN_SEED_INVITEE_PASSWORD" "invitee")"

  local family_lookup family_payload family_create
  family_lookup="$(supabase_select_raw "families" "select=id,name" "name=eq.${GREEN_SEED_FAMILY_NAME}" "limit=1")"
  assert_json_array_or_exit "$family_lookup" "table=families seed lookup"
  seed_family_id="$(jq -r '.[0].id // empty' <<<"$family_lookup")"

  if [[ -z "$seed_family_id" ]]; then
    family_payload="$(jq -n --arg name "$GREEN_SEED_FAMILY_NAME" '{name:$name}')"
    family_create="$(supabase_insert "families" "$family_payload")"
    assert_json_array_or_exit "$family_create" "table=families seed create"
    seed_family_id="$(jq -r '.[0].id // empty' <<<"$family_create")"
    if [[ -z "$seed_family_id" ]]; then
      echo "[green-seed-reset] Failed to create seed family" >&2
      exit 4
    fi
  fi

  local owner_member_payload invitee_member_payload
  owner_member_payload="$(jq -n \
    --arg family_id "$seed_family_id" \
    --arg user_id "$seed_owner_user_id" \
    --arg email "$GREEN_SEED_OWNER_EMAIL" \
    '{family_id:$family_id,user_id:$user_id,role:"owner",is_primary:true,first_name:"Green",last_name:"Owner",email:$email,phone:"5550000001",relationship:"parent"}')"
  invitee_member_payload="$(jq -n \
    --arg family_id "$seed_family_id" \
    --arg user_id "$seed_invitee_user_id" \
    --arg email "$GREEN_SEED_INVITEE_EMAIL" \
    '{family_id:$family_id,user_id:$user_id,role:"member",is_primary:false,first_name:"Green",last_name:"Invitee",email:$email,phone:"5550000002",relationship:"caregiver"}')"

  _="$(supabase_upsert "family_members" "family_id,user_id" "$owner_member_payload")"
  _="$(supabase_upsert "family_members" "family_id,user_id" "$invitee_member_payload")"

  local child_primary_payload child_secondary_payload child_primary_created child_secondary_created
  child_primary_payload="$(jq -n \
    --arg family_id "$seed_family_id" \
    --arg first_name "River" \
    --arg last_name "Green" \
    --arg name "River Green" \
    --arg birth_date "2024-01-15" \
    --arg gender "girl" \
    --arg timezone "America/Los_Angeles" \
    '{family_id:$family_id,first_name:$first_name,last_name:$last_name,name:$name,birth_date:$birth_date,due_date:null,gender:$gender,birth_weight:7.5,birth_weight_unit:"lb",latest_weight:12.3,latest_weight_date:null,timezone:$timezone,routine_eligible:false}')"
  child_secondary_payload="$(jq -n \
    --arg family_id "$seed_family_id" \
    --arg first_name "Skye" \
    --arg last_name "Green" \
    --arg name "Skye Green" \
    --arg birth_date "2025-09-23" \
    --arg due_date "2025-10-20" \
    --arg gender "boy" \
    --arg timezone "America/Los_Angeles" \
    '{family_id:$family_id,first_name:$first_name,last_name:$last_name,name:$name,birth_date:$birth_date,due_date:$due_date,gender:$gender,birth_weight:6.9,birth_weight_unit:"lb",latest_weight:8.4,latest_weight_date:null,timezone:$timezone,routine_eligible:false}')"

  child_primary_created="$(supabase_insert "children" "$child_primary_payload")"
  child_secondary_created="$(supabase_insert "children" "$child_secondary_payload")"
  assert_json_array_or_exit "$child_primary_created" "table=children primary seed"
  assert_json_array_or_exit "$child_secondary_created" "table=children secondary seed"
  seed_child_primary_id="$(jq -r '.[0].id // empty' <<<"$child_primary_created")"
  seed_child_secondary_id="$(jq -r '.[0].id // empty' <<<"$child_secondary_created")"

  if [[ -z "$seed_child_primary_id" || -z "$seed_child_secondary_id" ]]; then
    echo "[green-seed-reset] Failed to create seed children" >&2
    exit 4
  fi

  local timestamp_iso remind_iso session_payload session_created
  timestamp_iso="$(now_iso)"
  remind_iso="$(iso_plus_hour)"

  session_payload="$(jq -n \
    --arg family_id "$seed_family_id" \
    --arg child_id "$seed_child_primary_id" \
    --arg user_id "$seed_owner_user_id" \
    --arg ts "$timestamp_iso" \
    --arg title "${GREEN_MARKER} Baseline chat" \
    '{family_id:$family_id,child_id:$child_id,user_id:$user_id,title:$title,last_message_at:$ts,created_at:$ts,updated_at:$ts}')"
  session_created="$(supabase_insert "conversation_sessions" "$session_payload")"
  assert_json_array_or_exit "$session_created" "table=conversation_sessions seed"
  seed_session_id="$(jq -r '.[0].id // empty' <<<"$session_created")"

  if [[ -z "$seed_session_id" ]]; then
    echo "[green-seed-reset] Failed to create seed conversation session" >&2
    exit 4
  fi

  local user_message_payload assistant_message_payload
  user_message_payload="$(jq -n \
    --arg session_id "$seed_session_id" \
    --arg user_id "$seed_owner_user_id" \
    --arg ts "$timestamp_iso" \
    --arg content "${GREEN_MARKER} baby pooped at 3pm" \
    '{session_id:$session_id,user_id:$user_id,role:"user",content:$content,intent:"logging",created_at:$ts}')"
  assistant_message_payload="$(jq -n \
    --arg session_id "$seed_session_id" \
    --arg ts "$timestamp_iso" \
    --arg content "${GREEN_MARKER} Logged it. Want a reminder?" \
    '{session_id:$session_id,user_id:null,role:"assistant",content:$content,intent:"logging",created_at:$ts}')"
  local user_message_created assistant_message_created
  user_message_created="$(supabase_insert "conversation_messages" "$user_message_payload")"
  assistant_message_created="$(supabase_insert "conversation_messages" "$assistant_message_payload")"
  assert_json_array_or_exit "$user_message_created" "table=conversation_messages seed user"
  assert_json_array_or_exit "$assistant_message_created" "table=conversation_messages seed assistant"

  local task_payload task_created
  task_payload="$(jq -n \
    --arg family_id "$seed_family_id" \
    --arg child_id "$seed_child_primary_id" \
    --arg owner_user_id "$seed_owner_user_id" \
    --arg remind_iso "$remind_iso" \
    --arg title "${GREEN_MARKER} Pack daycare bag" \
    '{family_id:$family_id,child_id:$child_id,title:$title,status:"open",due_at:null,remind_at:$remind_iso,reminder_channel:"push",is_recurring:false,recurrence_rule:null,created_by_user_id:$owner_user_id,assigned_to_user_id:$owner_user_id}')"
  task_created="$(supabase_insert "tasks" "$task_payload")"
  assert_json_array_or_exit "$task_created" "table=tasks seed"
  seed_task_id="$(jq -r '.[0].id // empty' <<<"$task_created")"

  local invite_payload invite_created invite_token
  invite_token="$(python3 - <<'PY'
import uuid
print(uuid.uuid4().hex)
PY
)"
  invite_payload="$(jq -n \
    --arg family_id "$seed_family_id" \
    --arg email "$GREEN_SEED_INVITEE_EMAIL" \
    --arg invited_by "$seed_owner_user_id" \
    --arg token "$invite_token" \
    '{family_id:$family_id,email:$email,role:"member",token:$token,invited_by:$invited_by}')"
  invite_created="$(supabase_insert "family_invites" "$invite_payload")"
  assert_json_array_or_exit "$invite_created" "table=family_invites seed"
  seed_invite_id="$(jq -r '.[0].id // empty' <<<"$invite_created")"
}

family_ids=()
invite_ids_email=()
message_marker_ids=()
task_ids=()
timeline_ids=()
session_ids=()
message_session_ids=()
conversation_message_ids=()
child_ids=()
invite_ids_family=()
invite_ids=()
family_ids_rows=()

if [[ "$MODE" == "reset" ]]; then
  run_reset_scope_collection
  run_reset_scope_delete
elif [[ "$MODE" == "seed" ]]; then
  run_reset_scope_collection
  run_reset_scope_delete
  run_seed_scope_create
  run_reset_scope_collection
elif [[ "$MODE" == "reset-seed" ]]; then
  run_reset_scope_collection
  run_reset_scope_delete
  run_seed_scope_create
  run_reset_scope_collection
fi

APPLY_BOOL=false
if [[ "$GREEN_SEED_APPLY" == "1" ]]; then
  APPLY_BOOL=true
fi
ALLOW_BOOL=false
if [[ "$GREEN_ALLOW_SHARED_DB" == "1" ]]; then
  ALLOW_BOOL=true
fi
NOW_UTC="$(now_iso)"

jq -n \
  --arg run_id "$GREEN_SEED_RUN_ID" \
  --arg generated_at "$NOW_UTC" \
  --arg mode "$MODE" \
  --arg supabase_url "$SUPABASE_URL" \
  --arg marker "$GREEN_MARKER" \
  --arg family_name "$GREEN_SEED_FAMILY_NAME" \
  --arg owner_email "$GREEN_SEED_OWNER_EMAIL" \
  --arg invitee_email "$GREEN_SEED_INVITEE_EMAIL" \
  --arg owner_user_id "$seed_owner_user_id" \
  --arg invitee_user_id "$seed_invitee_user_id" \
  --arg family_id "$seed_family_id" \
  --arg child_primary_id "$seed_child_primary_id" \
  --arg child_secondary_id "$seed_child_secondary_id" \
  --arg session_id "$seed_session_id" \
  --arg task_id "$seed_task_id" \
  --arg invite_id "$seed_invite_id" \
  --argjson apply "$APPLY_BOOL" \
  --argjson allow_shared_db "$ALLOW_BOOL" \
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
  --argjson children_found "$found_children" \
  --argjson children_deleted "$deleted_children" \
  --argjson family_members_found "$found_family_members" \
  --argjson family_members_deleted "$deleted_family_members" \
  --argjson families_found "$found_families" \
  --argjson families_deleted "$deleted_families" \
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
      family_name: $family_name,
      seed_owner_email: $owner_email,
      seed_invitee_email: $invitee_email
    },
    supabase: {
      url: $supabase_url
    },
    reset: {
      tables: {
        family_invites: { found: $invites_found, deleted: $invites_deleted },
        tasks: { found: $tasks_found, deleted: $tasks_deleted },
        timeline_events: { found: $timeline_found, deleted: $timeline_deleted },
        conversation_sessions: { found: $sessions_found, deleted: $sessions_deleted },
        conversation_messages_by_marker: { found: $messages_marker_found, deleted: $messages_marker_deleted },
        conversation_messages_by_session: { found: $messages_session_found, deleted: $messages_session_deleted },
        children: { found: $children_found, deleted: $children_deleted },
        family_members: { found: $family_members_found, deleted: $family_members_deleted },
        families: { found: $families_found, deleted: $families_deleted }
      }
    },
    seed: {
      owner_user_id: (if $owner_user_id == "" then null else $owner_user_id end),
      invitee_user_id: (if $invitee_user_id == "" then null else $invitee_user_id end),
      family_id: (if $family_id == "" then null else $family_id end),
      child_primary_id: (if $child_primary_id == "" then null else $child_primary_id end),
      child_secondary_id: (if $child_secondary_id == "" then null else $child_secondary_id end),
      session_id: (if $session_id == "" then null else $session_id end),
      task_id: (if $task_id == "" then null else $task_id end),
      invite_id: (if $invite_id == "" then null else $invite_id end)
    }
  }' > "$REPORT_FILE"

echo "[green-seed-reset] mode=${MODE} apply=${GREEN_SEED_APPLY} marker=${GREEN_MARKER}"
echo "[green-seed-reset] report=${REPORT_FILE}"

if [[ "$MODE" == "reset" && "$GREEN_SEED_APPLY" != "1" ]]; then
  echo "[green-seed-reset] dry-run only. To apply deletes set GREEN_SEED_APPLY=1 GREEN_ALLOW_SHARED_DB=1"
fi
