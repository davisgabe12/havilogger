#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_LABEL="${HAVI_RELEASE_LABEL:-manual-$(date +%Y%m%d%H%M%S)}"
UI_GATE_EXTRA_ATTEMPTS="${HAVI_UI_GATE_EXTRA_ATTEMPTS:-1}"
REPORT_DIR="${ROOT_DIR}/docs/active/green-proof"
SUMMARY_FILE="${REPORT_DIR}/prod-release-gate-${RUN_LABEL}.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "[fail] jq is required for prod_release_gate.sh"
  exit 1
fi

if ! [[ "${UI_GATE_EXTRA_ATTEMPTS}" =~ ^[0-9]+$ ]]; then
  echo "[fail] HAVI_UI_GATE_EXTRA_ATTEMPTS must be an integer >= 0 (got '${UI_GATE_EXTRA_ATTEMPTS}')."
  exit 1
fi

mkdir -p "${REPORT_DIR}"

echo "Running production release gate..."
echo "Label: ${RUN_LABEL}"
echo "UI gate extra attempts on fail: ${UI_GATE_EXTRA_ATTEMPTS}"

core_label="${RUN_LABEL}"
core_report="${REPORT_DIR}/prod-core-smoke-${core_label}.json"
ui_attempts_file="${REPORT_DIR}/prod-release-gate-${RUN_LABEL}-ui-attempts.jsonl"
: > "${ui_attempts_file}"

set +e
HAVI_SMOKE_LABEL="${core_label}" "${ROOT_DIR}/scripts/prod_core_smoke.sh"
core_exit=$?
set -e

if [[ "${core_exit}" -ne 0 ]]; then
  echo "[fail] Core smoke failed for label '${core_label}'."
else
  echo "[pass] Core smoke passed for label '${core_label}'."
fi

ui_gate_pass=false
ui_gate_attempt=1
max_ui_gate_attempts=$((UI_GATE_EXTRA_ATTEMPTS + 1))

if [[ "${core_exit}" -eq 0 ]]; then
  while (( ui_gate_attempt <= max_ui_gate_attempts )); do
    ui_label="${RUN_LABEL}-ui-gate-${ui_gate_attempt}"
    ui_summary="${REPORT_DIR}/prod-ui-smoke-${ui_label}.json"
    started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    echo ""
    echo "== UI gate attempt ${ui_gate_attempt}/${max_ui_gate_attempts} (${ui_label}) =="

    set +e
    HAVI_UI_SMOKE_LABEL="${ui_label}" "${ROOT_DIR}/scripts/prod_ui_smoke_gate.sh"
    ui_exit=$?
    set -e

    ended_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    status="fail"
    if [[ "${ui_exit}" -eq 0 ]]; then
      status="pass"
      ui_gate_pass=true
      echo "[pass] UI gate attempt ${ui_gate_attempt}/${max_ui_gate_attempts}."
    else
      echo "[fail] UI gate attempt ${ui_gate_attempt}/${max_ui_gate_attempts}."
    fi

    jq -nc \
      --argjson attempt "${ui_gate_attempt}" \
      --arg status "${status}" \
      --arg label "${ui_label}" \
      --arg summary_file "${ui_summary}" \
      --arg started_at "${started_at}" \
      --arg ended_at "${ended_at}" \
      --argjson exit_code "${ui_exit}" \
      '{
        attempt: $attempt,
        status: $status,
        label: $label,
        summary_file: $summary_file,
        started_at: $started_at,
        ended_at: $ended_at,
        exit_code: $exit_code
      }' >> "${ui_attempts_file}"

    if [[ "${ui_exit}" -eq 0 ]]; then
      break
    fi
    ui_gate_attempt=$((ui_gate_attempt + 1))
  done
fi

ui_attempts_json="[]"
if [[ -s "${ui_attempts_file}" ]]; then
  ui_attempts_json="$(jq -s '.' "${ui_attempts_file}")"
fi

gate_pass=false
if [[ "${core_exit}" -eq 0 && "${ui_gate_pass}" == "true" ]]; then
  gate_pass=true
fi

jq -nc \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg label "${RUN_LABEL}" \
  --arg core_label "${core_label}" \
  --arg core_report "${core_report}" \
  --argjson core_exit "${core_exit}" \
  --argjson ui_gate_extra_attempts "${UI_GATE_EXTRA_ATTEMPTS}" \
  --argjson gate_pass "${gate_pass}" \
  --argjson ui_attempts "${ui_attempts_json}" \
  '{
    generated_at: $generated_at,
    label: $label,
    gate_pass: $gate_pass,
    core_smoke: {
      label: $core_label,
      report_file: $core_report,
      exit_code: $core_exit,
      passed: ($core_exit == 0)
    },
    ui_gate: {
      extra_attempts_on_fail: $ui_gate_extra_attempts,
      passed: ([$ui_attempts[] | select(.status == "pass")] | length > 0),
      attempts: $ui_attempts
    }
  }' > "${SUMMARY_FILE}"

if [[ "${gate_pass}" == "true" ]]; then
  echo ""
  echo "[pass] Production release gate passed."
  echo "[pass] Summary: ${SUMMARY_FILE}"
  exit 0
fi

echo ""
echo "[fail] Production release gate failed."
echo "[fail] Summary: ${SUMMARY_FILE}"
exit 1
