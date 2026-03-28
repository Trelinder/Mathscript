#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"
PORT="${PORT:-7860}"
HOST="${HOST:-127.0.0.1}"
BASE_URL="${HEALTHCHECK_BASE_URL:-http://${HOST}:${PORT}}"
SERVER_LOG="${ROOT_DIR}/.bugcheck-server.log"

echo "==> Mathscript bug check starting"
echo "    root: ${ROOT_DIR}"
echo "    base url: ${BASE_URL}"

if [[ ! -d "${VENV_DIR}" ]]; then
  echo "==> creating Python virtual environment"
  python3 -m venv "${VENV_DIR}"
fi

echo "==> installing backend dependencies"
"${VENV_DIR}/bin/pip" install -q -r "${ROOT_DIR}/requirements.txt"

echo "==> checking frontend dependencies"
cd "${ROOT_DIR}/frontend"
npm install --silent

echo "==> running frontend lint"
set +e
npm run lint
LINT_EXIT=$?
set -e
if [[ "${LINT_EXIT}" -ne 0 ]]; then
  echo "==> warning: frontend lint reported issues (exit ${LINT_EXIT}); continuing runtime bug checks"
fi

echo "==> running frontend build"
npm run build

cd "${ROOT_DIR}"
echo "==> running backend compile/import checks"
"${VENV_DIR}/bin/python" -m py_compile backend/main.py backend/database.py backend/healthcheck.py
"${VENV_DIR}/bin/python" -c "import backend.main; print('backend import ok')"

echo "==> starting backend server for smoke checks"
"${VENV_DIR}/bin/python" -m uvicorn backend.main:app --host "${HOST}" --port "${PORT}" >"${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}"
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

sleep 4

echo "==> smoke: GET /"
curl -fsS "${BASE_URL}/" >/dev/null

echo "==> smoke: GET /api/characters"
curl -fsS "${BASE_URL}/api/characters" >/dev/null

echo "==> smoke: GET /api/health"
HEALTH_JSON="$(curl -fsS "${BASE_URL}/api/health")"
echo "${HEALTH_JSON}" | "${VENV_DIR}/bin/python" -c 'import json,sys; r=json.load(sys.stdin); print(f"health total={r.get(\"total\")} passed={r.get(\"passed\")} failed={r.get(\"failed_count\")}")'

echo "==> bug check complete"
if [[ "${LINT_EXIT}" -ne 0 ]]; then
  echo "==> completed with lint issues"
  exit "${LINT_EXIT}"
fi
