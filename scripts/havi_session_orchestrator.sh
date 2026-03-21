#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT_DEFAULT="/Users/gabedavis/Desktop/projects/havilogger"
WORKTREES_ROOT_DEFAULT="$REPO_ROOT_DEFAULT/.worktrees"
BASE_BRANCH="main"
REPO_ROOT="$REPO_ROOT_DEFAULT"
WORKTREES_ROOT="$WORKTREES_ROOT_DEFAULT"
FEATURE_NAME=""
BRANCH_NAME=""
DO_FETCH=1
DO_SPEC=1
DRY_RUN=0
WORKTREE_CREATE_MODE=""
START_REF=""
WORKTREE_ADD_TIMEOUT_SECONDS=45

usage() {
  cat <<'USAGE'
Usage: havi_session_orchestrator.sh --feature <name> [options]

Required:
  --feature NAME                 Feature name used for branch/spec slug.

Optional:
  --branch NAME                  Branch name (default: codex/<feature-slug>)
  --base-branch NAME             Base branch for new worktree (default: main)
  --repo-root PATH               Repo root (default: /Users/gabedavis/Desktop/projects/havilogger)
  --worktrees-root PATH          Root folder for worktrees (default: /Users/gabedavis/Desktop/projects/havi-worktrees)
  --no-fetch                     Skip fetch of origin/<base-branch>
  --no-spec                      Do not scaffold feature spec
  --dry-run                      Print actions without mutating git/worktree
  --help                         Show this help

Behavior:
  1) Creates or reuses a dedicated feature worktree.
  2) Creates branch codex/<feature-slug> by default.
  3) Scaffolds docs/active/specs/<feature-slug>-spec.md if missing.
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

slugify() {
  local input="$1"
  echo "$input" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

run_cmd() {
  local cmd="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $cmd"
  else
    eval "$cmd"
  fi
}

run_cmd_timeout() {
  local timeout_seconds="$1"
  local cmd="$2"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] $cmd"
    return 0
  fi

  bash -lc "$cmd" &
  local cmd_pid=$!
  local elapsed=0

  while kill -0 "$cmd_pid" 2>/dev/null; do
    if (( elapsed >= timeout_seconds )); then
      kill "$cmd_pid" 2>/dev/null || true
      wait "$cmd_pid" 2>/dev/null || true
      echo "Command timed out after ${timeout_seconds}s: $cmd" >&2
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  wait "$cmd_pid"
}

warn() {
  echo "[warn] $*" >&2
}

resolve_worktree_create_mode() {
  if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    WORKTREE_CREATE_MODE="use-local-branch"
    START_REF="$BRANCH_NAME"
    return
  fi

  if git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME"; then
    WORKTREE_CREATE_MODE="create-from-remote-branch"
    START_REF="origin/$BRANCH_NAME"
    return
  fi

  if git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
    WORKTREE_CREATE_MODE="create-from-origin-base"
    START_REF="origin/$BASE_BRANCH"
    return
  fi

  WORKTREE_CREATE_MODE="create-from-local-base"
  START_REF="$BASE_BRANCH"
}

git_worktree_add() {
  local no_checkout="${1:-0}"
  local no_checkout_flag=""
  if [[ "$no_checkout" -eq 1 ]]; then
    no_checkout_flag="--no-checkout"
  fi

  case "$WORKTREE_CREATE_MODE" in
    use-local-branch)
      run_cmd_timeout "$WORKTREE_ADD_TIMEOUT_SECONDS" "git worktree add $no_checkout_flag \"$WORKTREE_PATH\" \"$BRANCH_NAME\""
      ;;
    create-from-remote-branch|create-from-origin-base|create-from-local-base)
      run_cmd_timeout "$WORKTREE_ADD_TIMEOUT_SECONDS" "git worktree add $no_checkout_flag -b \"$BRANCH_NAME\" \"$WORKTREE_PATH\" \"$START_REF\""
      ;;
    *)
      echo "Unknown worktree create mode: $WORKTREE_CREATE_MODE" >&2
      exit 1
      ;;
  esac
}

