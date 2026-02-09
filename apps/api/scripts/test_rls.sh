#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
SYSTEM_PYTHON="$(command -v python3)"

create_venv() {
  python3 -m venv --system-site-packages "$VENV_DIR"
}

if [[ ! -d "$VENV_DIR" ]]; then
  create_venv
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

if ! python - <<'PY'
try:
    import jwt  # noqa: F401
except Exception:
    raise SystemExit(1)
PY
then
  deactivate || true
  rm -rf "$VENV_DIR"
  create_venv
  # shellcheck disable=SC1090
  source "$VENV_DIR/bin/activate"
fi

python -m pip install -r "$ROOT_DIR/requirements.txt"

if ! python - <<'PY'
try:
    import pytest  # noqa: F401
except Exception:
    raise SystemExit(1)
PY
then
  deactivate || true
  rm -rf "$VENV_DIR"
  create_venv
  # shellcheck disable=SC1090
  source "$VENV_DIR/bin/activate"
  python -m pip install -r "$ROOT_DIR/requirements.txt"
  python - <<'PY'
try:
    import pytest  # noqa: F401
except Exception:
    raise SystemExit(1)
PY
fi

set -a
source "$ROOT_DIR/.env.local"
set +a

cd "$ROOT_DIR"
python -m pytest -k rls_paths -q
