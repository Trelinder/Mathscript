import os
import io
import re
import json
import ast
import copy
import base64
import datetime
import wave
import random
import logging
import operator
import threading
import concurrent.futures
import hmac
import hashlib
import urllib.parse
from pathlib import Path
import requests as http_requests

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

try:
    from azure.identity import DefaultAzureCredential
    from azure.keyvault.secrets import SecretClient
    AZURE_SDK_AVAILABLE = True
except ImportError:
    AZURE_SDK_AVAILABLE = False

if AZURE_SDK_AVAILABLE:
    try:
        needed_secrets = []
        if not os.environ.get("AI_INTEGRATIONS_GEMINI_BASE_URL"):
            needed_secrets.append(("AI_INTEGRATIONS_GEMINI_BASE_URL", "AI-INTEGRATIONS-GEMINI-BASE-URL"))
        if not os.environ.get("GEMINI_API_KEY"):
            needed_secrets.append(("GEMINI_API_KEY", "gemini-api"))
        if not os.environ.get("GOOGLE_API_KEY"):
            needed_secrets.append(("GOOGLE_API_KEY", "gemini-api"))
        if not os.environ.get("OPENAI_API_KEY"):
            needed_secrets.append(("OPENAI_API_KEY", "openAI-Api"))
        if not os.environ.get("STRIPE_SECRET_KEY"):
            needed_secrets.append(("STRIPE_SECRET_KEY", "stripe-secret-key"))
        if not os.environ.get("STRIPE_PUBLISHABLE_KEY"):
            needed_secrets.append(("STRIPE_PUBLISHABLE_KEY", "stripe-publishable-key"))
        if not os.environ.get("RESEND_API_KEY"):
            needed_secrets.append(("RESEND_API_KEY", "resend-api-key"))
        if not os.environ.get("COSMOS_URI"):
            needed_secrets.append(("COSMOS_URI", "cosmos-uri"))
        if not os.environ.get("COSMOS_KEY"):
            needed_secrets.append(("COSMOS_KEY", "cosmos-key"))
        if not os.environ.get("SESSION_SECRET"):
            needed_secrets.append(("SESSION_SECRET", "session-secret"))
        if not os.environ.get("ADMIN_PASSWORD"):
            needed_secrets.append(("ADMIN_PASSWORD", "admin-password"))

        if needed_secrets:
            # Wrap _fetch_secrets to log success/failure without hiding the result.
            def _fetch_secrets(_needed):
                vault_url = "https://mathscriptkey.vault.azure.net/"
                try:
                    credential = DefaultAzureCredential()
                    client = SecretClient(vault_url=vault_url, credential=credential)
                    for env_name, secret_name in _needed:
                        os.environ[env_name] = client.get_secret(secret_name).value
                    logger.info(
                        "Azure Key Vault bootstrap complete — loaded %d secret(s)", len(_needed)
                    )
                except Exception as _kv_exc:
                    logger.warning(
                        "Azure Key Vault bootstrap failed — using environment variables if set "
                        "(%s: %s)", type(_kv_exc).__name__, _kv_exc
                    )

            # Fire-and-forget: start the KV fetch in a background daemon thread so
            # the server binds its port immediately.  Secrets land in os.environ
            # within a few seconds; any request that arrives before they're ready
            # falls back to whatever env vars are already set (e.g. Azure App Settings).
            _kv_thread = threading.Thread(
                target=_fetch_secrets, args=(needed_secrets,), daemon=True,
                name="kv-bootstrap",
            )
            _kv_thread.start()
    except Exception as exc:
        # Azure Key Vault is optional in local/non-Azure environments.
        logger.warning(
            f"Azure Key Vault bootstrap skipped - using environment variables if set "
            f"({type(exc).__name__}: {exc})"
        )

from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Header
from fastapi.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, JSONResponse, RedirectResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, field_validator
from typing import Optional
from google import genai
from google.genai import types
from fpdf import FPDF
from openai import OpenAI
import stripe
import jwt as _jwt
from passlib.context import CryptContext

SESSION_SECRET = os.environ.get("SESSION_SECRET", "fallback-dev-secret-change-me")
JWT_SECRET = SESSION_SECRET
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = 30

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# In-memory user store — used as a fallback when Cosmos DB is unavailable.
# Stores { username: { passwordHash, sessionId, email, heroUnlocked,
#          tycoonCurrency } }  in process memory.  Data is lost on restart,
# but allows registration / login / guest play to work without Cosmos.
# ---------------------------------------------------------------------------
_mem_users: dict[str, dict] = {}
_mem_users_lock = threading.Lock()


def _mem_get_user(username: str):
    with _mem_users_lock:
        return copy.deepcopy(_mem_users[username]) if username in _mem_users else None


def _mem_upsert_user(username: str, password_hash: str, session_id: str,
                     hero_unlocked=None, tycoon_currency: int = 0,
                     extra: dict | None = None):
    with _mem_users_lock:
        doc = _mem_users.get(username, {})
        doc.update({
            "username": username,
            "sessionId": session_id,
            "heroUnlocked": hero_unlocked,
            "tycoonCurrency": tycoon_currency,
        })
        if password_hash:
            doc["passwordHash"] = password_hash
        if extra:
            doc.update(extra)
        _mem_users[username] = doc


def _hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def _verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def _create_jwt(username: str, session_id: str) -> str:
    payload = {
        "sub": username,
        "session_id": session_id,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=JWT_EXPIRY_DAYS),
    }
    return _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode_jwt(token: str) -> dict | None:
    """Decode and verify a JWT.  Returns the payload dict or None on failure."""
    try:
        return _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None

def sign_session_id(raw_id: str) -> str:
    sig = hmac.new(SESSION_SECRET.encode(), raw_id.encode(), hashlib.sha256).hexdigest()[:12]
    return f"{raw_id}.{sig}"

def verify_session_id(signed_id: str) -> str:
    if '.' not in signed_id:
        return None
    raw_id, sig = signed_id.rsplit('.', 1)
    expected = hmac.new(SESSION_SECRET.encode(), raw_id.encode(), hashlib.sha256).hexdigest()[:12]
    if not hmac.compare_digest(sig, expected):
        return None
    return raw_id

_SESSION_ID_PATTERN = re.compile(r'^sess_[a-z0-9]{6,20}$')

def validate_session_id(session_id: str) -> str:
    if not session_id or len(session_id) > 50:
        raise HTTPException(status_code=400, detail="Invalid session")
    if session_id == "__healthcheck_test__":
        return session_id
    if not _SESSION_ID_PATTERN.match(session_id):
        raise HTTPException(status_code=400, detail="Invalid session format")
    return session_id

from backend.database import init_db, get_or_create_user, update_user_stripe, get_daily_usage, increment_usage, can_solve_problem, is_premium, FREE_DAILY_LIMIT, load_session_data, save_session_data, get_all_feature_flags, get_feature_flag, set_feature_flag
from backend.healthcheck import (
    start_health_check_scheduler, run_health_checks, get_last_report,
    start_guardian, get_guardian_status, reset_guardian,
    disable_guardian, enable_guardian,
    register_guardian_repair, register_guardian_safe_state_hook,
)
from backend.cosmos_service import get_cosmos_service

try:
    init_db()
    logger.warning("Database init complete")
except Exception as e:
    logger.warning(f"Database init warning: {e}")

start_health_check_scheduler()

# ── Guardian repair playbook ──────────────────────────────────────────────────
# Each function receives the failure dict and returns a human-readable summary.

def _repair_database_connection(_failure: dict) -> str:
    """Re-attempt database initialisation when the connection is lost."""
    init_db()
    return "init_db() called — connection re-attempted"

def _repair_frontend_build(_failure: dict) -> str:
    """Rebuild the frontend dist when the build artefacts are missing.

    Only runs in non-production environments and only when the env-var
    GUARDIAN_AUTO_BUILD is set to 'true', to prevent accidental builds in prod.
    """
    if _is_production():
        return "skipped — production environment"
    if os.environ.get("GUARDIAN_AUTO_BUILD", "").lower() not in ("1", "true", "yes"):
        return "skipped — GUARDIAN_AUTO_BUILD not enabled"
    import subprocess
    frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=frontend_dir,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(f"npm run build failed: {result.stderr[-500:]}")
    return "npm run build succeeded"

def _repair_gc_hint(_failure: dict) -> str:
    """Trigger a garbage-collection pass to recover stale memory."""
    import gc as _gc
    collected = _gc.collect()
    return f"gc.collect() recovered {collected} objects"

register_guardian_repair("Database connection", _repair_database_connection)
# Both "Frontend build" and "Frontend assets" map to the same repair: rebuilding
# the frontend dist directory resolves both the missing index.html and the
# missing asset files simultaneously.
register_guardian_repair("Frontend build", _repair_frontend_build)
register_guardian_repair("Frontend assets", _repair_frontend_build)

# ── Guardian safe-state hooks ─────────────────────────────────────────────────
# These are called when the kill switch is engaged to restore a clean baseline.

def _safe_state_clear_rate_limits() -> str:
    """Clear all in-process rate-limit windows."""
    count = len(_rate_limits)
    _rate_limits.clear()
    return f"rate_limits cleared ({count} keys)"

def _safe_state_clear_flag_cache() -> str:
    """Clear the feature-flag TTL cache so all flags are re-read from source."""
    count = len(_flag_cache)
    _flag_cache.clear()
    return f"flag_cache cleared ({count} entries)"

register_guardian_safe_state_hook(_safe_state_clear_rate_limits)
register_guardian_safe_state_hook(_safe_state_clear_flag_cache)

start_guardian()

import traceback

class ErrorPatcherMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"CRITICAL ERROR: {e}\n{traceback.format_exc()}")
            raise e

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(ErrorPatcherMiddleware)

# ── Firebase Admin SDK ─────────────────────────────────────────────────────────
# Initialised once at startup using the service-account JSON stored in the
# `firebase_service_account` App Service environment variable.  If the variable
# is absent (local dev without Firebase) the SDK is simply left un-initialised
# and token verification falls back to trusting the request body (dev-only).

import firebase_admin
from firebase_admin import credentials as _fb_credentials, auth as _fb_auth

_firebase_ready = False
_fb_sa_json = os.environ.get("firebase_service_account", "").strip()
if _fb_sa_json:
    try:
        _fb_sa_info = json.loads(_fb_sa_json)
        _fb_cred    = _fb_credentials.Certificate(_fb_sa_info)
        firebase_admin.initialize_app(_fb_cred)
        _firebase_ready = True
        logger.info("Firebase Admin SDK initialised successfully.")
    except Exception as _fb_exc:
        logger.warning("Firebase Admin SDK init failed — token verification disabled: %s", _fb_exc)
else:
    logger.warning("firebase_service_account env var not set — Firebase token verification disabled.")

app.add_middleware(GZipMiddleware, minimum_size=500)

import time as _time
from collections import defaultdict

_rate_limits = defaultdict(list)
_RATE_WINDOW = 60
_RATE_MAX = 10
_rate_limit_last_cleanup = _time.time()

def check_rate_limit(key: str, max_requests: int = _RATE_MAX, window: int = _RATE_WINDOW):
    global _rate_limit_last_cleanup
    now = _time.time()

    if now - _rate_limit_last_cleanup > 300:
        stale_keys = [k for k, v in _rate_limits.items() if not v or now - v[-1] > 300]
        for k in stale_keys:
            del _rate_limits[k]
        _rate_limit_last_cleanup = now

    _rate_limits[key] = [t for t in _rate_limits[key] if now - t < window]
    if len(_rate_limits[key]) >= max_requests:
        return False
    _rate_limits[key].append(now)
    return True

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def check_global_rate_limit(request: Request, max_requests: int = 60, window: int = 60):
    ip = get_client_ip(request)
    return check_rate_limit(f"global_ip:{ip}", max_requests, window)

_cors_origins = []
_dev_domain = os.environ.get("REPLIT_DEV_DOMAIN", "")
_replit_domains = os.environ.get("REPLIT_DOMAINS", "")
if _dev_domain:
    _cors_origins.append(f"https://{_dev_domain}")
for d in _replit_domains.split(","):
    d = d.strip()
    if d:
        _cors_origins.append(f"https://{d}")
_app_base_url_env = os.environ.get("APP_BASE_URL", "").rstrip("/")
if _app_base_url_env and _app_base_url_env not in _cors_origins:
    _cors_origins.append(_app_base_url_env)
_azure_hostname = os.environ.get("WEBSITE_HOSTNAME", "")
if _azure_hostname:
    _azure_origin = f"https://{_azure_hostname}"
    if _azure_origin not in _cors_origins:
        _cors_origins.append(_azure_origin)
if not _cors_origins:
    _cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "x-admin-key"],
)

MAX_REQUEST_BODY = 12 * 1024 * 1024

_blocked_ips = {}
_BLOCK_DURATION = 3600
_suspicious_activity = defaultdict(int)
_SUSPICION_THRESHOLD = 3

_ADMIN_PATHS = {
    "/admin", "/admin/", "/Admin", "/Admin/",
    "/admin/dashboard", "/api/admin/promo/list",
    "/api/admin/promo/create", "/api/admin/promo/toggle",
    "/api/admin/promo/delete",
}

_HONEYPOT_PATHS = {
    "/administrator",
    "/.env", "/.git", "/.git/config", "/.gitignore",
    "/wp-admin", "/wp-login.php", "/wp-content", "/wordpress",
    "/debug", "/debug/vars", "/debug/pprof",
    "/config", "/config.json", "/config.yml", "/config.php",
    "/phpinfo", "/phpinfo.php", "/phpmyadmin",
    "/server-status", "/server-info",
    "/.htaccess", "/.htpasswd",
    "/backup", "/backup.sql", "/db.sql", "/dump.sql",
    "/api/v1/admin", "/api/admin", "/api/internal",
    "/console", "/shell", "/cmd", "/exec",
    "/actuator", "/actuator/env", "/actuator/health",
    "/swagger.json", "/api-docs",
    "/.aws/credentials", "/.docker/config.json",
    "/etc/passwd", "/etc/shadow",
    "/api/keys", "/api/tokens", "/api/secrets",
}

_ATTACK_PATTERNS = [
    re.compile(r"(\bunion\b.*\bselect\b|\bselect\b.*\bfrom\b.*\bwhere\b|\bdrop\b\s+\btable\b|\binsert\b\s+\binto\b)", re.IGNORECASE),
    re.compile(r"('|\"|;)\s*(or|and)\s+\d+\s*=\s*\d+", re.IGNORECASE),
    re.compile(r"<script[\s>]|javascript\s*:|on\w+\s*=", re.IGNORECASE),
    re.compile(r"\.\./\.\./|/etc/passwd|/proc/self|%2e%2e%2f", re.IGNORECASE),
    re.compile(r"\$\{.*j(ndi|ava).*\}|log4(j|shell)", re.IGNORECASE),
    re.compile(r"__(import|class|globals|builtins|subclasses)__", re.IGNORECASE),
    re.compile(r"\beval\s*\(|\bexec\s*\(|\bos\.system\s*\(|\bsubprocess\b", re.IGNORECASE),
    re.compile(r";\s*(ls|cat|wget|curl|bash|sh|nc|ncat)\s", re.IGNORECASE),
    re.compile(r"\bbase64_decode\b|\bchar\s*\(\s*\d+\s*\)|0x[0-9a-fA-F]{8,}", re.IGNORECASE),
]

_FAKE_RESPONSES = {
    "admin": {
        "status": "maintenance",
        "version": "2.1.4-legacy",
        "server": "Apache/2.4.41 (Ubuntu)",
        "note": "Admin panel temporarily disabled. Contact sysadmin.",
        "last_login": "2025-11-03T14:22:00Z",
        "users_online": 0,
    },
    "env": "APP_ENV=production\nDATABASE_URL=postgres://readonly:••••••@internal-db:5432/app\nSECRET_KEY=••••••••••••\nAWS_ACCESS_KEY=AKIA••••••••••••\nSTRIPE_KEY=sk_live_••••••••••••\nDEBUG=false\n",
    "config": {
        "app": "MathQuest",
        "version": "1.0.3",
        "environment": "production",
        "database": {"host": "internal-db.cluster.local", "port": 5432, "name": "mathquest_prod"},
        "redis": {"host": "redis.cluster.local", "port": 6379},
        "features": {"admin_panel": False, "debug_mode": False},
    },
    "swagger": {
        "openapi": "3.0.0",
        "info": {"title": "Internal API", "version": "0.0.1"},
        "paths": {},
        "components": {},
        "note": "Documentation moved to internal wiki.",
    },
}

def _flag_attacker(ip: str, reason: str):
    _suspicious_activity[ip] += 1
    logger.warning(f"SECURITY: Suspicious activity from {ip}: {reason} (strike {_suspicious_activity[ip]})")
    if _suspicious_activity[ip] >= _SUSPICION_THRESHOLD:
        _blocked_ips[ip] = _time.time()
        logger.warning(f"SECURITY: IP {ip} auto-blocked for {_BLOCK_DURATION}s after {_SUSPICION_THRESHOLD} strikes")

def _is_blocked(ip: str) -> bool:
    if ip in _blocked_ips:
        if _time.time() - _blocked_ips[ip] < _BLOCK_DURATION:
            return True
        else:
            del _blocked_ips[ip]
            _suspicious_activity.pop(ip, None)
    return False

def _detect_attack_patterns(text: str) -> str:
    for pattern in _ATTACK_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(0)[:50]
    return None

def _get_honeypot_response(path: str):
    _time.sleep(random.uniform(0.5, 2.0))
    if "env" in path or "htaccess" in path or "htpasswd" in path or "credentials" in path:
        return Response(content=_FAKE_RESPONSES["env"], media_type="text/plain", status_code=200,
                        headers={"Server": "Apache/2.4.41 (Ubuntu)", "X-Powered-By": "PHP/7.4.3"})
    if "administrator" in path or "login" in path or "console" in path:
        return JSONResponse(content=_FAKE_RESPONSES["admin"], status_code=403,
                            headers={"Server": "Apache/2.4.41 (Ubuntu)", "X-Powered-By": "PHP/7.4.3"})
    if "config" in path:
        return JSONResponse(content=_FAKE_RESPONSES["config"], status_code=200,
                            headers={"Server": "nginx/1.18.0", "X-Powered-By": "Express"})
    if "swagger" in path or "api-docs" in path:
        return JSONResponse(content=_FAKE_RESPONSES["swagger"], status_code=200,
                            headers={"Server": "nginx/1.18.0"})
    if "php" in path:
        return Response(content="<!DOCTYPE html><html><body><h1>phpinfo()</h1><p>PHP Version 7.4.3</p><p>System: Linux webserver 5.4.0-42-generic</p><table><tr><td>disable_functions</td><td>exec,passthru,shell_exec,system</td></tr></table></body></html>",
                        media_type="text/html", status_code=200,
                        headers={"Server": "Apache/2.4.41 (Ubuntu)", "X-Powered-By": "PHP/7.4.3"})
    if "sql" in path or "backup" in path or "dump" in path:
        return Response(content="-- MySQL dump\n-- Server version 5.7.31\n-- Access denied. Authentication required.\n",
                        media_type="text/plain", status_code=403)
    if "passwd" in path or "shadow" in path or "proc" in path:
        return Response(content="Permission denied\n", media_type="text/plain", status_code=403,
                        headers={"Server": "Apache/2.4.41 (Ubuntu)"})
    return JSONResponse(content={"error": "Forbidden"}, status_code=403,
                        headers={"Server": "nginx/1.18.0"})

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        ip = get_client_ip(request)

        if _is_blocked(ip):
            _time.sleep(random.uniform(1.0, 3.0))
            return JSONResponse(status_code=403, content={"detail": "Access denied"},
                                headers={"Server": "nginx/1.18.0", "Retry-After": "3600"})

        path = request.url.path.rstrip("/").lower() if request.url.path != "/" else "/"
        if request.url.path in _ADMIN_PATHS or path in {p.lower() for p in _ADMIN_PATHS}:
            pass
        elif path in _HONEYPOT_PATHS or request.url.path in _HONEYPOT_PATHS:
            _flag_attacker(ip, f"honeypot: {request.url.path}")
            return _get_honeypot_response(request.url.path)

        full_url = str(request.url)
        url_attack = _detect_attack_patterns(full_url)
        if url_attack:
            _flag_attacker(ip, f"attack_pattern_url: {url_attack}")
            return JSONResponse(status_code=400, content={"detail": "Bad request"},
                                headers={"Server": "nginx/1.18.0"})

        ua = request.headers.get("user-agent", "")
        _scanner_signatures = ["sqlmap", "nikto", "nmap", "dirbuster", "gobuster", "wfuzz",
                               "hydra", "masscan", "nuclei", "ffuf", "burpsuite", "zap",
                               "acunetix", "nessus", "openvas", "w3af", "arachni"]
        ua_lower = ua.lower()
        if any(scanner in ua_lower for scanner in _scanner_signatures):
            _flag_attacker(ip, f"scanner_detected: {ua[:60]}")
            _time.sleep(random.uniform(2.0, 5.0))
            return JSONResponse(status_code=200, content={"status": "ok"},
                                headers={"Server": "Apache/2.4.41 (Ubuntu)", "X-Powered-By": "PHP/7.4.3"})

        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_BODY:
            return JSONResponse(status_code=413, content={"detail": "Request too large"})

        if request.url.path.startswith("/api/") and request.url.path != "/api/health":
            if not check_global_rate_limit(request, max_requests=120, window=60):
                return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down."})

        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"

        response.headers["Server"] = "nginx"
        response.headers["X-Request-ID"] = hashlib.md5(f"{ip}{_time.time()}{random.random()}".encode()).hexdigest()[:16]

        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            # 'unsafe-inline' needed for React's style props; 'wasm-unsafe-eval' needed
            # for Phaser 3's WebAssembly physics backend.
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.stripe.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob: data:; "
            # blob: worker-src is required for Phaser 3 Web Workers (audio, physics).
            "worker-src blob: 'self'; "
            "connect-src 'self' https://api.stripe.com; "
            "frame-src https://js.stripe.com https://hooks.stripe.com; "
            "object-src 'none'; "
            "base-uri 'self'"
        )
        rpath = request.url.path
        if rpath.startswith("/assets/") or rpath.startswith("/images/"):
            response.headers["Cache-Control"] = "public, max-age=604800, immutable"
        else:
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        return response

app.add_middleware(SecurityHeadersMiddleware)

PII_PATTERNS = [
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'), '[REDACTED]'),
    (re.compile(r'\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b'), '[REDACTED]'),
    (re.compile(r'\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b'), '[REDACTED]'),
    (re.compile(r'\b(?:\d{4}[-\s]?){3}\d{4}\b'), '[REDACTED]'),
    (re.compile(r'\b(?:bearer|token|key|password|secret|auth|credential)[:\s=]+\S+', re.IGNORECASE), '[REDACTED]'),
    (re.compile(r'\b(?:sk-|pk_|api[_-]?key[_-]?|ghp_|gho_|xox[bpas]-)\S+', re.IGNORECASE), '[REDACTED]'),
    (re.compile(r'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+'), '[REDACTED]'),
    (re.compile(r'\b[A-Fa-f0-9]{32,}\b'), '[REDACTED]'),
]

def sanitize_input(text: str) -> str:
    if not text:
        return text
    sanitized = text
    for pattern, replacement in PII_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized

def scan_input_for_attacks(text: str, request: Request = None):
    if not text:
        return
    attack = _detect_attack_patterns(text)
    if attack:
        ip = get_client_ip(request) if request else "unknown"
        _flag_attacker(ip, f"attack_in_body: {attack}")
        raise HTTPException(status_code=400, detail="Invalid input")

def sanitize_error(error: Exception) -> str:
    msg = str(error)
    for pattern, replacement in PII_PATTERNS:
        msg = pattern.sub(replacement, msg)
    return msg

_MATH_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_MATH_UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

def _format_math_number(value: float) -> str:
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.6f}".rstrip("0").rstrip(".")

