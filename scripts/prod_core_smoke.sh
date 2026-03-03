#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ENV_FILE="${ROOT_DIR}/apps/web/.env.local"

API_BASE_URL="${HAVI_PROD_API_BASE_URL:-https://api-production-0a5d.up.railway.app}"
SITE_BASE_URL="${HAVI_PROD_SITE_BASE_URL:-https://gethavi.com}"
RUN_LABEL="${HAVI_SMOKE_LABEL:-manual-$(date +%Y%m%d%H%M%S)}"

EXISTING_EMAIL="${HAVI_SMOKE_EXISTING_EMAIL:-gdavis12+smoke0303a@gmail.com}"
EXISTING_PASSWORD="${HAVI_SMOKE_EXISTING_PASSWORD:-Lev2025!}"

SMOKE_SUFFIX="$(date +%Y%m%d%H%M%S)"
NEW_EMAIL_DEFAULT="gdavis12+prodsmoke${SMOKE_SUFFIX}@gmail.com"
NEW_EMAIL="${HAVI_SMOKE_NEW_EMAIL:-$NEW_EMAIL_DEFAULT}"
NEW_PASSWORD="${HAVI_SMOKE_NEW_PASSWORD:-Lev2025!}"

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
REPORT_DIR="${ROOT_DIR}/docs/active/green-proof"
REPORT_FILE_DEFAULT="${REPORT_DIR}/prod-core-smoke-${RUN_LABEL}.json"
REPORT_FILE="${HAVI_SMOKE_OUT:-$REPORT_FILE_DEFAULT}"

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_ANON_KEY" ]]; then
  if [[ -f "$WEB_ENV_FILE" ]]; then
    [[ -z "$SUPABASE_URL" ]] && SUPABASE_URL="$(awk -F= '/^NEXT_PUBLIC_SUPABASE_URL=/{print $2}' "$WEB_ENV_FILE" | tail -n 1)"
    [[ -z "$SUPABASE_ANON_KEY" ]] && SUPABASE_ANON_KEY="$(awk -F= '/^NEXT_PUBLIC_SUPABASE_ANON_KEY=/{print $2}' "$WEB_ENV_FILE" | tail -n 1)"
  fi
fi

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_ANON_KEY" ]]; then
  echo "[fail] Missing SUPABASE_URL or SUPABASE_ANON_KEY."
  echo "Set them directly or ensure apps/web/.env.local has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[fail] jq is required for prod_core_smoke.sh"
  exit 1
fi

REQ_COUNT=0
SITE_ROOT_STATUS=""
SIGN_IN_STATUS=""
SIGN_UP_STATUS=""
API_HEALTH_STATUS=""
FLOW_RESULTS_JSON=()

http_code() {
  local url="$1"
  curl -sS -o /dev/null -w "%{http_code}" "$url" || echo "000"
}

assert_http_200() {
  local name="$1"
  local url="$2"
  local status_var="${3:-}"
  local code
  code="$(http_code "$url")"
  if [[ "$code" != "200" ]]; then
    echo "[fail] ${name}: expected 200, got ${code} (${url})"
    exit 1
  fi
  echo "[pass] ${name}: 200"
  if [[ -n "$status_var" ]]; then
    printf -v "$status_var" "%s" "$code"
  fi
}

curl_json() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  shift 3 || true
  local -a extra_headers=("$@")
  local -a args=(-sS -X "$method" "$url" -H "apikey: ${SUPABASE_ANON_KEY}")

  local header
  for header in "${extra_headers[@]}"; do
    args+=(-H "$header")
  done
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" --data "$body")
  fi
  curl "${args[@]}"
}

auth_login() {
  local email="$1"
  local password="$2"
  local response
  response="$(curl_json "POST" "${SUPABASE_URL}/auth/v1/token?grant_type=password" "{\"email\":\"${email}\",\"password\":\"${password}\"}" "Authorization: Bearer ${SUPABASE_ANON_KEY}")"
  local token
  token="$(jq -r '.access_token // empty' <<<"$response")"
  if [[ -z "$token" ]]; then
    echo "[fail] Existing account login failed for ${email}"
    echo "$response" | jq -r '.error_description // .msg // .error // "Unknown login error"'
    exit 1
  fi
  echo "$token"
}

