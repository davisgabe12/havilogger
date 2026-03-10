#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE="${HAVI_RAILWAY_SERVICE:-api}"
TIMEOUT_SEC="${HAVI_RAILWAY_WAIT_TIMEOUT_SEC:-900}"
POLL_SEC="${HAVI_RAILWAY_WAIT_POLL_SEC:-10}"
EXPECTED_PROVIDER="${HAVI_RAILWAY_EXPECT_PROVIDER:-python}"
EXPECTED_CONFIG="${HAVI_RAILWAY_EXPECT_CONFIG:-railway.toml}"

if ! [[ "${TIMEOUT_SEC}" =~ ^[0-9]+$ ]] || (( TIMEOUT_SEC < 30 )); then
  echo "[fail] HAVI_RAILWAY_WAIT_TIMEOUT_SEC must be an integer >= 30 (got '${TIMEOUT_SEC}')."
  exit 1
fi
if ! [[ "${POLL_SEC}" =~ ^[0-9]+$ ]] || (( POLL_SEC < 5 )); then
  echo "[fail] HAVI_RAILWAY_WAIT_POLL_SEC must be an integer >= 5 (got '${POLL_SEC}')."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[fail] jq is required."
  exit 1
fi

railway_cmd=()
if [[ -n "${HAVI_RAILWAY_CLI:-}" ]]; then
  railway_cmd=("${HAVI_RAILWAY_CLI}")
elif command -v railway >/dev/null 2>&1; then
  railway_cmd=("railway")
else
  railway_cmd=("npx" "@railway/cli")
fi

railway() {
  "${railway_cmd[@]}" "$@"
}

echo "Deploying Railway service '${SERVICE}' from apps/api with --path-as-root..."
deploy_output="$(
  cd "${ROOT_DIR}/apps/api"
  railway up . --service "${SERVICE}" --detach --path-as-root
)"
echo "${deploy_output}"

deploy_id="$(printf '%s\n' "${deploy_output}" | grep -Eo 'id=[0-9a-f-]+' | head -n1 | cut -d= -f2 || true)"
if [[ -z "${deploy_id}" ]]; then
  deploy_id="$(railway deployment list --service "${SERVICE}" --json | jq -r '.[0].id // empty')"
fi
if [[ -z "${deploy_id}" ]]; then
  echo "[fail] Unable to determine deployment ID."
  exit 1
fi

echo "Watching deployment ${deploy_id} (timeout ${TIMEOUT_SEC}s)..."
start_ts="$(date +%s)"
while true; do
  entry="$(
    railway deployment list --service "${SERVICE}" --json \
      | jq -c --arg id "${deploy_id}" 'map(select(.id == $id)) | .[0] // empty'
  )"

  if [[ -z "${entry}" ]]; then
    echo "[warn] Deployment ${deploy_id} not found yet; waiting..."
  else
    status="$(jq -r '.status // "UNKNOWN"' <<<"${entry}")"
    provider="$(jq -r '.meta.nixpacksProviders[0] // ""' <<<"${entry}")"
    config_file="$(jq -r '.meta.configFile // ""' <<<"${entry}")"
    echo "[info] ${deploy_id} status=${status} provider=${provider:-<none>} config=${config_file:-<none>}"

    if [[ "${status}" == "SUCCESS" ]]; then
      if [[ "${provider}" != "${EXPECTED_PROVIDER}" ]]; then
        echo "[fail] Deploy succeeded with provider='${provider}', expected '${EXPECTED_PROVIDER}'."
        exit 1
      fi
      if [[ "${config_file}" != "${EXPECTED_CONFIG}" ]]; then
        echo "[fail] Deploy succeeded with config='${config_file}', expected '${EXPECTED_CONFIG}'."
        exit 1
      fi
      echo "[pass] Deployment ${deploy_id} is healthy and matches expected provider/config."
      exit 0
    fi

    if [[ "${status}" =~ ^(FAILED|CRASHED|REMOVED|CANCELED)$ ]]; then
      echo "[fail] Deployment ${deploy_id} ended with status=${status}."
      exit 1
    fi
  fi

  now_ts="$(date +%s)"
  if (( now_ts - start_ts >= TIMEOUT_SEC )); then
    echo "[fail] Timed out waiting for deployment ${deploy_id} after ${TIMEOUT_SEC}s."
    exit 1
  fi
  sleep "${POLL_SEC}"
done
