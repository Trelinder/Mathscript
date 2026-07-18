"""Minimal backend smoke test for runtime upgrades.

This script intentionally avoids pytest so it can run in GitHub Actions and
App Service build environments with only the production requirements installed.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


DUMMY_ENV = {
    "AI_INTEGRATIONS_GEMINI_BASE_URL": "https://example.invalid",
    "GEMINI_API_KEY": "dummy",
    "GOOGLE_API_KEY": "dummy",
    "OPENAI_API_KEY": "dummy",
    "STRIPE_SECRET_KEY": "sk_test_dummy",
    "STRIPE_PUBLISHABLE_KEY": "pk_test_dummy",
    "RESEND_API_KEY": "dummy",
    "RESEND_FROM_EMAIL": "noreply@example.invalid",
    "FIREBASE_SERVICE_ACCOUNT_JSON": "{}",
    "SESSION_SECRET": "smoke-test-secret",
    "ADMIN_PASSWORD": "smoke-test-admin",
}


def main() -> None:
    for key, value in DUMMY_ENV.items():
        os.environ.setdefault(key, value)

    from backend.main import app

    route_paths = {getattr(route, "path", None) for route in app.routes}
    required_routes = {"/api/health", "/api/auth/guest", "/api/session/{session_id}"}
    missing = required_routes - route_paths
    if missing:
        raise SystemExit(f"Missing expected route(s): {', '.join(sorted(missing))}")

    client = TestClient(app)
    health = client.get("/api/health")
    if health.status_code != 200:
        raise SystemExit(f"/api/health returned HTTP {health.status_code}: {health.text[:200]}")

    guest = client.post("/api/auth/guest")
    if guest.status_code != 200:
        raise SystemExit(f"/api/auth/guest returned HTTP {guest.status_code}: {guest.text[:200]}")

    payload = guest.json()
    if not payload.get("session_id") or not payload.get("token"):
        raise SystemExit("Guest auth response did not include session_id and token")

    print("Backend smoke test passed")


if __name__ == "__main__":
    main()