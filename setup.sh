#!/usr/bin/env bash
set -euo pipefail

# ── MathScript Local Development Setup ──
# Creates a Python virtual-environment, installs backend dependencies,
# and builds the React frontend so the app can run locally.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${ROOT_DIR}/.venv"

echo "── Creating Python virtual-environment in ${VENV_DIR} ──"
python3 -m venv "${VENV_DIR}"

echo "── Installing Python dependencies ──"
"${VENV_DIR}/bin/pip" install --upgrade pip
"${VENV_DIR}/bin/pip" install -r "${ROOT_DIR}/requirements.txt"

echo "── Building React frontend ──"
cd "${ROOT_DIR}/frontend"
npm install
npm run build

echo ""
echo "✅  Setup complete!"
echo ""
echo "To start the server run:"
echo "  cd ${ROOT_DIR}"
echo "  source .venv/bin/activate"
echo "  uvicorn backend.main:app --host 0.0.0.0 --port 7860"