materialize_no_checkout_worktree() {
  local wt_gitdir=""
  local checkout_err_file
  checkout_err_file="$(mktemp)"

  if [[ ! -f "$WORKTREE_PATH/.git" ]]; then
    echo "Worktree gitdir file missing after --no-checkout create: $WORKTREE_PATH/.git" >&2
    rm -f "$checkout_err_file"
    exit 1
  fi

  wt_gitdir="$(sed -n 's/^gitdir: //p' "$WORKTREE_PATH/.git")"
  if [[ -z "$wt_gitdir" || ! -d "$wt_gitdir" ]]; then
    echo "Unable to resolve worktree gitdir from $WORKTREE_PATH/.git" >&2
    rm -f "$checkout_err_file"
    exit 1
  fi

  GIT_DIR="$wt_gitdir" GIT_WORK_TREE="$WORKTREE_PATH" git read-tree "$BRANCH_NAME"
  if ! GIT_DIR="$wt_gitdir" GIT_WORK_TREE="$WORKTREE_PATH" git checkout-index -a -f --ignore-skip-worktree-bits 2>"$checkout_err_file"; then
    if grep -qi "unable to read sha1 file" "$checkout_err_file"; then
      warn "Missing git objects detected during fallback checkout; fetching origin/$BASE_BRANCH and retrying once."
      git fetch origin "$BASE_BRANCH"
      GIT_DIR="$wt_gitdir" GIT_WORK_TREE="$WORKTREE_PATH" git read-tree "$BRANCH_NAME"
      GIT_DIR="$wt_gitdir" GIT_WORK_TREE="$WORKTREE_PATH" git checkout-index -a -f --ignore-skip-worktree-bits
    elif is_checkout_materialization_failure "$checkout_err_file"; then
      rm -f "$checkout_err_file"
      return 42
    else
      cat "$checkout_err_file" >&2
      rm -f "$checkout_err_file"
      exit 1
    fi
  fi

  rm -f "$checkout_err_file"
}

is_checkout_materialization_failure() {
  local err_file="$1"
  if grep -Eqi "reset died of signal|mmap failed|stale nfs file handle|operation timed out" "$err_file"; then
    return 0
  fi
  return 1
}

create_isolated_clone_fallback() {
  warn "Falling back to isolated clone setup at $WORKTREE_PATH."
  rm -rf "$WORKTREE_PATH"
  git clone --no-checkout "$REPO_ROOT" "$WORKTREE_PATH"

  if git -C "$WORKTREE_PATH" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    git -C "$WORKTREE_PATH" checkout "$BRANCH_NAME"
    return
  fi

  if git -C "$WORKTREE_PATH" show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME"; then
    git -C "$WORKTREE_PATH" checkout -b "$BRANCH_NAME" "origin/$BRANCH_NAME"
    return
  fi

  if git -C "$WORKTREE_PATH" show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
    git -C "$WORKTREE_PATH" checkout -b "$BRANCH_NAME" "origin/$BASE_BRANCH"
    return
  fi

  git -C "$WORKTREE_PATH" checkout -b "$BRANCH_NAME" "$BASE_BRANCH"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --feature)
      require_arg "$1" "${2:-}"
      FEATURE_NAME="$2"
      shift 2
      ;;
    --branch)
      require_arg "$1" "${2:-}"
      BRANCH_NAME="$2"
      shift 2
      ;;
    --base-branch)
      require_arg "$1" "${2:-}"
      BASE_BRANCH="$2"
      shift 2
      ;;
    --repo-root)
      require_arg "$1" "${2:-}"
      REPO_ROOT="$2"
      shift 2
      ;;
    --worktrees-root)
      require_arg "$1" "${2:-}"
      WORKTREES_ROOT="$2"
      shift 2
      ;;
    --no-fetch)
      DO_FETCH=0
      shift
      ;;
    --no-spec)
      DO_SPEC=0
      shift
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

if [[ -z "$FEATURE_NAME" ]]; then
  echo "--feature is required" >&2
  usage >&2
  exit 2
fi

if [[ ! -d "$REPO_ROOT/.git" ]]; then
  echo "Invalid repo root: $REPO_ROOT" >&2
  exit 1
fi

FEATURE_SLUG="$(slugify "$FEATURE_NAME")"
if [[ -z "$FEATURE_SLUG" ]]; then
  echo "Feature name did not produce a valid slug: $FEATURE_NAME" >&2
  exit 1
