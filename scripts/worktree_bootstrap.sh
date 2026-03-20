#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREE_PATH=""
CHECK_ONLY=0
SYNC_ENV=1
ENV_SOURCE_ROOT="/Users/gabedavis/Desktop/projects/havilogger"

usage() {
  cat <<'USAGE'
Usage: worktree_bootstrap.sh [options]

Options:
  --worktree PATH   Target worktree path (default: current directory)
  --check-only      Verify readiness only; do not install missing deps
  --no-sync-env     Do not copy env files from source repo when missing
  --sync-env-from PATH
                   Source repo path for env files (default: /Users/gabedavis/Desktop/projects/havilogger)
  --help            Show help

Behavior:
  1) Verifies apps/web exists in the target worktree.
  2) Checks for apps/web/node_modules/.bin/jest.
  3) If missing and not check-only, runs npm ci in apps/web.
  4) Optionally copies apps/web/.env.local and apps/api/.env.local when missing.
  5) Fails fast if Jest is still unavailable.
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
    --worktree)
      require_arg "$1" "${2:-}"
      WORKTREE_PATH="$2"
      shift 2
      ;;
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    --no-sync-env)
      SYNC_ENV=0
      shift
      ;;
    --sync-env-from)
      require_arg "$1" "${2:-}"
      ENV_SOURCE_ROOT="$2"
      shift 2
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

if [[ -z "$WORKTREE_PATH" ]]; then
  WORKTREE_PATH="$(pwd)"
fi

WEB_DIR="$WORKTREE_PATH/apps/web"
JEST_BIN="$WEB_DIR/node_modules/.bin/jest"

if [[ ! -d "$WEB_DIR" ]]; then
  echo "Invalid worktree. Missing web app directory: $WEB_DIR" >&2
  exit 1
fi

sync_env_file() {
  local rel_path="$1"
  local src="$ENV_SOURCE_ROOT/$rel_path"
  local dst="$WORKTREE_PATH/$rel_path"

  if [[ -f "$dst" ]]; then
    return 0
  fi

  if [[ ! -f "$src" ]]; then
    echo "[warn] Missing source env file: $src" >&2
    return 0
  fi

  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "[info] Synced env file: $rel_path"
}

if [[ "$SYNC_ENV" -eq 1 ]]; then
  sync_env_file "apps/web/.env.local"
  sync_env_file "apps/api/.env.local"
fi

if [[ -x "$JEST_BIN" ]]; then
  echo "[ready] Web test dependencies available: $JEST_BIN"
  exit 0
fi

if [[ "$CHECK_ONLY" -eq 1 ]]; then
  echo "[not-ready] Missing Jest binary: $JEST_BIN" >&2
  echo "Run: cd \"$WEB_DIR\" && npm ci" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed or not on PATH; cannot install web dependencies." >&2
  exit 1
fi

echo "[info] Installing web dependencies in $WEB_DIR (npm ci)..."
(
  cd "$WEB_DIR"
  npm ci
)

if [[ ! -x "$JEST_BIN" ]]; then
  echo "[error] npm ci completed but Jest is still missing: $JEST_BIN" >&2
  exit 1
fi

echo "[ready] Worktree bootstrap complete: Jest is available."
