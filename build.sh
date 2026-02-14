#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

if [ ! -d "$FRONTEND_DIR" ]; then
  FRONTEND_DIR="/home/runner/workspace/frontend"
fi

if [ ! -d "$FRONTEND_DIR" ]; then
  echo "ERROR: frontend directory not found"
  exit 1
fi

if [ ! -f "$FRONTEND_DIR/package.json" ]; then
  echo "ERROR: frontend/package.json not found"
  exit 1
fi

echo "Building frontend from: $FRONTEND_DIR"
cd "$FRONTEND_DIR"
npm install
npm run build
echo "Frontend build complete"
