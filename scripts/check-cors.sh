#!/usr/bin/env bash
set -euo pipefail

TARGET=${1:-http://127.0.0.1:8000/health}
ORIGIN=${2:-http://127.0.0.1:3001}

echo "Checking CORS header for origin ${ORIGIN} against ${TARGET}"
RESPONSE_HEADERS=$(curl -sI -H "Origin: ${ORIGIN}" "${TARGET}")
if printf "%s" "${RESPONSE_HEADERS}" | grep -qi "Access-Control-Allow-Origin: ${ORIGIN}"; then
  echo "CORS looks good (${ORIGIN})"
  exit 0
else
  printf "%s" "${RESPONSE_HEADERS}"
  echo "Missing Access-Control-Allow-Origin for ${ORIGIN}" >&2
  exit 1
fi
