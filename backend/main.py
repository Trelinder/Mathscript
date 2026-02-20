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
import hmac
import hashlib
import requests as http_requests
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, JSONResponse
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

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

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

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

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

_HONEYPOT_PATHS = {
    "/admin", "/admin/", "/admin/login", "/administrator",
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
    if "admin" in path or "login" in path or "console" in path:
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
        if path in _HONEYPOT_PATHS or request.url.path in _HONEYPOT_PATHS:
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
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
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
            f"In {realm}, {player_name} calls for Zenith as a star gate opens with the challenge: {problem}. Cosmic glyphs spin into a battle map in the sky.",
            f"Zenith channels {pronoun_his} starlight and aligns each number like constellations. {pronoun_he} guides the first move with precise celestial timing.",
            f"A gravity surge makes the puzzle tricky, but Zenith stabilizes the field and checks every step. The final pattern locks with a bright solar flare.",
            f"Victory! Zenith lifts {pronoun_his} star lance and reveals the answer: {answer}. {player_name} gains a cosmic rank and celebrates.",
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
            f"In {realm}, {player_name} summons Zenith to solve {problem}. A dense cosmic storm blocks the full strategy feed.",
            f"Zenith starts charging {pronoun_his} star core while the advanced solve scroll loads. {pronoun_he} marks the key values to keep the mission safe.",
            f"Quick mode activates so the adventure keeps moving without delay. Zenith holds the boss in a gravity lock while preparing the full breakdown.",
            f"Quick victory secured! Continue the quest, then retry this challenge to unlock Zenith's full AI cosmic explanation.",
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
        opts = {'api_version': '', 'base_url': gemini_base} if gemini_base else {'api_version': ''}
        _gemini_client = genai.Client(http_options=opts)
    return _gemini_client

AI_MATH_TIMEOUT_SECONDS = int(os.environ.get("AI_MATH_TIMEOUT_SECONDS", "14"))
AI_STORY_TIMEOUT_SECONDS = int(os.environ.get("AI_STORY_TIMEOUT_SECONDS", "16"))
AI_MINIGAME_TIMEOUT_SECONDS = int(os.environ.get("AI_MINIGAME_TIMEOUT_SECONDS", "10"))

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
        "story": "uses celestial light, gravity pulses, and precision cosmic strikes",
        "look": "a futuristic cosmic guardian in navy and silver armor with a radiant star core on the chest, glowing cyan visor, and orbiting light shards around both hands",
        "emoji": "🌟",
        "color": "#14B8A6",
        "particles": ["🌟", "✨", "💫", "⚡", "🌀"],
        "action": "channeling starlight"
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
}

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

    if quests_completed >= 1:
        badges.add("first_quest")
    if quests_completed >= 5:
        badges.add("quests_5")
    if quests_completed >= 15:
        badges.add("quests_15")
    if streak >= 3:
        badges.add("streak_3")
    if streak >= 7:
        badges.add("streak_7")
    if len(session.get("inventory", [])) >= 5:
        badges.add("collector")

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
    session["player_name"] = normalize_player_name(session.get("player_name"))
    session["age_group"] = normalize_age_group(session.get("age_group"))
    session["selected_realm"] = normalize_realm(session.get("selected_realm"))
    _update_streak(session)
    _update_badges(session)

def _public_session_payload(session: dict):
    data = {k: v for k, v in session.items() if not k.startswith("_")}
    data["badge_details"] = _get_badge_details(data.get("badges"))
    data["progression"] = _build_progression(session)
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
    force_full_ai: bool = False

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
            model="gpt-4o-mini",
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

        domain = os.environ.get("REPLIT_DOMAINS", "").split(",")[0]
        base_url = f"https://{domain}" if domain else "http://localhost:5000"

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

        domain = os.environ.get("REPLIT_DOMAINS", "").split(",")[0]
        base_url = f"https://{domain}" if domain else "http://localhost:5000"

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

