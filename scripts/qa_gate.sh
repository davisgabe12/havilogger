#!/usr/bin/env bash
set -euo pipefail

ROOT_DEFAULT="/Users/gabedavis/Desktop/projects/havilogger"
ROOT_DIR="$ROOT_DEFAULT"
LABEL="manual-$(date +%Y%m%d%H%M%S)"
CHANGED_AREAS=""
DEPLOY_SCOPE="none"
RUN_TESTS=1
RUN_GREEN=1
RUN_PLAYWRIGHT=1
RUN_RELEASE_GATE=1
PLAYWRIGHT_CMD=""
DRY_RUN=0
ARTIFACT_ROOT=""
declare -a TEST_CMDS

usage() {
  cat <<'USAGE'
Usage: qa_gate.sh [options]

Options:
  --label NAME                   QA label (default: manual-<timestamp>)
  --areas CSV                    Changed areas (e.g. chat,tasks,auth)
  --deploy-scope SCOPE           one of: none|api|web|both (default: none)
  --test-cmd "COMMAND"           Repeatable. Targeted test command(s) to execute.
  --playwright-cmd "COMMAND"     Playwright validation command for changed UX flow.
  --skip-tests                   Skip targeted tests step.
  --skip-green                   Skip deterministic GREEN step.
  --skip-playwright              Skip Playwright flow step.
  --skip-release-gate            Skip production release gate step.
  --artifact-root PATH           Output folder root (default: docs/active/green-proof/releases)
  --repo-root PATH               Havi repo root (default: /Users/gabedavis/Desktop/projects/havilogger)
  --dry-run                      Print commands and create summary without executing commands.
  --help                         Show help.

Examples:
  ./scripts/qa_gate.sh --label chat-photo-upload --areas chat \
    --test-cmd "cd apps/api && ../../.venv/bin/pytest tests/test_chat_routing_logic.py -q" \
    --playwright-cmd "cd apps/web && PLAYWRIGHT_WEBSERVER=1 npm run test:green"

  ./scripts/qa_gate.sh --label invite-flow --areas auth,onboarding --deploy-scope both \
    --test-cmd "cd apps/api && ../../.venv/bin/pytest tests/test_invites.py -q"
USAGE
}

require_arg() {
  local flag="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Missing value for $flag" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --label)
      require_arg "$1" "${2:-}"
      LABEL="$2"
      shift 2
      ;;
    --areas)
      require_arg "$1" "${2:-}"
      CHANGED_AREAS="$2"
      shift 2
      ;;
    --deploy-scope)
      require_arg "$1" "${2:-}"
      DEPLOY_SCOPE="$2"
      shift 2
      ;;
    --test-cmd)
      require_arg "$1" "${2:-}"
      TEST_CMDS+=("$2")
      shift 2
      ;;
    --playwright-cmd)
      require_arg "$1" "${2:-}"
      PLAYWRIGHT_CMD="$2"
      shift 2
      ;;
    --skip-tests)
      RUN_TESTS=0
      shift
      ;;
    --skip-green)
      RUN_GREEN=0
      shift
      ;;
    --skip-playwright)
      RUN_PLAYWRIGHT=0
      shift
      ;;
    --skip-release-gate)
      RUN_RELEASE_GATE=0
      shift
      ;;
    --artifact-root)
      require_arg "$1" "${2:-}"
      ARTIFACT_ROOT="$2"
      shift 2
      ;;
    --repo-root)
      require_arg "$1" "${2:-}"
      ROOT_DIR="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! "$DEPLOY_SCOPE" =~ ^(none|api|web|both)$ ]]; then
  echo "Invalid --deploy-scope: $DEPLOY_SCOPE" >&2
  exit 2
fi

if [[ -z "$ARTIFACT_ROOT" ]]; then
  ARTIFACT_ROOT="$ROOT_DIR/docs/active/green-proof/releases"
fi

if [[ ! -d "$ROOT_DIR" ]]; then
  echo "Repo root not found: $ROOT_DIR" >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ ${#TEST_CMDS[@]} -eq 0 && "$RUN_TESTS" -eq 1 ]]; then
  case ",$CHANGED_AREAS," in
    *,chat,*)
      TEST_CMDS+=("cd apps/api && ../../.venv/bin/pytest tests/test_chat_routing_logic.py tests/test_chat_composition_hardening.py -q")
      ;;
  esac
  case ",$CHANGED_AREAS," in
    *,tasks,*)
      TEST_CMDS+=("cd apps/api && ../../.venv/bin/pytest tests/test_tasks_route_supabase.py -q")
      ;;
  esac
  case ",$CHANGED_AREAS," in
    *,timeline,*)
      TEST_CMDS+=("cd apps/api && ../../.venv/bin/pytest tests/test_activities_regressions.py -q")
      ;;
  esac
  case ",$CHANGED_AREAS," in
    *,auth,*|*,onboarding,*)
      TEST_CMDS+=("cd apps/api && ../../.venv/bin/pytest tests/test_invites.py -q")
      ;;
  esac
fi

TODAY="$(date +%Y-%m-%d)"
BUNDLE_DIR="$ARTIFACT_ROOT/${TODAY}-${LABEL}-qa-gate"
LOG_DIR="$BUNDLE_DIR/logs"
mkdir -p "$LOG_DIR"

STEP_FILE="$(mktemp)"
trap 'rm -f "$STEP_FILE"' EXIT

record_step() {
  local step="$1"
  local required="$2"
  local status="$3"
  local rc="$4"
  local log_file="$5"
  printf "%s|%s|%s|%s|%s\n" "$step" "$required" "$status" "$rc" "$log_file" >> "$STEP_FILE"
}

