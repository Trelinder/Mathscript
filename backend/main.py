import os
import io
import re
import json
import base64
import datetime
import wave
import random
import logging
import hmac
import hashlib
import requests as http_requests
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
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
    logger.warning("Database initialized")
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

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
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
        path = request.url.path
        if path.startswith("/assets/") or path.startswith("/images/"):
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

def sanitize_error(error: Exception) -> str:
    msg = str(error)
    for pattern, replacement in PII_PATTERNS:
        msg = pattern.sub(replacement, msg)
    return msg

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
    }
}

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

sessions: dict = {}
_MAX_SESSIONS = 10000

def get_session(sid: str):
    if sid not in sessions:
        if len(sessions) >= _MAX_SESSIONS:
            oldest_key = next(iter(sessions))
            del sessions[oldest_key]
        sessions[sid] = {"coins": 0, "inventory": [], "equipped": [], "potions": [], "history": [], "_ts": _time.time()}
    s = sessions[sid]
    s["_ts"] = _time.time()
    if "equipped" not in s:
        s["equipped"] = []
    if "potions" not in s:
        s["potions"] = []
    return s


class StoryRequest(BaseModel):
    hero: str
    problem: str
    session_id: str

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
    return {k: v for k, v in s.items() if not k.startswith("_")}

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
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT session_id FROM app_users WHERE stripe_customer_id = %s OR stripe_subscription_id = %s", (customer_id, subscription_id))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if row:
            mapped_status = status if status in ("active", "trialing", "past_due") else "free"
            if event_type == "customer.subscription.deleted":
                mapped_status = "free"
            update_user_stripe(row[0], subscription_id=subscription_id, status=mapped_status)
            logger.warning(f"Subscription {status} for session {row[0]}")

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

def generate_mini_games(math_problem, math_steps, hero_name):
    try:
        prompt = (
            f"Generate exactly 3 mini-game challenges for a kids' math learning game based on this math problem: {math_problem}\n\n"
            f"The hero is {hero_name}. The verified solution steps are:\n"
            + "\n".join(math_steps) + "\n\n"
            f"Return a JSON array with exactly 3 objects. Each object must have these fields:\n"
            f"- type: one of 'quicktime', 'timed', 'choice' (use different types for each)\n"
            f"- title: a short fun action title (e.g., 'Boss Attack!', 'Power Up!', 'Choose Your Path!')\n"
            f"- prompt: a kid-friendly question or instruction\n"
            f"- question: the math question to answer\n"
            f"- correct_answer: the correct answer as a string\n"
            f"- choices: array of 3-4 answer choices as strings (include the correct one)\n"
            f"- time_limit: seconds for timed challenges (8-15)\n"
            f"- reward_coins: 10-25 bonus coins\n"
            f"- hero_action: what the hero does on success (e.g., 'lands a fire punch!', 'powers up!')\n"
            f"- fail_message: encouraging message on wrong answer\n\n"
            f"Mini-game 1 should be 'quicktime' type.\n"
            f"Mini-game 2 should be 'timed' type.\n"
            f"Mini-game 3 should be 'choice' type.\n\n"
            f"Make questions related to the math problem but slightly different (not exact copies).\n"
            f"Return ONLY the JSON array, no markdown, no code blocks."
        )
        response = get_gemini_client().models.generate_content(model="gemini-2.5-flash", contents=prompt)
        text = response.text.strip()
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
        mini_games = json.loads(text)
        if isinstance(mini_games, list) and len(mini_games) >= 3:
            for mg in mini_games:
                if mg.get("type") == "dragdrop":
                    mg["type"] = "timed"
            return mini_games[:3]
    except Exception as e:
        logger.warning(f"Mini-game generation failed: {e}")

    return [
        {
            "type": "quicktime",
            "title": f"{hero_name} vs Math Boss!",
            "prompt": "Quick! Pick the right answer to land a hit!",
            "question": f"What is 7 x 8?",
            "correct_answer": "56",
            "choices": ["48", "56", "54", "64"],
            "time_limit": 10,
            "reward_coins": 15,
            "hero_action": "lands a powerful strike!",
            "fail_message": "Almost! Try again, hero!"
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
            "fail_message": "Keep trying! You're getting stronger!"
        },
        {
            "type": "choice",
            "title": "Choose Your Path!",
            "prompt": "The path splits! Only the right answer leads forward!",
            "question": "What is 9 x 6?",
            "correct_answer": "54",
            "choices": ["52", "54", "56"],
            "time_limit": 15,
            "reward_coins": 15,
            "hero_action": "found the right path!",
            "fail_message": "Wrong path! But don't give up!"
        }
    ]

@app.post("/api/story")
def generate_story(req: StoryRequest):
    validate_session_id(req.session_id)
    if not check_rate_limit(f"story:{req.session_id}", max_requests=8, window=60):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment.")
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")

    allowed, remaining = can_solve_problem(req.session_id)
    if not allowed:
        raise HTTPException(status_code=403, detail=f"Daily limit reached! Free accounts get {FREE_DAILY_LIMIT} problems per day. Upgrade to Premium for unlimited access!")

    session = get_session(req.session_id)
    gear = ", ".join(session["inventory"]) if session["inventory"] else "bare hands"

    try:
        char_pronouns = hero.get('pronouns', 'he/him')
        pronoun_he = char_pronouns.split('/')[0].capitalize()
        pronoun_his = char_pronouns.split('/')[1] if '/' in char_pronouns else 'his'

        safe_problem = sanitize_input(req.problem)

        math_response = get_openai_client().chat.completions.create(
            model="o4-mini",
            messages=[
                {"role": "user", "content": (
                    f"Solve this math problem step by step for a child learning math: {safe_problem}\n\n"
                    f"Format your response EXACTLY like this:\n"
                    f"STEP 1: (first step, simple and clear)\n"
                    f"STEP 2: (next step)\n"
                    f"STEP 3: (next step if needed)\n"
                    f"STEP 4: (next step if needed)\n"
                    f"ANSWER: (the final answer)\n\n"
                    f"Use 2-4 steps. Each step should be one short sentence a child can follow. "
                    f"Use simple math notation. Show the work clearly."
                )}
            ],
        )
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
            f"starring {req.hero} who {hero['story']}. The hero is equipped with {gear}.\n\n"
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
        response = get_gemini_client().models.generate_content(model="gemini-2.5-flash", contents=prompt)
        story_text = response.text

        segments = [s.strip() for s in story_text.split('---SEGMENT---') if s.strip()]
        if len(segments) < 2:
            segments = [s.strip() for s in story_text.split('\n\n') if s.strip()]
        if len(segments) > 6:
            segments = segments[:6]
        if len(segments) == 0:
            segments = [story_text]

        mini_games = generate_mini_games(req.problem, math_steps, req.hero)

        increment_usage(req.session_id)

        session["coins"] += 50
        session["history"].append({
            "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "concept": req.problem,
            "hero": req.hero
        })

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

@app.post("/api/segment-image")
async def generate_segment_image(req: SegmentImageRequest):
    validate_session_id(req.session_id)
    if not check_rate_limit(f"img:{req.session_id}", max_requests=12, window=60):
        raise HTTPException(status_code=429, detail="Too many image requests. Please wait.")
    hero = CHARACTERS.get(req.hero)
    if not hero:
        raise HTTPException(status_code=400, detail="Unknown hero")

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
async def generate_tts(req: TTSRequest):
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
        report = run_health_checks()
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
    report = run_health_checks()
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
