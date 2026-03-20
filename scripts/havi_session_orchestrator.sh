#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT_DEFAULT="/Users/gabedavis/Desktop/projects/havilogger"
WORKTREES_ROOT_DEFAULT="/Users/gabedavis/Desktop/projects/havi-worktrees"
BASE_BRANCH="main"
REPO_ROOT="$REPO_ROOT_DEFAULT"
WORKTREES_ROOT="$WORKTREES_ROOT_DEFAULT"
FEATURE_NAME=""
BRANCH_NAME=""
DO_FETCH=1
DO_SPEC=1
DRY_RUN=0
BOOTSTRAP_WEB_DEPS=1

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
  --no-bootstrap-web-deps        Skip worktree web dependency bootstrap
  --bootstrap-web-deps           Force worktree web dependency bootstrap (default)
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
    --no-bootstrap-web-deps)
      BOOTSTRAP_WEB_DEPS=0
      shift
      ;;
    --bootstrap-web-deps)
      BOOTSTRAP_WEB_DEPS=1
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

if [[ ! -e "$REPO_ROOT/.git" ]]; then
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

if [[ -d "$WORKTREE_PATH/.git" || -f "$WORKTREE_PATH/.git" ]]; then
  echo "[info] Reusing existing worktree: $WORKTREE_PATH"
else
  if [[ "$DRY_RUN" -eq 1 ]]; then
    run_cmd "git worktree add -b \"$BRANCH_NAME\" \"$WORKTREE_PATH\" \"origin/$BASE_BRANCH\""
  elif git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
    run_cmd "git worktree add \"$WORKTREE_PATH\" \"$BRANCH_NAME\""
  elif git ls-remote --heads origin "$BRANCH_NAME" | grep -q "$BRANCH_NAME"; then
    run_cmd "git worktree add -b \"$BRANCH_NAME\" \"$WORKTREE_PATH\" \"origin/$BRANCH_NAME\""
  else
    if git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
      run_cmd "git worktree add -b \"$BRANCH_NAME\" \"$WORKTREE_PATH\" \"origin/$BASE_BRANCH\""
    else
      run_cmd "git worktree add -b \"$BRANCH_NAME\" \"$WORKTREE_PATH\" \"$BASE_BRANCH\""
    fi
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

if [[ "$BOOTSTRAP_WEB_DEPS" -eq 1 ]]; then
  BOOTSTRAP_SCRIPT="$REPO_ROOT/scripts/worktree_bootstrap.sh"
  if [[ ! -x "$BOOTSTRAP_SCRIPT" ]]; then
    echo "Bootstrap script not executable or missing: $BOOTSTRAP_SCRIPT" >&2
    exit 1
  fi
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] \"$BOOTSTRAP_SCRIPT\" --worktree \"$WORKTREE_PATH\""
  else
    "$BOOTSTRAP_SCRIPT" --worktree "$WORKTREE_PATH"
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
3) verify readiness: ./scripts/worktree_bootstrap.sh --check-only
4) start execution from the active spec
EOF