run_step() {
  local step="$1"
  local required="$2"
  local cmd="$3"
  local log_file="$LOG_DIR/${step}.log"
  local rc=0
  local status="pass"

  {
    echo "# step: $step"
    echo "# command: $cmd"
  } > "$log_file"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $cmd" >> "$log_file"
    status="skipped"
    rc=0
  else
    set +e
    /bin/bash -lc "$cmd" >> "$log_file" 2>&1
    rc=$?
    set -e
    if [[ "$rc" -ne 0 ]]; then
      status="fail"
    fi
  fi

  record_step "$step" "$required" "$status" "$rc" "$log_file"
}

add_failure_note() {
  local step="$1"
  case "$step" in
    tests)
      echo "- tests: update/fix touched tests or code path; re-run targeted suite before release."
      ;;
    green)
      echo "- green: triage deterministic local flow failure (seed/reset/auth/app readiness) and rerun."
      ;;
    playwright)
      echo "- playwright: update flow assertions or fix UX regression in changed feature path."
      ;;
    release_gate_before|release_gate_after)
      echo "- release gate: investigate deploy/runtime mismatch; do not ship until gate passes."
      ;;
  esac
}

if [[ "$RUN_TESTS" -eq 1 ]]; then
  if [[ ${#TEST_CMDS[@]} -eq 0 ]]; then
    run_step "tests" "required" "echo 'No targeted tests provided or inferred.' && exit 2"
  else
    for i in "${!TEST_CMDS[@]}"; do
      run_step "tests_$((i + 1))" "required" "${TEST_CMDS[$i]}"
    done
  fi
else
  record_step "tests" "optional" "skipped" "0" "$LOG_DIR/tests.log"
fi

if [[ "$RUN_GREEN" -eq 1 ]]; then
  run_step "green" "required" "cd \"$ROOT_DIR\" && ./scripts/green_seed_reset.sh reset && GREEN_USE_SEED=1 GREEN_SEED_APPLY=1 GREEN_ALLOW_SHARED_DB=1 ./scripts/e2e_green.sh"
else
  record_step "green" "optional" "skipped" "0" "$LOG_DIR/green.log"
fi

if [[ "$RUN_PLAYWRIGHT" -eq 1 ]]; then
  if [[ -z "$PLAYWRIGHT_CMD" ]]; then
    run_step "playwright" "required" "echo 'Missing --playwright-cmd for required UI-flow check.' && exit 2"
  else
    run_step "playwright" "required" "$PLAYWRIGHT_CMD"
  fi
else
  record_step "playwright" "optional" "skipped" "0" "$LOG_DIR/playwright.log"
fi

if [[ "$RUN_RELEASE_GATE" -eq 1 && "$DEPLOY_SCOPE" != "none" ]]; then
  run_step "release_gate_before" "required" "cd \"$ROOT_DIR\" && HAVI_RELEASE_LABEL=before-$LABEL ./scripts/prod_release_gate.sh"
  run_step "release_gate_after" "required" "cd \"$ROOT_DIR\" && HAVI_RELEASE_LABEL=after-$LABEL ./scripts/prod_release_gate.sh"
else
  record_step "release_gate" "optional" "skipped" "0" "$LOG_DIR/release_gate.log"
fi

SUMMARY_JSON="$BUNDLE_DIR/qa-gate-summary.json"
SUMMARY_MD="$BUNDLE_DIR/README.md"

python3 - "$STEP_FILE" "$SUMMARY_JSON" "$LABEL" "$CHANGED_AREAS" "$DEPLOY_SCOPE" <<'PY'
import json
import os
import sys
from datetime import datetime

step_file, out_json, label, areas, scope = sys.argv[1:6]
rows = []
overall = "pass"
for line in open(step_file, "r", encoding="utf-8"):
    step, required, status, rc, log_file = line.rstrip("\n").split("|", 4)
    item = {
        "step": step,
        "required": required == "required",
        "status": status,
        "exit_code": int(rc),
        "log_file": log_file,
    }
    rows.append(item)
    if item["required"] and status == "fail":
        overall = "fail"

payload = {
    "label": label,
    "changed_areas": areas,
    "deploy_scope": scope,
    "overall_status": overall,
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "steps": rows,
}
os.makedirs(os.path.dirname(out_json), exist_ok=True)
with open(out_json, "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
print(json.dumps(payload, indent=2))
PY

{
  echo "# QA Gate Summary"
  echo
  echo "- Label: \`$LABEL\`"
  echo "- Changed areas: \`$CHANGED_AREAS\`"
  echo "- Deploy scope: \`$DEPLOY_SCOPE\`"
  echo "- Summary JSON: \`$SUMMARY_JSON\`"
  echo
  echo "## Step Results"
  echo
  echo "| Step | Required | Status | Log |"
  echo "|---|---|---|---|"
  while IFS='|' read -r step required status rc log_file; do
    echo "| $step | $required | $status (rc=$rc) | $log_file |"
  done < "$STEP_FILE"
  echo
  echo "## Recommended Fixes When Failed"
  echo
  while IFS='|' read -r step required status rc _; do
    if [[ "$required" == "required" && "$status" == "fail" ]]; then
      add_failure_note "$step"
    fi
  done < "$STEP_FILE"
} > "$SUMMARY_MD"

OVERALL_STATUS="$(python3 - "$SUMMARY_JSON" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
print(data["overall_status"])
PY
)"

echo "[done] QA gate summary: $SUMMARY_JSON"
echo "[done] QA gate report:  $SUMMARY_MD"

if [[ "$OVERALL_STATUS" != "pass" ]]; then
  echo "[fail] Required QA gate steps failed. See summary for recommended fixes." >&2
  exit 1
fi

echo "[pass] QA gate passed."
