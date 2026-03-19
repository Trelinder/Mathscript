#!/usr/bin/env bash
# deploy.sh — Oracle Cloud deployment script for The Math Script
# Handles SSH keepalive, frontend build, and backend startup.
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override with environment variables when needed
# ---------------------------------------------------------------------------
APP_PORT="${APP_PORT:-5000}"
APP_HOST="${APP_HOST:-0.0.0.0}"
APP_WORKERS="${APP_WORKERS:-2}"
# SSH_KEEPALIVE_HOST: set to a specific hostname pattern (e.g. "*.oraclecloud.com")
# to limit the keepalive settings to Oracle Cloud hosts only.
SSH_KEEPALIVE_HOST="${SSH_KEEPALIVE_HOST:-*}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---------------------------------------------------------------------------
# SSH keepalive — write a per-user SSH client config so connections to
# Oracle Cloud (and any other host) stay alive instead of timing out.
# ServerAliveInterval: send a keepalive packet every 60 seconds.
# ServerAliveCountMax: drop the connection only after 10 missed replies
#                      (i.e. ~10 minutes of total silence).
# ---------------------------------------------------------------------------
configure_ssh_keepalive() {
    local ssh_config="$HOME/.ssh/config"
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"

    if [ -f "$ssh_config" ] && grep -q "Math Script / Oracle Cloud keepalive" "$ssh_config"; then
        echo "[deploy] SSH keepalive already configured in $ssh_config"
        return
    fi

    cat >> "$ssh_config" <<EOF

# ── Math Script / Oracle Cloud keepalive ────────────────────────────────────
Host ${SSH_KEEPALIVE_HOST}
    ServerAliveInterval 60
    ServerAliveCountMax 10
    TCPKeepAlive yes
    ConnectTimeout 30
# ────────────────────────────────────────────────────────────────────────────
EOF

    chmod 600 "$ssh_config"
    echo "[deploy] SSH keepalive configured in $ssh_config (Host: ${SSH_KEEPALIVE_HOST})"
}

# ---------------------------------------------------------------------------
# Build frontend
# ---------------------------------------------------------------------------
build_frontend() {
    echo "[deploy] Building frontend …"
    cd "$ROOT_DIR/frontend"
    npm install --silent
    npm run build
    echo "[deploy] Frontend build complete → $ROOT_DIR/frontend/dist"
    cd "$ROOT_DIR"
}

# ---------------------------------------------------------------------------
# Start the FastAPI backend
# Uvicorn serves the React build from frontend/dist as static files and
# handles all /api/* routes.
# ---------------------------------------------------------------------------
start_backend() {
    echo "[deploy] Starting backend on $APP_HOST:$APP_PORT …"
    cd "$ROOT_DIR"
    exec uvicorn backend.main:app \
        --host "$APP_HOST" \
        --port "$APP_PORT" \
        --workers "$APP_WORKERS" \
        --log-level warning
}

# ---------------------------------------------------------------------------
# Health check — waits for the server to become ready, then runs the
# built-in health check suite and prints a summary.
# ---------------------------------------------------------------------------
run_health_check() {
    local url="http://127.0.0.1:${APP_PORT}/api/health"
    local retries=15
    local delay=2

    echo "[deploy] Waiting for server to be ready …"
    for i in $(seq 1 $retries); do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo "[deploy] Server is up. Running health checks …"
            curl -s "$url" | python3 -m json.tool
            return 0
        fi
        sleep "$delay"
    done
    echo "[deploy] WARNING: server did not respond within $((retries * delay))s" >&2
    return 1
}

# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
MODE="${1:-run}"

case "$MODE" in
    ssh-keepalive)
        configure_ssh_keepalive
        ;;
    build)
        build_frontend
        ;;
    health)
        run_health_check
        ;;
    run)
        configure_ssh_keepalive
        build_frontend
        start_backend
        ;;
    *)
        echo "Usage: $0 [run|build|ssh-keepalive|health]" >&2
        echo ""
        echo "  run            (default) configure SSH, build frontend, start backend"
        echo "  build          build the React frontend only"
        echo "  ssh-keepalive  write SSH keepalive settings to ~/.ssh/config"
        echo "  health         poll /api/health and print results"
        exit 1
        ;;
esac