fi

if [[ -z "$BRANCH_NAME" ]]; then
  BRANCH_NAME="codex/$FEATURE_SLUG"
fi

WORKTREE_PATH="$WORKTREES_ROOT/$FEATURE_SLUG"
SPEC_PATH="$WORKTREE_PATH/docs/active/specs/${FEATURE_SLUG}-spec.md"
TEMPLATE_PATH="$REPO_ROOT/docs/active/specs/_feature-spec-template.md"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] mkdir -p \"$WORKTREES_ROOT\""
else
  mkdir -p "$WORKTREES_ROOT"
fi

cd "$REPO_ROOT"

if [[ "$DO_FETCH" -eq 1 && "$DRY_RUN" -eq 0 ]]; then
  run_cmd "git fetch origin $BASE_BRANCH"
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  run_cmd "git worktree prune --verbose >/dev/null"
fi

resolve_worktree_create_mode

if [[ -d "$WORKTREE_PATH/.git" || -f "$WORKTREE_PATH/.git" ]]; then
  echo "[info] Reusing existing worktree: $WORKTREE_PATH"
else
  if [[ "$DRY_RUN" -eq 1 ]]; then
    git_worktree_add 0
  else
    create_err_file="$(mktemp)"
    if ! git_worktree_add 0 2>"$create_err_file"; then
      if is_checkout_materialization_failure "$create_err_file"; then
        warn "git worktree add checkout/materialization failed; retrying with --no-checkout fallback."
        rm -rf "$WORKTREE_PATH"
        if git worktree list --porcelain | grep -Fq "worktree $WORKTREE_PATH"; then
          git worktree remove --force "$WORKTREE_PATH" || true
        fi
        resolve_worktree_create_mode
        no_checkout_err_file="$(mktemp)"
        if ! git_worktree_add 1 2>"$no_checkout_err_file"; then
          if is_checkout_materialization_failure "$no_checkout_err_file"; then
            warn "No-checkout worktree fallback failed; using isolated clone fallback."
            create_isolated_clone_fallback
          else
            cat "$no_checkout_err_file" >&2
            rm -f "$create_err_file" "$no_checkout_err_file"
            exit 1
          fi
        else
          if ! materialize_no_checkout_worktree; then
            warn "No-checkout materialization failed; using isolated clone fallback."
            create_isolated_clone_fallback
          fi
        fi
        rm -f "$no_checkout_err_file"
      else
        cat "$create_err_file" >&2
        rm -f "$create_err_file"
        exit 1
      fi
    fi
    rm -f "$create_err_file"
  fi
fi

if [[ "$DO_SPEC" -eq 1 ]]; then
  if [[ -f "$SPEC_PATH" ]]; then
    echo "[info] Spec already exists: $SPEC_PATH"
  else
    if [[ ! -f "$TEMPLATE_PATH" ]]; then
      echo "Spec template not found: $TEMPLATE_PATH" >&2
      exit 1
    fi

    TODAY="$(date +%Y-%m-%d)"

    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] create spec from template -> $SPEC_PATH"
    else
      mkdir -p "$(dirname "$SPEC_PATH")"
      cp "$TEMPLATE_PATH" "$SPEC_PATH"
      sed -i '' "s|Status: draft|Status: active|g" "$SPEC_PATH"
      sed -i '' "s|Last updated: <YYYY-MM-DD>|Last updated: $TODAY|g" "$SPEC_PATH"
      sed -i '' "s|# <Feature or Bug Name>|# $FEATURE_NAME|g" "$SPEC_PATH"
      sed -i '' "s|<Feature or Bug Name>|$FEATURE_NAME|g" "$SPEC_PATH"
      echo "[info] Created spec: $SPEC_PATH"
    fi
  fi
fi

cat <<EOF
[done] Session worktree is ready.
- repo: $REPO_ROOT
- feature: $FEATURE_NAME
- branch: $BRANCH_NAME
- worktree: $WORKTREE_PATH
- spec: $SPEC_PATH

Next:
1) cd "$WORKTREE_PATH"
2) git status -sb
3) start execution from the active spec
EOF