def _fallback_mini_games(hero_name, age_group):
    cfg = AGE_GROUP_SETTINGS.get(age_group, AGE_GROUP_SETTINGS["8-10"])
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
                "question": "What is 14 x 6?",
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
                "question": "What is 7 x 8?",
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
                "question": "What is 9 x 6?",
                "correct_answer": "54",
                "choices": ["52", "54", "56", "58"],
                "time_limit": 12,
                "reward_coins": 18,
                "hero_action": "found the right path!",
                "fail_message": "Wrong path! But don't give up!",
            },
        ]
    return [_sanitize_mini_game(mg, age_group) for mg in raw]

def generate_mini_games(math_problem, math_steps, hero_name, age_group="8-10"):
    cfg = AGE_GROUP_SETTINGS.get(age_group, AGE_GROUP_SETTINGS["8-10"])
    # Fast path for common arithmetic inputs to keep story response quick.
    if try_solve_basic_math(math_problem):
        return _fallback_mini_games(hero_name, age_group)
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
            lambda: get_gemini_client().models.generate_content(model="gemini-2.5-flash", contents=prompt),
            AI_MINIGAME_TIMEOUT_SECONDS,
        )
        if timed_out or response is None:
            logger.warning("[MINIGAME] Generation timed out; using fallback mini-games")
            return _fallback_mini_games(hero_name, age_group)
        text = (response.text or "").strip()
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

    return _fallback_mini_games(hero_name, age_group)

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
    _ensure_session_defaults(session)

    age_group = normalize_age_group(session.get("age_group"))
    age_cfg = AGE_GROUP_SETTINGS[age_group]
    player_name = normalize_player_name(session.get("player_name"))
    selected_realm = normalize_realm(session.get("selected_realm"))
    gear = ", ".join(session["inventory"]) if session["inventory"] else "bare hands"

    try:
        char_pronouns = hero.get('pronouns', 'he/him')
        pronoun_he = char_pronouns.split('/')[0].capitalize()
        pronoun_his = char_pronouns.split('/')[1] if '/' in char_pronouns else 'his'

        safe_problem = sanitize_input(req.problem)
        solve_mode = "full_ai"
        quick_mode_reason = None
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
            mini_games = _fallback_mini_games(req.hero, age_group)
        else:
            math_response = None
            math_timed_out = False
            try:
                math_response, math_timed_out = run_with_timeout(
                    lambda: get_openai_client().chat.completions.create(
                        model="o4-mini",
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
                    AI_MATH_TIMEOUT_SECONDS + 2,
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
                mini_games = _fallback_mini_games(req.hero, age_group)
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

                prompt = (
                    f"You are a fun kids' storyteller. Explain the math concept '{safe_problem}' as a short adventure story "
                    f"starring {req.hero} who {hero['story']}. The hero is equipped with {gear}. "
                    f"The adventure happens in {selected_realm}. The child player is named {player_name}.\n\n"
                    f"Target age group is {age_group} ({age_cfg['label']}). "
                    f"Story style must be: {age_cfg['story_style']}.\n\n"
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
                        lambda: get_gemini_client().models.generate_content(model="gemini-2.5-flash", contents=prompt),
                        AI_STORY_TIMEOUT_SECONDS,
                    )
                except Exception as e:
                    logger.warning(f"[STORY] AI storyteller unavailable, using fallback story: {sanitize_error(e)}")
                if story_timed_out or response is None or not getattr(response, "text", None):
                    solve_mode = "quick_fallback"
                    quick_mode_reason = "ai_story_timeout" if story_timed_out else "ai_story_unavailable"
                    answer_for_story = answer_line or extract_answer_from_math_steps(math_steps) or "the final answer"
                    segments = build_fast_story_segments(
                        req.hero, pronoun_he, pronoun_his, safe_problem, answer_for_story, selected_realm, player_name
                    )
                    story_text = "---SEGMENT---".join(segments)
                    mini_games = _fallback_mini_games(req.hero, age_group)
                else:
                    story_text = response.text

                    segments = [s.strip() for s in story_text.split('---SEGMENT---') if s.strip()]
                    if len(segments) < 2:
                        segments = [s.strip() for s in story_text.split('\n\n') if s.strip()]
                    if len(segments) > 6:
                        segments = segments[:6]
                    if len(segments) == 0:
                        segments = [story_text]

                    mini_games = generate_mini_games(req.problem, math_steps, req.hero, age_group)

        increment_usage(req.session_id)

        session["coins"] += 50
        session["quests_completed"] = int(session.get("quests_completed", 0)) + 1
        session["history"].append({
            "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "concept": req.problem,
            "hero": req.hero
        })
        _update_streak(session)
        _update_badges(session)

        current_usage = get_daily_usage(req.session_id)
        premium = is_premium(req.session_id)

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
        }
    except Exception as e:
        if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
            raise HTTPException(status_code=429, detail="Cloud budget exceeded")
        raise HTTPException(status_code=500, detail="Story generation failed. Please try again.")

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
                f"Generate ONLY an image, no text. A colorful cartoon illustration for a children's storybook. "
                f"{hero['look']} {mood}. "
                f"Context: {req.segment_text[:100]}. "
                f"Style: bright, kid-friendly, game art, no text or words in the image."
            )
            response = get_gemini_client().models.generate_content(
                model='gemini-2.5-flash-image',
                contents=image_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["Image"],
                ),
            )
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if part.inline_data:
                        image_b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                        mime = part.inline_data.mime_type or 'image/png'
                        return {"image": image_b64, "mime": mime}
        except Exception as e:
            logger.warning(f"[IMG] Segment image error: {e}")
            if "FREE_CLOUD_BUDGET_EXCEEDED" in str(e):
                raise HTTPException(status_code=429, detail="Cloud budget exceeded")
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
    import concurrent.futures

    def _gen_one(seg_text, seg_idx):
        import time as _time
        mood = scene_moods[min(seg_idx, len(scene_moods) - 1)]
        image_prompt = (
            f"Generate ONLY an image, no text. A colorful cartoon illustration for a children's storybook. "
            f"{hero['look']} {mood}. "
            f"Context: {seg_text[:100]}. "
            f"Style: bright, kid-friendly, game art, no text or words in the image."
        )
        for attempt in range(3):
            try:
                logger.warning(f"[IMG] Generating image for segment {seg_idx} (attempt {attempt+1})...")
                response = get_gemini_client().models.generate_content(
                    model='gemini-2.5-flash-image',
                    contents=image_prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["Image"],
                    ),
                )
                if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                    for part in response.candidates[0].content.parts:
                        if part.inline_data:
                            image_b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                            mime = part.inline_data.mime_type or 'image/png'
                            logger.warning(f"[IMG] Segment {seg_idx} image generated OK")
                            return {"image": image_b64, "mime": mime}
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
            image_prompt = f"Generate ONLY an image, no text. A colorful cartoon illustration of {hero['look']}, teaching a math lesson about {req.problem}. The character is also equipped with {gear}. The scene is fun, kid-friendly, vibrant colors, game art style. No text or words in the image."
            response = get_gemini_client().models.generate_content(
                model='gemini-2.5-flash-image',
                contents=image_prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["Image"],
                ),
            )
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if part.inline_data:
                        image_b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                        mime = part.inline_data.mime_type or 'image/png'
                        return {"image": image_b64, "mime": mime}
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


@app.get("/api/health")
async def health_check():
    report = get_last_report()
    if report is None:
        report = await run_in_threadpool(run_health_checks)
    if os.environ.get("REPLIT_DEPLOYMENT") == "1":
        return {
            "status": "ok" if report.get("failed_count", 0) == 0 else "degraded",
            "total": report.get("total"),
            "passed": report.get("passed"),
            "failed_count": report.get("failed_count"),
        }
    return report

@app.post("/api/health/run")
async def run_health_check_now(request: Request):
    if os.environ.get("REPLIT_DEPLOYMENT") == "1":
        raise HTTPException(status_code=403, detail="Not available in production")
    report = await run_in_threadpool(run_health_checks)
    return report

build_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(build_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(build_dir, "assets")), name="assets")
    images_dir = os.path.join(build_dir, "images")
    if os.path.exists(images_dir):
        app.mount("/images", StaticFiles(directory=images_dir), name="images")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.realpath(os.path.join(build_dir, full_path))
        real_build = os.path.realpath(build_dir)
        if file_path.startswith(real_build) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(build_dir, "index.html"), headers={"Cache-Control": "no-cache"})