auth_signup() {
  local email="$1"
  local password="$2"
  local response
  response="$(curl_json "POST" "${SUPABASE_URL}/auth/v1/signup" "{\"email\":\"${email}\",\"password\":\"${password}\"}" "Authorization: Bearer ${SUPABASE_ANON_KEY}")"
  local token
  token="$(jq -r '.access_token // empty' <<<"$response")"
  if [[ -z "$token" ]]; then
    echo "[fail] Signup did not return access_token for ${email}"
    echo "$response" | jq -r '.msg // .error_description // .error // "Unknown signup error"'
    echo "If email confirmation is enabled, disable it for launch-speed smoke or set a confirmed account."
    exit 1
  fi
  echo "$token"
}

api_call() {
  local method="$1"
  local path="$2"
  local token="$3"
  local family_id="${4:-}"
  local child_id="${5:-}"
  local payload="${6:-}"

  local url="${API_BASE_URL}${path}"
  local -a args=(-sS -X "$method" "$url" -H "Authorization: Bearer ${token}")
  [[ -n "$family_id" ]] && args+=(-H "X-Havi-Family-Id: ${family_id}")
  [[ -n "$child_id" ]] && args+=(-H "X-Havi-Child-Id: ${child_id}")
  if [[ -n "$payload" ]]; then
    args+=(-H "Content-Type: application/json" --data "$payload")
  fi

  local raw
  raw="$(curl "${args[@]}" -w $'\n%{http_code}')"
  API_BODY="${raw%$'\n'*}"
  API_STATUS="${raw##*$'\n'}"
}

assert_status_200() {
  local label="$1"
  if [[ "$API_STATUS" != "200" ]]; then
    echo "[fail] ${label}: expected 200, got ${API_STATUS}"
    echo "$API_BODY" | jq -C . 2>/dev/null || echo "$API_BODY"
    exit 1
  fi
  echo "[pass] ${label}: 200"
}

assert_status_200_quiet() {
  if [[ "$API_STATUS" != "200" ]]; then
    echo "[fail] Expected 200, got ${API_STATUS}"
    echo "$API_BODY" | jq -C . 2>/dev/null || echo "$API_BODY"
    exit 1
  fi
}

count_events() {
  local token="$1"
  local family_id="$2"
  local child_id="$3"
  local start_iso="$4"
  local end_iso="$5"
  api_call "GET" "/events?start=${start_iso}&end=${end_iso}&child_id=${child_id}" "$token" "$family_id" "$child_id"
  assert_status_200_quiet
  jq -r 'length' <<<"$API_BODY"
}

