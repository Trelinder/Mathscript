#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
#  MathScript — Oracle Cloud Deploy Script
#  Usage: ./deploy.sh
#  Run from project root on the Oracle VM.
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS_STAMP="$ROOT_DIR/venv/.deps_installed"
echo "== MathScript Deploy =="
echo "   Root: $ROOT_DIR"

# ── 0. Configure SSH keepalive (prevents Oracle SSH timeout drops) ────
echo "-> Configuring SSH keepalive..."
SSH_CONFIG="$HOME/.ssh/config"
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
if ! grep -q "ServerAliveInterval" "$SSH_CONFIG" 2>/dev/null; then
    cat >> "$SSH_CONFIG" <<'EOF'

# MathScript — Oracle SSH keepalive (added by deploy.sh)
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 10
    TCPKeepAlive yes
EOF
    chmod 600 "$SSH_CONFIG"
    echo "   [OK] SSH keepalive configured in $SSH_CONFIG"
else
    echo "   [OK] SSH keepalive already configured"
fi

# ── 1. Load env vars ──────────────────────────────────────────────────
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
    set +a
    echo "   [OK] .env loaded"
else
    echo "   [WARN] No .env file found — ensure env vars are set in systemd or shell"
fi

# ── 2. Build frontend ─────────────────────────────────────────────────
echo "-> Building frontend..."
cd "$ROOT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "   node_modules missing; installing frontend dependencies..."
    npm install --silent --no-audit --no-fund
else
    echo "   node_modules present; skipping npm install for faster deploy"
fi
npm run build
if [ ! -f "$ROOT_DIR/frontend/dist/index.html" ]; then
    echo "ERROR: Frontend build failed (frontend/dist/index.html missing)."
    exit 1
fi
echo "   [OK] Frontend built to frontend/dist/"

# ── 3. Install Python dependencies ───────────────────────────────────
echo "-> Installing Python dependencies..."
cd "$ROOT_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "   [OK] venv created"
fi
source venv/bin/activate
if [ ! -f "$DEPS_STAMP" ] || [ requirements.txt -nt "$DEPS_STAMP" ]; then
    echo "   Installing/updating Python dependencies..."
    pip install -q -r requirements.txt
    touch "$DEPS_STAMP"
    echo "   [OK] Python deps installed"
else
    echo "   requirements unchanged; skipping pip install for faster deploy"
fi

# ── 4. Check required env vars ────────────────────────────────────────
echo "-> Checking required environment variables..."
MISSING=0
for VAR in SESSION_SECRET; do
    if [ -z "${!VAR:-}" ]; then
        echo "   [MISSING] $VAR is not set!"
        MISSING=1
    else
        echo "   [OK] $VAR"
    fi
done
# Warn (but don't fail) on optional production vars
for VAR in DATABASE_URL GEMINI_API_KEY OPENAI_API_KEY STRIPE_SECRET_KEY; do
    if [ -z "${!VAR:-}" ]; then
        echo "   [WARN] $VAR is not set (optional — some features will be disabled)"
    else
        echo "   [OK] $VAR"
    fi
done

if [ "$MISSING" -eq 1 ]; then
    echo ""
    echo "ERROR: One or more required environment variables are missing."
    echo "       Copy .env.example to .env and fill in the values."
    exit 1
fi

# ── 5. Run database migrations ───────────────────────────────────────
echo "-> Running database migrations..."
cd "$ROOT_DIR"
if [ -n "${DATABASE_URL:-}" ]; then
    if ! alembic upgrade head; then
        echo "   [WARN] Alembic migrations failed. Check your DATABASE_URL and DB connectivity."
        echo "          Continuing deploy — app may still run with existing schema."
    else
        echo "   [OK] Migrations applied"
    fi
else
    echo "   [SKIP] DATABASE_URL not set — skipping migrations"
fi

# ── 6. Restart systemd service (if available) ─────────────────────────
if systemctl is-active --quiet mathscript 2>/dev/null; then
    echo "-> Restarting mathscript systemd service..."
    sudo systemctl restart mathscript
    sleep 2
    sudo systemctl status mathscript --no-pager
    echo "   [OK] Service restarted"
elif systemctl list-unit-files mathscript.service &>/dev/null; then
    echo "-> Starting mathscript systemd service..."
    sudo systemctl start mathscript
    echo "   [OK] Service started"
else
    echo "-> No systemd service found. Starting manually..."
    echo "   Run: uvicorn backend.main:app --host 0.0.0.0 --port 5000"
    echo ""
    echo "   Or install the systemd service — see .cursor/rules/oracle-deploy.mdc"
fi

# ── 7. Smoke checks ───────────────────────────────────────────────────
echo "-> Running post-deploy smoke checks..."
if ! curl -fsS --max-time 10 http://127.0.0.1:5000/api/health >/dev/null; then
    echo "ERROR: Health endpoint check failed at /api/health"
    exit 1
fi
if ! curl -fsS --max-time 10 http://127.0.0.1:5000/ >/dev/null; then
    echo "ERROR: Root UI check failed at /"
    exit 1
fi
echo "   [OK] Smoke checks passed"

echo ""
echo "== Deploy complete =="
echo "   App should be available at http://$(hostname -I | awk '{print $1}'):5000"
