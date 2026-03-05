#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${HAVI_PROD_SITE_BASE_URL:-https://gethavi.com}"
RUN_LABEL="${HAVI_UI_SMOKE_LABEL:-manual-$(date +%Y%m%d%H%M%S)}"
REQUIRED_RUNS="${HAVI_UI_SMOKE_RUNS:-2}"
REPORT_DIR="${ROOT_DIR}/docs/active/green-proof/prod-ui-smoke-${RUN_LABEL}"
SUMMARY_FILE="${ROOT_DIR}/docs/active/green-proof/prod-ui-smoke-${RUN_LABEL}.json"

if ! [[ "${REQUIRED_RUNS}" =~ ^[0-9]+$ ]] || (( REQUIRED_RUNS < 2 )); then
  echo "[fail] HAVI_UI_SMOKE_RUNS must be an integer >= 2 (got '${REQUIRED_RUNS}')."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[fail] jq is required for prod_ui_smoke_gate.sh"
  exit 1
fi

mkdir -p "${REPORT_DIR}"
ATTEMPTS_FILE="${REPORT_DIR}/attempts.jsonl"
: > "${ATTEMPTS_FILE}"

echo "Running production UI smoke gate..."
echo "Base URL: ${BASE_URL}"
echo "Required consecutive passes: ${REQUIRED_RUNS}"
echo "Label: ${RUN_LABEL}"

consecutive_passes=0
attempt=1

while (( attempt <= REQUIRED_RUNS )); do
  log_file="${REPORT_DIR}/run-${attempt}.log"
  report_file="${REPORT_DIR}/run-${attempt}-report.json"
  start_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  echo ""
  echo "== UI smoke run ${attempt}/${REQUIRED_RUNS} =="

  set +e
  (
    cd "${ROOT_DIR}/apps/web"
    PLAYWRIGHT_BASE_URL="${BASE_URL}" npm run test:green
  ) >"${log_file}" 2>&1
  run_exit=$?
  set -e

  end_time="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  copied_report=""
  if [[ -f "${ROOT_DIR}/apps/web/test-results/report.json" ]]; then
    cp "${ROOT_DIR}/apps/web/test-results/report.json" "${report_file}"
    copied_report="${report_file}"
  fi

  if [[ "${run_exit}" -eq 0 ]]; then
    run_status="pass"
    consecutive_passes=$((consecutive_passes + 1))
    echo "[pass] UI smoke run ${attempt}/${REQUIRED_RUNS}"
  else
    run_status="fail"
    consecutive_passes=0
    echo "[fail] UI smoke run ${attempt}/${REQUIRED_RUNS} (see ${log_file})"
  fi

  jq -nc \
    --argjson attempt "${attempt}" \
    --arg status "${run_status}" \
    --arg started_at "${start_time}" \
    --arg ended_at "${end_time}" \
    --arg log_file "${log_file}" \
    --arg report_file "${copied_report}" \
    --argjson exit_code "${run_exit}" \
    '{
      attempt: $attempt,
      status: $status,
      started_at: $started_at,
      ended_at: $ended_at,
      exit_code: $exit_code,
      log_file: $log_file,
      report_file: $report_file
    }' >> "${ATTEMPTS_FILE}"

  if [[ "${run_exit}" -ne 0 ]]; then
    break
  fi

  attempt=$((attempt + 1))
done

gate_pass=false
if (( consecutive_passes >= REQUIRED_RUNS )); then
  gate_pass=true
fi

jq -s \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg label "${RUN_LABEL}" \
  --arg base_url "${BASE_URL}" \
  --argjson required_consecutive_passes "${REQUIRED_RUNS}" \
  --argjson gate_pass "${gate_pass}" \
  '{
    generated_at: $generated_at,
    label: $label,
    base_url: $base_url,
    required_consecutive_passes: $required_consecutive_passes,
    gate_pass: $gate_pass,
    attempts: .
  }' "${ATTEMPTS_FILE}" > "${SUMMARY_FILE}"

if [[ "${gate_pass}" == "true" ]]; then
  echo ""
  echo "[pass] Production UI smoke gate passed (${REQUIRED_RUNS} consecutive runs)."
  echo "[pass] Summary: ${SUMMARY_FILE}"
  exit 0
fi

echo ""
echo "[fail] Production UI smoke gate failed."
echo "[fail] Summary: ${SUMMARY_FILE}"
exit 1