run_core_flow() {
  local mode="$1"
  local label="$2"
  local email="$3"
  local password="$4"
  local token=""

  echo ""
  echo "== ${label} flow (${mode}) =="
  if [[ "$mode" == "login" ]]; then
    token="$(auth_login "$email" "$password")"
  else
    token="$(auth_signup "$email" "$password")"
  fi
  echo "[pass] Auth token acquired for ${email}"

  local family_name="Davis Test Family ${label} ${SMOKE_SUFFIX}"
  api_call "POST" "/api/v1/families" "$token" "" "" "{\"name\":\"${family_name}\"}"
  assert_status_200 "Create family"
  local family_id
  family_id="$(jq -r '.id // empty' <<<"$API_BODY")"
  if [[ -z "$family_id" ]]; then
    echo "[fail] Family id missing in create response"
    echo "$API_BODY"
    exit 1
  fi

  local child_first_name
  local child_last_name
  local dob
  local birth_weight
  if [[ "$mode" == "login" ]]; then
    child_first_name="Noah"
    child_last_name="Davis"
    dob="2024-03-14"
    birth_weight="6.7"
  else
    child_first_name="Lev"
    child_last_name="Davis"
    dob="2025-09-23"
    birth_weight="6.9"
  fi

  local settings_payload
  settings_payload="$(jq -n \
    --arg caregiver_first "Gabe" \
    --arg caregiver_last "Davis" \
    --arg child_first "$child_first_name" \
    --arg child_last "$child_last_name" \
    --arg birth_date "$dob" \
    --arg gender "boy" \
    --arg timezone "America/Los_Angeles" \
    --argjson birth_weight "$birth_weight" \
    '{caregiver:{first_name:$caregiver_first,last_name:$caregiver_last,email:"",phone:"",relationship:"dad"},child:{first_name:$child_first,last_name:$child_last,birth_date:$birth_date,due_date:"",gender:$gender,birth_weight:$birth_weight,birth_weight_unit:"lb",timezone:$timezone}}')"

  api_call "PUT" "/api/v1/settings" "$token" "$family_id" "" "$settings_payload"
  assert_status_200 "Save settings/child"
  local child_id
  child_id="$(jq -r '.child.id // empty' <<<"$API_BODY")"
  if [[ -z "$child_id" ]]; then
    echo "[fail] Child id missing after settings save"
    echo "$API_BODY"
    exit 1
  fi

  api_call "POST" "/api/v1/conversations?child_id=${child_id}" "$token" "$family_id" "$child_id"
  assert_status_200 "Create conversation"
  local conversation_id
  conversation_id="$(jq -r '.id // empty' <<<"$API_BODY")"
  if [[ -z "$conversation_id" ]]; then
    echo "[fail] Conversation id missing"
    echo "$API_BODY"
    exit 1
  fi

  local start_iso
  local end_iso
  start_iso="$(date -u -v-1H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '1 hour ago' +"%Y-%m-%dT%H:%M:%SZ")"
  end_iso="$(date -u -v+2H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '2 hours' +"%Y-%m-%dT%H:%M:%SZ")"

  local before_count
  before_count="$(count_events "$token" "$family_id" "$child_id" "$start_iso" "$end_iso")"

  local tracking_payload
  tracking_payload="$(jq -n \
    --arg message "Baby pooped at 3pm (${label})" \
    --arg timezone "America/Los_Angeles" \
    --arg child_id "$child_id" \
    --arg conversation_id "$conversation_id" \
    --arg child_name "$child_first_name" \
    --arg child_dob "$dob" \
    '{message:$message,timezone:$timezone,source:"chat",child_id:$child_id,conversation_id:$conversation_id,model_request:{user_message:$message,user_preferences:null,child:{name:$child_name,dob:$child_dob,dueDate:null},feedback_summary:null}}')"

  api_call "POST" "/api/v1/activities" "$token" "$family_id" "$child_id" "$tracking_payload"
  assert_status_200 "Tracking message"
  local tracking_intent tracking_actions
  tracking_intent="$(jq -r '.intent // empty' <<<"$API_BODY")"
  tracking_actions="$(jq -r '.actions | length' <<<"$API_BODY")"
  if [[ "$tracking_intent" != "logging" || "$tracking_actions" -lt 1 ]]; then
    echo "[fail] Tracking classification unexpected intent=${tracking_intent} actions=${tracking_actions}"
    echo "$API_BODY" | jq -C . || true
    exit 1
  fi

  local after_tracking_count
  after_tracking_count="$(count_events "$token" "$family_id" "$child_id" "$start_iso" "$end_iso")"
  echo "[pass] Events list: 200"
  if [[ "$after_tracking_count" -lt $((before_count + 1)) ]]; then
    echo "[fail] Expected tracking to add at least one event (before=${before_count}, after=${after_tracking_count})"
    exit 1
  fi
  echo "[pass] Tracking persisted event count before=${before_count} after=${after_tracking_count}"

  local guidance_payload
  guidance_payload="$(jq -n \
    --arg message "What should I do if he is waking at night?" \
    --arg timezone "America/Los_Angeles" \
    --arg child_id "$child_id" \
    --arg conversation_id "$conversation_id" \
    --arg child_name "$child_first_name" \
    --arg child_dob "$dob" \
    '{message:$message,timezone:$timezone,source:"chat",child_id:$child_id,conversation_id:$conversation_id,model_request:{user_message:$message,user_preferences:null,child:{name:$child_name,dob:$child_dob,dueDate:null},feedback_summary:null}}')"

  api_call "POST" "/api/v1/activities" "$token" "$family_id" "$child_id" "$guidance_payload"
  assert_status_200 "Guidance message"
  local guidance_intent guidance_actions
  guidance_intent="$(jq -r '.intent // empty' <<<"$API_BODY")"
  guidance_actions="$(jq -r '.actions | length' <<<"$API_BODY")"
  if [[ "$guidance_actions" -ne 0 ]]; then
    echo "[fail] Guidance created actions unexpectedly (intent=${guidance_intent}, actions=${guidance_actions})"
    echo "$API_BODY" | jq -C . || true
    exit 1
  fi

  local after_guidance_count
  after_guidance_count="$(count_events "$token" "$family_id" "$child_id" "$start_iso" "$end_iso")"
  echo "[pass] Events list: 200"
  if [[ "$after_guidance_count" -ne "$after_tracking_count" ]]; then
    echo "[fail] Guidance mutated timeline events (after_tracking=${after_tracking_count}, after_guidance=${after_guidance_count})"
    exit 1
  fi
  echo "[pass] Guidance did not add timeline events"

  local task_payload
  task_payload="$(jq -n --arg title "Buy diapers (${label})" --arg child_id "$child_id" '{title:$title,child_id:$child_id}')"
  api_call "POST" "/api/v1/tasks" "$token" "$family_id" "$child_id" "$task_payload"
  assert_status_200 "Create task"
  local task_id
  task_id="$(jq -r '.id // empty' <<<"$API_BODY")"
  if [[ -z "$task_id" ]]; then
    echo "[fail] Task id missing after create"
    echo "$API_BODY" | jq -C . || true
    exit 1
  fi
  echo "[pass] Core flow complete for ${label} (family=${family_id}, child=${child_id}, task=${task_id})"

  FLOW_RESULTS_JSON+=("$(jq -n \
    --arg label "$label" \
    --arg mode "$mode" \
    --arg email "$email" \
    --arg family_id "$family_id" \
    --arg child_id "$child_id" \
    --arg conversation_id "$conversation_id" \
    --arg task_id "$task_id" \
    --arg tracking_intent "$tracking_intent" \
    --arg guidance_intent "$guidance_intent" \
    --argjson before_count "$before_count" \
    --argjson after_tracking_count "$after_tracking_count" \
    --argjson after_guidance_count "$after_guidance_count" \
    --argjson tracking_actions "$tracking_actions" \
    --argjson guidance_actions "$guidance_actions" \
    '{label:$label,mode:$mode,email:$email,family_id:$family_id,child_id:$child_id,conversation_id:$conversation_id,task_id:$task_id,tracking_intent:$tracking_intent,guidance_intent:$guidance_intent,tracking_actions:$tracking_actions,guidance_actions:$guidance_actions,events_before:$before_count,events_after_tracking:$after_tracking_count,events_after_guidance:$after_guidance_count}')")

  REQ_COUNT=$((REQ_COUNT + 1))
}

