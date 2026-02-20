#!/usr/bin/env bash
set -euo pipefail

# Resolve script location so deploy works regardless of cwd.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT_DIR/frontend"
npm install
npm run build
