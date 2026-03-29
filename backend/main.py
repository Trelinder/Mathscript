import os
import io
import re
import json
import ast
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

        if needed_secrets:
            vault_url = "https://mathscriptkey.vault.azure.net/"
            credential = DefaultAzureCredential()
            client = SecretClient(vault_url=vault_url, credential=credential)
            for env_name, secret_name in needed_secrets:
                os.environ[env_name] = client.get_secret(secret_name).value
    except Exception as exc:
        # Azure Key Vault is optional in local/non-Azure environments.
        logger.warning(
            f"Azure Key Vault bootstrap skipped - using environment variables if set "
            f"({type(exc).__name__}: {exc})"
        )

from fastapi import FastAPI, HTTPException, UploadFile, File, Request
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

SESSION_SECRET = os.environ.get("SESSION_SECRET", "fallback-dev-secret-change-me")

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

from backend.database import init_db, get_or_create_user, update_user_stripe, get_daily_usage, increment_usage, can_solve_problem, is_premium, FREE_DAILY_LIMIT
from backend.healthcheck import start_health_check_scheduler, run_health_checks, get_last_report

try:
    init_db()
    logger.warning("Database init complete")
except Exception as e:
    logger.warning(f"Database init warning: {e}")

start_health_check_scheduler()

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
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
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
            "script-src 'self' 'unsafe-inline' https://js.stripe.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob: data:; "
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
    if not sys.stdin.isatty():
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

_prompt_for_missing_key("OPENAI_API_KEY", "Azure OpenAI API key (used for math solving, story generation, analogies, verification, and image generation)")
# GOOGLE_API_KEY is no longer required — all AI features now run on Azure OpenAI


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
AZURE_IMAGE_MODEL = os.environ.get("AZURE_IMAGE_MODEL", "dall-e-3")          # Image generation (DALL-E 3 via Azure OpenAI)

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
    return data

def get_session(sid: str):
    if sid not in sessions:
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
    return _public_session_payload(s)

@app.post("/api/session/profile")
def update_session_profile(req: SessionProfileRequest):
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
    _ensure_session_defaults(s)
    return _public_session_payload(s)

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


def _fallback_mini_games(math_problem, solved, hero_name, age_group):
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
        return [_sanitize_mini_game(mg, age_group) for mg in raw]
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
    return [_sanitize_mini_game(mg, age_group) for mg in raw]


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


def generate_mini_games(math_problem, math_steps, hero_name, age_group="8-10"):
    cfg = AGE_GROUP_SETTINGS.get(age_group, AGE_GROUP_SETTINGS["8-10"])
    # Fast path for common arithmetic inputs to keep story response quick.
    solved = try_solve_basic_math(math_problem)
    if solved:
        return _fallback_mini_games(math_problem, solved, hero_name, age_group)
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
            return _fallback_mini_games(math_problem, solved, hero_name, age_group)
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

    return _fallback_mini_games(math_problem, try_solve_basic_math(math_problem), hero_name, age_group)

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
            mini_games = _fallback_mini_games(safe_problem, quick_math, req.hero, age_group)
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
                mini_games = _fallback_mini_games(safe_problem, None, req.hero, age_group)
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
                    mini_games = _fallback_mini_games(safe_problem, try_solve_basic_math(safe_problem), req.hero, age_group)
                else:
                    story_text = story_content

                    segments = [s.strip() for s in story_text.split('---SEGMENT---') if s.strip()]
                    if len(segments) < 2:
                        segments = [s.strip() for s in story_text.split('\n\n') if s.strip()]
                    if len(segments) > 6:
                        segments = segments[:6]
                    if len(segments) == 0:
                        segments = [story_text]

                    # Run mini_games and teaching_analogy concurrently to reduce latency
                    problem_skill_for_analogy = _detect_math_skill(safe_problem)
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                        mini_games_future = pool.submit(generate_mini_games, req.problem, math_steps, req.hero, age_group)
                        analogy_future = pool.submit(generate_teaching_analogy, problem_skill_for_analogy, safe_problem)
                        mini_games = mini_games_future.result()
                        _teaching_analogy = analogy_future.result()

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
    return {
        "ideology_meter": new_val,
        "ideology_label": _ideology_label(new_val),
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
    return {
        "hint_count": session["hint_count"],
        "perseverance_score": session["perseverance_score"],
        "badges": session.get("badges", []),
        "badge_details": _get_badge_details(session.get("badges", [])),
        "message": "💡 Great thinking — using hints shows real learning power!" if req.eventually_correct
                   else "💡 Hint used — keep going, you've got this!",
    }

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


def _generate_dalle_image(prompt: str) -> dict:
    """Generate an image using DALL-E 3 via Azure OpenAI.

    Returns {"image": base64_str, "mime": "image/png"} on success,
    or {"image": None, "mime": None} on failure.
    Raises HTTPException(429) if the cloud budget is exceeded.
    """
    try:
        response = get_openai_client().images.generate(
            model=AZURE_IMAGE_MODEL,
            prompt=prompt,
            response_format="b64_json",
            size="1024x1024",
            quality="standard",
            n=1,
        )
        if response.data and response.data[0].b64_json:
            return {"image": response.data[0].b64_json, "mime": "image/png"}
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"[IMG] DALL-E generation error: {e}")
        if "content_policy_violation" in str(e).lower():
            logger.warning("[IMG] DALL-E content policy violation — prompt was rejected")
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
                f"A colorful cartoon illustration for a children's storybook. "
                f"{hero['look']} {mood}. "
                f"Context: {req.segment_text[:100]}. "
                f"Style: bright, kid-friendly, game art, no text or words in the image."
            )
            result = _generate_dalle_image(image_prompt)
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
            f"A colorful cartoon illustration for a children's storybook. "
            f"{hero['look']} {mood}. "
            f"Context: {seg_text[:100]}. "
            f"Style: bright, kid-friendly, game art, no text or words in the image."
        )
        for attempt in range(3):
            try:
                logger.warning(f"[IMG] Generating image for segment {seg_idx} (attempt {attempt+1})...")
                result = _generate_dalle_image(image_prompt)
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
    "pqHfZKP75CvOlQylNhV4",  # Aria - expressive, warm female
    "21m00Tcm4TlvDq8ikWAM",  # Rachel - calm, gentle female
    "nPczCjzI2devNBz1zQrb",  # Bill - trustworthy, warm male
    "N2lVS1w4EtoT3dr4eOWO",  # Brian - deep, warm male
    "XB0fDUnXU5powFXDhCwa",  # Charlie - natural, friendly male
    "iP95p4xoKVk53GoZ742B",  # Charlotte - sweet, young female
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
                "model_id": "eleven_multilingual_v2",
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
            image_prompt = f"A colorful cartoon illustration of {hero['look']}, teaching a math lesson about {req.problem}. The character is equipped with {gear}. The scene is fun, kid-friendly, vibrant colors, game art style. No text or words in the image."
            result = _generate_dalle_image(image_prompt)
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
    return {"equipped": session["equipped"]}

