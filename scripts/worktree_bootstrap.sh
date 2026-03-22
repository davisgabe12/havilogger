#!/usr/bin/env bash
set -euo pipefail

CHECK_ONLY=0
if [[ "${1:-}" == "--check-only" ]]; then
  CHECK_ONLY=1
fi

WT_ROOT="$(pwd)"
COMMON_GIT_DIR="$(git rev-parse --git-common-dir)"
REPO_ROOT="$(cd "${COMMON_GIT_DIR}/.." && pwd)"

WEB_ENV_SRC="${REPO_ROOT}/apps/web/.env.local"
API_ENV_SRC="${REPO_ROOT}/apps/api/.env.local"
WEB_ENV_DST="${WT_ROOT}/apps/web/.env.local"
API_ENV_DST="${WT_ROOT}/apps/api/.env.local"

require_var() {
  local file="$1"
  local name="$2"
  if ! grep -q "^${name}=" "$file"; then
    echo "[error] Missing ${name} in ${file}" >&2
    return 1
  fi
}

check_ready() {
  local ok=0
  if [[ ! -f "$WEB_ENV_DST" ]]; then
    echo "[warn] Missing ${WEB_ENV_DST}"
    ok=1
  fi
  if [[ ! -f "$API_ENV_DST" ]]; then
    echo "[warn] Missing ${API_ENV_DST}"
    ok=1
  fi

  if [[ "$ok" -ne 0 ]]; then
    return 1
  fi

  require_var "$WEB_ENV_DST" "NEXT_PUBLIC_SUPABASE_URL" || return 1
  require_var "$WEB_ENV_DST" "NEXT_PUBLIC_SUPABASE_ANON_KEY" || return 1
  require_var "$API_ENV_DST" "SUPABASE_URL" || return 1
  require_var "$API_ENV_DST" "SUPABASE_ANON_KEY" || return 1
}

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  if check_ready; then
    echo "[ok] worktree env bootstrap ready"
    exit 0
  fi
  echo "[error] worktree env bootstrap not ready"
  exit 1
fi

if [[ ! -f "$WEB_ENV_SRC" || ! -f "$API_ENV_SRC" ]]; then
  echo "[error] Source env files missing under ${REPO_ROOT}/apps/{web,api}/.env.local" >&2
  exit 1
fi

if [[ ! -f "$WEB_ENV_DST" ]]; then
  cp "$WEB_ENV_SRC" "$WEB_ENV_DST"
  chmod 600 "$WEB_ENV_DST" || true
  echo "[info] copied ${WEB_ENV_DST}"
fi

if [[ ! -f "$API_ENV_DST" ]]; then
  cp "$API_ENV_SRC" "$API_ENV_DST"
  chmod 600 "$API_ENV_DST" || true
  echo "[info] copied ${API_ENV_DST}"
fi

if check_ready; then
  echo "[ok] worktree env bootstrap complete"
  exit 0
fi

echo "[error] worktree env bootstrap failed validation" >&2
exit 1