def _safe_eval_math_ast(node):
    if isinstance(node, ast.Expression):
        return _safe_eval_math_ast(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError("Unsupported constant")
    if isinstance(node, ast.UnaryOp) and type(node.op) in _MATH_UNARY_OPS:
        return _MATH_UNARY_OPS[type(node.op)](_safe_eval_math_ast(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in _MATH_BIN_OPS:
        left = _safe_eval_math_ast(node.left)
        right = _safe_eval_math_ast(node.right)
        if type(node.op) in (ast.Div, ast.FloorDiv, ast.Mod) and abs(right) < 1e-12:
            raise ValueError("Division by zero")
        if isinstance(node.op, ast.Pow):
            if abs(right) > 8 or abs(left) > 1_000_000:
                raise ValueError("Power too large")
        out = _MATH_BIN_OPS[type(node.op)](left, right)
        if not isinstance(out, (int, float)):
            raise ValueError("Invalid arithmetic output")
        if abs(out) > 1_000_000_000:
            raise ValueError("Value too large")
        return float(out)
    raise ValueError("Unsupported expression")

def _normalize_math_expression(problem: str) -> Optional[str]:
    if not problem:
        return None
    expr = problem.strip()
    expr = re.sub(r'(?i)^\s*(what is|solve|calculate|find)\s*', '', expr).strip()
    expr = expr.replace(",", "")
    expr = expr.replace("×", "*").replace("÷", "/")
    expr = expr.replace("–", "-").replace("—", "-")
    expr = expr.replace("²", "^2").replace("³", "^3")
    expr = re.sub(r'(?i)\bplus\b', '+', expr)
    expr = re.sub(r'(?i)\bminus\b', '-', expr)
    expr = re.sub(r'(?i)\b(times|multiplied by)\b', '*', expr)
    expr = re.sub(r'(?i)\b(divided by|over)\b', '/', expr)
    expr = re.sub(r'(?<=\d)\s*[xX]\s*(?=\d)', '*', expr)
    expr = re.sub(r'\s+', '', expr)

    if '=' in expr:
        left, right = expr.split('=', 1)
        if '?' in right or right == "":
            expr = left

    if not expr or len(expr) > 48:
        return None
    if not re.fullmatch(r'[0-9+\-*/().^%]+', expr):
        return None
    expr = expr.replace("^", "**")
    if "***" in expr:
        return None
    return expr

def try_solve_basic_math(problem: str):
    expr = _normalize_math_expression(problem)
    if not expr:
        return None
    try:
        parsed = ast.parse(expr, mode='eval')
        value = _safe_eval_math_ast(parsed)
    except Exception:
        return None

    answer = _format_math_number(value)
    display_expr = expr.replace("**", "^")
    math_steps = [
        f"Rewrite the challenge as {display_expr}.",
        f"Compute it: {display_expr} = {answer}.",
        f"Answer: {answer}",
    ]
    math_solution = (
        f"STEP 1: Rewrite the challenge as {display_expr}.\n"
        f"STEP 2: Compute it: {display_expr} = {answer}.\n"
        f"ANSWER: {answer}"
    )
    return {
        "answer": answer,
        "display_expr": display_expr,
        "math_steps": math_steps,
        "math_solution": math_solution,
    }

def build_fast_story_segments(hero_name: str, pronoun_he: str, pronoun_his: str, problem: str, answer: str, realm: str, player_name: str):
    if hero_name == "Zenith":
        return [
            f"In {realm}, {player_name} calls in Zenith as the challenge appears: {problem}. A blazing golden aura erupts across the arena.",
            f"Zenith powers up and breaks the numbers into clean battle steps. {pronoun_he} keeps focus, lines up each operation, and controls the pace.",
            f"The boss tries to scramble the math, but Zenith counters with sharp energy strikes and checks every move. The final sequence locks into place.",
            f"Victory! Zenith unleashes the finishing blast and reveals the answer: {answer}. {player_name} levels up with unstoppable confidence.",
        ]
    return [
        f"In {realm}, {player_name} asks {hero_name} to solve {problem}. A math portal opens and the challenge flashes in bright runes.",
        f"{hero_name} steadies {pronoun_his} stance and breaks the problem into simple moves. The numbers start lining up as {pronoun_he} guides the first step.",
        f"A tricky moment appears, but {hero_name} keeps focus and checks each operation carefully. The final pattern locks into place with a burst of light.",
        f"Victory! {hero_name} raises {pronoun_his} hand and reveals the answer: {answer}. {player_name} levels up with confidence and cheers.",
    ]

def build_timeout_story_segments(hero_name: str, pronoun_he: str, pronoun_his: str, problem: str, realm: str, player_name: str):
    if hero_name == "Zenith":
        return [
            f"In {realm}, {player_name} summons Zenith to solve {problem}. The full strategy feed lags, but Zenith immediately enters battle stance.",
            f"Zenith charges {pronoun_his} golden aura while marking the key numbers. {pronoun_he} secures the field so the mission stays on track.",
            f"Quick mode activates to keep the quest moving. Zenith holds the boss back with rapid strikes while the full solve catches up.",
            f"Quick victory secured! Continue the quest, then retry this challenge to unlock Zenith's full AI power explanation.",
        ]
    return [
        f"In {realm}, {player_name} calls on {hero_name} to tackle {problem}. The challenge is locked behind a heavy magic barrier.",
        f"{hero_name} begins charging {pronoun_his} powers while the full strategy scroll is loading. {pronoun_he} marks the key numbers to start safely.",
        f"The mission enters quick mode so gameplay can continue right away. The boss is stalled while your hero prepares the full solve.",
        f"Quick win secured! Keep battling, then tap this problem again for a complete AI breakdown and final answer reveal.",
    ]

def extract_answer_from_math_steps(math_steps):
    for step in reversed(math_steps or []):
        text = str(step).strip()
        if text.lower().startswith("answer:"):
            return text.split(":", 1)[1].strip()
    return ""

os.environ.setdefault("OPENAI_API_KEY", os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", ""))
os.environ.setdefault("OPENAI_BASE_URL", os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", ""))
os.environ.setdefault("GOOGLE_API_KEY", os.environ.get("AI_INTEGRATIONS_GEMINI_API_KEY", ""))

def _prompt_for_missing_key(env_name: str, description: str) -> None:
    """Prompt the user to paste an API key at startup if it is not already set."""
    import sys
    if os.environ.get(env_name, "").strip():
        return
    # Never block a deployed web-server process.  Both the isatty() check and
    # the WEBSITE_HOSTNAME guard (Azure App Service) are included so that the
    # function is safe in any non-interactive container environment.
    if not sys.stdin.isatty() or os.environ.get("WEBSITE_HOSTNAME", "").strip() or os.environ.get("REPLIT_DEPLOYMENT") == "1":
        logger.warning(f"Missing API key: {env_name} ({description}). Set it as an environment variable.")
        return
    try:
        print(f"\n[Setup] {description} not found in Azure Key Vault or environment.")
        value = input(f"Paste your {env_name} and press Enter (leave blank to skip): ").strip()
        if value:
            os.environ[env_name] = value
            logger.info(f"{env_name} set from user input.")
        else:
            logger.warning(f"{env_name} was not provided — AI features may not work.")
    except (EOFError, KeyboardInterrupt):
        logger.warning(f"{env_name} input skipped.")

_prompt_for_missing_key("OPENAI_API_KEY", "Azure OpenAI API key (used for math solving, story generation, analogies, and verification)")
# GOOGLE_API_KEY / GEMINI_API_KEY is used for image generation via Gemini Flash


def _get_app_base_url() -> str:
    """Return the canonical base URL for this deployment (no trailing slash).

    Priority:
      1. APP_BASE_URL  – explicit override, set this in Azure App Settings
      2. WEBSITE_HOSTNAME – injected automatically by Azure App Service
      3. REPLIT_DOMAINS  – Replit environment
      4. Fallback: http://localhost:5000
    """
    explicit = os.environ.get("APP_BASE_URL", "").rstrip("/")
    if explicit:
        return explicit
    azure_host = os.environ.get("WEBSITE_HOSTNAME", "")
    if azure_host:
        return f"https://{azure_host}"
    replit_domain = os.environ.get("REPLIT_DOMAINS", "").split(",")[0].strip()
    if replit_domain:
        return f"https://{replit_domain}"
    return "http://localhost:5000"


def _is_production() -> bool:
    """True when running in a deployed (production) environment."""
    return (
        os.environ.get("APP_ENV", "").lower() == "production"
        or os.environ.get("REPLIT_DEPLOYMENT") == "1"
        or bool(os.environ.get("WEBSITE_HOSTNAME"))
    )


_openai_client = None
_gemini_client = None

def get_openai_client():
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI()
    return _openai_client

def get_gemini_client():
    global _gemini_client
    if _gemini_client is None:
        gemini_base = os.environ.get("AI_INTEGRATIONS_GEMINI_BASE_URL", "")
        api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
        opts = {'api_version': '', 'base_url': gemini_base} if gemini_base else {'api_version': ''}
        _gemini_client = genai.Client(api_key=api_key, http_options=opts)
    return _gemini_client

AI_MATH_TIMEOUT_SECONDS = int(os.environ.get("AI_MATH_TIMEOUT_SECONDS", "14"))
AI_STORY_TIMEOUT_SECONDS = int(os.environ.get("AI_STORY_TIMEOUT_SECONDS", "16"))
AI_MINIGAME_TIMEOUT_SECONDS = int(os.environ.get("AI_MINIGAME_TIMEOUT_SECONDS", "10"))
AI_ANALOGY_TIMEOUT_SECONDS = int(os.environ.get("AI_ANALOGY_TIMEOUT_SECONDS", "10"))
AI_VERIFY_TIMEOUT_SECONDS = int(os.environ.get("AI_VERIFY_TIMEOUT_SECONDS", "8"))
TIMEOUT_BUFFER_SECONDS = 2  # Extra buffer added to run_with_timeout beyond the inner AI call timeout

# Azure model deployment names — override via environment variables to match your Azure deployment names
AZURE_ANALOGY_MODEL = os.environ.get("AZURE_ANALOGY_MODEL", "gpt-5.2")       # Teaching analogies (GPT-5.2 Chat)
AZURE_STORY_MODEL = os.environ.get("AZURE_STORY_MODEL", "gpt-5.1")           # Story generation (GPT-5.1)
AZURE_MATH_MODEL = os.environ.get("AZURE_MATH_MODEL", "phi-4-reasoning")     # Math solving (Phi-4-Reasoning)
AZURE_VERIFY_MODEL = os.environ.get("AZURE_VERIFY_MODEL", "phi-4-mini")      # Answer verification (Phi-4-mini)
AZURE_VISION_MODEL = os.environ.get("AZURE_VISION_MODEL", "gpt-4o-mini")     # Image OCR (must be vision-capable)
GEMINI_IMAGE_MODEL = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-preview-image-generation")  # Image generation via Gemini 2.5 Flash

def run_with_timeout(callable_fn, timeout_seconds: int):
    result = {}
    error = {}

    def _target():
        try:
            result["value"] = callable_fn()
        except Exception as exc:
            error["exc"] = exc

    worker = threading.Thread(target=_target, daemon=True)
    worker.start()
    worker.join(timeout_seconds)
    if worker.is_alive():
        return None, True
    if "exc" in error:
        raise error["exc"]
    return result.get("value"), False

CHARACTERS = {
    "Arcanos": {
        "pronouns": "he/his",
        "story": "uses ancient arcane spells, enchanted potions, and mystical spellbooks",
        "look": "an ancient sorcerer with a long silver beard, tall pointed hat with runes, deep purple robe with glowing arcane symbols, and a crystal-topped staff radiating magical energy",
        "emoji": "🧙‍♂️",
        "color": "#7B1FA2",
        "particles": ["✨", "⭐", "🔮", "💫", "🌟"],
        "action": "casting a spell"
    },
    "Blaze": {
        "pronouns": "he/his",
        "story": "uses blazing fire punches, flame kicks, and explosive martial arts combos",
        "look": "a fierce young martial artist with fiery red-orange spiky hair, a crimson and gold fighting gi, flame tattoos on his arms, fists engulfed in bright orange fire",
        "emoji": "🔥",
        "color": "#FF6F00",
        "particles": ["🔥", "💥", "⚡", "💪", "✊"],
        "action": "powering up"
    },
    "Shadow": {
        "pronouns": "he/his",
        "story": "uses stealth techniques, shadow clones, smoke bombs, and razor-sharp throwing stars",
        "look": "a mysterious ninja warrior in sleek dark grey and black armor, a glowing blue visor, twin daggers on the back, surrounded by wisps of shadow smoke",
        "emoji": "🥷",
        "color": "#37474F",
        "particles": ["💨", "🌀", "⚔️", "🌙", "💫"],
        "action": "throwing stars"
    },
    "Luna": {
        "pronouns": "she/her",
        "story": "uses moonlight enchantments, starfire shields, and celestial fairy tale magic",
        "look": "a brave enchantress in a flowing silver and lavender gown with crescent moon patterns, a glowing tiara of moonstone, wielding a scepter topped with a radiant crescent moon",
        "emoji": "🌙",
        "color": "#E91E63",
        "particles": ["🌙", "💎", "🦋", "🌸", "✨"],
        "action": "casting lunar magic"
    },
    "Titan": {
        "pronouns": "he/his",
        "story": "uses colossal super strength, earth-shattering smashes, and unstoppable brute force",
        "look": "a towering muscular giant with rocky stone-like skin in grey and green tones, glowing amber eyes, massive fists, wearing armored shoulder plates and a belt with a boulder emblem",
        "emoji": "💪",
        "color": "#2E7D32",
        "particles": ["💥", "💪", "🪨", "⚡", "🔥"],
        "action": "smashing"
    },
    "Webweaver": {
        "pronouns": "he/his",
        "story": "uses energy webs, acrobatic flips, wall-running, and heightened reflexes",
        "look": "an agile acrobatic hero in a sleek teal and silver suit with geometric web-like patterns, glowing energy lines along the arms, a masked helmet with bright cyan lenses",
        "emoji": "🕸️",
        "color": "#D32F2F",
        "particles": ["🕸️", "💫", "⚡", "🌀", "✨"],
        "action": "slinging webs"
    },
    "Volt": {
        "pronouns": "he/his",
        "story": "uses electric venom blasts, cloaking invisibility, energy webs, and lightning reflexes",
        "look": "a young athletic hero in a black and electric blue suit with glowing neon circuit patterns, a hood with a lightning bolt emblem, sparks of electricity crackling from his fingertips",
        "emoji": "⚡",
        "color": "#B71C1C",
        "particles": ["⚡", "💥", "🕸️", "✨", "🌀"],
        "action": "charging a venom blast"
    },
    "Tempest": {
        "pronouns": "she/her",
        "story": "uses weather control, lightning bolts, howling wind gusts, and the raw power of storms",
        "look": "a powerful warrior woman with flowing white hair streaked with blue, glowing electric blue eyes, wearing a silver and dark blue armored bodysuit with a billowing cape, summoning a vortex of lightning and wind",
        "emoji": "🌪️",
        "color": "#1565C0",
        "particles": ["⚡", "🌩️", "💨", "🌪️", "✨"],
        "action": "summoning a storm"
    },
    "Zenith": {
        "pronouns": "he/him",
        "story": "uses high-speed martial strikes, golden aura bursts, and super-charged energy blasts",
        "look": "an original young Black male superhero with short golden-glowing locs hairstyle, dark brown skin, fierce confident eyes, wearing a sleek armored black bodysuit with golden energy lines and a glowing gold chest emblem, golden gauntlets on both fists, surrounded by a blazing golden ki aura — NOT Goku, NOT Dragon Ball, completely unique original character design",
        "emoji": "⚡",
        "color": "#F59E0B",
        "particles": ["⚡", "🔥", "💥", "✨", "🌀"],
        "action": "powering up golden ki",
        "img": "/images/hero-zenith.png"
    }
}

FREE_HERO_ROSTER = {"Arcanos", "Blaze", "Shadow", "Zenith"}


def _is_hero_unlocked_for_session(session_id: str, hero_name: str) -> bool:
    if hero_name in FREE_HERO_ROSTER:
        return True
    return is_premium(session_id)

SHOP_ITEMS = [
    {"id": "fire_sword", "name": "Fire Sword", "category": "weapons", "price": 100, "description": "A blazing blade that burns through math problems.", "effect": {"type": "damage_boost", "value": 15}, "rarity": "common"},
    {"id": "ice_dagger", "name": "Ice Dagger", "category": "weapons", "price": 80, "description": "A frost-edged blade for quick strikes.", "effect": {"type": "damage_boost", "value": 10}, "rarity": "common"},
    {"id": "magic_wand", "name": "Magic Wand", "category": "weapons", "price": 150, "description": "Channels arcane energy into powerful spells.", "effect": {"type": "damage_boost", "value": 20}, "rarity": "rare"},
    {"id": "lightning_gauntlets", "name": "Lightning Gauntlets", "category": "weapons", "price": 300, "description": "Electrified fists that deal massive damage.", "effect": {"type": "damage_boost", "value": 30}, "rarity": "epic"},
    {"id": "void_blade", "name": "Void Blade", "category": "weapons", "price": 500, "description": "A sword forged from pure darkness.", "effect": {"type": "damage_boost", "value": 40}, "rarity": "legendary"},

    {"id": "ice_shield", "name": "Ice Shield", "category": "armor", "price": 100, "description": "A frozen barrier that absorbs boss attacks.", "effect": {"type": "defense", "value": 15}, "rarity": "common"},
    {"id": "dragon_armor", "name": "Dragon Armor", "category": "armor", "price": 250, "description": "Scales of an ancient dragon protect you.", "effect": {"type": "defense", "value": 25}, "rarity": "rare"},
    {"id": "shadow_cloak", "name": "Shadow Cloak", "category": "armor", "price": 350, "description": "Melt into shadows to dodge boss attacks.", "effect": {"type": "defense", "value": 35}, "rarity": "epic"},
    {"id": "titan_plate", "name": "Titan Plate", "category": "armor", "price": 600, "description": "Legendary armor of the ancient Titans.", "effect": {"type": "defense", "value": 50}, "rarity": "legendary"},

    {"id": "fox_companion", "name": "Pixel Fox", "category": "pets", "price": 120, "description": "A clever fox that finds bonus gold.", "effect": {"type": "gold_boost", "value": 5}, "rarity": "common"},
    {"id": "dragon_hatchling", "name": "Dragon Hatchling", "category": "pets", "price": 280, "description": "A baby dragon that helps in battle.", "effect": {"type": "damage_boost", "value": 12}, "rarity": "rare"},
    {"id": "phoenix_companion", "name": "Phoenix", "category": "pets", "price": 450, "description": "A legendary firebird that boosts all stats.", "effect": {"type": "all_boost", "value": 10}, "rarity": "epic"},
    {"id": "star_sprite", "name": "Star Sprite", "category": "pets", "price": 200, "description": "A tiny star that extends your battle time.", "effect": {"type": "time_boost", "value": 5}, "rarity": "rare"},

    {"id": "healing_potion", "name": "Healing Potion", "category": "potions", "price": 50, "description": "Restores health during battle.", "effect": {"type": "heal", "value": 30}, "rarity": "common", "consumable": True},
    {"id": "power_elixir", "name": "Power Elixir", "category": "potions", "price": 90, "description": "Doubles damage for one battle.", "effect": {"type": "damage_boost", "value": 50}, "rarity": "rare", "consumable": True},
    {"id": "time_potion", "name": "Time Potion", "category": "potions", "price": 75, "description": "Adds extra seconds to timed challenges.", "effect": {"type": "time_boost", "value": 8}, "rarity": "common", "consumable": True},
    {"id": "lucky_charm", "name": "Lucky Charm", "category": "potions", "price": 60, "description": "Earn double gold from your next victory.", "effect": {"type": "gold_boost", "value": 15}, "rarity": "common", "consumable": True},

    {"id": "rocket_board", "name": "Rocket Board", "category": "mounts", "price": 400, "description": "A flying hoverboard that boosts speed.", "effect": {"type": "time_boost", "value": 4}, "rarity": "epic"},
    {"id": "dino_saddle", "name": "Dino Saddle", "category": "mounts", "price": 200, "description": "Ride a T-Rex into battle for extra power.", "effect": {"type": "damage_boost", "value": 18}, "rarity": "rare"},
    {"id": "storm_pegasus", "name": "Storm Pegasus", "category": "mounts", "price": 700, "description": "A mythical winged horse of thunder.", "effect": {"type": "all_boost", "value": 15}, "rarity": "legendary"},
]

# Promo code duration mapping — days granted per type
_DURATION_DAYS: dict[str, int] = {"30_day": 30, "90_day": 90, "lifetime": 36500}

AGE_GROUP_SETTINGS = {
    "5-7": {
        "label": "Rookie Explorer",
        "difficulty": "very easy",
        "time_min": 12,
        "time_max": 20,
        "choice_count": 3,
        "reward_min": 12,
        "reward_max": 20,
        "story_style": "very short sentences, playful tone, and concrete examples",
        "math_style": "Use tiny steps, simple words, and beginner arithmetic.",
    },
    "8-10": {
        "label": "Quest Adventurer",
        "difficulty": "medium",
        "time_min": 10,
        "time_max": 16,
        "choice_count": 4,
        "reward_min": 14,
        "reward_max": 24,
        "story_style": "energetic and clear with simple action language",
        "math_style": "Use clear steps with age-appropriate operations.",
    },
    "11-13": {
        "label": "Elite Strategist",
        "difficulty": "challenging",
        "time_min": 8,
        "time_max": 14,
        "choice_count": 4,
        "reward_min": 16,
        "reward_max": 26,
        "story_style": "epic and strategic with slightly more advanced vocabulary",
        "math_style": "Use concise steps and include challenge-ready reasoning.",
    },
}

REALM_CHOICES = [
    "Sky Citadel",
    "Jungle of Numbers",
    "Volcano Forge",
    "Cosmic Arena",
]

WORLD_MAP = [
    {"id": "sky", "name": "Sky Citadel", "unlock_quests": 0, "emoji": "☁️", "boss": "Cloud Coder"},
    {"id": "jungle", "name": "Jungle of Numbers", "unlock_quests": 3, "emoji": "🌴", "boss": "Vine Vortex"},
    {"id": "volcano", "name": "Volcano Forge", "unlock_quests": 7, "emoji": "🌋", "boss": "Magma Max"},
    {"id": "cosmic", "name": "Cosmic Arena", "unlock_quests": 12, "emoji": "🌌", "boss": "Nova Null"},
]

BADGE_LIBRARY = {
    "first_quest": {"id": "first_quest", "name": "First Victory", "emoji": "🏅"},
    "streak_3": {"id": "streak_3", "name": "3-Day Streak", "emoji": "🔥"},
    "streak_7": {"id": "streak_7", "name": "7-Day Streak", "emoji": "⚡"},
    "quests_5": {"id": "quests_5", "name": "Quest Adventurer", "emoji": "🧭"},
    "quests_15": {"id": "quests_15", "name": "Legend Solver", "emoji": "👑"},
    "collector": {"id": "collector", "name": "Gear Collector", "emoji": "🎒"},
    # Guild badges — Architects
    "architect_initiate": {"id": "architect_initiate", "name": "Architect Initiate", "emoji": "📐", "guild": "architects"},
    "architect_adept": {"id": "architect_adept", "name": "Blueprint Master", "emoji": "🏛️", "guild": "architects"},
    "architect_legend": {"id": "architect_legend", "name": "Grand Architect", "emoji": "🔷", "guild": "architects"},
    # Guild badges — Chronos Order
    "chronos_initiate": {"id": "chronos_initiate", "name": "Chronos Initiate", "emoji": "⏱️", "guild": "chronos_order"},
    "chronos_adept": {"id": "chronos_adept", "name": "Time Bender", "emoji": "🕰️", "guild": "chronos_order"},
    "chronos_legend": {"id": "chronos_legend", "name": "Chronos Masters", "emoji": "⚡", "guild": "chronos_order"},
    # Guild badges — Strategists
    "strategist_initiate": {"id": "strategist_initiate", "name": "Strategist Initiate", "emoji": "♟️", "guild": "strategists"},
    "strategist_adept": {"id": "strategist_adept", "name": "Puzzle Solver", "emoji": "🧩", "guild": "strategists"},
    "strategist_legend": {"id": "strategist_legend", "name": "Grand Strategist", "emoji": "🧠", "guild": "strategists"},
    # Growth mindset badges
    "perseverance_10": {"id": "perseverance_10", "name": "Never Give Up", "emoji": "💪"},
    "perseverance_25": {"id": "perseverance_25", "name": "Iron Will", "emoji": "🛡️"},
    "hint_master": {"id": "hint_master", "name": "Wise Learner", "emoji": "💡"},
    # Ideology alignment badges
    "constructive_path": {"id": "constructive_path", "name": "Builder of Worlds", "emoji": "🏗️"},
    "explorative_path": {"id": "explorative_path", "name": "Explorer of Truths", "emoji": "🔭"},
    # DDA milestone
    "difficulty_master": {"id": "difficulty_master", "name": "Difficulty Crusher", "emoji": "💥"},
}

# ── Guild System ──────────────────────────────────────────────────────────────
GUILD_CONFIG = {
    "architects": {
        "id": "architects",
        "name": "The Architects",
        "emoji": "📐",
        "color": "#3b82f6",
        "tagline": "Master of Geometry & Puzzles",
        "description": "Builders of great structures, solvers of shape and space.",
        "math_focus": [
            "geometry", "area and perimeter", "angles", "symmetry",
            "coordinate planes", "3D shapes", "spatial reasoning", "patterns and sequences",
        ],
        "prompt_context": (
            "The player belongs to the Architects guild — masters of geometry, shapes, and spatial puzzles. "
            "When possible, frame the math problem in the context of building, measuring, designing blueprints, "
            "or solving architectural puzzles. Use vocabulary like blueprint, structure, angles, dimensions."
        ),
    },
    "chronos_order": {
        "id": "chronos_order",
        "name": "The Chronos Order",
        "emoji": "⏱️",
        "color": "#f59e0b",
        "tagline": "Masters of Speed & Mental Math",
        "description": "Elite calculators who bend time with lightning arithmetic.",
        "math_focus": [
            "mental arithmetic", "speed math", "multiplication tables", "estimation",
            "time and clocks", "number patterns", "skip counting", "rapid calculation",
        ],
        "prompt_context": (
            "The player belongs to the Chronos Order — elite speed mathematicians who calculate in the blink of an eye. "
            "Frame the math problem as a timed challenge or a race against time. Use urgency and speed metaphors. "
            "Vocabulary: clock, countdown, rapid-fire, mental calculation, lightning fast, millisecond."
        ),
    },
    "strategists": {
        "id": "strategists",
        "name": "The Strategists",
        "emoji": "♟️",
        "color": "#8b5cf6",
        "tagline": "Masters of Logic & Word Problems",
        "description": "Deep thinkers who decode logic puzzles and real-world challenges.",
        "math_focus": [
            "word problems", "logic puzzles", "ratios and proportions", "probability",
            "algebraic thinking", "data analysis", "fractions", "percentages",
        ],
        "prompt_context": (
            "The player belongs to the Strategists guild — logical masterminds who solve word problems and riddles. "
            "Frame the math problem as a strategic puzzle or real-world scenario requiring careful thinking. "
            "Vocabulary: strategy, decode, logic, reasoning, evidence, plan, deduce, critical thinking."
        ),
    },
}

GUILD_IDS = list(GUILD_CONFIG.keys())

# ── Dynamic Difficulty Adjustment (DDA) ──────────────────────────────────────
DDA_MIN = 1
DDA_MAX = 10
DDA_DEFAULT = 3

def _compute_dda_level(session: dict) -> int:
    """Adjust difficulty based on recent quest history and hint usage.

    All story completions count as 'correct' since the AI always provides
    the solution. Instead, we use hint frequency and quest pacing as
    real-time difficulty signals.
    """
    history = session.get("history", [])
    recent = history[-8:]  # look at last 8 quests
    current = int(session.get("difficulty_level", DDA_DEFAULT))
    if len(recent) < 3:
        return current

    # Hint usage is the primary signal: high hint rate → reduce difficulty
    hint_count = int(session.get("hint_count", 0))
    quest_count = max(int(session.get("quests_completed", 1)), 1)
    hint_ratio = hint_count / quest_count  # hints per quest

    if hint_ratio >= 0.7:
        # Struggling — ease back
        new_level = max(DDA_MIN, current - 1)
    elif hint_ratio <= 0.1 and len(recent) >= 5:
        # Sailing through without hints — ramp up
        new_level = min(DDA_MAX, current + 1)
    else:
        # Mixed — respect the current difficulty by quests completed
        if quest_count >= 10 and current < 5:
            new_level = min(5, current + 1)
        else:
            new_level = current
    return new_level

def _difficulty_label(level: int) -> str:
    labels = {
        1: "Rookie", 2: "Apprentice", 3: "Journeyman", 4: "Adventurer", 5: "Veteran",
        6: "Expert", 7: "Champion", 8: "Master", 9: "Grandmaster", 10: "Archmage",
    }
    return labels.get(level, "Journeyman")

def _dda_prompt_hint(level: int, age_cfg: dict) -> str:
    """Returns a difficulty modifier for story/math prompts."""
    base = age_cfg.get("difficulty", "medium")
    if level <= 2:
        return f"Make this very accessible — {base} difficulty but simpler numbers and more guidance."
    elif level >= 8:
        return f"Push the challenge — {base} difficulty with larger numbers, multi-step reasoning, or a twist."
    elif level >= 6:
        return f"Increase the challenge — {base} difficulty with an extra reasoning step."
    else:
        return f"Standard {base} difficulty appropriate for this age group."

def _ideology_label(meter: int) -> str:
    """Human-readable ideology alignment label."""
    if meter <= -60:
        return "Architect of Order"
    elif meter <= -20:
        return "Constructive Thinker"
    elif meter < 20:
        return "Balanced Explorer"
    elif meter < 60:
        return "Curious Adventurer"
    else:
        return "Free-Spirit Explorer"

DAILY_CHEST_REWARDS = {"5-7": 30, "8-10": 35, "11-13": 40}

sessions: dict = {}
_MAX_SESSIONS = 10000

def normalize_age_group(age_group: Optional[str]) -> str:
    if age_group in AGE_GROUP_SETTINGS:
        return age_group
    return "8-10"

def normalize_player_name(name: Optional[str]) -> str:
    if not name:
        return "Hero"
    cleaned = re.sub(r"[^a-zA-Z0-9 _-]", "", name).strip()
    return cleaned[:24] if cleaned else "Hero"

def normalize_realm(realm: Optional[str]) -> str:
    if realm in REALM_CHOICES:
        return realm
    return REALM_CHOICES[0]

def _update_streak(session: dict):
    today = datetime.date.today()
    last_active_str = session.get("last_active_date", "")
    streak = int(session.get("streak_count", 0))
    if last_active_str:
        try:
            last_active = datetime.date.fromisoformat(last_active_str)
        except Exception:
            last_active = None
    else:
        last_active = None

    if last_active == today:
        pass
    elif last_active == (today - datetime.timedelta(days=1)):
        streak += 1
    else:
        streak = 1

    session["streak_count"] = max(1, streak)
    session["last_active_date"] = today.isoformat()

def _update_badges(session: dict):
    badges = set(session.get("badges", []))
    quests_completed = int(session.get("quests_completed", 0))
    streak = int(session.get("streak_count", 0))
    guild = session.get("guild")
    perseverance = int(session.get("perseverance_score", 0))
    hint_count = int(session.get("hint_count", 0))
    ideology = int(session.get("ideology_meter", 0))
    difficulty = int(session.get("difficulty_level", DDA_DEFAULT))

    # Core quest badges
    if quests_completed >= 1:
        badges.add("first_quest")
    if quests_completed >= 5:
        badges.add("quests_5")
    if quests_completed >= 15:
        badges.add("quests_15")
    # Streak badges
    if streak >= 3:
        badges.add("streak_3")
    if streak >= 7:
        badges.add("streak_7")
    # Gear collector
    if len(session.get("inventory", [])) >= 5:
        badges.add("collector")
    # Growth mindset / perseverance
    if perseverance >= 10:
        badges.add("perseverance_10")
    if perseverance >= 25:
        badges.add("perseverance_25")
    if hint_count >= 5:
        badges.add("hint_master")
    # Ideology alignment (strong lean either way)
    if ideology <= -40:
        badges.add("constructive_path")
    if ideology >= 40:
        badges.add("explorative_path")
    # DDA milestone
    if difficulty >= 8:
        badges.add("difficulty_master")
    # Guild-specific badges
    if guild == "architects":
        if quests_completed >= 1:
            badges.add("architect_initiate")
        if quests_completed >= 6:
            badges.add("architect_adept")
        if quests_completed >= 18:
            badges.add("architect_legend")
    elif guild == "chronos_order":
        if quests_completed >= 1:
            badges.add("chronos_initiate")
        if quests_completed >= 6:
            badges.add("chronos_adept")
        if quests_completed >= 18:
            badges.add("chronos_legend")
    elif guild == "strategists":
        if quests_completed >= 1:
            badges.add("strategist_initiate")
        if quests_completed >= 6:
            badges.add("strategist_adept")
        if quests_completed >= 18:
            badges.add("strategist_legend")

    ordered = [bid for bid in BADGE_LIBRARY.keys() if bid in badges]
    session["badges"] = ordered

def _get_badge_details(badge_ids):
    details = []
    for bid in badge_ids or []:
        if bid in BADGE_LIBRARY:
            details.append(BADGE_LIBRARY[bid])
    return details

def _build_progression(session: dict):
    quests_completed = int(session.get("quests_completed", 0))
    worlds = []
    for world in WORLD_MAP:
        worlds.append({
            **world,
            "unlocked": quests_completed >= world["unlock_quests"],
        })
    next_unlock = next((w for w in WORLD_MAP if quests_completed < w["unlock_quests"]), None)
    return {
        "quests_completed": quests_completed,
        "streak_count": int(session.get("streak_count", 1)),
        "worlds": worlds,
        "next_unlock": next_unlock,
    }

SUPPORTED_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "pt": "Portuguese",
}

def normalize_preferred_language(language) -> str:
    if not language:
        return "en"
    code = str(language).strip().lower()
    return code if code in SUPPORTED_LANGUAGES else "en"

def _default_privacy_settings() -> dict:
    return {
        "parental_consent": False,
        "allow_telemetry": False,
        "allow_personalization": True,
        "data_retention_days": 30,
    }

def _sanitize_privacy_settings(raw) -> dict:
    defaults = _default_privacy_settings()
    if not isinstance(raw, dict):
        return defaults
    return {
        "parental_consent": bool(raw.get("parental_consent", defaults["parental_consent"])),
        "allow_telemetry": bool(raw.get("allow_telemetry", defaults["allow_telemetry"])),
        "allow_personalization": bool(raw.get("allow_personalization", defaults["allow_personalization"])),
        "data_retention_days": int(raw.get("data_retention_days", defaults["data_retention_days"])),
    }

def _hash_parent_pin(pin: str) -> str:
    return hmac.new(SESSION_SECRET.encode(), pin.encode(), hashlib.sha256).hexdigest()

def _is_valid_parent_pin(pin: str) -> bool:
    return isinstance(pin, str) and len(pin) == 4 and pin.isdigit()

MATH_SKILLS = ["addition", "subtraction", "multiplication", "division", "fractions", "decimals", "algebra", "exponents"]

def _detect_math_skill(problem: str) -> str:
    p = problem.lower()
    if any(w in p for w in ["^", "exponent", "power", "squared", "cubed"]):
        return "exponents"
    if any(w in p for w in ["x =", "solve for", "equation", "variable"]):
        return "algebra"
    if any(w in p for w in ["fraction", "/", "numerator", "denominator", " over "]):
        return "fractions"
    if any(w in p for w in ["decimal", ".", "0.", "tenths", "hundredths"]):
        return "decimals"
    if "×" in p or "*" in p or "multiply" in p or "times" in p or "product" in p:
        return "multiplication"
    if "÷" in p or "divide" in p or "quotient" in p or " / " in p:
        return "division"
    if "−" in p or " - " in p or "subtract" in p or "minus" in p or "difference" in p:
        return "subtraction"
    return "addition"

MATH_ANALOGIES = {
    "addition": {
        "title": "The Treasure Chest Rule",
        "analogy": "Think of two treasure chests — adding means putting all the gold from both chests into one big chest.",
        "why_this_works": [
            "Each number is a chest of gold coins.",
            "Adding means combining all coins into one chest.",
            "The sum is the total coins in the final chest.",
        ],
        "where_it_breaks": "This analogy works best with whole positive numbers — negative numbers need a different picture.",
        "example_steps": [
            "Chest 1 has 5 gold coins.",
            "Chest 2 has 3 gold coins.",
            "Pour both into one chest: 5 + 3 = 8 coins total.",
        ],
        "check_question": "If one chest has 7 gems and another has 4, how many gems are in the combined chest?",
        "alternate_analogies": [
            "Joining two groups of kids at recess — count everyone together.",
            "Filling a bucket from two different jugs of water.",
        ],
    },
    "subtraction": {
        "title": "The HP Bar",
        "analogy": "Your energy bar starts full. Each hit takes away HP — subtraction shows what's left after the battle.",
        "why_this_works": [
            "The starting number is your full HP bar.",
            "The number you subtract is the damage taken.",
            "The answer is the HP remaining after the hit.",
        ],
        "where_it_breaks": "HP bars can't go below zero in most games, but subtraction answers can be negative.",
        "example_steps": [
            "You start with 10 HP.",
            "The boss hits you for 4 damage.",
            "10 − 4 = 6 HP remaining.",
        ],
        "check_question": "You have 15 shields. You use 6 in battle. How many shields are left?",
        "alternate_analogies": [
            "Spending coins from your wallet — subtract to see how much is left.",
            "Eating slices from a full pizza — count the slices remaining.",
        ],
    },
    "multiplication": {
        "title": "The Arena Seats",
        "analogy": "Imagine rows of seats in an arena. Multiply rows × seats per row to get the total crowd count.",
        "why_this_works": [
            "One factor is the number of rows.",
            "The other factor is seats in each row.",
            "The product is the total seats in the arena.",
        ],
        "where_it_breaks": "This works for whole numbers. Multiplying by a fraction or decimal needs a different picture.",
        "example_steps": [
            "The arena has 4 rows.",
            "Each row holds 6 seats.",
            "4 × 6 = 24 seats total.",
        ],
        "check_question": "A game board has 5 rows and 7 columns of squares. How many squares in total?",
        "alternate_analogies": [
            "Packs of trading cards — multiply packs × cards per pack.",
            "Equal groups of heroes — count all heroes across every group.",
        ],
    },
    "division": {
        "title": "The Hero Share",
        "analogy": "Split a stack of coins evenly among heroes — division finds how many each hero receives.",
        "why_this_works": [
            "The dividend is the total coins in the stack.",
            "The divisor is the number of heroes sharing.",
            "The quotient is each hero's fair share.",
        ],
        "where_it_breaks": "If coins don't split evenly, there's a remainder — the leftover that can't be shared equally.",
        "example_steps": [
            "There are 20 coins to share.",
            "4 heroes need equal shares.",
            "20 ÷ 4 = 5 coins per hero.",
        ],
        "check_question": "You have 18 potions to give equally to 3 adventurers. How many does each one get?",
        "alternate_analogies": [
            "Cutting a sub sandwich into equal portions for friends.",
            "Filling identical bags with the same number of marbles each.",
        ],
    },
    "fractions": {
        "title": "The Quest Pizza",
        "analogy": "A pizza cut into equal slices — the denominator is total slices, numerator is how many you eat.",
        "why_this_works": [
            "The denominator tells you how many equal parts the whole is split into.",
            "The numerator counts how many of those parts you have.",
            "The fraction shows part of the whole.",
        ],
        "where_it_breaks": "Pizza slices must be equal — fractions always assume equal-sized parts.",
        "example_steps": [
            "Cut a pizza into 8 equal slices (denominator = 8).",
            "You eat 3 slices (numerator = 3).",
            "You ate 3/8 of the pizza.",
        ],
        "check_question": "A shield is split into 5 equal sections. If 2 sections are damaged, what fraction is damaged?",
        "alternate_analogies": [
            "A health bar divided into equal segments — count the filled ones.",
            "Coloring squares on grid paper — shaded squares over total squares.",
        ],
    },
    "decimals": {
        "title": "Gold Coins & Copper Pieces",
        "analogy": "Think of dollars and cents: numbers left of the decimal are whole dollars, right side are cents.",
        "why_this_works": [
            "Digits to the left of the decimal point are whole units.",
            "Digits to the right are fractions of one unit (tenths, hundredths).",
            "The decimal point separates whole from part.",
        ],
        "where_it_breaks": "This works well for money. For very tiny decimals (like 0.0001) you'd need many copper coins.",
        "example_steps": [
            "3.75 means 3 full gold coins.",
            "Plus 75 copper pieces (75 hundredths of a coin).",
            "Total: three and three-quarter coins.",
        ],
        "check_question": "A sword costs 4.50 gold. You pay 5.00 gold. How much change do you receive?",
        "alternate_analogies": [
            "A progress bar — 0.5 means the bar is half full.",
            "Measuring height — 1.2 meters is 1 full meter and 2 tenths more.",
        ],
    },
    "algebra": {
        "title": "The Balance Scale",
        "analogy": "An equation is a balance scale — whatever you do to one side, you must do to the other to keep it level.",
        "why_this_works": [
            "The equals sign is the pivot point of the scale.",
            "Both sides must stay equal in weight (value).",
            "To find the unknown, perform the same operation on both sides.",
        ],
        "where_it_breaks": "Scales can't go negative weight, but variables in algebra can represent negative numbers.",
        "example_steps": [
            "x + 5 = 12 — the scale is balanced.",
            "Remove 5 from both sides: x + 5 − 5 = 12 − 5.",
            "x = 7 — the scale stays balanced.",
        ],
        "check_question": "If y + 3 = 10, what must y equal to keep the scale balanced?",
        "alternate_analogies": [
            "A mystery bag of gems — find how many gems make both sides equal.",
            "Two players with the same score — one gained points, figure out how many.",
        ],
    },
    "exponents": {
        "title": "The Clone Machine",
        "analogy": "A clone machine that copies itself: 2³ means the machine runs 3 rounds, doubling each time.",
        "why_this_works": [
            "The base (2) is the starting amount that multiplies.",
            "The exponent (3) is how many times the multiplication happens.",
            "Each round multiplies the current total by the base again.",
        ],
        "where_it_breaks": "This picture works for whole-number exponents. Fractional exponents (like 2^½) need a different idea.",
        "example_steps": [
            "Round 1: 1 clone → 2 (2¹ = 2).",
            "Round 2: each clone copies → 4 (2² = 4).",
            "Round 3: each of the 4 copies → 8 (2³ = 8).",
        ],
        "check_question": "If a crystal triples every day and starts at 1, how big is it after 3 days (3³)?",
        "alternate_analogies": [
            "A chain reaction — one spark lights 3 fires, each fire lights 3 more.",
            "Compound interest — your gold grows by the same factor each year.",
        ],
    },
}

def _ensure_mastery_defaults(session: dict):
    mastery = session.setdefault("mastery", {})
    if not isinstance(mastery, dict):
        mastery = {}
        session["mastery"] = mastery
    for skill in MATH_SKILLS:
        entry = mastery.get(skill)
        if not isinstance(entry, dict):
            mastery[skill] = {"correct": 0, "total": 0, "mastery_score": 0.0}
        else:
            entry.setdefault("correct", 0)
            entry.setdefault("total", 0)
            entry.setdefault("mastery_score", 0.0)

def _compute_mastery_score(entry: dict) -> float:
    total = max(int(entry.get("total", 0)), 1)
    correct = int(entry.get("correct", 0))
    raw = correct / total
    confidence = min(total / 5.0, 1.0)
    return round(raw * confidence, 3)

def _update_mastery_after_quest(session: dict, problem: str, correct: bool = True):
    _ensure_mastery_defaults(session)
    skill = _detect_math_skill(problem)
    mastery = session["mastery"]
    entry = mastery[skill]
    entry["total"] = int(entry.get("total", 0)) + 1
    if correct:
        entry["correct"] = int(entry.get("correct", 0)) + 1
    entry["mastery_score"] = _compute_mastery_score(entry)

def _build_learning_plan(session: dict, current_skill: str = None) -> list:
    _ensure_mastery_defaults(session)
    mastery = session.get("mastery", {})
    scored = []
    for skill in MATH_SKILLS:
        entry = mastery.get(skill, {})
        score = float(entry.get("mastery_score", 0.0))
        total = int(entry.get("total", 0))
        scored.append({"skill": skill, "mastery_score": score, "attempts": total})
    scored.sort(key=lambda x: (x["mastery_score"], -x["attempts"]))
    plan = []
    for item in scored:
        if item["skill"] == current_skill:
            continue
        plan.append(item)
        if len(plan) >= 3:
            break
    return plan

def _ensure_session_defaults(session: dict):
    session.setdefault("coins", 0)
    session.setdefault("inventory", [])
    session.setdefault("equipped", [])
    session.setdefault("potions", [])
    session.setdefault("history", [])
    session.setdefault("player_name", "Hero")
    session.setdefault("age_group", "8-10")
    session.setdefault("selected_realm", REALM_CHOICES[0])
    session.setdefault("streak_count", 0)
    session.setdefault("last_active_date", "")
    session.setdefault("quests_completed", 0)
    session.setdefault("badges", [])
    session.setdefault("daily_chest_last_claim", "")
    session.setdefault("preferred_language", "en")
    session.setdefault("privacy_settings", _default_privacy_settings())
    session.setdefault("mastery", {})
    # Ideology / Guild / DDA fields
    session.setdefault("guild", None)
    session.setdefault("ideology_meter", 0)       # -100 (constructive) to +100 (explorative)
    session.setdefault("perseverance_score", 0)   # rewards hints + resilience
    session.setdefault("hint_count", 0)           # total hints used
    session.setdefault("difficulty_level", DDA_DEFAULT)  # 1–10 DDA
    # Math Progression Engine fields
    session.setdefault("player_level", 1)         # math level (1 → ∞)
    session.setdefault("player_xp", 0)            # XP within current level
    session["player_name"] = normalize_player_name(session.get("player_name"))
    session["age_group"] = normalize_age_group(session.get("age_group"))
    session["selected_realm"] = normalize_realm(session.get("selected_realm"))
    session["preferred_language"] = normalize_preferred_language(session.get("preferred_language"))
    session["privacy_settings"] = _sanitize_privacy_settings(session.get("privacy_settings"))
    _ensure_mastery_defaults(session)
    _update_streak(session)
    _update_badges(session)

def _public_session_payload(session: dict):
    data = {k: v for k, v in session.items() if not k.startswith("_")}
    data["badge_details"] = _get_badge_details(data.get("badges"))
    data["progression"] = _build_progression(session)
    data["learning_plan"] = _build_learning_plan(session)
    data["has_parent_pin"] = "_parent_pin_hash" in session
    data["privacy_settings"] = _sanitize_privacy_settings(session.get("privacy_settings"))
    # Guild / ideology / DDA extras
    guild_id = session.get("guild")
    data["guild_config"] = GUILD_CONFIG.get(guild_id) if guild_id else None
    data["difficulty_label"] = _difficulty_label(int(session.get("difficulty_level", DDA_DEFAULT)))
    data["ideology_label"] = _ideology_label(int(session.get("ideology_meter", 0)))
    # Tycoon / hero progress
    data.setdefault("hero_unlocked", session.get("hero_unlocked"))
    data.setdefault("tycoon_currency", session.get("tycoon_currency", 0))
    return data

def get_session(sid: str):
    if sid not in sessions:
        # Try to restore from the database first
        db_data = load_session_data(sid)
        if db_data:
            sessions[sid] = db_data
        else:
            if len(sessions) >= _MAX_SESSIONS:
                oldest_key = next(iter(sessions))
                del sessions[oldest_key]
            sessions[sid] = {
                "coins": 0,
                "inventory": [],
                "equipped": [],
                "potions": [],
                "history": [],
                "player_name": "Hero",
                "age_group": "8-10",
                "selected_realm": REALM_CHOICES[0],
                "streak_count": 0,
                "last_active_date": "",
                "quests_completed": 0,
                "badges": [],
                "daily_chest_last_claim": "",
                "guild": None,
                "ideology_meter": 0,
                "perseverance_score": 0,
                "hint_count": 0,
                "difficulty_level": DDA_DEFAULT,
                "_ts": _time.time(),
            }
    s = sessions[sid]
    s["_ts"] = _time.time()
    _ensure_session_defaults(s)
    return s


def _save_session(sid: str) -> None:
    """Persist the in-memory session to the database (best-effort)."""
    if sid not in sessions:
        return
    try:
        save_session_data(sid, sessions[sid])
    except Exception as e:
        logger.warning(f"[SESSION] Could not persist session {sid}: {e}")


class StoryRequest(BaseModel):
    hero: str
    problem: str
    session_id: str
    age_group: Optional[str] = None
    player_name: Optional[str] = None
    selected_realm: Optional[str] = None
    preferred_language: Optional[str] = None
    force_full_ai: bool = False
    guild: Optional[str] = None  # Ideology system — player faction
    ideology_shift: Optional[int] = None  # shift to apply after story completion

    @field_validator('problem')
    @classmethod
    def problem_length(cls, v):
        if len(v) > 500:
            raise ValueError('Problem text too long (max 500 characters)')
        if len(v.strip()) < 1:
            raise ValueError('Problem text required')
        return v

    @field_validator('hero')
    @classmethod
    def hero_valid(cls, v):
        if len(v) > 30:
            raise ValueError('Invalid hero name')
        return v

    @field_validator('player_name')
    @classmethod
    def player_name_valid(cls, v):
        if v is None:
            return v
        if len(v) > 40:
            raise ValueError('Player name too long')
        return v

    @field_validator('age_group')
    @classmethod
    def age_group_valid(cls, v):
        if v is None:
            return v
        if v not in AGE_GROUP_SETTINGS:
            raise ValueError('Invalid age group')
        return v

    @field_validator('selected_realm')
    @classmethod
    def selected_realm_valid(cls, v):
        if v is None:
            return v
        if v not in REALM_CHOICES:
            raise ValueError('Invalid realm')
        return v

class SessionProfileRequest(BaseModel):
    session_id: str
    player_name: Optional[str] = None
    age_group: Optional[str] = None
    selected_realm: Optional[str] = None
    preferred_language: Optional[str] = None
    # Tycoon / hero progress fields persisted to Cosmos DB
    hero_unlocked: Optional[str] = None
    tycoon_currency: Optional[int] = None

    @field_validator('player_name')
    @classmethod
    def profile_player_name_valid(cls, v):
        if v is None:
            return v
        if len(v) > 40:
            raise ValueError('Player name too long')
        return v

    @field_validator('age_group')
    @classmethod
    def profile_age_group_valid(cls, v):
        if v is None:
            return v
        if v not in AGE_GROUP_SETTINGS:
            raise ValueError('Invalid age group')
        return v

    @field_validator('selected_realm')
    @classmethod
    def profile_realm_valid(cls, v):
        if v is None:
            return v
        if v not in REALM_CHOICES:
            raise ValueError('Invalid realm')
        return v

    @field_validator('preferred_language')
    @classmethod
    def profile_language_valid(cls, v):
        if v is None:
            return v
        code = str(v).strip().lower()
        if code not in SUPPORTED_LANGUAGES:
            raise ValueError('Unsupported language code')
        return code

    @field_validator('hero_unlocked')
    @classmethod
    def profile_hero_unlocked_valid(cls, v):
        if v is None:
            return v
        if len(v) > 50 or not re.match(r'^[A-Za-z0-9_ -]+$', v):
            raise ValueError('Invalid hero_unlocked value')
        return v

    @field_validator('tycoon_currency')
    @classmethod
    def profile_tycoon_currency_valid(cls, v):
        if v is None:
            return v
        if v < 0 or v > 10_000_000:
            raise ValueError('tycoon_currency out of range')
        return v

    # Math Progression Engine fields
    player_level: Optional[int] = None
    player_xp: Optional[int] = None

    @field_validator('player_level')
    @classmethod
    def profile_player_level_valid(cls, v):
        if v is None:
            return v
        if v < 1 or v > 1000:
            raise ValueError('player_level out of range')
        return v

    @field_validator('player_xp')
    @classmethod
    def profile_player_xp_valid(cls, v):
        if v is None:
            return v
        if v < 0 or v > 1_000_000:
            raise ValueError('player_xp out of range')
        return v

class ShopRequest(BaseModel):
    item_id: str
    session_id: str

    @field_validator('item_id')
    @classmethod
    def item_id_valid(cls, v):
        if len(v) > 50 or not re.match(r'^[a-z0-9_]+$', v):
            raise ValueError('Invalid item ID')
        return v


@app.get("/api/characters")
def get_characters():
    return CHARACTERS

@app.get("/api/shop")
def get_shop():
    return SHOP_ITEMS

@app.get("/api/session/{session_id}")
def get_session_data(session_id: str):
    validate_session_id(session_id)
    s = get_session(session_id)
    # If the session was freshly created (no hero_unlocked yet), try to
    # restore tycoon/hero progress from Cosmos DB so returning players
    # see their saved state even if the server restarted.
    if s.get("hero_unlocked") is None and s.get("tycoon_currency", 0) == 0:
        try:
            cosmos_doc = get_cosmos_service().get_progress(session_id)
            if cosmos_doc:
                if cosmos_doc.get("heroUnlocked") is not None:
                    s["hero_unlocked"] = cosmos_doc["heroUnlocked"]
                if cosmos_doc.get("tycoonCurrency") is not None:
                    s["tycoon_currency"] = cosmos_doc["tycoonCurrency"]
        except Exception as _cosmos_err:
            logger.debug("[SESSION] Cosmos restore skipped: %s", _cosmos_err)
    return _public_session_payload(s)

@app.post("/api/session/profile")
def update_session_profile(req: SessionProfileRequest, authorization: Optional[str] = Header(default=None)):
    validate_session_id(req.session_id)
    s = get_session(req.session_id)
    if req.player_name is not None:
        s["player_name"] = normalize_player_name(req.player_name)
    if req.age_group is not None:
        s["age_group"] = normalize_age_group(req.age_group)
    if req.selected_realm is not None:
        s["selected_realm"] = normalize_realm(req.selected_realm)
    if req.preferred_language is not None:
        s["preferred_language"] = normalize_preferred_language(req.preferred_language)
    if req.hero_unlocked is not None:
        s["hero_unlocked"] = req.hero_unlocked
    if req.tycoon_currency is not None:
        s["tycoon_currency"] = req.tycoon_currency
    if req.player_level is not None:
        s["player_level"] = req.player_level
    if req.player_xp is not None:
        s["player_xp"] = req.player_xp
    _ensure_session_defaults(s)
    _save_session(req.session_id)

    # Persist tycoon/hero progress to Cosmos DB (best-effort; never blocks the response)
    if req.hero_unlocked is not None or req.tycoon_currency is not None:
        try:
            cosmos_svc = get_cosmos_service()
            cosmos_svc.upsert_progress(
                user_id=req.session_id,
                current_level=s.get("hero_unlocked") or "none",
                score=s.get("tycoon_currency", 0),
                visual_analogies_completed=s.get("badges", []),
                extra={
                    "heroUnlocked": s.get("hero_unlocked"),
                    "tycoonCurrency": s.get("tycoon_currency", 0),
                    "playerName": s.get("player_name", "Hero"),
                },
            )
            # If a valid JWT is present, also update the named user doc so
            # progress is linked to the account rather than just the session.
            if authorization and authorization.lower().startswith("bearer "):
                jwt_payload = _decode_jwt(authorization[7:])
                if jwt_payload and jwt_payload.get("sub"):
                    cosmos_svc.upsert_user(
                        username=jwt_payload["sub"],
                        password_hash="",   # preserve existing hash via upsert
                        session_id=req.session_id,
                        hero_unlocked=s.get("hero_unlocked"),
                        tycoon_currency=s.get("tycoon_currency", 0),
                        extra={"playerName": s.get("player_name", "Hero")},
                    )
        except Exception as _cosmos_err:
            logger.warning("[SESSION] Cosmos upsert skipped: %s", _cosmos_err)

    return _public_session_payload(s)


# ---------------------------------------------------------------------------
# Tycoon Save Engine  — /api/tycoon/save  and  /api/tycoon/state/{session_id}
# ---------------------------------------------------------------------------

class TycoonFloorState(BaseModel):
    level: int = 0

    @field_validator('level')
    @classmethod
    def level_valid(cls, v: int) -> int:
        if v < 0 or v > 10_000:
            raise ValueError('level out of range')
        return v


class TycoonBusState(BaseModel):
    capacity: float = 25
    capacityLevel: int = 0
    capacityCost: float = 50
    speed: float = 0.5
    speedLevel: int = 0
    speedCost: float = 150


class TycoonCompilerState(BaseModel):
    batchSize: float = 5
    batchLevel: int = 0
    batchCost: float = 100
    procTime: float = 3
    procLevel: int = 0
    procCost: float = 200
    convRate: float = 1
    convLevel: int = 0
    convCost: float = 500


class TycoonAutoState(BaseModel):
    production: bool = False
    dataBus: bool = False
    compiler: bool = False


class TycoonManagersState(BaseModel):
    floors:   list[bool] = []
    elevator: bool = False
    sales:    bool = False

    @field_validator('floors')
    @classmethod
    def floors_valid(cls, v: list) -> list:
        if len(v) > 50:
            raise ValueError('too many manager floor slots')
        return v


class TycoonSaveRequest(BaseModel):
    session_id: str
    coins: float
    lifetime: float
    productionBuffer: float = 0
    prodCap: float = 150
    compilerBuffer: float = 0
    floors: list[TycoonFloorState] = []
    bus: TycoonBusState = TycoonBusState()
    compiler: TycoonCompilerState = TycoonCompilerState()
    auto: TycoonAutoState = TycoonAutoState()
    managers: TycoonManagersState = TycoonManagersState()
    prime_tokens: int = 0

    @field_validator('coins')
    @classmethod
    def coins_valid(cls, v: float) -> float:
        if v < 0 or v > 1_000_000_000:
            raise ValueError('coins out of range')
        return round(v, 2)

    @field_validator('lifetime')
    @classmethod
    def lifetime_valid(cls, v: float) -> float:
        # lifetime accumulates across prestige runs so allow a much higher ceiling
        if v < 0 or v > 1_000_000_000_000_000:
            raise ValueError('lifetime out of range')
        return round(v, 2)

    @field_validator('productionBuffer', 'compilerBuffer', 'prodCap')
    @classmethod
    def buffer_valid(cls, v: float) -> float:
        if v < 0 or v > 1_000_000_000:
            raise ValueError('buffer value out of range')
        return round(v, 2)

    @field_validator('floors')
    @classmethod
    def floors_valid(cls, v: list) -> list:
        if len(v) > 50:
            raise ValueError('too many floors')
        return v

    @field_validator('prime_tokens')
    @classmethod
    def prime_tokens_valid(cls, v: int) -> int:
        if v < 0 or v > 100_000:
            raise ValueError('prime_tokens out of range')
        return v


@app.post("/api/tycoon/save")
async def tycoon_save(req: TycoonSaveRequest, request: Request):
    """Persist the full Tycoon economy state to Cosmos DB.

    Called every 15 seconds by the frontend background save loop.
    Rate-limited to 6 saves per 90 seconds per session to prevent abuse.
    Fails gracefully — never raises a 5xx so the game keeps running.
    """
    validate_session_id(req.session_id)
    if not check_rate_limit(f"tycoon_save:{req.session_id}", max_requests=6, window=90):
        raise HTTPException(status_code=429, detail="Save rate limit reached. Please wait.")

    # Also keep the in-memory session and tycoon_currency in sync.
    # Round to nearest integer for the session field (consistent with the
    # existing tycoon_currency field which is stored as int elsewhere).
    s = get_session(req.session_id)
    s["tycoon_currency"] = round(req.coins)
    _save_session(req.session_id)

    # Best-effort Cosmos persist — never let a DB error surface to the client
    try:
        state = req.model_dump(exclude={"session_id"})
        await run_in_threadpool(
            get_cosmos_service().upsert_tycoon_state,
            req.session_id,
            state,
        )
    except Exception as exc:
        logger.warning("[TYCOON] Cosmos save skipped for %s: %s", req.session_id, exc)

    return {"saved": True}


@app.get("/api/tycoon/state/{session_id}")
async def tycoon_get_state(session_id: str):
    """Return the last Cosmos-persisted Tycoon state for *session_id*.

    Used on page load to restore progress after a server restart or
    a device switch when localStorage is empty or stale.
    Returns ``{"state": null}`` when no save exists yet.
    """
    validate_session_id(session_id)
    try:
        state = await run_in_threadpool(
            get_cosmos_service().get_tycoon_state,
            session_id,
        )
        return {"state": state}
    except Exception as exc:
        logger.warning("[TYCOON] Cosmos restore skipped for %s: %s", session_id, exc)
        return {"state": None}


# ---------------------------------------------------------------------------
# Auth routes  — /api/auth/register  and  /api/auth/login
# ---------------------------------------------------------------------------

_USERNAME_PATTERN = re.compile(r'^[A-Za-z0-9_]{3,30}$')
_EMAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


class AuthRegisterRequest(BaseModel):
    username: str
    password: str
    email: str = ""   # optional — required only for password-recovery

    @field_validator('username')
    @classmethod
    def username_valid(cls, v):
        v = str(v).strip()
        if not _USERNAME_PATTERN.match(v):
            raise ValueError('Username must be 3–30 alphanumeric/underscore characters')
        return v

    @field_validator('password')
    @classmethod
    def password_valid(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if len(v) > 128:
            raise ValueError('Password too long')
        return v

    @field_validator('email')
    @classmethod
    def email_valid(cls, v):
        v = str(v).strip().lower()
        if v and not _EMAIL_PATTERN.match(v):
            raise ValueError('Invalid email address')
        return v


class AuthLoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/auth/register")
async def auth_register(req: AuthRegisterRequest):
    """Register a new user account.  Returns a JWT + session_id on success."""
    from backend.database import get_auth_user as db_get_auth_user, upsert_auth_user as db_upsert_auth_user

    # ── Duplicate check — PostgreSQL first, then Cosmos, then in-memory ──────
    existing = db_get_auth_user(req.username)

    cosmos_svc = None
    if existing is None:
        try:
            cosmos_svc = get_cosmos_service()
            existing = await run_in_threadpool(cosmos_svc.get_user, req.username)
        except RuntimeError as exc:
            logger.warning("[Auth] Cosmos unavailable during register check: %s", exc)

    if existing is None:
        existing = _mem_get_user(req.username)

    if existing:
        raise HTTPException(status_code=409, detail="Username already taken.")

    # ── Create credentials ────────────────────────────────────────────────────
    new_session_id = "sess_" + os.urandom(10).hex()
    password_hash = _hash_password(req.password)

    # ── Persist — PostgreSQL (primary) → Cosmos (secondary) → in-memory ──────
    db_ok = db_upsert_auth_user(
        req.username, password_hash, new_session_id, email=req.email or ""
    )
    if db_ok:
        logger.info("[Auth] Registered user in PostgreSQL: username=%s", req.username)
    else:
        logger.warning("[Auth] PostgreSQL unavailable, trying Cosmos for username=%s", req.username)

    extra = {"email": req.email} if req.email else {}
    if cosmos_svc is not None:
        try:
            await run_in_threadpool(
                cosmos_svc.upsert_user,
                req.username,
                password_hash,
                new_session_id,
                None,
                0,
                extra or None,
            )
        except Exception as exc:
            logger.warning("[Auth] Cosmos upsert failed: %s", exc)
            if not db_ok:
                _mem_upsert_user(req.username, password_hash, new_session_id, extra=extra or None)
    elif not db_ok:
        _mem_upsert_user(req.username, password_hash, new_session_id, extra=extra or None)

    token = _create_jwt(req.username, new_session_id)
    logger.info("[Auth] Registered username=%s session=%s db_ok=%s", req.username, new_session_id, db_ok)
    return {"token": token, "session_id": new_session_id, "username": req.username}


@app.post("/api/auth/login")
async def auth_login(req: AuthLoginRequest):
    """Log in with username + password.  Returns a JWT + session_id on success."""
    from backend.database import get_auth_user as db_get_auth_user

    # ── Look up user — PostgreSQL first, then Cosmos, then in-memory ─────────
    user_doc = db_get_auth_user(req.username)

    if user_doc is None:
        cosmos_svc = None
        try:
            cosmos_svc = get_cosmos_service()
            user_doc = await run_in_threadpool(cosmos_svc.get_user, req.username)
        except RuntimeError as exc:
            logger.warning("[Auth] Cosmos unavailable during login: %s", exc)

    if user_doc is None:
        user_doc = _mem_get_user(req.username)

    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    if not _verify_password(req.password, user_doc.get("passwordHash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    session_id = user_doc.get("sessionId", "sess_" + os.urandom(10).hex())
    token = _create_jwt(req.username, session_id)
    logger.info("[Auth] Login username=%s session=%s", req.username, session_id)
    return {
        "token": token,
        "session_id": session_id,
        "username": req.username,
        "hero_unlocked": user_doc.get("heroUnlocked"),
        "tycoon_currency": user_doc.get("tycoonCurrency", 0),
    }


@app.post("/api/auth/guest")
async def auth_guest(request: Request):
    """Create a one-time guest session.  No account is stored; progress is lost on expiry."""
    ip = get_client_ip(request)
    if not check_rate_limit(f"auth_guest:{ip}", max_requests=10, window=60):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait and try again.")

    guest_id = "guest_" + os.urandom(8).hex()          # 8 bytes = 16 hex chars
    session_id = "sess_" + os.urandom(10).hex()        # matches SESSION_ID_PATTERN
    token = _create_jwt(guest_id, session_id)
    logger.info("[Auth] Guest session created session=%s", session_id)
    return {"token": token, "session_id": session_id, "username": guest_id, "is_guest": True}


class ForgotPasswordRequest(BaseModel):
    username: str

    @field_validator('username')
    @classmethod
    def username_valid(cls, v):
        v = str(v).strip()
        if not _USERNAME_PATTERN.match(v):
            raise ValueError('Invalid username')
        return v


@app.post("/api/auth/forgot-password")
async def auth_forgot_password(req: ForgotPasswordRequest, request: Request):
    """Send a password-reset email if an email address is stored for *username*.

    Always returns 200 with a generic message to avoid username enumeration.
    """
    ip = get_client_ip(request)
    if not check_rate_limit(f"auth_forgot:{ip}", max_requests=3, window=300):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait 5 minutes and try again.")

    _GENERIC_OK = {"message": "If an email is associated with this account, a reset link has been sent."}

    try:
        cosmos_svc = get_cosmos_service()
    except RuntimeError:
        return _GENERIC_OK

    user_doc = await run_in_threadpool(cosmos_svc.get_user, req.username)
    if not user_doc or not user_doc.get("email"):
        return _GENERIC_OK

    reset_token = os.urandom(32).hex()
    expiry = (
        datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)
    ).isoformat()

    try:
        await run_in_threadpool(
            cosmos_svc.update_user_reset_token, req.username, reset_token, expiry
        )
    except Exception as exc:
        logger.error("[Auth] Could not store reset token: %s", exc)
        return _GENERIC_OK

    base_url = os.environ.get("APP_BASE_URL", "").rstrip("/")
    if not base_url:
        azure_host = os.environ.get("WEBSITE_HOSTNAME", "")
        base_url = f"https://{azure_host}" if azure_host else "https://themathscript.com"

    reset_url = f"{base_url}/?reset_token={reset_token}&user={urllib.parse.quote(req.username)}"

    try:
        from backend.resend_client import send_password_reset_email
        send_password_reset_email(user_doc["email"], req.username, reset_url)
    except Exception as exc:
        logger.error("[Auth] Could not send reset email: %s", exc)

    return _GENERIC_OK


class ResetPasswordRequest(BaseModel):
    username: str
    token: str
    new_password: str

    @field_validator('username')
    @classmethod
    def username_valid(cls, v):
        v = str(v).strip()
        if not _USERNAME_PATTERN.match(v):
            raise ValueError('Invalid username')
        return v

    @field_validator('new_password')
    @classmethod
    def password_valid(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if len(v) > 128:
            raise ValueError('Password too long')
        return v


@app.post("/api/auth/reset-password")
async def auth_reset_password(req: ResetPasswordRequest, request: Request):
    """Set a new password using a valid reset token."""
    ip = get_client_ip(request)
    if not check_rate_limit(f"auth_reset:{ip}", max_requests=5, window=300):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait and try again.")

    try:
        cosmos_svc = get_cosmos_service()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Auth service temporarily unavailable.")

    user_doc = await run_in_threadpool(cosmos_svc.get_user, req.username)
    if not user_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    stored_token = user_doc.get("resetToken")
    stored_expiry = user_doc.get("resetTokenExpiry")

    if not stored_token or stored_token != req.token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    if stored_expiry:
        try:
            expiry_dt = datetime.datetime.fromisoformat(stored_expiry)
            if datetime.datetime.now(datetime.timezone.utc) > expiry_dt:
                raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    new_hash = _hash_password(req.new_password)
    try:
        # Update password by calling upsert_user with the new hash (preserves session/other fields)
        await run_in_threadpool(
            cosmos_svc.upsert_user,
            req.username,
            new_hash,
            user_doc.get("sessionId", "sess_" + os.urandom(10).hex()),
            user_doc.get("heroUnlocked"),
            user_doc.get("tycoonCurrency", 0),
            {k: user_doc[k] for k in ("email",) if k in user_doc} or None,
        )
        # Clear the reset token
        await run_in_threadpool(cosmos_svc.update_user_reset_token, req.username, None, None)
    except Exception as exc:
        logger.error("[Auth] Password reset update failed: %s", exc)
        raise HTTPException(status_code=503, detail="Could not update password. Please try again.")

    logger.info("[Auth] Password reset successful for username=%s", req.username)
    return {"message": "Password updated successfully. You can now log in."}


class SegmentImageRequest(BaseModel):
    hero: str
    segment_text: str
    segment_index: int
    session_id: str

class BatchSegmentImageRequest(BaseModel):
    hero: str
    segments: list[str]
    session_id: str

class TTSRequest(BaseModel):
    text: str
    voice: str = "Kore"
    voice_id: Optional[str] = None

    @field_validator('text')
    @classmethod
    def text_length(cls, v):
        if len(v) > 2000:
            raise ValueError('Text too long (max 2000 characters)')
        if len(v.strip()) < 1:
            raise ValueError('Text required')
        return v

@app.post("/api/problem-from-image")
async def problem_from_image(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload an image file")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")

    img_base64 = base64.b64encode(contents).decode("utf-8")
    mime = file.content_type or "image/jpeg"

    try:
        response = get_openai_client().chat.completions.create(
            model=AZURE_VISION_MODEL,
            messages=[
                {"role": "user", "content": [
                    {"type": "text", "text": (
                        "Look at this image of a math problem. Extract ONLY the math problem or question from the image. "
                        "Return just the math problem as plain text, nothing else. "
                        "If there are multiple problems, pick the first one. "
                        "If you cannot find a math problem, respond with exactly: NO_PROBLEM_FOUND"
                    )},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img_base64}"}}
                ]}
            ],
        )
        problem = response.choices[0].message.content.strip()

        if not problem or "NO_PROBLEM_FOUND" in problem:
            raise HTTPException(status_code=400, detail="Couldn't find a math problem in this photo. Try a clearer picture!")

        return {"problem": problem}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error analyzing image. Please try again.")

@app.get("/api/subscription/{session_id}")
def get_subscription_status(session_id: str):
    validate_session_id(session_id)
    user = get_or_create_user(session_id)
    usage = get_daily_usage(session_id)
    allowed, remaining = can_solve_problem(session_id)
    premium = user["subscription_status"] in ("active", "trialing")
    return {
        "is_premium": premium,
        "subscription_status": user["subscription_status"],
        "daily_usage": usage,
        "daily_limit": FREE_DAILY_LIMIT,
        "remaining": remaining if not premium else -1,
        "can_solve": allowed,
    }

@app.get("/api/stripe/publishable-key")
def get_publishable_key():
    try:
        from backend.stripe_client import get_stripe_credentials
        creds = get_stripe_credentials()
        return {"publishable_key": creds["publishable_key"]}
    except Exception:
        return {"publishable_key": None}

class CheckoutRequest(BaseModel):
    session_id: str
    price_id: str

@app.post("/api/stripe/create-checkout")
def create_checkout_session(req: CheckoutRequest):
    try:
        from backend.stripe_client import get_stripe_client
        client = get_stripe_client()

        user = get_or_create_user(req.session_id)
        customer_id = user.get("stripe_customer_id")

        if not customer_id:
            customer = client.v1.customers.create(params={
                "metadata": {"session_id": req.session_id}
            })
            customer_id = customer.id
            update_user_stripe(req.session_id, customer_id=customer_id)

        base_url = _get_app_base_url()

        checkout_session = client.v1.checkout.sessions.create(params={
            "customer": customer_id,
            "payment_method_types": ["card"],
            "line_items": [{"price": req.price_id, "quantity": 1}],
            "mode": "subscription",
            "subscription_data": {
                "trial_period_days": 3,
            },
            "success_url": f"{base_url}?checkout=success",
            "cancel_url": f"{base_url}?checkout=cancel",
            "metadata": {"session_id": req.session_id},
        })
        return {"url": checkout_session.url}
    except Exception as e:
        logger.warning(f"Checkout error: {e}")
        raise HTTPException(status_code=500, detail="Could not create checkout session")

@app.post("/api/stripe/portal")
def create_portal_session(req: CheckoutRequest):
    try:
        from backend.stripe_client import get_stripe_client
        client = get_stripe_client()

        user = get_or_create_user(req.session_id)
        customer_id = user.get("stripe_customer_id")
        if not customer_id:
            raise HTTPException(status_code=400, detail="No subscription found")

        base_url = _get_app_base_url()

        portal = client.v1.billing_portal.sessions.create(params={
            "customer": customer_id,
            "return_url": base_url,
        })
        return {"url": portal.url}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Portal error: {e}")
        raise HTTPException(status_code=500, detail="Could not create portal session")

@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    import json as json_mod
    payload = await request.body()

    sig_header = request.headers.get("stripe-signature")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

    if webhook_secret and sig_header:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
            event_data = event
        except stripe.SignatureVerificationError:
            logger.warning("Webhook signature verification failed")
            return JSONResponse(status_code=400, content={"error": "Invalid signature"})
        except Exception as e:
            logger.warning(f"Webhook verification error: {sanitize_error(e)}")
            return JSONResponse(status_code=400, content={"error": "Webhook error"})
    else:
        try:
            event_data = json_mod.loads(payload)
        except Exception as e:
            logger.warning(f"Webhook parse error: {sanitize_error(e)}")
            return JSONResponse(status_code=400, content={"error": "Invalid payload"})

    event_type = event_data.get("type", "") if isinstance(event_data, dict) else event_data.type
    data = event_data.get("data", {}).get("object", {}) if isinstance(event_data, dict) else event_data.data.object

    if event_type == "checkout.session.completed":
        session_id = data.get("metadata", {}).get("session_id")
        subscription_id = data.get("subscription")
        customer_id = data.get("customer")
        if session_id and subscription_id:
            update_user_stripe(session_id, customer_id=customer_id, subscription_id=subscription_id, status="active")
            logger.warning(f"Subscription activated for session {session_id}")

    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        subscription_id = data.get("id")
        status = data.get("status")
        customer_id = data.get("customer")
        from backend.database import get_db_connection
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute(
                "SELECT session_id FROM app_users WHERE stripe_customer_id = %s OR stripe_subscription_id = %s",
                (customer_id, subscription_id),
            )
            row = cur.fetchone()
            cur.close()
            conn.close()
            if row:
                mapped_status = status if status in ("active", "trialing", "past_due") else "free"
                if event_type == "customer.subscription.deleted":
                    mapped_status = "free"
                update_user_stripe(row[0], subscription_id=subscription_id, status=mapped_status)
                logger.warning(f"Subscription {status} for session {row[0]}")
        except Exception as e:
            logger.warning(f"Webhook subscription update skipped (database unavailable): {sanitize_error(e)}")

    return JSONResponse(status_code=200, content={"received": True})

@app.get("/api/stripe/prices")
def get_stripe_prices():
    try:
        from backend.stripe_client import get_stripe_client
        client = get_stripe_client()
        products = client.v1.products.search(params={"query": "name:'Math Quest Premium'", "limit": 1})
        if not products.data:
            return {"prices": []}
        product = products.data[0]
        prices = client.v1.prices.list(params={"product": product.id, "active": True})
        result = []
        for p in prices.data:
            result.append({
                "id": p.id,
                "unit_amount": p.unit_amount,
                "currency": p.currency,
                "interval": p.recurring.interval if p.recurring else None,
                "product_name": product.name,
                "product_description": product.description,
            })
        return {"prices": sorted(result, key=lambda x: x["unit_amount"])}
    except Exception as e:
        logger.warning(f"Prices fetch error: {e}")
        return {"prices": []}

def _clamp(value, min_v, max_v):
    return max(min_v, min(max_v, value))

def _numeric_distractors(correct_answer: str, needed: int):
    distractors = []
    try:
        if "." in str(correct_answer):
            base = float(correct_answer)
            variations = [base + 1, base - 1, base + 2, base - 2, base + 0.5]
            for v in variations:
                if len(distractors) >= needed:
                    break
                distractors.append(str(round(v, 2)))
        else:
            base = int(str(correct_answer))
            variations = [base + 1, base - 1, base + 2, base - 2, base + 5, base - 5]
            for v in variations:
                if len(distractors) >= needed:
                    break
                distractors.append(str(v))
    except Exception:
        pass
    return distractors

def _sanitize_mini_game(mg, age_group):
    cfg = AGE_GROUP_SETTINGS.get(age_group, AGE_GROUP_SETTINGS["8-10"])
    valid_type = mg.get("type", "choice")
    # Pass-through specialized game types without mutation
    if valid_type in ("concrete_packers", "potion_alchemists"):
        return {
            "type": valid_type,
            "equation": str(mg.get("equation", "5 + 5")).strip(),
            "reward_coins": _clamp(int(mg.get("reward_coins", 20)), cfg["reward_min"], cfg["reward_max"]),
        }
    if valid_type not in ("quicktime", "timed", "choice"):
        valid_type = "choice"

    correct = str(mg.get("correct_answer", "")).strip()
    if not correct:
        correct = "0"
    choices = [str(c).strip() for c in (mg.get("choices") or []) if str(c).strip()]
    if correct not in choices:
        choices.append(correct)

    target_choice_count = cfg["choice_count"]
    if len(choices) < target_choice_count:
        for option in _numeric_distractors(correct, target_choice_count - len(choices)):
            if option not in choices:
                choices.append(option)
    random.shuffle(choices)
    if correct not in choices[:target_choice_count]:
        if choices:
            choices[0] = correct
    choices = choices[:target_choice_count]

    try:
        raw_time = int(mg.get("time_limit", cfg["time_max"]))
    except Exception:
        raw_time = cfg["time_max"]
    try:
        raw_reward = int(mg.get("reward_coins", cfg["reward_min"]))
    except Exception:
        raw_reward = cfg["reward_min"]

    return {
        "type": valid_type,
        "title": str(mg.get("title", "Power Move!")).strip()[:40] or "Power Move!",
        "prompt": str(mg.get("prompt", "Choose your best move!")).strip()[:160] or "Choose your best move!",
        "question": str(mg.get("question", "What is 2 + 2?")).strip()[:180] or "What is 2 + 2?",
        "correct_answer": correct,
        "choices": choices,
        "time_limit": _clamp(raw_time, cfg["time_min"], cfg["time_max"]),
        "reward_coins": _clamp(raw_reward, cfg["reward_min"], cfg["reward_max"]),
        "hero_action": str(mg.get("hero_action", "lands the winning move!")).strip()[:80] or "lands the winning move!",
        "fail_message": str(mg.get("fail_message", "Good try! Go again!")).strip()[:90] or "Good try! Go again!",
    }

def _make_distractors(correct_str: str, n: int = 3) -> list:
    try:
        val = float(correct_str)
    except (ValueError, TypeError):
        return [correct_str] * n
    is_int = val == int(val)
    cv = int(val) if is_int else val
    if is_int:
        mag = abs(cv)
        if mag <= 10:
            step = 1
        elif mag <= 50:
            step = 2
        elif mag <= 200:
            step = 5
        else:
            step = max(10, mag // 20)
        import random as _rnd
        offsets = [-3, -2, -1, 1, 2, 3]
        _rnd.shuffle(offsets)
        seen = {cv}
        choices = []
        for o in offsets:
            candidate = cv + o * step
            if candidate > 0 and candidate not in seen:
                seen.add(candidate)
                choices.append(str(candidate))
            if len(choices) >= n:
                break
        while len(choices) < n:
            choices.append(str(cv + (len(choices) + 1) * step))
        return choices
    else:
        step = max(0.5, abs(val) * 0.1)
        return [str(round(val + o * step, 2)) for o in [-1, 1, 2][:n]]


def _fmt_expr(display_expr: str) -> str:
    return display_expr.replace("*", "×").replace("/", "÷").replace("**", "^")


def _fallback_mini_games(math_problem, solved, hero_name, age_group, player_level: int = 1):
    cfg = AGE_GROUP_SETTINGS.get(age_group, AGE_GROUP_SETTINGS["8-10"])
    if solved:
        expr = _fmt_expr(solved["display_expr"])
        correct = solved["answer"]
        d1 = _make_distractors(correct, n=3)
        d2 = _make_distractors(correct, n=3)
        d3 = _make_distractors(correct, n=3)
        if age_group == "5-7":
            time_limits = (16, 16, 14)
            rewards = (14, 16, 15)
        elif age_group == "11-13":
            time_limits = (9, 10, 12)
            rewards = (19, 22, 21)
        else:
            time_limits = (10, 10, 12)
            rewards = (15, 20, 18)
        raw = [
            {
                "type": "quicktime",
                "title": f"{hero_name} vs Math Boss!",
                "prompt": "Quick! Pick the right answer to land a hit!",
                "question": f"What is {expr}?",
                "correct_answer": correct,
                "choices": d1 + [correct],
                "time_limit": time_limits[0],
                "reward_coins": rewards[0],
                "hero_action": "lands a powerful strike!",
                "fail_message": "Almost! Try again, hero!",
            },
            {
                "type": "timed",
                "title": "Speed Spark!",
                "prompt": "Answer fast to charge up your hero's power!",
                "question": f"{expr} = ?",
                "correct_answer": correct,
                "choices": d2 + [correct],
                "time_limit": time_limits[1],
                "reward_coins": rewards[1],
                "hero_action": "is fully powered up!",
                "fail_message": "Keep going! You're getting stronger!",
            },
            {
                "type": "choice",
                "title": "Choose Your Path!",
                "prompt": "The path splits! Only the right answer leads forward!",
                "question": f"Solve: {expr}",
                "correct_answer": correct,
                "choices": d3 + [correct],
                "time_limit": time_limits[2],
                "reward_coins": rewards[2],
                "hero_action": "found the right path!",
                "fail_message": "Wrong path! But don't give up!",
            },
        ]
        sanitized = [_sanitize_mini_game(mg, age_group) for mg in raw]
        # Inject specialized interactive game suited to age group
        raw_equation = solved.get("display_expr", "5 + 5")
        has_addition = re.search(r'\d+\s*\+\s*\d+', raw_equation)
        if age_group == "5-7" and has_addition:
            sanitized[0] = _sanitize_mini_game({
                "type": "concrete_packers",
                "equation": raw_equation,
                "reward_coins": 20,
            }, age_group)
        elif age_group in ("8-10", "11-13"):
            sanitized[2] = _sanitize_mini_game({
                "type": "potion_alchemists",
                "reward_coins": 25,
            }, age_group)
        return sanitized
    if age_group == "5-7":
        raw = [
            {
                "type": "quicktime",
                "title": f"{hero_name}'s Quick Hit!",
                "prompt": "Tap the right answer!",
                "question": "What is 5 + 4?",
                "correct_answer": "9",
                "choices": ["8", "9", "10"],
                "time_limit": 16,
                "reward_coins": 14,
                "hero_action": "jumps over the boss!",
                "fail_message": "Nice try! Let's do it again!",
            },
            {
                "type": "timed",
                "title": "Speed Spark",
                "prompt": "Beat the clock!",
                "question": "What is 12 - 5?",
                "correct_answer": "7",
                "choices": ["6", "7", "8"],
                "time_limit": 16,
                "reward_coins": 16,
                "hero_action": "charges up with math power!",
                "fail_message": "Close one! Try once more!",
            },
            {
                "type": "choice",
                "title": "Choose the Path",
                "prompt": "Pick the best answer to keep moving.",
                "question": "What is 3 + 6?",
                "correct_answer": "9",
                "choices": ["7", "8", "9"],
                "time_limit": 14,
                "reward_coins": 15,
                "hero_action": "finds the glowing portal!",
                "fail_message": "Oops! You can still win this!",
            },
        ]
    elif age_group == "11-13":
        raw = [
            {
                "type": "quicktime",
                "title": f"{hero_name} Tactical Strike",
                "prompt": "Solve and counter fast.",
                "question": "What is 14 × 6?",
                "correct_answer": "84",
                "choices": ["76", "84", "88", "92"],
                "time_limit": 9,
                "reward_coins": 19,
                "hero_action": "lands a precision combo!",
                "fail_message": "Strategize and try again!",
            },
            {
                "type": "timed",
                "title": "Critical Countdown",
                "prompt": "One accurate answer unlocks the shield.",
                "question": "What is 132 ÷ 11?",
                "correct_answer": "12",
                "choices": ["11", "12", "13", "14"],
                "time_limit": 10,
                "reward_coins": 22,
                "hero_action": "breaks the boss guard!",
                "fail_message": "Almost there. Recalculate and strike!",
            },
            {
                "type": "choice",
                "title": "Path of Logic",
                "prompt": "Choose the strongest result.",
                "question": "What is 9² - 17?",
                "correct_answer": "64",
                "choices": ["62", "63", "64", "65"],
                "time_limit": 12,
                "reward_coins": 21,
                "hero_action": "wins with strategy!",
                "fail_message": "Not quite. You can outsmart this!",
            },
        ]
    else:
        # Level-aware fallback: Levels 1–3 are addition/subtraction only;
        # higher levels may use multiplication.
        if player_level <= 3:
            raw = [
                {
                    "type": "quicktime",
                    "title": f"{hero_name} vs Math Boss!",
                    "prompt": "Quick! Pick the right answer to land a hit!",
                    "question": "What is 6 + 3?",
                    "correct_answer": "9",
                    "choices": ["7", "8", "9", "10"],
                    "time_limit": 12,
                    "reward_coins": 15,
                    "hero_action": "lands a powerful strike!",
                    "fail_message": "Almost! Try again, hero!",
                },
                {
                    "type": "timed",
                    "title": "Power Up Challenge!",
                    "prompt": "Answer fast to charge up your hero's power!",
                    "question": "What is 8 + 5?",
                    "correct_answer": "13",
                    "choices": ["11", "12", "13", "14"],
                    "time_limit": 12,
                    "reward_coins": 20,
                    "hero_action": "is fully powered up!",
                    "fail_message": "Keep trying! You're getting stronger!",
                },
                {
                    "type": "choice",
                    "title": "Choose Your Path!",
                    "prompt": "The path splits! Only the right answer leads forward!",
                    "question": "What is 9 - 4?",
                    "correct_answer": "5",
                    "choices": ["3", "4", "5", "6"],
                    "time_limit": 14,
                    "reward_coins": 18,
                    "hero_action": "found the right path!",
                    "fail_message": "Wrong path! But don't give up!",
                },
            ]
        else:
            raw = [
                {
                    "type": "quicktime",
                    "title": f"{hero_name} vs Math Boss!",
                    "prompt": "Quick! Pick the right answer to land a hit!",
                    "question": "What is 7 × 8?",
                    "correct_answer": "56",
                    "choices": ["48", "56", "54", "64"],
                    "time_limit": 10,
                    "reward_coins": 15,
                    "hero_action": "lands a powerful strike!",
                    "fail_message": "Almost! Try again, hero!",
                },
                {
                    "type": "timed",
                    "title": "Power Up Challenge!",
                    "prompt": "Answer fast to charge up your hero's power!",
                    "question": "What is 12 + 15?",
                    "correct_answer": "27",
                    "choices": ["25", "27", "29", "26"],
                    "time_limit": 10,
                    "reward_coins": 20,
                    "hero_action": "is fully powered up!",
                    "fail_message": "Keep trying! You're getting stronger!",
                },
                {
                    "type": "choice",
                    "title": "Choose Your Path!",
                    "prompt": "The path splits! Only the right answer leads forward!",
                    "question": "What is 9 × 6?",
                    "correct_answer": "54",
                    "choices": ["52", "54", "56", "58"],
                    "time_limit": 12,
                    "reward_coins": 18,
                    "hero_action": "found the right path!",
                    "fail_message": "Wrong path! But don't give up!",
                },
            ]
    sanitized = [_sanitize_mini_game(mg, age_group) for mg in raw]
    # Inject specialized interactive game for non-solved fallback
    if age_group == "5-7":
        sanitized[0] = _sanitize_mini_game({
            "type": "concrete_packers",
            "equation": "5 + 5",
            "reward_coins": 20,
        }, age_group)
    elif age_group in ("8-10", "11-13"):
        sanitized[2] = _sanitize_mini_game({
            "type": "potion_alchemists",
            "reward_coins": 25,
        }, age_group)
    return sanitized


def generate_teaching_analogy(math_skill: str, problem: str) -> dict:
    """Generate a child-friendly teaching analogy for a math skill using GPT-5.2.

    Falls back to the pre-written MATH_ANALOGIES entry on any error so the
    rest of the response is never blocked.
    """
    static = MATH_ANALOGIES.get(math_skill, MATH_ANALOGIES["addition"])
    try:
        prompt = (
            f"You are an expert math teacher for children aged 5-13. "
            f"Create a vivid, memorable analogy that explains the math concept in this problem: '{problem}'\n"
            f"The analogy must be returned as a JSON object with EXACTLY these fields:\n"
            f"- title: short catchy title (max 5 words)\n"
            f"- analogy: one clear sentence describing the analogy\n"
            f"- why_this_works: array of exactly 3 short bullet-point sentences\n"
            f"- where_it_breaks: one sentence about a limitation of the analogy\n"
            f"- example_steps: array of exactly 3 numbered example steps\n"
            f"- check_question: one follow-up question a child can try\n"
            f"- alternate_analogies: array of exactly 2 alternative one-sentence analogies\n"
            f"Return ONLY the JSON object, no markdown or code blocks."
        )
        response, timed_out = run_with_timeout(
            lambda: get_openai_client().chat.completions.create(
                model=AZURE_ANALOGY_MODEL,
                timeout=AI_ANALOGY_TIMEOUT_SECONDS,
                messages=[
                    {"role": "system", "content": "You are a friendly math teacher who explains concepts with creative analogies for kids."},
                    {"role": "user", "content": prompt},
                ],
            ),
            AI_ANALOGY_TIMEOUT_SECONDS + TIMEOUT_BUFFER_SECONDS,
        )
        if timed_out or response is None:
            return static
        text = (response.choices[0].message.content if response.choices else "").strip()
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        analogy = json.loads(text)
        required = {"title", "analogy", "why_this_works", "where_it_breaks", "example_steps", "check_question", "alternate_analogies"}
        if required.issubset(analogy.keys()):
            return analogy
    except Exception as e:
        logger.warning(f"[ANALOGY] Generation failed, using static fallback: {sanitize_error(e)}")
    return static


# Chester sector labels used by the World Builder (maps game realms → in-universe locations)
_CHESTER_SECTORS: dict[str, str] = {
    "Sky Citadel": "the Sky Citadel sector of Chester",
    "Jungle of Numbers": "the Jungle of Numbers district, deep in Chester's bio-grid",
    "Volcano Forge": "the Volcano Forge, Chester's molten data core",
    "Cosmic Arena": "the Cosmic Arena, Chester's outermost logic frontier",
}


def generate_victory_story(hero: str, equation_solved: str, answer: str, realm: str) -> str:
    """Generate a 3-sentence World Builder Victory Story beat.

    Uses AZURE_STORY_MODEL with the World Builder system prompt.  Follows
    all four World Builder directives: Chester setting, hero uses the answer,
    PG framing (no violence), and a cliffhanger at the end.  The second
    sentence is a brief, child-friendly explanation of *why* the math works.

    Falls back to a static beat on timeout or error so the response is never
    blocked.
    """
    location = _CHESTER_SECTORS.get(realm, f"{realm}, Chester")
    static_beat = (
        f"{hero} channels the answer — {answer} — and the Logic Gate shatters in a burst of light, "
        f"restoring order to {location}. "
        f"That worked because the equation {equation_solved} = {answer} holds true — "
        f"the numbers lined up perfectly and the pattern clicked into place. "
        f"But in the distance, a new Data Anomaly flickers to life... the next challenge awaits."
    )

    try:
        system_prompt = (
            "You are the World Builder for The Math Script, a techno-fantasy math RPG set in Chester, Pennsylvania. "
            "Your job is to write a 3-sentence Victory Story beat that:\n"
            "1. Features the hero using the exact correct answer to overcome the obstacle or power up.\n"
            "2. Is set in the specified Chester location with vivid techno-fantasy imagery.\n"
            "3. Is strictly PG — no violence; focus on 'restoring logic', 'breaking barriers', or 'powering up energy'.\n"
            "4. The SECOND sentence must be a child-friendly explanation of WHY the math answer is correct — "
            "explain the mechanism or concept simply (e.g., '5 × 5 equals 25 because five groups of five things "
            "gives you twenty-five total'). Make it feel like part of the story.\n"
            "5. Ends with a subtle cliffhanger that teases the next challenge.\n"
            "Write EXACTLY 3 sentences. No markdown, no headers — plain text only."
        )
        user_prompt = (
            f"Equation Solved: {equation_solved} = {answer}\n"
            f"Hero: {hero}\n"
            f"Current Location: {location}"
        )
        response, timed_out = run_with_timeout(
            lambda: get_openai_client().chat.completions.create(
                model=AZURE_STORY_MODEL,
                timeout=AI_STORY_TIMEOUT_SECONDS,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            ),
            AI_STORY_TIMEOUT_SECONDS + TIMEOUT_BUFFER_SECONDS,
        )
        if not timed_out and response is not None:
            text = (response.choices[0].message.content if response.choices else "").strip()
            if text:
                return text
    except Exception as e:
        logger.warning(f"[VICTORY] Victory story generation failed: {sanitize_error(e)}")

    return static_beat


def verify_math_answer(problem: str, proposed_answer: str) -> bool:
    """Use Phi-4-mini to fact-check the math answer before the child sees it.

    Returns True if the answer appears correct, False if it appears wrong.
    Falls back to True (pass-through) on any error so the story is never blocked.
    """
    if not proposed_answer:
        return True
    try:
        response, timed_out = run_with_timeout(
            lambda: get_openai_client().chat.completions.create(
                model=AZURE_VERIFY_MODEL,
                timeout=AI_VERIFY_TIMEOUT_SECONDS,
                messages=[
                    {"role": "system", "content": "You are a precise math checker. Verify answers concisely."},
                    {"role": "user", "content": (
                        f"Math problem: {problem}\n"
                        f"Proposed answer: {proposed_answer}\n"
                        f"Is this answer correct? Reply with exactly CORRECT or INCORRECT on the first line, "
                        f"then one short reason on the second line."
                    )},
                ],
            ),
            AI_VERIFY_TIMEOUT_SECONDS + TIMEOUT_BUFFER_SECONDS,
        )
        if timed_out or response is None:
            return True
        verdict = (response.choices[0].message.content if response.choices else "").strip().upper()
        return not verdict.startswith("INCORRECT")
    except Exception as e:
        logger.warning(f"[VERIFY] Math verification failed, skipping: {sanitize_error(e)}")
        return True


def generate_mini_games(math_problem, math_steps, hero_name, age_group="8-10", player_level: int = 1):
    cfg = AGE_GROUP_SETTINGS.get(age_group, AGE_GROUP_SETTINGS["8-10"])
    # Fast path for common arithmetic inputs to keep story response quick.
    solved = try_solve_basic_math(math_problem)
    if solved:
        return _fallback_mini_games(math_problem, solved, hero_name, age_group, player_level)
    try:
        prompt = (
            f"Generate exactly 3 mini-game challenges for a kids' math learning game based on this math problem: {math_problem}\n\n"
            f"The hero is {hero_name}. The verified solution steps are:\n"
            + "\n".join(math_steps) + "\n\n"
            f"Target age group: {age_group}. Difficulty level: {cfg['difficulty']}.\n"
            f"Keep language age-appropriate: {cfg['story_style']}.\n"
            f"Each challenge should match this age mode.\n\n"
            f"Return a JSON array with exactly 3 objects. Each object must have these fields:\n"
            f"- type: one of 'quicktime', 'timed', 'choice' (use different types for each)\n"
            f"- title: a short fun action title\n"
            f"- prompt: kid-friendly instruction\n"
            f"- question: math question to answer\n"
            f"- correct_answer: correct answer as a string\n"
            f"- choices: array of answer choices including the correct answer\n"
            f"- time_limit: seconds for timed challenge\n"
            f"- reward_coins: coin reward integer\n"
            f"- hero_action: what hero does on success\n"
            f"- fail_message: encouraging message on wrong answer\n\n"
            f"Mini-game 1 must be 'quicktime'. Mini-game 2 must be 'timed'. Mini-game 3 must be 'choice'.\n"
            f"For age {age_group}, keep each question fair and not frustrating.\n"
            f"Return ONLY the JSON array, no markdown, no code blocks."
        )
        response, timed_out = run_with_timeout(
            lambda: get_openai_client().chat.completions.create(
                model=AZURE_STORY_MODEL,
                timeout=AI_MINIGAME_TIMEOUT_SECONDS,
                messages=[
                    {"role": "system", "content": "You are a kids' game designer. Return only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
            ),
            AI_MINIGAME_TIMEOUT_SECONDS + TIMEOUT_BUFFER_SECONDS,
        )
        if timed_out or response is None:
            logger.warning("[MINIGAME] Generation timed out; using fallback mini-games")
            return _fallback_mini_games(math_problem, solved, hero_name, age_group, player_level)
        text = (response.choices[0].message.content if response.choices else "").strip()
        if not text:
            raise ValueError("No mini-game content returned")
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        mini_games = json.loads(text)
        if isinstance(mini_games, list) and len(mini_games) >= 3:
            cleaned = []
            for mg in mini_games[:3]:
                if mg.get("type") == "dragdrop":
                    mg["type"] = "timed"
                cleaned.append(_sanitize_mini_game(mg, age_group))
            return cleaned
    except Exception as e:
        logger.warning(f"Mini-game generation failed: {e}")

    return _fallback_mini_games(math_problem, try_solve_basic_math(math_problem), hero_name, age_group, player_level)

@app.post("/api/story")
def generate_story(req: StoryRequest, request: Request):
    validate_session_id(req.session_id)
    scan_input_for_attacks(req.problem, request)
    if not check_rate_limit(f"story:{req.session_id}", max_requests=8, window=60):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment.")
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")
    if not _is_hero_unlocked_for_session(req.session_id, req.hero):
        raise HTTPException(status_code=403, detail="This hero is a Premium unlock. Upgrade to use this hero.")

    allowed, remaining = can_solve_problem(req.session_id)
    if not allowed:
        raise HTTPException(status_code=403, detail=f"Daily limit reached! Free accounts get {FREE_DAILY_LIMIT} problems per day. Upgrade to Premium for unlimited access!")

    session = get_session(req.session_id)
    if req.player_name is not None:
        session["player_name"] = normalize_player_name(req.player_name)
    if req.age_group is not None:
        session["age_group"] = normalize_age_group(req.age_group)
    if req.selected_realm is not None:
        session["selected_realm"] = normalize_realm(req.selected_realm)
    if req.guild is not None and req.guild in GUILD_IDS:
        session["guild"] = req.guild
    _ensure_session_defaults(session)

    # Update DDA level based on history before generating
    session["difficulty_level"] = _compute_dda_level(session)

    age_group = normalize_age_group(session.get("age_group"))
    age_cfg = AGE_GROUP_SETTINGS[age_group]
    player_name = normalize_player_name(session.get("player_name"))
    selected_realm = normalize_realm(session.get("selected_realm"))
    gear = ", ".join(session["inventory"]) if session["inventory"] else "bare hands"
    player_level = int(session.get("player_level", 1))
    # Guild and DDA context for prompts
    guild_id = session.get("guild")
    guild_ctx = GUILD_CONFIG[guild_id]["prompt_context"] if guild_id and guild_id in GUILD_CONFIG else ""
    dda_hint = _dda_prompt_hint(int(session.get("difficulty_level", DDA_DEFAULT)), age_cfg)

    try:
        char_pronouns = hero.get('pronouns', 'he/him')
        pronoun_he = char_pronouns.split('/')[0].capitalize()
        pronoun_his = char_pronouns.split('/')[1] if '/' in char_pronouns else 'his'

        safe_problem = sanitize_input(req.problem)
        solve_mode = "full_ai"
        quick_mode_reason = None
        _teaching_analogy = None
        _victory_story: Optional[str] = None
        quick_math = try_solve_basic_math(safe_problem)
        if quick_math and not req.force_full_ai:
            solve_mode = "quick_math"
            quick_mode_reason = "basic_arithmetic_fast_path"
            math_solution = quick_math["math_solution"]
            math_steps = quick_math["math_steps"]
            segments = build_fast_story_segments(
                req.hero, pronoun_he, pronoun_his, safe_problem, quick_math["answer"], selected_realm, player_name
            )
            story_text = "---SEGMENT---".join(segments)
            mini_games = _fallback_mini_games(safe_problem, quick_math, req.hero, age_group, player_level)
            _victory_story = generate_victory_story(req.hero, safe_problem, quick_math["answer"], selected_realm)
        else:
            math_response = None
            math_timed_out = False
            try:
                math_response, math_timed_out = run_with_timeout(
                    lambda: get_openai_client().chat.completions.create(
                        model=AZURE_MATH_MODEL,
                        timeout=AI_MATH_TIMEOUT_SECONDS,
                        messages=[
                            {"role": "user", "content": (
                                f"Solve this math problem step by step for a child learning math: {safe_problem}\n\n"
                                f"Age group: {age_group}. {age_cfg['math_style']}\n\n"
                                f"Format your response EXACTLY like this:\n"
                                f"STEP 1: (first step, simple and clear)\n"
                                f"STEP 2: (next step)\n"
                                f"STEP 3: (next step if needed)\n"
                                f"STEP 4: (next step if needed)\n"
                                f"ANSWER: (the final answer)\n\n"
                                f"Use 2-4 steps. Each step should be one short sentence a child can follow. "
                                f"Use simple math notation. Show the work clearly. "
                                f"If possible, include confidence-building wording."
                            )}
                        ],
                    ),
                    AI_MATH_TIMEOUT_SECONDS + TIMEOUT_BUFFER_SECONDS,
                )
            except Exception as e:
                logger.warning(f"[STORY] AI math solve unavailable, switching to quick mode: {sanitize_error(e)}")

            if math_timed_out or math_response is None:
                solve_mode = "quick_fallback"
                quick_mode_reason = "ai_math_timeout" if math_timed_out else "ai_math_unavailable"
                math_solution = ""
                math_steps = [
                    "Quick Mode: Full AI solve is not available right now.",
                    "Break the problem into smaller operations and solve one step at a time.",
                    "Retry this exact problem soon for the full step-by-step AI solution.",
                ]
                segments = build_timeout_story_segments(req.hero, pronoun_he, pronoun_his, safe_problem, selected_realm, player_name)
                story_text = "---SEGMENT---".join(segments)
                mini_games = _fallback_mini_games(safe_problem, None, req.hero, age_group, player_level)
            else:
                math_solution = math_response.choices[0].message.content or ""

                math_steps = []
                answer_line = ""
                for line in math_solution.split('\n'):
                    line = line.strip()
                    if line.upper().startswith('STEP'):
                        step_text = re.sub(r'^STEP\s*\d+\s*[:\.]\s*', '', line, flags=re.IGNORECASE)
                        if step_text:
                            math_steps.append(step_text)
                    elif line.upper().startswith('ANSWER'):
                        answer_line = re.sub(r'^ANSWER\s*[:\.]\s*', '', line, flags=re.IGNORECASE)

                if not math_steps:
                    for line in math_solution.split('\n'):
                        line = line.strip()
                        if line and not line.upper().startswith('ANSWER'):
                            math_steps.append(line)
                if answer_line and answer_line not in math_steps:
                    math_steps.append(f"Answer: {answer_line}")

                # Phi-4-mini verification: fact-check the answer before the child sees it
                answer_verified = verify_math_answer(safe_problem, answer_line)
                if not answer_verified:
                    logger.warning(f"[VERIFY] Phi-4-mini flagged a potential math error for problem: {safe_problem!r}")

                prompt = (
                    f"You are a fun kids' storyteller. Explain the math concept '{safe_problem}' as a short adventure story "
                    f"starring {req.hero} who {hero['story']}. The hero is equipped with {gear}. "
                    f"The adventure happens in {selected_realm}. The child player is named {player_name}.\n\n"
                    f"Target age group is {age_group} ({age_cfg['label']}). "
                    f"Story style must be: {age_cfg['story_style']}.\n\n"
                    + (f"GUILD CONTEXT: {guild_ctx}\n\n" if guild_ctx else "")
                    + f"DIFFICULTY GUIDANCE: {dda_hint}\n\n"
                    f"CRITICAL MATH ACCURACY: A math expert has verified the solution below. You MUST use this exact answer and steps in your story. DO NOT calculate the answer yourself.\n"
                    f"Verified solution:\n{math_solution}\n\n"
                    f"IMPORTANT: {req.hero} uses {char_pronouns} pronouns. Always refer to {req.hero} as '{pronoun_he}' and '{pronoun_his}' — never use the wrong pronouns.\n\n"
                    f"IMPORTANT: Split the story into EXACTLY 4 short paragraphs separated by the delimiter '---SEGMENT---'.\n"
                    f"Each paragraph should be 2-3 sentences max, fun, action-packed, and easy for a child to read.\n"
                    f"Paragraph 1: The hero discovers the math problem (the challenge appears).\n"
                    f"Paragraph 2: The hero uses {pronoun_his} powers to start solving it (show the steps from the verified solution).\n"
                    f"Paragraph 3: The hero fights through the tricky part and figures it out.\n"
                    f"Paragraph 4: Victory! {pronoun_he} celebrates and reveals the verified correct answer clearly.\n\n"
                    f"Do NOT number the paragraphs. Just write them separated by ---SEGMENT---."
                )
                response = None
                story_timed_out = False
                try:
                    response, story_timed_out = run_with_timeout(
                        lambda: get_openai_client().chat.completions.create(
                            model=AZURE_STORY_MODEL,
                            timeout=AI_STORY_TIMEOUT_SECONDS,
                            messages=[
                                {"role": "system", "content": "You are a fun kids' storyteller who explains math through exciting adventures."},
                                {"role": "user", "content": prompt},
                            ],
                        ),
                        AI_STORY_TIMEOUT_SECONDS + TIMEOUT_BUFFER_SECONDS,
                    )
                except Exception as e:
                    logger.warning(f"[STORY] AI storyteller unavailable, using fallback story: {sanitize_error(e)}")
                story_content = response.choices[0].message.content if response and response.choices else None
                if story_timed_out or story_content is None:
                    solve_mode = "quick_fallback"
                    quick_mode_reason = "ai_story_timeout" if story_timed_out else "ai_story_unavailable"
                    answer_for_story = answer_line or extract_answer_from_math_steps(math_steps) or "the final answer"
                    segments = build_fast_story_segments(
                        req.hero, pronoun_he, pronoun_his, safe_problem, answer_for_story, selected_realm, player_name
                    )
                    story_text = "---SEGMENT---".join(segments)
                    mini_games = _fallback_mini_games(safe_problem, try_solve_basic_math(safe_problem), req.hero, age_group, player_level)
                else:
                    story_text = story_content

                    segments = [s.strip() for s in story_text.split('---SEGMENT---') if s.strip()]
                    if len(segments) < 2:
                        segments = [s.strip() for s in story_text.split('\n\n') if s.strip()]
                    if len(segments) > 6:
                        segments = segments[:6]
                    if len(segments) == 0:
                        segments = [story_text]

                    # Run mini_games, teaching_analogy, and victory_story concurrently to reduce latency
                    problem_skill_for_analogy = _detect_math_skill(safe_problem)
                    solved_answer = answer_line or extract_answer_from_math_steps(math_steps) or "the answer"
                    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
                        mini_games_future = pool.submit(generate_mini_games, req.problem, math_steps, req.hero, age_group, player_level)
                        analogy_future = pool.submit(generate_teaching_analogy, problem_skill_for_analogy, safe_problem)
                        victory_future = pool.submit(generate_victory_story, req.hero, safe_problem, solved_answer, selected_realm)
                        try:
                            mini_games = mini_games_future.result()
                        except Exception as e:
                            logger.warning(f"[MINIGAME] Concurrent mini-game generation failed: {sanitize_error(e)}")
                            mini_games = _fallback_mini_games(safe_problem, try_solve_basic_math(safe_problem), req.hero, age_group, player_level)
                        try:
                            _teaching_analogy = analogy_future.result()
                        except Exception as e:
                            logger.warning(f"[ANALOGY] Concurrent analogy generation failed: {sanitize_error(e)}")
                        try:
                            _victory_story = victory_future.result()
                        except Exception as e:
                            logger.warning(f"[VICTORY] Concurrent victory story generation failed: {sanitize_error(e)}")

        increment_usage(req.session_id)

        session["coins"] += 50
        session["quests_completed"] = int(session.get("quests_completed", 0)) + 1
        session["history"].append({
            "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "concept": req.problem,
            "hero": req.hero,
            "correct": True,
            "difficulty_level": session.get("difficulty_level", DDA_DEFAULT),
            "guild": session.get("guild"),
        })
        # Apply ideology shift if supplied (from narrative choice in frontend)
        if req.ideology_shift is not None:
            shift = max(-20, min(20, int(req.ideology_shift)))
            session["ideology_meter"] = max(-100, min(100, int(session.get("ideology_meter", 0)) + shift))
        _update_streak(session)
        _update_badges(session)

        current_usage = get_daily_usage(req.session_id)
        premium = is_premium(req.session_id)

        problem_skill = _detect_math_skill(safe_problem)
        _update_mastery_after_quest(session, safe_problem, correct=True)
        _save_session(req.session_id)

        return {
            "segments": segments,
            "story": story_text,
            "coins": session["coins"],
            "math_steps": math_steps,
            "mini_games": mini_games,
            "daily_usage": current_usage,
            "daily_limit": FREE_DAILY_LIMIT,
            "remaining": max(0, FREE_DAILY_LIMIT - current_usage) if not premium else -1,
            "is_premium": premium,
            "player_name": player_name,
            "age_group": age_group,
            "selected_realm": selected_realm,
            "streak_count": session.get("streak_count", 1),
            "quests_completed": session.get("quests_completed", 0),
            "badges": session.get("badges", []),
            "badge_details": _get_badge_details(session.get("badges", [])),
            "progression": _build_progression(session),
            "solve_mode": solve_mode,
            "quick_mode": solve_mode != "full_ai",
            "quick_mode_reason": quick_mode_reason,
            "teaching_analogy": _teaching_analogy if _teaching_analogy is not None else generate_teaching_analogy(problem_skill, safe_problem),
            "victory_story": _victory_story,
            "learning_plan": _build_learning_plan(session, problem_skill),
            "privacy_settings": _sanitize_privacy_settings(session.get("privacy_settings")),
            "guild": session.get("guild"),
            "guild_config": GUILD_CONFIG.get(session.get("guild")) if session.get("guild") else None,
            "ideology_meter": session.get("ideology_meter", 0),
            "ideology_label": _ideology_label(int(session.get("ideology_meter", 0))),
            "perseverance_score": session.get("perseverance_score", 0),
            "difficulty_level": session.get("difficulty_level", DDA_DEFAULT),
            "difficulty_label": _difficulty_label(int(session.get("difficulty_level", DDA_DEFAULT))),
       }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Story generation failed")
        if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
            raise HTTPException(status_code=429, detail="Cloud budget exceeded")
        raise HTTPException(status_code=500, detail=f"Story generation failed: {type(e).__name__}. Please try again.")

class BonusCoinsRequest(BaseModel):
    session_id: str
    coins: int

@app.post("/api/bonus-coins")
def add_bonus_coins(req: BonusCoinsRequest):
    validate_session_id(req.session_id)
    if not check_rate_limit(f"bonus:{req.session_id}", max_requests=10, window=60):
        raise HTTPException(status_code=429, detail="Too many bonus requests")
    session = get_session(req.session_id)
    bonus = min(max(req.coins, 0), 50)
    session["coins"] += bonus
    _save_session(req.session_id)
    return {"coins": session["coins"], "bonus": bonus}

class DailyChestRequest(BaseModel):
    session_id: str

@app.post("/api/daily-chest")
def claim_daily_chest(req: DailyChestRequest):
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    today = datetime.date.today().isoformat()
    if session.get("daily_chest_last_claim") == today:
        return {
            "claimed": False,
            "coins": session["coins"],
            "message": "Daily chest already opened today!",
        }
    age_group = normalize_age_group(session.get("age_group"))
    bonus = DAILY_CHEST_REWARDS.get(age_group, 35)
    session["coins"] += bonus
    session["daily_chest_last_claim"] = today
    _update_badges(session)
    _save_session(req.session_id)
    return {
        "claimed": True,
        "coins": session["coins"],
        "bonus": bonus,
        "message": f"Daily chest opened! +{bonus} gold",
    }

# ── Guild / Ideology / Perseverance / DDA Endpoints ──────────────────────────

class SetGuildRequest(BaseModel):
    session_id: str
    guild: str

    @field_validator("guild")
    @classmethod
    def validate_guild(cls, v):
        if v not in GUILD_IDS:
            raise ValueError(f"Unknown guild. Must be one of: {', '.join(GUILD_IDS)}")
        return v

@app.post("/api/session/guild")
def set_player_guild(req: SetGuildRequest):
    """Set the player's faction/guild and award the initiate badge."""
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    session["guild"] = req.guild
    _update_badges(session)
    guild_cfg = GUILD_CONFIG[req.guild]
    _save_session(req.session_id)
    return {
        "guild": req.guild,
        "guild_config": guild_cfg,
        "badges": session.get("badges", []),
        "badge_details": _get_badge_details(session.get("badges", [])),
        "message": f"Welcome to {guild_cfg['name']}! {guild_cfg['tagline']}",
    }

class IdeologyRequest(BaseModel):
    session_id: str
    shift: int  # negative = constructive, positive = explorative

    @field_validator("shift")
    @classmethod
    def validate_shift(cls, v):
        clamped = max(-20, min(20, v))
        return clamped

@app.post("/api/player/ideology")
def update_ideology(req: IdeologyRequest):
    """Shift the player's ideology meter based on their problem-solving approach."""
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    current = int(session.get("ideology_meter", 0))
    new_val = max(-100, min(100, current + req.shift))
    session["ideology_meter"] = new_val
    _update_badges(session)
    _save_session(req.session_id)
    return {
        "ideology_meter": new_val,
        "ideology_label": _ideology_label(new_val),
        "badges": session.get("badges", []),
        "badge_details": _get_badge_details(session.get("badges", [])),
    }

# ── Lead Mentor Hint System ───────────────────────────────────────────────────

# Ideology-themed vocabulary for the Lead Mentor prompt
MENTOR_GUILD_THEMES: dict[str, dict[str, str]] = {
    "architects": {
        "theme": "Architect",
        "context": (
            "Use blueprints, building blocks, geometry, and structures as your analogies. "
            "Think of numbers as bricks, operations as structural forces, and equations as blueprints to decode. "
            "Vocabulary: blueprint, structure, dimensions, angles, layers, foundation, blocks."
        ),
    },
    "chronos_order": {
        "theme": "Chronos Order",
        "context": (
            "Use time, speed, racing, and energy waves as your analogies. "
            "Think of numbers as speed values, operations as time calculations, and equations as race timers to beat. "
            "Vocabulary: countdown, race, energy wave, milliseconds, velocity, surge, rapid-fire."
        ),
    },
    "strategists": {
        "theme": "Strategist",
        "context": (
            "Use maps, chess pieces, tactical planning, and puzzles as your analogies. "
            "Think of numbers as resources on a map, operations as strategic moves, and equations as puzzles to decode. "
            "Vocabulary: strategy, map, chess, decode, tactic, logic, mission, puzzle piece."
        ),
    },
}


class MentorHintRequest(BaseModel):
    session_id: str
    equation: str
    hero: str

    @field_validator("equation")
    @classmethod
    def equation_length(cls, v: str) -> str:
        if len(v) > 500:
            raise ValueError("Too long")
        if not v.strip():
            raise ValueError("Required")
        return v.strip()

    @field_validator("hero")
    @classmethod
    def hero_trim(cls, v: str) -> str:
        return v.strip()[:50]


@app.post("/api/mentor/hint")
def get_mentor_hint(req: MentorHintRequest):
    """Generate a Lead Mentor themed explanation for the equation.

    Calls AZURE_ANALOGY_MODEL with a guild-specific system prompt that explains
    *how* the math works — never revealing the numerical answer.  Also records
    the hint use and boosts the player's perseverance score.
    """
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    guild_id = session.get("guild")
    player_name = session.get("player_name", "Hero")
    age_group = session.get("age_group", "8-10")

    # Record hint use (same logic as /api/player/hint)
    session["hint_count"] = int(session.get("hint_count", 0)) + 1
    session["perseverance_score"] = int(session.get("perseverance_score", 0)) + 1
    _update_badges(session)
    _save_session(req.session_id)

    # Build guild-themed system prompt
    guild_theme = MENTOR_GUILD_THEMES.get(guild_id)
    if guild_theme:
        ideology_instruction = (
            f"You are a {guild_theme['theme']} mentor. {guild_theme['context']}"
        )
    else:
        ideology_instruction = "Use vivid, everyday real-world analogies that are relatable for children."

    system_prompt = (
        f"You are the Lead Mentor in a math RPG called The Math Script, guiding {player_name} "
        f"(aged {age_group}). "
        f"{ideology_instruction}\n\n"
        "YOUR RULES:\n"
        "1. NEVER state the numerical answer to the equation. Only explain the *mechanism* — "
        "how the math operation works (e.g., 'multiplication is stacking equal groups').\n"
        "2. Refer to the math problem as a 'Logic Gate' or 'Data Anomaly'.\n"
        "3. Keep your tone encouraging, high-energy, and in-universe — you are a wise mentor "
        "helping a hero on an epic adventure.\n"
        "4. Give ONE vivid analogy (2-3 sentences max) themed to the ideology above.\n"
        "5. End with one short encouraging phrase (e.g., 'You've got this!' or "
        "'The gate is yours to unlock!').\n"
        "6. Do NOT use markdown formatting — plain text only."
    )

    user_prompt = (
        f"The hero {req.hero} is facing this Logic Gate: {req.equation}\n"
        "Give a themed hint that explains the mechanism of this math without revealing the answer."
    )

    explanation: str = ""
    try:
        response, timed_out = run_with_timeout(
            lambda: get_openai_client().chat.completions.create(
                model=AZURE_ANALOGY_MODEL,
                timeout=AI_ANALOGY_TIMEOUT_SECONDS,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            ),
            AI_ANALOGY_TIMEOUT_SECONDS + TIMEOUT_BUFFER_SECONDS,
        )
        if not timed_out and response is not None:
            explanation = (response.choices[0].message.content if response.choices else "").strip()
    except Exception as e:
        logger.warning(f"[MENTOR] Hint generation failed: {sanitize_error(e)}")

    if not explanation:
        # Static fallback — use the pre-written analogy for the detected skill
        math_skill = _detect_math_skill(req.equation)
        static = MATH_ANALOGIES.get(math_skill, MATH_ANALOGIES["addition"])
        explanation = f"{static['title']}: {static['analogy']}"

    return {
        "explanation": explanation,
        "hint_count": session.get("hint_count", 0),
        "perseverance_score": session.get("perseverance_score", 0),
        "badges": session.get("badges", []),
        "badge_details": _get_badge_details(session.get("badges", [])),
    }


class HintRequest(BaseModel):
    session_id: str
    eventually_correct: bool = False  # True if player got it right after hint

@app.post("/api/player/hint")
def record_hint_use(req: HintRequest):
    """Record that the player used a hint — boosts perseverance score."""
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    session["hint_count"] = int(session.get("hint_count", 0)) + 1
    # Perseverance: +1 for using a hint, +2 if they got it right after
    bonus = 3 if req.eventually_correct else 1
    session["perseverance_score"] = int(session.get("perseverance_score", 0)) + bonus
    _update_badges(session)
    _save_session(req.session_id)
    return {
        "hint_count": session["hint_count"],
        "perseverance_score": session["perseverance_score"],
        "badges": session.get("badges", []),
        "badge_details": _get_badge_details(session.get("badges", [])),
        "message": "💡 Great thinking — using hints shows real learning power!" if req.eventually_correct
                   else "💡 Hint used — keep going, you've got this!",
    }

# ── Logic Sentry ────────────────────────────────────────────────────────────

# In-universe feedback phrases keyed by guild — used in static fallbacks
_SENTRY_GUILD_FEEDBACK: dict[str, str] = {
    "architects": "The blueprint parameters are slightly off!",
    "chronos_order": "Your temporal frequency is fluctuating!",
    "strategists": "The tactical map shows a miscalculation!",
}

# Proximity buckets: how close the student's guess was to the correct answer
def _perseverance_penalty(correct_answer: str, student_input: str) -> int:
    """Return 1-3 penalty based on how far off the guess was.

    1 = close (within ±5 or ~25% off for larger numbers)
    2 = moderate
    3 = very far off / non-numeric / completely wrong
    """
    try:
        correct_val = float(correct_answer)
        student_val = float(student_input)
        if correct_val == 0:
            return 1 if student_val == 0 else 3
        ratio = abs(correct_val - student_val) / abs(correct_val)
        if ratio <= 0.25:
            return 1
        if ratio <= 0.75:
            return 2
        return 3
    except (ValueError, TypeError):
        return 3


class LogicSentryRequest(BaseModel):
    session_id: str
    hero: str
    equation: str
    correct_answer: str
    student_input: str

    @field_validator("equation")
    @classmethod
    def equation_len(cls, v: str) -> str:
        if len(v) > 500:
            raise ValueError("Too long")
        if not v.strip():
            raise ValueError("Required")
        return v.strip()

    @field_validator("correct_answer", "student_input")
    @classmethod
    def field_trim(cls, v: str) -> str:
        return str(v).strip()[:200]

    @field_validator("hero")
    @classmethod
    def hero_trim(cls, v: str) -> str:
        return v.strip()[:50]


@app.post("/api/logic-sentry")
def logic_sentry_analyze(req: LogicSentryRequest):
    """Logic Sentry: analyze a student's wrong answer and return in-universe feedback.

    Compares the student's incorrect input to the correct answer, identifies
    the specific misconception, and returns an encouraging in-universe error
    message along with a perseverance penalty (1–3).  The penalty is applied
    to the session's perseverance_score (floored at 0).

    Returns JSON matching the Logic Sentry schema:
    {
        "error_analysis": str,
        "in_universe_feedback": str,
        "perseverance_penalty": int
    }
    """
    validate_session_id(req.session_id)
    if not check_rate_limit(f"logic_sentry:{req.session_id}", max_requests=20, window=60):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment.")

    session = get_session(req.session_id)
    guild_id = session.get("guild")
    player_name = normalize_player_name(session.get("player_name", "Hero"))

    # Compute penalty before AI call so we can return it even on fallback
    penalty = _perseverance_penalty(req.correct_answer, req.student_input)

    # Apply perseverance penalty to session
    current_perseverance = int(session.get("perseverance_score", 0))
    session["perseverance_score"] = max(0, current_perseverance - penalty)
    _save_session(req.session_id)

    # Guild-specific in-universe voice
    guild_phrase = _SENTRY_GUILD_FEEDBACK.get(guild_id, "Your ki is fluctuating!")
    guild_config = GUILD_CONFIG.get(guild_id)
    guild_voice = (
        f"Use the language and tone of a {guild_config['name']} mentor." if guild_config else
        "Use vivid techno-fantasy language."
    )

    system_prompt = (
        "You are the Logic Sentry for The Math Script, a techno-fantasy math RPG set in Chester, Pennsylvania. "
        "Your job is to analyze a student's wrong answer without ever saying 'Wrong' or making them feel bad.\n\n"
        "YOUR RULES:\n"
        f"1. {guild_voice}\n"
        "2. Identify the specific mathematical misconception (e.g., added instead of multiplied, off-by-one, forgot to carry).\n"
        "3. Frame feedback in-universe (e.g., 'Your ki is fluctuating!' or 'The blueprint parameters are slightly off!').\n"
        "4. Give ONE targeted hint that addresses the exact mistake.\n"
        "5. Keep the tone warm, encouraging, and high-energy.\n"
        "6. Respond with ONLY valid JSON matching this exact schema — no markdown, no extra keys:\n"
        '{"error_analysis": "<internal description of the math mistake>", '
        '"in_universe_feedback": "<encouraging in-universe text shown to the player>", '
        f'"perseverance_penalty": {penalty}}}\n'
        f"IMPORTANT: perseverance_penalty MUST be exactly the integer {penalty}."
    )

    user_prompt = (
        f"Target Equation: {req.equation}\n"
        f"Correct Answer: {req.correct_answer}\n"
        f"Student Input: {req.student_input}\n"
        f"Hero: {req.hero}\n"
        f"Player Name: {player_name}"
    )

    result: dict | None = None
    try:
        response, timed_out = run_with_timeout(
            lambda: get_openai_client().chat.completions.create(
                model=AZURE_ANALOGY_MODEL,
                timeout=AI_ANALOGY_TIMEOUT_SECONDS,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            ),
            AI_ANALOGY_TIMEOUT_SECONDS + TIMEOUT_BUFFER_SECONDS,
        )
        if not timed_out and response is not None:
            raw = (response.choices[0].message.content if response.choices else "").strip()
            # Strip optional markdown fences
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)
            parsed = json.loads(raw)
            # Validate required keys and clamp penalty to the pre-computed value
            if all(k in parsed for k in ("error_analysis", "in_universe_feedback", "perseverance_penalty")):
                parsed["perseverance_penalty"] = penalty  # always use server-computed value
                result = parsed
    except Exception as e:
        logger.warning(f"[SENTRY] Logic Sentry AI call failed: {sanitize_error(e)}")

    if result is None:
        # Static fallback
        result = {
            "error_analysis": f"Student answered '{req.student_input}' for '{req.equation}'. Correct answer is '{req.correct_answer}'.",
            "in_universe_feedback": (
                f"{guild_phrase} {req.hero} senses the equation needs another look — "
                f"check the operation and try again, the Logic Gate is almost yours!"
            ),
            "perseverance_penalty": penalty,
        }

    result["perseverance_score"] = session.get("perseverance_score", 0)
    return result


class CorrectAnswerTutorRequest(BaseModel):
    session_id: str
    hero: str
    equation: str
    correct_answer: str

    @field_validator("session_id", "hero", "equation", "correct_answer")
    @classmethod
    def trim_fields(cls, v: str) -> str:
        return v.strip()[:200]


@app.post("/api/correct-answer-tutor")
def correct_answer_tutor(req: CorrectAnswerTutorRequest):
    """Return a brief in-universe explanation of WHY the answer is correct.

    Shown in the mini-game after each correct answer so students learn the
    concept, not just the result.  Falls back to a static explanation on
    timeout or error.
    """
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    age_group = session.get("age_group", "8-10")
    player_name = session.get("player_name", "Hero")

    # Build a semi-specific static fallback based on the detected operation
    eq = req.equation
    if "×" in eq or "*" in eq:
        op_hint = (
            f"Multiplication means adding equal groups — {eq} works because you're combining "
            f"those equal groups to get {req.correct_answer}."
        )
    elif "÷" in eq or "/" in eq:
        op_hint = (
            f"Division splits a total into equal shares — {eq} = {req.correct_answer} "
            f"because the groups come out perfectly even."
        )
    elif "+" in eq:
        op_hint = (
            f"Addition combines amounts — {eq} = {req.correct_answer} "
            f"because putting those values together gives you that total."
        )
    elif "-" in eq:
        op_hint = (
            f"Subtraction finds what's left — {eq} = {req.correct_answer} "
            f"because removing that amount leaves exactly that many."
        )
    else:
        op_hint = (
            f"The equation {eq} = {req.correct_answer} holds true — "
            f"the numbers balance perfectly on both sides. Keep that pattern locked in!"
        )
    static_explanation = f"Logic Gate unlocked! {op_hint} Memorise this one — it'll power up your next battle too!"

    try:
        system_prompt = (
            f"You are the Logic Tutor in The Math Script, a techno-fantasy math RPG. "
            f"You explain correct math answers to {player_name} (aged {age_group}) in a fun, "
            f"in-universe way.\n\n"
            "YOUR RULES:\n"
            "1. Confirm the answer is correct with a short celebration (e.g., 'Exactly right!' or 'Logic Gate unlocked!').\n"
            "2. In 1-2 sentences, explain WHY the math answer is correct using a simple, vivid concept "
            "(e.g., '5 × 5 = 25 because you have 5 equal groups of 5, and counting them all gives you 25').\n"
            "3. Keep it short — 2-3 sentences total. High-energy, encouraging tone.\n"
            "4. Do NOT use markdown. Plain text only."
        )
        user_prompt = (
            f"Equation: {req.equation}\n"
            f"Correct Answer: {req.correct_answer}\n"
            f"Hero: {req.hero}\n"
            "Explain why this answer is correct in a fun, child-friendly way."
        )
        response, timed_out = run_with_timeout(
            lambda: get_openai_client().chat.completions.create(
                model=AZURE_ANALOGY_MODEL,
                timeout=AI_ANALOGY_TIMEOUT_SECONDS,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            ),
            AI_ANALOGY_TIMEOUT_SECONDS + TIMEOUT_BUFFER_SECONDS,
        )
        if not timed_out and response is not None:
            text = (response.choices[0].message.content if response.choices else "").strip()
            if text:
                return {"explanation": text}
    except Exception as e:
        logger.warning(f"[TUTOR] Correct answer tutor failed: {sanitize_error(e)}")

    return {"explanation": static_explanation}


# ── Dynamic Feature Flag system ───────────────────────────────────────────────
# Priority (highest first):
#   1. Database (feature_flags table) — toggled live via Admin Portal
#   2. Environment variable FEATURE_<FLAG_NAME> — Azure App Service settings
#   3. Default (True for backwards compat during rollout)
#
# A 30-second in-process TTL cache avoids a DB hit on every request while
# still propagating admin toggles within half a minute.

_flag_cache: dict[str, tuple[bool, float]] = {}   # {flag_name: (is_active, expiry_ts)}
_FLAG_CACHE_TTL = 30  # seconds


def _feature_enabled(flag_name: str, default: bool = True) -> bool:
    """Return True if the named feature flag is active.

    Checks DB first (with TTL cache), then env var, then falls back to
    `default`.  Flag names are in SCREAMING_SNAKE_CASE (e.g. CONCRETE_PACKERS).
    """
    now = datetime.datetime.utcnow().timestamp()
    cached = _flag_cache.get(flag_name)
    if cached is not None and cached[1] > now:
        return cached[0]

    # 1. Database (best-effort; never raises)
    try:
        db_val = get_feature_flag(flag_name)
        if db_val is not None:
            _flag_cache[flag_name] = (db_val, now + _FLAG_CACHE_TTL)
            return db_val
    except Exception:
        pass

    # 2. Environment variable
    env_val_str = os.environ.get(f"FEATURE_{flag_name}", "").strip().lower()
    if env_val_str:
        env_val = env_val_str in ("true", "1", "yes")
        _flag_cache[flag_name] = (env_val, now + _FLAG_CACHE_TTL)
        return env_val

    # 3. Default
    _flag_cache[flag_name] = (default, now + _FLAG_CACHE_TTL)
    return default


def _get_admin_credential() -> str:
    """Return the configured admin credential.

    Checks ADMIN_PASSWORD first (the simple password the owner sets), then
    falls back to ADMIN_API_KEY for backwards compatibility.  Returns an
    empty string if neither is set.
    """
    return (
        os.environ.get("ADMIN_PASSWORD", "").strip()
        or os.environ.get("ADMIN_API_KEY", "").strip()
    )


def _admin_guard(request: Request) -> None:
    """Raise 403 if the request does not carry the valid admin credential.

    Accepts either ADMIN_PASSWORD or ADMIN_API_KEY (ADMIN_PASSWORD takes
    priority).  If neither environment variable is set the endpoint is
    effectively locked (403 on every request).  A warning is logged once so
    operators know the credential needs to be configured.
    """
    admin_key = _get_admin_credential()
    if not admin_key:
        logger.warning(
            "[ADMIN] ADMIN_PASSWORD (or ADMIN_API_KEY) is not configured — "
            "all admin endpoints will return 403 until it is set."
        )
        raise HTTPException(status_code=403, detail="Admin password not configured.")
    provided = request.headers.get("x-admin-key", request.query_params.get("key", ""))
    if not hmac.compare_digest(admin_key, provided):
        raise HTTPException(status_code=403, detail="Forbidden")


# ── Admin utility routes ──────────────────────────────────────────────────────

@app.get("/api/admin/ping")
def admin_ping(request: Request):
    """Lightweight auth-check endpoint.  Returns 200 when the admin key is
    valid without touching the database — used by the admin dashboard login
    flow so a missing DATABASE_URL never produces a misleading HTTP 500.
    """
    _admin_guard(request)
    return {"ok": True}


# ── Feature-flag API routes ───────────────────────────────────────────────────

@app.get("/api/feature-flags")
def public_feature_flags():
    """Return all feature flags (public, no auth).

    Called by the React app on load so it knows which mini-games to show
    without requiring an admin key.  Only flag names and is_active are exposed.
    """
    flags = get_all_feature_flags()
    return {f["flag_name"]: f["is_active"] for f in flags}


@app.get("/api/admin/feature-flags")
def admin_list_feature_flags(request: Request):
    """Return all feature flags with metadata (admin only)."""
    _admin_guard(request)
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if not check_rate_limit(f"admin_flags:{ip}", max_requests=60, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")
    return {"flags": get_all_feature_flags()}


class FeatureFlagPatchRequest(BaseModel):
    is_active: bool

    @field_validator("is_active")
    @classmethod
    def must_be_bool(cls, v):
        if not isinstance(v, bool):
            raise ValueError("is_active must be a boolean")
        return v


@app.patch("/api/admin/feature-flags/{flag_name}")
def admin_set_feature_flag(flag_name: str, req: FeatureFlagPatchRequest, request: Request):
    """Toggle a single feature flag on or off (admin only).

    Also invalidates the in-process TTL cache so the change takes effect
    immediately on this server instance.
    """
    _admin_guard(request)
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if not check_rate_limit(f"admin_flags:{ip}", max_requests=60, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")

    # Validate flag_name — allow only SCREAMING_SNAKE_CASE, max 60 chars
    clean_name = flag_name.strip().upper()
    if not re.match(r'^[A-Z][A-Z0-9_]{0,59}$', clean_name):
        raise HTTPException(status_code=422, detail="Invalid flag_name format.")

    # Bust cache immediately so the next request sees the new value
    _flag_cache.pop(clean_name, None)

    updated = set_feature_flag(clean_name, req.is_active)
    logger.info(f"[FEATURE_FLAG] {clean_name} → {req.is_active} (admin: {ip})")
    return updated


# ── Guardian admin endpoints ──────────────────────────────────────────────────

@app.get("/api/admin/guardian/status")
def admin_guardian_status(request: Request):
    """Return the current GuardianAgent state and recent repair history (admin only)."""
    _admin_guard(request)
    ip = get_client_ip(request)
    if not check_rate_limit(f"admin_guardian:{ip}", max_requests=30, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")
    return get_guardian_status()


class GuardianResetRequest(BaseModel):
    secret: str

    @field_validator("secret")
    @classmethod
    def secret_nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("secret must not be empty")
        return v.strip()


@app.post("/api/admin/guardian/reset")
def admin_guardian_reset(req: GuardianResetRequest, request: Request):
    """Unlock the GuardianAgent from LOCKED state.

    Requires the ``GUARDIAN_SECRET`` env-var value in the request body.  If
    ``GUARDIAN_SECRET`` is not configured it falls back to ``ADMIN_PASSWORD`` /
    ``ADMIN_API_KEY``.  The admin credential (``x-admin-key`` header) is also
    required so two independent secrets must be valid.
    """
    _admin_guard(request)
    ip = get_client_ip(request)
    # Tighter rate limit: unlocking the kill switch is a sensitive action.
    if not check_rate_limit(f"admin_guardian_reset:{ip}", max_requests=3, window=300):
        raise HTTPException(status_code=429, detail="Too many requests.")
    if reset_guardian(req.secret):
        logger.warning("[GUARDIAN] Reset via admin API from %s", ip)
        return {"ok": True, "message": "Guardian unlocked and returned to ACTIVE state."}
    raise HTTPException(status_code=403, detail="Invalid guardian secret.")


@app.post("/api/admin/guardian/disable")
def admin_guardian_disable(request: Request):
    """Pause the GuardianAgent (admin only).  Use /enable to resume."""
    _admin_guard(request)
    ip = get_client_ip(request)
    if not check_rate_limit(f"admin_guardian:{ip}", max_requests=30, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")
    disable_guardian()
    logger.warning("[GUARDIAN] Disabled via admin API from %s", ip)
    return {"ok": True, "message": "Guardian disabled."}


@app.post("/api/admin/guardian/enable")
def admin_guardian_enable(request: Request):
    """Resume a paused (DISABLED) GuardianAgent (admin only)."""
    _admin_guard(request)
    ip = get_client_ip(request)
    if not check_rate_limit(f"admin_guardian:{ip}", max_requests=30, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")
    enable_guardian()
    logger.warning("[GUARDIAN] Enabled via admin API from %s", ip)
    return {"ok": True, "message": "Guardian enabled."}

# Allowed event types from the Concrete Packers mini-game.
_CONCRETE_PACKERS_EVENTS = frozenset({
    "drag_start", "drag_cancel", "slot_occupied",
    "block_placed", "fuse_to_crate", "puzzle_complete", "reset",
})


class ConcretePackersTelemetryRequest(BaseModel):
    event_type: str
    session_id: Optional[str] = None
    equation: Optional[str] = None
    correct_answer: Optional[int] = None
    placed_count: Optional[int] = None
    elapsed_ms: Optional[int] = None
    timestamp: Optional[int] = None
    block_id: Optional[str] = None
    slot_index: Optional[int] = None
    crate_number: Optional[int] = None
    crate_count: Optional[int] = None
    belt_after: Optional[list] = None

    @field_validator("event_type")
    @classmethod
    def validate_event(cls, v: str) -> str:
        v = v.strip()[:64]
        if v not in _CONCRETE_PACKERS_EVENTS:
            raise ValueError(f"Unknown event_type: {v}")
        return v

    @field_validator("equation")
    @classmethod
    def sanitize_equation(cls, v):
        if v is None:
            return v
        return v.strip()[:100]

    @field_validator("block_id")
    @classmethod
    def sanitize_block_id(cls, v):
        if v is None:
            return v
        return v.strip()[:50]

    @field_validator("belt_after")
    @classmethod
    def sanitize_belt(cls, v):
        if v is None:
            return v
        # Keep only first 10 entries, each coerced to str or None
        return [(str(s)[:50] if s is not None else None) for s in v[:10]]


@app.post("/api/concrete-packers/telemetry")
def concrete_packers_telemetry(req: ConcretePackersTelemetryRequest, request: Request):
    """Ingest Concrete Packers drag-and-drop telemetry for the Phi-4 logic engine.

    Feature flag: FEATURE_CONCRETE_PACKERS (env var, default true).

    Payload schema:
    {
        "event_type": "drag_start" | "drag_cancel" | "slot_occupied" |
                      "block_placed" | "fuse_to_crate" | "puzzle_complete" | "reset",
        "session_id": "sess_abc123",
        "equation": "8 + 4",
        "correct_answer": 12,
        "placed_count": 5,
        "elapsed_ms": 12340,
        "timestamp": 1743260675000,
        "block_id": "blk-3",                // present on drag/place events
        "slot_index": 4,                    // present on block_placed / slot_occupied
        "belt_after": ["blk-0", null, ...], // 10-element array after placement
        "crate_number": 1,                  // present on fuse_to_crate
        "crate_count": 1,                   // present on puzzle_complete
    }
    """
    if not _feature_enabled("CONCRETE_PACKERS"):
        raise HTTPException(status_code=404, detail="Feature not enabled.")

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if not check_rate_limit(f"cp_telemetry:{ip}", max_requests=120, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")

    safe = {
        "event_type": req.event_type,
        "session_id": (req.session_id or "")[:40],
        "equation": req.equation,
        "correct_answer": req.correct_answer,
        "placed_count": req.placed_count,
        "elapsed_ms": req.elapsed_ms,
        "timestamp": req.timestamp,
        "block_id": req.block_id,
        "slot_index": req.slot_index,
        "crate_number": req.crate_number,
        "crate_count": req.crate_count,
    }
    logger.info(f"[CONCRETE_PACKERS] {json.dumps(safe)}")
    return {"ok": True}


# ── Potion Alchemists telemetry ───────────────────────────────────────────────

# Allowed event types from the Potion Alchemists mini-game.
_POTION_ALCHEMISTS_EVENTS = frozenset({
    "pour", "overfill", "beaker_emptied", "puzzle_complete",
})

# Allowed cup IDs (matches frontend CUPS array)
_POTION_CUP_IDS = frozenset({
    "quarter", "third", "half", "two_thirds", "three_quarters",
})


class PotionAlchemistsTelemetryRequest(BaseModel):
    event_type: str
    session_id: Optional[str] = None
    puzzle_index: Optional[int] = None
    target_fraction: Optional[str] = None   # e.g. "3/4"
    current_fill: Optional[str] = None      # e.g. "1/2"
    elapsed_ms: Optional[int] = None
    timestamp: Optional[int] = None
    cup_poured: Optional[str] = None        # cup id, e.g. "quarter"
    cup_fraction: Optional[str] = None      # e.g. "1/4"
    fill_after: Optional[str] = None        # fraction string after pour
    overfill_amount: Optional[str] = None   # fraction string of overflow
    pours_taken: Optional[int] = None       # on puzzle_complete
    pours_wasted: Optional[int] = None      # on beaker_emptied
    pour_history: Optional[list] = None     # list of {cup, fraction} on puzzle_complete

    @field_validator("event_type")
    @classmethod
    def validate_event(cls, v: str) -> str:
        v = v.strip()[:64]
        if v not in _POTION_ALCHEMISTS_EVENTS:
            raise ValueError(f"Unknown event_type: {v}")
        return v

    @field_validator("cup_poured")
    @classmethod
    def validate_cup(cls, v):
        if v is None:
            return v
        v = v.strip()[:50]
        if v and v not in _POTION_CUP_IDS:
            raise ValueError(f"Unknown cup_poured: {v}")
        return v

    @field_validator("target_fraction", "current_fill", "fill_after",
                     "overfill_amount", "cup_fraction")
    @classmethod
    def sanitize_fraction_str(cls, v):
        if v is None:
            return v
        return v.strip()[:20]

    @field_validator("pour_history")
    @classmethod
    def sanitize_history(cls, v):
        if v is None:
            return v
        # Accept up to 20 entries; each must be a dict with safe string values
        safe = []
        for item in v[:20]:
            if isinstance(item, dict):
                safe.append({k[:30]: str(val)[:50] for k, val in list(item.items())[:5]})
        return safe


@app.post("/api/potion-alchemists/telemetry")
def potion_alchemists_telemetry(req: PotionAlchemistsTelemetryRequest, request: Request):
    """Ingest Potion Alchemists fraction-pouring telemetry for the Phi-4 logic engine.

    Feature flag: FEATURE_POTION_ALCHEMISTS (env var, default true).

    Payload schema:
    {
        "event_type": "pour" | "overfill" | "beaker_emptied" | "puzzle_complete",
        "session_id": "sess_abc123",
        "puzzle_index": 0,
        "target_fraction": "3/4",
        "current_fill": "1/2",
        "elapsed_ms": 8200,
        "timestamp": 1743260675000,

        // pour / overfill events:
        "cup_poured": "quarter",         // cup ID
        "cup_fraction": "1/4",
        "fill_after": "3/4",             // on "pour"
        "overfill_amount": "5/4",        // on "overfill"

        // puzzle_complete:
        "pours_taken": 3,
        "pour_history": [{"cup": "half", "fraction": "1/2"}, ...],

        // beaker_emptied:
        "pours_wasted": 2,
    }
    """
    if not _feature_enabled("POTION_ALCHEMISTS"):
        raise HTTPException(status_code=404, detail="Feature not enabled.")

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if not check_rate_limit(f"pa_telemetry:{ip}", max_requests=120, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")

    safe = {
        "event_type": req.event_type,
        "session_id": (req.session_id or "")[:40],
        "puzzle_index": req.puzzle_index,
        "target_fraction": req.target_fraction,
        "current_fill": req.current_fill,
        "elapsed_ms": req.elapsed_ms,
        "timestamp": req.timestamp,
        "cup_poured": req.cup_poured,
        "cup_fraction": req.cup_fraction,
        "fill_after": req.fill_after,
        "overfill_amount": req.overfill_amount,
        "pours_taken": req.pours_taken,
        "pours_wasted": req.pours_wasted,
    }
    logger.info(f"[POTION_ALCHEMISTS] {json.dumps(safe)}")
    return {"ok": True}


# ── Orbital Engineers telemetry ───────────────────────────────────────────────

class OrbitalEngineersTelemetryRequest(BaseModel):
    session_id: Optional[str] = None
    puzzle_index: Optional[int] = None
    target_angle: Optional[float] = None
    final_angle: Optional[float] = None
    attempts: Optional[int] = None
    outcome: Optional[str] = None      # "correct" | "wrong"
    elapsed_ms: Optional[int] = None

@app.post("/api/orbital-engineers/telemetry")
def orbital_engineers_telemetry(req: OrbitalEngineersTelemetryRequest, request: Request):
    """Record a single Orbital Engineers puzzle attempt.
    Feature flag: FEATURE_ORBITAL_ENGINEERS (env var, default true).
    """
    ip = get_client_ip(request)
    if not check_rate_limit(f"orbital_tel:{ip}", max_requests=120, window=60):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    if not _feature_enabled("ORBITAL_ENGINEERS"):
        raise HTTPException(status_code=404, detail="Feature not available")
    validate_session_id(req.session_id or "")
    safe = {
        "session_id": (req.session_id or "")[:40],
        "puzzle_index": req.puzzle_index,
        "target_angle": req.target_angle,
        "final_angle": req.final_angle,
        "attempts": req.attempts,
        "outcome": (req.outcome or "")[:20],
        "elapsed_ms": req.elapsed_ms,
    }
    logger.info(f"[ORBITAL_ENGINEERS] {json.dumps(safe)}")
    return {"ok": True}


@app.get("/api/guilds")
def list_guilds():
    """Return all available guild options for onboarding."""
    return {"guilds": list(GUILD_CONFIG.values())}

@app.get("/api/player/stats/{session_id}")
def get_player_stats(session_id: str):
    """Detailed player stats for parent/educator dashboard."""
    try:
        validate_session_id(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session ID")
    session = get_session(session_id)
    history = session.get("history", [])
    quests = int(session.get("quests_completed", 0))

    # Compute per-guild quest counts from history
    guild_quests: dict = {}
    for entry in history:
        g = entry.get("guild")
        if g:
            guild_quests[g] = guild_quests.get(g, 0) + 1

    return {
        "player_name": session.get("player_name", "Hero"),
        "age_group": session.get("age_group", "8-10"),
        "guild": session.get("guild"),
        "guild_config": GUILD_CONFIG.get(session.get("guild")) if session.get("guild") else None,
        "quests_completed": quests,
        "streak_count": int(session.get("streak_count", 0)),
        "last_active_date": session.get("last_active_date", ""),
        "ideology_meter": int(session.get("ideology_meter", 0)),
        "ideology_label": _ideology_label(int(session.get("ideology_meter", 0))),
        "perseverance_score": int(session.get("perseverance_score", 0)),
        "hint_count": int(session.get("hint_count", 0)),
        "difficulty_level": int(session.get("difficulty_level", DDA_DEFAULT)),
        "difficulty_label": _difficulty_label(int(session.get("difficulty_level", DDA_DEFAULT))),
        "badges": session.get("badges", []),
        "badge_details": _get_badge_details(session.get("badges", [])),
        "guild_quests": guild_quests,
        "mastery": session.get("mastery", {}),
        "recent_history": history[-10:],
        "coins": int(session.get("coins", 0)),
    }


def _generate_image(prompt: str) -> dict:
    """Generate an image using Gemini 2.5 Flash.

    Uses the gemini-2.5-flash-preview-image-generation model by default.
    The model can be overridden via the GEMINI_IMAGE_MODEL environment variable.

    Returns {"image": base64_str, "mime": "image/png"} on success,
    or {"image": None, "mime": None} on failure.
    Raises HTTPException(429) if the cloud budget is exceeded.
    """
    try:
        response = get_gemini_client().models.generate_content(
            model=GEMINI_IMAGE_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )
        candidates = response.candidates or []
        if not candidates or not candidates[0].content:
            return {"image": None, "mime": None}
        for part in candidates[0].content.parts:
            if part.inline_data and part.inline_data.data:
                mime = part.inline_data.mime_type or "image/png"
                img_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                return {"image": img_b64, "mime": mime}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[IMG] Image generation error: {e}")
        if "content_policy_violation" in str(e).lower() or "safety" in str(e).lower():
            logger.warning("[IMG] Content policy violation — prompt was rejected")
        if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
            raise HTTPException(status_code=429, detail="Cloud budget exceeded")
    return {"image": None, "mime": None}


@app.post("/api/segment-image")
async def generate_segment_image(req: SegmentImageRequest):
    validate_session_id(req.session_id)
    if not check_rate_limit(f"img:{req.session_id}", max_requests=12, window=60):
        raise HTTPException(status_code=429, detail="Too many image requests. Please wait.")
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")
    if not _is_hero_unlocked_for_session(req.session_id, req.hero):
        raise HTTPException(status_code=403, detail="This hero is a Premium unlock. Upgrade to use this hero.")

    scene_moods = [
        "discovering a challenge, looking curious and determined, bright dramatic lighting",
        "using special powers with energy effects, action pose, dynamic movement",
        "in an intense battle or puzzle-solving moment, focused and powerful",
        "celebrating victory with a triumphant pose, confetti and sparkles, joyful"
    ]
    mood = scene_moods[min(req.segment_index, len(scene_moods) - 1)]

    import asyncio
    def _gen_image():
        try:
            image_prompt = (
                f"A vivid, high-quality digital illustration for a children's adventure story. "
                f"{hero['look']} is {mood}. "
                f"Scene context: {req.segment_text[:120]}. "
                f"Art direction: rich colors, detailed environment, expressive character, "
                f"cinematic lighting, storybook style. "
                f"IMPORTANT: absolutely no text, letters, numbers, words, or symbols anywhere in the image."
            )
            result = _generate_image(image_prompt)
            return result
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"[IMG] Segment image error: {e}")
        return {"image": None, "mime": None}

    return await asyncio.to_thread(_gen_image)


@app.post("/api/segment-images-batch")
async def generate_segment_images_batch(req: BatchSegmentImageRequest):
    validate_session_id(req.session_id)
    if not check_rate_limit(f"batchimg:{req.session_id}", max_requests=4, window=60):
        raise HTTPException(status_code=429, detail="Too many image requests. Please wait.")
    if len(req.segments) > 6:
        raise HTTPException(status_code=400, detail="Too many segments")
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")
    if not _is_hero_unlocked_for_session(req.session_id, req.hero):
        raise HTTPException(status_code=403, detail="This hero is a Premium unlock. Upgrade to use this hero.")

    scene_moods = [
        "discovering a challenge, looking curious and determined, bright dramatic lighting",
        "using special powers with energy effects, action pose, dynamic movement",
        "in an intense battle or puzzle-solving moment, focused and powerful",
        "celebrating victory with a triumphant pose, confetti and sparkles, joyful"
    ]

    import asyncio

    def _gen_one(seg_text, seg_idx):
        import time as _time
        mood = scene_moods[min(seg_idx, len(scene_moods) - 1)]
        image_prompt = (
            f"A vivid, high-quality digital illustration for a children's adventure story. "
            f"{hero['look']} is {mood}. "
            f"Scene context: {seg_text[:120]}. "
            f"Art direction: rich colors, detailed environment, expressive character, "
            f"cinematic lighting, storybook style. "
            f"IMPORTANT: absolutely no text, letters, numbers, words, or symbols anywhere in the image."
        )
        for attempt in range(3):
            try:
                logger.warning(f"[IMG] Generating image for segment {seg_idx} (attempt {attempt+1})...")
                result = _generate_image(image_prompt)
                if result["image"]:
                    logger.warning(f"[IMG] Segment {seg_idx} image generated OK")
                    return result
                logger.warning(f"[IMG] Segment {seg_idx}: no image returned, retrying...")
            except Exception as e:
                logger.warning(f"[IMG] Segment {seg_idx} attempt {attempt+1} error: {e}")
                if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
                    return {"image": None, "mime": None, "error": "budget_exceeded"}
            if attempt < 2:
                _time.sleep(1)
        return {"image": None, "mime": None}

    loop = asyncio.get_event_loop()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        tasks = [
            loop.run_in_executor(pool, _gen_one, seg, idx)
            for idx, seg in enumerate(req.segments)
        ]
        results = await asyncio.gather(*tasks)

    return {"images": list(results)}


def _get_elevenlabs_key():
    return os.environ.get("ELEVENLABS_API_KEY", "")

STORYTELLER_VOICES = [
    "9BWtsMINqrJLrRacOk9x",  # Aria - warm, engaging female (2024)
    "cgSgspJ2msm6clMCkdW9",  # Jessica - bright, enthusiastic female (2024)
    "TX3LPaxmHKxFdv7VOFE1",  # Liam - natural, friendly male (2024)
    "bIHbv24MWmeRgasZH58o",  # Will - warm, approachable male (2024)
    "Xb7hH8MSUJpSbSDYk0k2",  # Alice - clear, confident female (2024)
    "IKne3meq5aSn9XLyUdCD",  # Charlie - natural, energetic male (2024)
]


def math_to_spoken(text):
    t = text
    t = re.sub(r'(\d+)\s*[×x\*]\s*(\d+)', r'\1 times \2', t)
    t = re.sub(r'(\d+)\s*[÷/]\s*(\d+)', r'\1 divided by \2', t)
    t = re.sub(r'(\d+)\s*\+\s*(\d+)', r'\1 plus \2', t)
    t = re.sub(r'(\d+)\s*[-–—]\s*(\d+)', r'\1 minus \2', t)
    t = re.sub(r'(\d+)\s*=\s*(\d+)', r'\1 equals \2', t)
    t = t.replace('%', ' percent')
    t = re.sub(r'(\d+)\s*\^(\d+)', r'\1 to the power of \2', t)
    t = re.sub(r'√(\d+)', r'the square root of \1', t)
    return t


@app.get("/api/tts/voices")
def get_tts_voices():
    return {"voices": STORYTELLER_VOICES}


@app.post("/api/tts")
async def generate_tts(req: TTSRequest, request: Request):
    scan_input_for_attacks(req.text, request)
    if not check_rate_limit(f"tts:{hash(req.text[:20])}", max_requests=15, window=60):
        raise HTTPException(status_code=429, detail="Too many TTS requests. Please wait.")
    import asyncio
    def _gen_audio():
        try:
            voice_id = req.voice_id if req.voice_id and req.voice_id in STORYTELLER_VOICES else random.choice(STORYTELLER_VOICES)
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            headers = {
                "xi-api-key": _get_elevenlabs_key(),
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            }
            payload = {
                "text": math_to_spoken(req.text),
                "model_id": "eleven_turbo_v2_5",
                "voice_settings": {
                    "stability": 0.55,
                    "similarity_boost": 0.7,
                    "style": 0.45,
                    "use_speaker_boost": True,
                },
            }
            resp = http_requests.post(url, json=payload, headers=headers, timeout=30)
            if resp.status_code == 200:
                audio_b64 = base64.b64encode(resp.content).decode('utf-8')
                return {"audio": audio_b64, "mime": "audio/mpeg"}
            else:
                pass
        except Exception:
            pass
        return {"audio": None}

    return await asyncio.to_thread(_gen_audio)


@app.post("/api/image")
def generate_image(req: StoryRequest):
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")
    if not _is_hero_unlocked_for_session(req.session_id, req.hero):
        raise HTTPException(status_code=403, detail="This hero is a Premium unlock. Upgrade to use this hero.")

    session = get_session(req.session_id)
    gear = ", ".join(session["inventory"]) if session["inventory"] else "bare hands"

    max_retries = 3
    for attempt in range(max_retries):
        try:
            image_prompt = (
                f"A vivid, high-quality digital illustration for a children's math adventure. "
                f"{hero['look']} equipped with {gear}, teaching about {req.problem}. "
                f"Art direction: rich colors, detailed environment, expressive character, "
                f"cinematic lighting, storybook style. "
                f"IMPORTANT: absolutely no text, letters, numbers, words, or symbols anywhere in the image."
            )
            result = _generate_image(image_prompt)
            if result["image"]:
                return result
        except Exception as e:
            logger.warning(f"[IMG] Single image error attempt {attempt}: {e}")
            if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
                raise HTTPException(status_code=429, detail="Cloud budget exceeded")
            if attempt == max_retries - 1:
                raise HTTPException(status_code=500, detail="Image generation failed")
            import time
            time.sleep(2)

    raise HTTPException(status_code=500, detail="Could not generate image")


@app.post("/api/shop/buy")
def buy_item(req: ShopRequest):
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    item = next((i for i in SHOP_ITEMS if i["id"] == req.item_id), None)
    if not item:
        raise HTTPException(status_code=400, detail="Unknown item")
    is_consumable = item.get("consumable", False)
    if not is_consumable and item["id"] in session["inventory"]:
        raise HTTPException(status_code=400, detail="Already owned")
    if session["coins"] < item["price"]:
        raise HTTPException(status_code=400, detail="Not enough coins")

    session["coins"] -= item["price"]
    if is_consumable:
        session["potions"].append(item["id"])
    else:
        session["inventory"].append(item["id"])
    _update_badges(session)
    _save_session(req.session_id)
    return {"coins": session["coins"], "inventory": session["inventory"], "equipped": session["equipped"], "potions": session["potions"]}

class EquipRequest(BaseModel):
    item_id: str
    session_id: str

@app.post("/api/shop/equip")
def equip_item(req: EquipRequest):
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    if req.item_id not in session["inventory"]:
        raise HTTPException(status_code=400, detail="Item not owned")
    item = next((i for i in SHOP_ITEMS if i["id"] == req.item_id), None)
    if not item:
        raise HTTPException(status_code=400, detail="Unknown item")
    cat = item["category"]
    session["equipped"] = [eid for eid in session["equipped"] if next((i for i in SHOP_ITEMS if i["id"] == eid), {}).get("category") != cat]
    session["equipped"].append(req.item_id)
    _save_session(req.session_id)
    return {"equipped": session["equipped"]}

@app.post("/api/shop/unequip")
def unequip_item(req: EquipRequest):
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    if req.item_id in session["equipped"]:
        session["equipped"].remove(req.item_id)
    _save_session(req.session_id)
    return {"equipped": session["equipped"]}

class UsePotionRequest(BaseModel):
    potion_id: str
    session_id: str

@app.post("/api/shop/use-potion")
def use_potion(req: UsePotionRequest):
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    if req.potion_id not in session["potions"]:
        raise HTTPException(status_code=400, detail="Potion not owned")
    session["potions"].remove(req.potion_id)
    item = next((i for i in SHOP_ITEMS if i["id"] == req.potion_id), None)
    _save_session(req.session_id)
    return {"potions": session["potions"], "effect": item["effect"] if item else None}


@app.get("/api/pdf/{session_id}")
def generate_pdf(session_id: str):
    validate_session_id(session_id)
    session = get_session(session_id)
    history = session.get("history", [])

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Math Quest Progress Report", ln=True, align="C")
    pdf.ln(10)

    if history:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(60, 8, "Date", border=1, align="C")
        pdf.cell(70, 8, "Concept", border=1, align="C")
        pdf.cell(60, 8, "Hero", border=1, align="C")
        pdf.ln()
        pdf.set_font("Helvetica", "", 10)
        for entry in history:
            clean_hero = "".join(c for c in entry["hero"] if c.isascii())
            clean_concept = "".join(c for c in entry["concept"] if c.isascii())
            pdf.cell(60, 8, entry["time"], border=1, align="C")
            pdf.cell(70, 8, clean_concept[:30], border=1, align="C")
            pdf.cell(60, 8, clean_hero, border=1, align="C")
            pdf.ln()
    else:
        pdf.cell(0, 10, "No quests completed yet.", ln=True, align="C")

    pdf_bytes = pdf.output()
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=Math_Quest_Report.pdf"})


class ParentPinRequest(BaseModel):
    session_id: str
    pin: str

    @field_validator('pin')
    @classmethod
    def pin_valid(cls, v):
        if not _is_valid_parent_pin(v):
            raise ValueError('PIN must be exactly 4 digits')
        return v

class ParentPinVerifyRequest(BaseModel):
    session_id: str
    pin: str

    @field_validator('pin')
    @classmethod
    def pin_verify_valid(cls, v):
        if not isinstance(v, str) or len(v) > 10:
            raise ValueError('Invalid PIN format')
        return v

class PrivacySettingsRequest(BaseModel):
    session_id: str
    pin: str
    settings: Optional[dict] = None
    parental_consent: Optional[bool] = None
    allow_telemetry: Optional[bool] = None
    allow_personalization: Optional[bool] = None
    data_retention_days: Optional[int] = None

    @field_validator('pin')
    @classmethod
    def privacy_pin_valid(cls, v):
        if not isinstance(v, str) or len(v) > 10:
            raise ValueError('Invalid PIN format')
        return v

@app.post("/api/parent-pin/set")
def set_parent_pin(req: ParentPinRequest):
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    if not _is_valid_parent_pin(req.pin):
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits")
    session["_parent_pin_hash"] = _hash_parent_pin(req.pin)
    _save_session(req.session_id)
    return {"success": True, "has_parent_pin": True}

@app.post("/api/parent-pin/verify")
def verify_parent_pin(req: ParentPinVerifyRequest):
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    stored_hash = session.get("_parent_pin_hash")
    if not stored_hash:
        return {"verified": False, "reason": "No PIN set"}
    attempt_hash = _hash_parent_pin(req.pin)
    verified = hmac.compare_digest(stored_hash, attempt_hash)
    return {"verified": verified}

@app.get("/api/privacy/{session_id}")
def get_privacy_settings(session_id: str):
    validate_session_id(session_id)
    session = get_session(session_id)
    return {
        "privacy_settings": _sanitize_privacy_settings(session.get("privacy_settings")),
        "has_parent_pin": "_parent_pin_hash" in session,
    }

@app.post("/api/privacy/settings")
def update_privacy_settings(req: PrivacySettingsRequest):
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    stored_hash = session.get("_parent_pin_hash")
    if stored_hash:
        attempt_hash = _hash_parent_pin(req.pin)
        if not hmac.compare_digest(stored_hash, attempt_hash):
            raise HTTPException(status_code=403, detail="Incorrect PIN")
    if req.settings is not None:
        raw = req.settings
    else:
        current = _sanitize_privacy_settings(session.get("privacy_settings"))
        raw = {
            "parental_consent": req.parental_consent if req.parental_consent is not None else current["parental_consent"],
            "allow_telemetry": req.allow_telemetry if req.allow_telemetry is not None else current["allow_telemetry"],
            "allow_personalization": req.allow_personalization if req.allow_personalization is not None else current["allow_personalization"],
            "data_retention_days": req.data_retention_days if req.data_retention_days is not None else current["data_retention_days"],
        }
    session["privacy_settings"] = _sanitize_privacy_settings(raw)
    _save_session(req.session_id)
    return {
        "success": True,
        "privacy_settings": session["privacy_settings"],
    }

class EarlyAccessRequest(BaseModel):
    # email is optional — when a Firebase Bearer token is provided the email is
    # extracted from the verified token instead of trusting the request body.
    email: str = ""

    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        import re as _re
        if not v:
            return v  # empty is allowed; token path will supply the email
        v = v.strip().lower()
        if len(v) > 254:
            raise ValueError('Invalid email')
        if not _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', v):
            raise ValueError('Invalid email format')
        return v


def _generate_promo_code() -> str:
    import random, string
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(random.choices(chars, k=6))
    return f"EARLY{suffix}"


# In-memory fallback store for early-access leads when no DATABASE_URL is
# configured.  Maps email → promo_code.  Resets on server restart but is
# sufficient to prevent double-sends during a single server session.
_early_access_memory: dict[str, str] = {}
_early_access_lock = threading.Lock()


@app.post("/api/early-access")
def early_access_claim(req: EarlyAccessRequest, authorization: str = Header(default="")):
    import traceback
    from backend.resend_client import send_promo_email

    # ── Firebase token verification (preferred) ───────────────────────────────
    # If a valid Bearer token is present, extract the verified email from it.
    # Falls back to req.email for environments where Firebase isn't configured.
    email = req.email
    if authorization.startswith("Bearer "):
        id_token = authorization.split(" ", 1)[1]
        if _firebase_ready:
            try:
                decoded = _fb_auth.verify_id_token(id_token)
                email = decoded.get("email", "").strip().lower()
            except Exception as token_exc:
                logger.warning("[EARLY_ACCESS] Firebase token verification failed: %s", token_exc)
                raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")
        else:
            # Firebase SDK not initialised — reject authenticated requests so
            # tokens are never silently accepted without verification.
            raise HTTPException(status_code=503, detail="Firebase token verification unavailable.")

    if not email:
        raise HTTPException(status_code=422, detail="Email is required.")

    # Lightweight structural check — email has already been validated by Firebase.
    _parts = email.split('@')
    if len(email) > 254 or len(_parts) != 2 or not _parts[0] or not _parts[1] or '.' not in _parts[1]:
        raise HTTPException(status_code=422, detail="Invalid email format.")

    db_url = os.environ.get("DATABASE_URL", "").strip()

    # ── Database path (preferred) ────────────────────────────────────────────
    if db_url:
        try:
            from backend.database import get_db_connection
            conn = get_db_connection()
            cur = conn.cursor()

            cur.execute("SELECT id FROM leads WHERE email = %s", (email,))
            if cur.fetchone():
                cur.close()
                conn.close()
                raise HTTPException(status_code=409, detail="This email has already claimed a code — check your inbox!")

            code = _generate_promo_code()
            while True:
                cur.execute("SELECT id FROM promo_codes WHERE code = %s", (code,))
                if not cur.fetchone():
                    break
                code = _generate_promo_code()

            cur.execute(
                """INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, grants_premium_days, active)
                   VALUES (%s, 'percent', 0, 1, 30, true)""",
                (code,)
            )
            cur.execute(
                "INSERT INTO leads (email, promo_code) VALUES (%s, %s)",
                (email, code)
            )
            conn.commit()

            # Email failure must not roll back a successful DB signup — log and continue.
            try:
                email_ok = send_promo_email(email, code)
            except Exception as email_exc:
                logger.error(f"[EARLY_ACCESS] Email send exception (db path): {email_exc}\n{traceback.format_exc()}")
                email_ok = False

            if email_ok:
                cur.execute("UPDATE leads SET email_sent = true WHERE email = %s", (email,))
                conn.commit()
            else:
                logger.warning(f"[EARLY_ACCESS] Email not sent for {email} (code={code}) — lead still recorded in DB")

            cur.close()
            conn.close()

            logger.info(f"[EARLY_ACCESS] Lead captured (db): {email}, code={code}, email_sent={email_ok}")
            return {"success": True, "message": "Check your email for your free promo code!"}

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[EARLY_ACCESS] DB error: {e}\n{traceback.format_exc()}")
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": str(e)},
            )

    # ── In-memory fallback (no DATABASE_URL configured) ───────────────────────
    logger.warning("[EARLY_ACCESS] DATABASE_URL not set — using in-memory fallback to send promo email")
    with _early_access_lock:
        if email in _early_access_memory:
            raise HTTPException(status_code=409, detail="This email has already claimed a code — check your inbox!")
        code = _generate_promo_code()
        _early_access_memory[email] = code

    # Send email outside the lock (network I/O).
    # Email failure does NOT un-register the user — they are already signed up.
    try:
        email_ok = send_promo_email(email, code)
        if not email_ok:
            logger.warning(f"[EARLY_ACCESS] Email not sent for {email} (code={code}) — lead still recorded in memory")
    except Exception as e:
        logger.error(f"[EARLY_ACCESS] Email send exception (memory path): {e}\n{traceback.format_exc()}")

    logger.info(f"[EARLY_ACCESS] Lead captured (memory): {email}, code={code}")
    return {"success": True, "message": "Check your email for your free promo code!"}


@app.get("/api/early-access/stats")
def early_access_stats(request: Request):
    admin_key = _get_admin_credential()
    provided_key = request.headers.get("x-admin-key", request.query_params.get("key", ""))
    if not admin_key or not hmac.compare_digest(admin_key, provided_key):
        raise HTTPException(status_code=403, detail="Forbidden")

    from backend.database import get_db_connection
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*), COUNT(CASE WHEN email_sent THEN 1 END) FROM leads")
    total, sent = cur.fetchone()
    cur.close()
    conn.close()
    return {"total_leads": total, "emails_sent": sent}


# ── Admin: promo code management ──────────────────────────────────────────────

class PromoGenerateRequest(BaseModel):
    duration_type: str = "30_day"   # "30_day" | "90_day" | "lifetime"
    count: int = 1

@app.get("/api/promo/list")
def promo_list(request: Request):
    """Return all promo codes with redemption status (admin only)."""
    _admin_guard(request)
    from backend.database import get_db_connection
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT p.code, p.grants_premium_days, p.active, p.created_at,
                   l.email AS redeemed_by
            FROM promo_codes p
            LEFT JOIN leads l ON l.promo_code = p.code
            ORDER BY p.created_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        codes = []
        for row in rows:
            days = row[1]
            if days >= 36500:
                dtype = "lifetime"
            elif days >= 90:
                dtype = "90_day"
            else:
                dtype = "30_day"
            codes.append({
                "code": row[0],
                "duration_type": dtype,
                "grants_premium_days": days,
                "active": row[2],
                "created_at": row[3].isoformat() if row[3] else None,
                "redeemed": row[4] is not None,
                "redeemed_by": row[4],
            })
        return {"codes": codes}
    except Exception as e:
        logger.error(f"[PROMO_LIST] {e}")
        raise HTTPException(status_code=500, detail="Could not load promo codes")


@app.post("/api/promo/generate")
def promo_generate(req: PromoGenerateRequest, request: Request):
    """Batch-generate admin promo codes (admin only)."""
    _admin_guard(request)
    if not check_rate_limit(f"promo_gen:{get_client_ip(request)}", max_requests=10, window=60):
        raise HTTPException(status_code=429, detail="Too many requests")
    count = max(1, min(50, req.count))
    dtype = req.duration_type if req.duration_type in _DURATION_DAYS else "30_day"
    days = _DURATION_DAYS[dtype]
    from backend.database import get_db_connection
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        generated = []
        for _ in range(count):
            code = _generate_promo_code()
            attempts = 0
            while attempts < 10:
                cur.execute("SELECT id FROM promo_codes WHERE code = %s", (code,))
                if not cur.fetchone():
                    break
                code = _generate_promo_code()
                attempts += 1
            cur.execute(
                """INSERT INTO promo_codes
                   (code, discount_type, discount_value, max_uses, grants_premium_days, active)
                   VALUES (%s, 'percent', 0, 1, %s, true)""",
                (code, days),
            )
            generated.append(code)
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"[PROMO_GEN] Admin generated {len(generated)} {dtype} codes")
        return {"codes": generated, "duration_type": dtype, "grants_premium_days": days}
    except Exception as e:
        logger.error(f"[PROMO_GEN] {e}")
        raise HTTPException(status_code=500, detail="Could not generate promo codes")


_contact_rate_limit: dict = {}

class TelemetryRequest(BaseModel):
    event_type: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    page: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: Optional[str] = None
    metadata: Optional[dict] = None
    payload: Optional[dict] = None

@app.post("/api/client-telemetry")
def client_telemetry(req: TelemetryRequest, request: Request):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if not check_rate_limit(f"telemetry:{ip}", max_requests=60, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")
    event = (req.event_type or "")[:64]

    # Persist gameplay events to the Telemetry Cosmos container
    if event in ("spell_cast", "tycoon_purchase"):
        sid = (req.session_id or req.user_id or "anon")[:128]
        meta = req.metadata or {}
        safe_meta = {k: v for k, v in list(meta.items())[:20]}
        try:
            get_cosmos_service().insert_telemetry_event(
                session_id=sid,
                event_type=event,
                metadata=safe_meta,
                timestamp=req.timestamp,
            )
        except Exception as _tel_err:
            logger.warning("[TELEMETRY] Cosmos write skipped: %s", _tel_err)

    # Legacy web-vital / error events — log only
    if event in ("web_vital", "client_error", "unhandled_rejection"):
        payload = req.payload or {}
        safe_payload = {k: str(v)[:200] for k, v in list(payload.items())[:10]}
        logger.info(f"[TELEMETRY] {event} {safe_payload}")

    return {"ok": True}


@app.get("/api/admin/telemetry-stats")
def admin_telemetry_stats(request: Request):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if not check_rate_limit(f"admin-stats:{ip}", max_requests=20, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")
    try:
        stats = get_cosmos_service().get_telemetry_stats()
        return stats
    except Exception as exc:
        logger.warning("[TELEMETRY] get_telemetry_stats failed: %s", exc)
        return {"spells_cast": 0, "math_accuracy_pct": 0.0, "total_answers": 0, "tycoon_purchases": 0}


class ContactRequest(BaseModel):
    name: str
    email: str
    message: str

@app.post("/api/contact")
def contact_us(req: ContactRequest, request: Request):
    name = req.name.strip()[:100]
    email = req.email.strip()[:200]
    message = req.message.strip()[:2000]

    if not name or not email or not message:
        raise HTTPException(status_code=422, detail="Name, email, and message are required.")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=422, detail="Invalid email address.")

    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    rate_key = f"{ip}:{email}"
    now = datetime.datetime.utcnow().timestamp()
    if rate_key in _contact_rate_limit and now - _contact_rate_limit[rate_key] < 600:
        raise HTTPException(status_code=429, detail="Please wait before sending another message.")
    _contact_rate_limit[rate_key] = now

    from backend.resend_client import send_contact_email
    ok = send_contact_email(name, email, message)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to send message. Please try again.")
    return {"success": True, "message": "Message sent! We'll get back to you soon."}


_inbound_emails: list = []

@app.post("/api/inbound-email")
async def inbound_email_webhook(request: Request):
    raw_body = ""
    try:
        raw_body = (await request.body()).decode("utf-8", errors="replace")
        payload = json.loads(raw_body)
    except Exception:
        return JSONResponse(status_code=200, content={"ok": True})

    event_type = payload.get("type", "")
    if event_type != "email.received":
        return JSONResponse(status_code=200, content={"ok": True})

    data = payload.get("data", {})
    email_id = data.get("email_id", "")
    subject = data.get("subject", "")
    from_addr = data.get("from", "")
    to_addrs = data.get("to", [])
    created_at = data.get("created_at", "")

    text_body = ""
    html_body = ""
    code_found = ""

    for key in ("text", "html", "body", "content", "payload"):
        val = data.get(key, "") or ""
        if val and not text_body:
            text_body = val if key in ("text", "body", "content", "payload") else text_body
            html_body = val if key == "html" else html_body

    reader_key = os.environ.get("Resend_Reader_Api", "")
    if not reader_key:
        reader_key = os.environ.get("RESEND_FULL_KEY", "")

    if reader_key and email_id:
        try:
            resp = http_requests.get(
                f"https://api.resend.com/emails/{email_id}",
                headers={"Authorization": f"Bearer {reader_key}"},
                timeout=8,
            )
            if resp.status_code == 200:
                fetched = resp.json()
                text_body = fetched.get("text", "") or text_body
                html_body = fetched.get("html", "") or html_body
        except Exception as e:
            logger.warning(f"[INBOUND] Reader key fetch failed: {e}")

    search_targets = " ".join(filter(None, [text_body, raw_body]))
    codes = re.findall(r"\b\d{6}\b", search_targets)
    if codes:
        code_found = codes[0]

    entry = {
        "email_id": email_id,
        "subject": subject,
        "from": from_addr,
        "to": to_addrs,
        "created_at": created_at,
        "code": code_found,
        "text_snippet": text_body[:500] if text_body else raw_body[:500],
    }
    _inbound_emails.insert(0, entry)
    if len(_inbound_emails) > 10:
        _inbound_emails.pop()

    logger.info(f"[INBOUND] from={from_addr} subject={subject!r} code={code_found!r}")

    try:
        from backend.resend_client import _get_resend_credentials
        send_key, from_email = _get_resend_credentials()
        if not from_email:
            from_email = "hello@themathscript.com"
        owner_email = os.environ.get("OWNER_EMAIL", "")
        if send_key and owner_email:
            import resend as resend_lib
            resend_lib.api_key = send_key

            code_section = (
                f'<div style="background:#0f172a;border:2px solid #00d4ff;border-radius:12px;'
                f'padding:20px;text-align:center;margin:20px 0;">'
                f'<div style="color:#a0aec0;font-size:12px;letter-spacing:2px;text-transform:uppercase;'
                f'margin-bottom:8px;">Verification Code</div>'
                f'<div style="color:#00d4ff;font-size:42px;font-weight:900;letter-spacing:10px;'
                f'font-family:monospace;">{code_found}</div></div>'
                if code_found else
                '<p style="color:#f87171;">No 6-digit code detected automatically — '
                'check the raw payload below.</p>'
            )

            raw_escaped = raw_body.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            text_escaped = text_body.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

            fwd_html = f"""<!DOCTYPE html>
<html><body style="background:#0a0e1a;color:#e8e8f0;font-family:Arial,sans-serif;padding:24px;">
<h2 style="color:#7c3aed;font-family:monospace;">📬 Forwarded Inbound Email</h2>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
  <tr><td style="color:#a0aec0;padding:4px 12px 4px 0;width:80px;">From</td>
      <td style="color:#e8e8f0;">{from_addr}</td></tr>
  <tr><td style="color:#a0aec0;padding:4px 12px 4px 0;">To</td>
      <td style="color:#e8e8f0;">{", ".join(to_addrs)}</td></tr>
  <tr><td style="color:#a0aec0;padding:4px 12px 4px 0;">Subject</td>
      <td style="color:#e8e8f0;">{subject}</td></tr>
  <tr><td style="color:#a0aec0;padding:4px 12px 4px 0;">Time</td>
      <td style="color:#e8e8f0;">{created_at}</td></tr>
</table>
{code_section}
{"<h3 style='color:#7c3aed;'>Email Body</h3><pre style='background:#12172a;padding:16px;border-radius:8px;white-space:pre-wrap;color:#e8e8f0;font-size:13px;'>" + text_escaped + "</pre>" if text_body else ""}
<h3 style="color:#7c3aed;">Raw Webhook Payload</h3>
<pre style="background:#12172a;padding:16px;border-radius:8px;white-space:pre-wrap;
color:#9ca3af;font-size:11px;">{raw_escaped[:3000]}</pre>
</body></html>"""

            resend_lib.Emails.send({
                "from": from_email,
                "to": [owner_email],
                "subject": f"📬 Fwd: {subject}",
                "html": fwd_html,
            })
            logger.info(f"[INBOUND] Forwarded to {owner_email}")
    except Exception as e:
        logger.error(f"[INBOUND] Forward failed: {e}")

    return JSONResponse(status_code=200, content={"ok": True})


@app.get("/api/inbound-email/latest")
def inbound_email_latest(request: Request):
    admin_key = _get_admin_credential()
    provided_key = request.headers.get("x-admin-key", request.query_params.get("key", ""))
    if not admin_key or not hmac.compare_digest(admin_key, provided_key):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"emails": _inbound_emails}


@app.get("/api/admin/subscribers")
def admin_check_subscribers(request: Request):
    admin_key = _get_admin_credential()
    provided_key = request.headers.get("x-admin-key", request.query_params.get("key", ""))
    if not admin_key or not hmac.compare_digest(admin_key, provided_key):
        raise HTTPException(status_code=403, detail="Forbidden")

    from backend.database import get_db_connection

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM app_users")
        total_users = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM app_users WHERE stripe_customer_id IS NOT NULL")
        stripe_customers = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*) FROM app_users
            WHERE subscription_status IN ('active', 'trialing', 'past_due')
        """)
        premium_count = cur.fetchone()[0]

        cur.execute("""
            SELECT session_id, stripe_customer_id, stripe_subscription_id,
                   subscription_status, created_at, updated_at
            FROM app_users
            WHERE subscription_status != 'free'
               OR stripe_customer_id IS NOT NULL
               OR stripe_subscription_id IS NOT NULL
            ORDER BY updated_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    subscribers = [
        {
            "session_id": r[0],
            "stripe_customer_id": r[1],
            "stripe_subscription_id": r[2],
            "subscription_status": r[3],
            "created_at": str(r[4]) if r[4] else None,
            "updated_at": str(r[5]) if r[5] else None,
        }
        for r in rows
    ]

    stripe_summary = None
    try:
        from backend.stripe_client import get_stripe_client
        client = get_stripe_client()
        counts = {}
        for status in ["active", "trialing", "past_due", "canceled"]:
            subs = client.v1.subscriptions.list(params={"status": status, "limit": 100})
            counts[f"{status}_count"] = len(subs.data)
        stripe_summary = counts
    except Exception as e:
        stripe_summary = {"error": str(e)}

    return {
        "total_users": total_users,
        "stripe_customers": stripe_customers,
        "premium_subscribers": premium_count,
        "has_any_subscribers": premium_count > 0,
        "subscriber_details": subscribers,
        "stripe_summary": stripe_summary,
    }



# ── Analogy Milestone Progress  ───────────────────────────────────────────────

# Allowed game types.  Extend this set as new games are added.
_VALID_GAME_TYPES = frozenset({"tycoon", "concrete-packers", "potion-alchemists", "orbital-engineers"})

# Concept IDs must be safe slugs (lowercase letters, digits, hyphens only).
# The first character must be a letter or digit; max total length is 100.
_CONCEPT_ID_MAX_LEN = 100
_CONCEPT_ID_RE = re.compile(rf'^[a-z0-9][a-z0-9\-]{{0,{_CONCEPT_ID_MAX_LEN - 2}}}$')

# Rate-limit for /api/progress/milestone: generous enough for normal gameplay
# (one milestone per analogy, a few per session) but tight enough to prevent
# bulk-write abuse.
_MILESTONE_RATE_LIMIT_REQUESTS = 30
_MILESTONE_RATE_LIMIT_WINDOW   = 60  # seconds

class MilestoneRequest(BaseModel):
    """Payload posted by the game client when a learner masters a concept."""
    userId:    str
    conceptId: str
    gameType:  str
    timestamp: Optional[str] = None  # ISO-8601; falls back to server time

    @field_validator("userId")
    @classmethod
    def validate_user_id(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 100:
            raise ValueError("userId must be 1-100 characters")
        # Allow the existing session-ID format (sess_xxx) and plain UUIDs/slugs
        if not re.match(r'^[a-zA-Z0-9_\-\.]{1,100}$', v):
            raise ValueError("userId contains invalid characters")
        return v

    @field_validator("conceptId")
    @classmethod
    def validate_concept_id(cls, v: str) -> str:
        v = v.strip().lower()
        if not _CONCEPT_ID_RE.match(v):
            raise ValueError(
                "conceptId must be a lowercase slug (letters, digits, hyphens)"
            )
        return v

    @field_validator("gameType")
    @classmethod
    def validate_game_type(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in _VALID_GAME_TYPES:
            raise ValueError(
                f"gameType must be one of: {', '.join(sorted(_VALID_GAME_TYPES))}"
            )
        return v

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()[:64]
        # Basic ISO-8601 sanity check — reject obviously non-date strings
        if not re.match(r'^\d{4}-\d{2}-\d{2}', v):
            raise ValueError("timestamp must be an ISO-8601 date string")
        return v


@app.post("/api/progress/milestone")
async def record_milestone(req: MilestoneRequest, request: Request):
    """Save an analogy milestone to Cosmos DB and return the learner's total points.

    The endpoint upserts a per-concept milestone document (type="progress") into
    the ``UserProgress`` container of ``MathScriptDB``, then updates the learner's
    master progress document with the new cumulative score.

    Each unique ``conceptId`` per ``userId`` contributes exactly 1 point, so
    re-submitting the same milestone is fully idempotent.

    Request body
    ------------
    .. code-block:: json

        {
            "userId":    "sess_abc123",
            "conceptId": "addition-intro",
            "gameType":  "tycoon",
            "timestamp": "2026-03-29T21:34:44.076Z"
        }

    Response (200)
    --------------
    .. code-block:: json

        {
            "ok":         true,
            "message":    "Milestone recorded",
            "totalPoints": 3
        }
    """
    ip = get_client_ip(request)
    if not check_rate_limit(f"milestone:{ip}", max_requests=_MILESTONE_RATE_LIMIT_REQUESTS, window=_MILESTONE_RATE_LIMIT_WINDOW):
        raise HTTPException(status_code=429, detail="Too many milestone requests. Please slow down.")

    # Use server-side timestamp if the client did not supply one
    milestone_timestamp = req.timestamp or datetime.datetime.now(datetime.timezone.utc).isoformat()

    try:
        svc = get_cosmos_service()
    except RuntimeError as exc:
        logger.warning("[Milestone] Cosmos unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Progress service is temporarily unavailable. Please try again later.",
        )

    try:
        result = await run_in_threadpool(
            svc.upsert_milestone,
            req.userId,
            req.conceptId,
            req.gameType,
            milestone_timestamp,
        )
    except Exception as exc:
        logger.error("[Milestone] Cosmos upsert failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Could not save progress. Please try again later.",
        )

    logger.info(
        "[Milestone] userId=%s conceptId=%s gameType=%s totalPoints=%d",
        req.userId, req.conceptId, req.gameType, result["totalPoints"],
    )
    return {
        "ok": True,
        "message": "Milestone recorded",
        "totalPoints": result["totalPoints"],
    }


@app.get("/api/health")
async def health_check():
    report = get_last_report()
    guardian = get_guardian_status()
    if report is None:
        # Server is still warming up — return a quick 200 so Azure's health probe
        # does NOT kill the container during the initial startup window.
        # The background scheduler (healthcheck._STARTUP_DELAY_SECONDS = 60 s) runs
        # the first full health-check pass after server boot; subsequent probes will
        # find a cached report and return real status.
        return {
            "status": "starting",
            "message": "Server warming up — health checks not yet run",
            "guardian_state": guardian.get("state"),
        }
    if _is_production():
        return {
            "status": "ok" if report.get("failed_count", 0) == 0 else "degraded",
            "total": report.get("total"),
            "passed": report.get("passed"),
            "failed_count": report.get("failed_count"),
            "guardian_state": guardian.get("state"),
        }
    return {**report, "guardian": guardian}

@app.post("/api/health/run")
async def run_health_check_now(request: Request):
    if _is_production():
        raise HTTPException(status_code=403, detail="Not available in production")
    report = await run_in_threadpool(run_health_checks)
    guardian = get_guardian_status()
    return {**report, "guardian": guardian}

_public_images = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "images")
if os.path.exists(_public_images):
    app.mount("/images", StaticFiles(directory=_public_images), name="images")

build_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
_assets_dir = os.path.join(build_dir, "assets")
if os.path.exists(_assets_dir):
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    real_build = Path(build_dir).resolve()
    if not real_build.is_dir():
        return HTMLResponse(
            "<!DOCTYPE html><html><body><h1>Starting up…</h1>"
            "<p>The frontend is not yet built. Please run <code>npm run build</code> "
            "inside the <code>frontend/</code> directory and redeploy.</p></body></html>",
            status_code=503,
        )
    index_html = real_build / "index.html"
    if not index_html.is_file():
        return HTMLResponse(
            "<!DOCTYPE html><html><body><h1>Starting up…</h1>"
            "<p>Frontend build is incomplete (index.html missing). Please redeploy.</p></body></html>",
            status_code=503,
        )
    # Prevent path traversal: resolve the full path and ensure it lives inside build_dir
    file_path = (real_build / full_path).resolve()
    if file_path.is_relative_to(real_build) and file_path.is_file():
        return FileResponse(str(file_path))
    return FileResponse(str(index_html), headers={"Cache-Control": "no-cache"})