@app.post("/api/shop/unequip")
def unequip_item(req: EquipRequest):
    validate_session_id(req.session_id)
    session = get_session(req.session_id)
    if req.item_id in session["equipped"]:
        session["equipped"].remove(req.item_id)
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
    return {
        "success": True,
        "privacy_settings": session["privacy_settings"],
    }

class EarlyAccessRequest(BaseModel):
    email: str

    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        import re as _re
        v = v.strip().lower()
        if not v or len(v) > 254:
            raise ValueError('Invalid email')
        if not _re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', v):
            raise ValueError('Invalid email format')
        return v


def _generate_promo_code() -> str:
    import random, string
    chars = string.ascii_uppercase + string.digits
    suffix = ''.join(random.choices(chars, k=6))
    return f"EARLY{suffix}"


@app.post("/api/early-access")
def early_access_claim(req: EarlyAccessRequest):
    from backend.database import get_db_connection
    from backend.resend_client import send_promo_email

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM leads")
        total = cur.fetchone()[0]

        cur.execute("SELECT id FROM leads WHERE email = %s", (req.email,))
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
            (req.email, code)
        )
        conn.commit()

        email_ok = send_promo_email(req.email, code)

        if email_ok:
            cur.execute("UPDATE leads SET email_sent = true WHERE email = %s", (req.email,))
            conn.commit()

        cur.close()
        conn.close()

        logger.info(f"[EARLY_ACCESS] Lead captured: {req.email}, code={code}, email_sent={email_ok}")
        return {"success": True, "message": "Check your email for your free promo code!"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[EARLY_ACCESS] Error: {e}")
        raise HTTPException(status_code=500, detail="Something went wrong. Please try again.")


@app.get("/api/early-access/stats")
def early_access_stats(request: Request):
    admin_key = os.environ.get("ADMIN_API_KEY", "")
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


_contact_rate_limit: dict = {}

class TelemetryRequest(BaseModel):
    event_type: Optional[str] = None
    session_id: Optional[str] = None
    page: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: Optional[int] = None
    payload: Optional[dict] = None

@app.post("/api/client-telemetry")
def client_telemetry(req: TelemetryRequest, request: Request):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    if not check_rate_limit(f"telemetry:{ip}", max_requests=60, window=60):
        raise HTTPException(status_code=429, detail="Too many requests.")
    event = (req.event_type or "")[:64]
    if event in ("web_vital", "client_error", "unhandled_rejection"):
        payload = req.payload or {}
        safe_payload = {k: str(v)[:200] for k, v in list(payload.items())[:10]}
        logger.info(f"[TELEMETRY] {event} {safe_payload}")
    return {"ok": True}


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
    admin_key = os.environ.get("ADMIN_API_KEY", "")
    provided_key = request.headers.get("x-admin-key", request.query_params.get("key", ""))
    if not admin_key or not hmac.compare_digest(admin_key, provided_key):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {"emails": _inbound_emails}


@app.get("/api/admin/subscribers")
def admin_check_subscribers(request: Request):
    admin_key = os.environ.get("ADMIN_API_KEY", "")
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


@app.get("/api/health")
async def health_check():
    report = get_last_report()
    if report is None:
        report = await run_in_threadpool(run_health_checks)
    if _is_production():
        return {
            "status": "ok" if report.get("failed_count", 0) == 0 else "degraded",
            "total": report.get("total"),
            "passed": report.get("passed"),
            "failed_count": report.get("failed_count"),
        }
    return report

@app.post("/api/health/run")
async def run_health_check_now(request: Request):
    if _is_production():
        raise HTTPException(status_code=403, detail="Not available in production")
    report = await run_in_threadpool(run_health_checks)
    return report

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