echo "Running Havi production core smoke..."
echo "API base: ${API_BASE_URL}"
echo "Site base: ${SITE_BASE_URL}"
echo "Existing account: ${EXISTING_EMAIL}"
echo "New signup account: ${NEW_EMAIL}"
echo ""

assert_http_200 "Site root" "${SITE_BASE_URL}" "SITE_ROOT_STATUS"
assert_http_200 "Sign in page" "${SITE_BASE_URL}/auth/sign-in" "SIGN_IN_STATUS"
assert_http_200 "Sign up page" "${SITE_BASE_URL}/auth/sign-up" "SIGN_UP_STATUS"
assert_http_200 "API health" "${API_BASE_URL}/health" "API_HEALTH_STATUS"

run_core_flow "login" "existing-account" "$EXISTING_EMAIL" "$EXISTING_PASSWORD"
run_core_flow "signup" "new-signup" "$NEW_EMAIL" "$NEW_PASSWORD"

mkdir -p "$(dirname "$REPORT_FILE")"
jq -n \
  --arg run_label "$RUN_LABEL" \
  --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --arg site_base_url "$SITE_BASE_URL" \
  --arg api_base_url "$API_BASE_URL" \
  --arg existing_email "$EXISTING_EMAIL" \
  --arg new_email "$NEW_EMAIL" \
  --arg site_root_status "$SITE_ROOT_STATUS" \
  --arg sign_in_status "$SIGN_IN_STATUS" \
  --arg sign_up_status "$SIGN_UP_STATUS" \
  --arg api_health_status "$API_HEALTH_STATUS" \
  --argjson flow_count "$REQ_COUNT" \
  --argjson flows "$(printf '%s\n' "${FLOW_RESULTS_JSON[@]}" | jq -s '.')" \
  '{run_label:$run_label,timestamp_utc:$timestamp,site_base_url:$site_base_url,api_base_url:$api_base_url,existing_email:$existing_email,new_email:$new_email,http_checks:{site_root:$site_root_status,sign_in:$sign_in_status,sign_up:$sign_up_status,api_health:$api_health_status},flow_count:$flow_count,flows:$flows}' \
  >"$REPORT_FILE"

echo ""
echo "[pass] Production core smoke complete. Flows verified: ${REQ_COUNT}"
echo "[pass] Report written: ${REPORT_FILE}"
