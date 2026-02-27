import os
import json
import time
import logging
import threading
import datetime
import traceback
import requests

logger = logging.getLogger("healthcheck")
logger.setLevel(logging.INFO)

BASE_URL = "http://127.0.0.1:5000"
CHECK_INTERVAL = 1200
TEST_SESSION_ID = "sess_healthcheck987654"
REQUIRED_HEROES = {
    "Arcanos", "Blaze", "Shadow", "Luna", "Titan",
    "Webweaver", "Volt", "Tempest", "Zenith",
}

class HealthCheckResult:
    def __init__(self):
        self.checks = []
        self.started = datetime.datetime.now()
        self.finished = None

    def add(self, name, passed, detail=""):
        self.checks.append({
            "name": name,
            "passed": passed,
            "detail": detail,
            "time": datetime.datetime.now().isoformat()
        })

    def finish(self):
        self.finished = datetime.datetime.now()
        total = len(self.checks)
        passed = sum(1 for c in self.checks if c["passed"])
        failed = [c for c in self.checks if not c["passed"]]
        return {
            "total": total,
            "passed": passed,
            "failed_count": len(failed),
            "failures": failed,
            "started": self.started.isoformat(),
            "finished": self.finished.isoformat(),
            "duration_s": round((self.finished - self.started).total_seconds(), 2),
        }


_last_report = None
_report_lock = threading.Lock()


def run_health_checks():
    global _last_report
    result = HealthCheckResult()

    try:
        r = requests.get(f"{BASE_URL}/api/characters", timeout=10)
        data = r.json()
        if r.status_code == 200 and isinstance(data, dict):
            missing = sorted(REQUIRED_HEROES - set(data.keys()))
            if not missing:
                result.add("Characters endpoint", True, f"{len(data)} heroes loaded")
            else:
                result.add("Characters endpoint", False, f"Missing heroes: {missing}")
        else:
            result.add("Characters endpoint", False, f"Status {r.status_code}, got {len(data) if isinstance(data, dict) else 'invalid'} heroes")
    except Exception as e:
        result.add("Characters endpoint", False, str(e))

    try:
        r = requests.get(f"{BASE_URL}/api/shop", timeout=10)
        data = r.json()
        if r.status_code == 200 and isinstance(data, list) and len(data) == 20:
            categories = set(item["category"] for item in data)
            expected_cats = {"weapons", "armor", "pets", "potions", "mounts"}
            if categories == expected_cats:
                result.add("Shop endpoint", True, f"{len(data)} items across {len(categories)} categories")
            else:
                result.add("Shop endpoint", False, f"Missing categories: {expected_cats - categories}")
        else:
            result.add("Shop endpoint", False, f"Status {r.status_code}, got {len(data) if isinstance(data, list) else 'invalid'} items (expected 20)")
    except Exception as e:
        result.add("Shop endpoint", False, str(e))

    for item in (data if 'data' in dir() and isinstance(data, list) else []):
        required = ["id", "name", "category", "price", "effect", "rarity", "description"]
        missing = [f for f in required if f not in item]
        if missing:
            result.add(f"Shop item '{item.get('name', '?')}' schema", False, f"Missing fields: {missing}")
            break
    else:
        if 'data' in dir() and isinstance(data, list) and len(data) > 0:
            result.add("Shop items schema", True, "All items have required fields")

    try:
        r = requests.get(f"{BASE_URL}/api/session/{TEST_SESSION_ID}", timeout=10)
        data = r.json()
        required_keys = ["coins", "inventory", "equipped", "potions", "history"]
        missing = [k for k in required_keys if k not in data]
        if r.status_code == 200 and not missing:
            result.add("Session endpoint", True, "Session structure valid")
        else:
            result.add("Session endpoint", False, f"Status {r.status_code}, missing keys: {missing}")
    except Exception as e:
        result.add("Session endpoint", False, str(e))

    try:
        r = requests.post(f"{BASE_URL}/api/shop/buy", json={"session_id": TEST_SESSION_ID, "item_id": "nonexistent_item"}, timeout=10)
        if r.status_code in [400, 404]:
            result.add("Shop buy validation", True, "Correctly rejects invalid items")
        else:
            result.add("Shop buy validation", False, f"Expected 400/404 for invalid item, got {r.status_code}")
    except Exception as e:
        result.add("Shop buy validation", False, str(e))

    try:
        r = requests.post(f"{BASE_URL}/api/shop/equip", json={"session_id": TEST_SESSION_ID, "item_id": "fire_sword"}, timeout=10)
        if r.status_code in [200, 400]:
            result.add("Equip endpoint", True, f"Responded with {r.status_code}")
        else:
            result.add("Equip endpoint", False, f"Unexpected status {r.status_code}")
    except Exception as e:
        result.add("Equip endpoint", False, str(e))

    try:
        r = requests.post(f"{BASE_URL}/api/shop/unequip", json={"session_id": TEST_SESSION_ID, "item_id": "fire_sword"}, timeout=10)
        if r.status_code in [200, 400]:
            result.add("Unequip endpoint", True, f"Responded with {r.status_code}")
        else:
            result.add("Unequip endpoint", False, f"Unexpected status {r.status_code}")
    except Exception as e:
        result.add("Unequip endpoint", False, str(e))

    try:
        r = requests.get(f"{BASE_URL}/api/subscription/{TEST_SESSION_ID}", timeout=10)
        data = r.json()
        if r.status_code == 200 and "is_premium" in data and ("daily_usage" in data or "usage_today" in data):
            result.add("Subscription endpoint", True, "Subscription data valid")
        else:
            result.add("Subscription endpoint", False, f"Status {r.status_code}, response: {data}")
    except Exception as e:
        result.add("Subscription endpoint", False, str(e))

    try:
        r = requests.post(f"{BASE_URL}/api/bonus-coins", json={"session_id": TEST_SESSION_ID, "coins": 0}, timeout=10)
        if r.status_code == 200:
            result.add("Bonus coins endpoint", True, "Responds correctly")
        else:
            result.add("Bonus coins endpoint", False, f"Status {r.status_code}")
    except Exception as e:
        result.add("Bonus coins endpoint", False, str(e))

    try:
        r = requests.get(f"{BASE_URL}/api/stripe/publishable-key", timeout=10)
        if r.status_code == 200:
            data = r.json()
            if data.get("publishable_key"):
                result.add("Stripe publishable key", True, "Key configured")
            else:
                result.add("Stripe publishable key", False, "No publishable key returned (Stripe may not be configured)")
        else:
            result.add("Stripe publishable key", False, f"Status {r.status_code}")
    except Exception as e:
        result.add("Stripe publishable key", False, str(e))

    try:
        r = requests.get(f"{BASE_URL}/", timeout=10)
        if r.status_code == 200 and ("<!DOCTYPE" in r.text or "<html" in r.text.lower()):
            result.add("Frontend serving", True, "HTML page served")
        else:
            result.add("Frontend serving", False, f"Status {r.status_code}, not HTML")
    except Exception as e:
        result.add("Frontend serving", False, str(e))

    try:
        from backend.database import get_daily_usage
        usage = get_daily_usage(TEST_SESSION_ID)
        if isinstance(usage, int):
            result.add("Database connection", True, f"Daily usage query returned {usage}")
        else:
            result.add("Database connection", False, f"Unexpected return type: {type(usage)}")
    except Exception as e:
        result.add("Database connection", False, str(e))

    try:
        from google import genai as g_check
        api_key = os.environ.get("AI_INTEGRATIONS_GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if api_key:
            result.add("Gemini API key", True, "API key configured")
        else:
            result.add("Gemini API key", False, "No Gemini API key found in environment")
    except Exception as e:
        result.add("Gemini API key", False, str(e))

    try:
        openai_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
        if openai_key:
            result.add("OpenAI API key", True, "API key configured")
        else:
            result.add("OpenAI API key", False, "No OpenAI API key found in environment")
    except Exception as e:
        result.add("OpenAI API key", False, str(e))

    try:
        elevenlabs_key = os.environ.get("ELEVENLABS_API_KEY")
        if elevenlabs_key:
            result.add("ElevenLabs API key", True, "API key configured")
        else:
            result.add("ElevenLabs API key", False, "No ElevenLabs API key found (voice narration will not work)")
    except Exception as e:
        result.add("ElevenLabs API key", False, str(e))

    try:
        r = requests.get(f"{BASE_URL}/api/stripe/prices", timeout=10)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list) and len(data) > 0:
                result.add("Stripe prices", True, f"{len(data)} price(s) available")
            else:
                result.add("Stripe prices", True, "No prices seeded yet (run seed_products to add)")
        else:
            result.add("Stripe prices", False, f"Status {r.status_code}")
    except Exception as e:
        result.add("Stripe prices", False, str(e))

    try:
        build_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
        index_path = os.path.join(build_dir, "index.html")
        assets_dir = os.path.join(build_dir, "assets")
        if os.path.exists(index_path):
            result.add("Frontend build", True, "dist/index.html exists")
        else:
            result.add("Frontend build", False, "dist/index.html missing — run 'npm run build'")
        if os.path.exists(assets_dir) and len(os.listdir(assets_dir)) > 0:
            result.add("Frontend assets", True, f"{len(os.listdir(assets_dir))} asset files")
        else:
            result.add("Frontend assets", False, "No asset files in dist/assets/")
    except Exception as e:
        result.add("Frontend build check", False, str(e))

    try:
        images_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist", "images")
        if os.path.exists(images_dir):
            hero_images = [f for f in os.listdir(images_dir) if f.startswith("hero-")]
            found = {os.path.splitext(f)[0] for f in hero_images}
            required = {f"hero-{name.lower()}" for name in REQUIRED_HEROES}
            missing = sorted(required - found)
            if not missing:
                result.add("Hero images", True, f"{len(hero_images)} hero images found")
            else:
                result.add("Hero images", False, f"Missing hero images: {missing}")
        else:
            images_dir2 = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "images")
            if os.path.exists(images_dir2):
                hero_images = [f for f in os.listdir(images_dir2) if f.startswith("hero-")]
                found = {os.path.splitext(f)[0] for f in hero_images}
                required = {f"hero-{name.lower()}" for name in REQUIRED_HEROES}
                missing = sorted(required - found)
                result.add(
                    "Hero images",
                    True if not missing else False,
                    f"{len(hero_images)} hero images in public/images" if not missing else f"Missing hero images: {missing}",
                )
            else:
                result.add("Hero images", False, "No images directory found")
    except Exception as e:
        result.add("Hero images check", False, str(e))

    report = result.finish()

    with _report_lock:
        _last_report = report

    if report["failed_count"] > 0:
        logger.warning(f"HEALTH CHECK: {report['failed_count']} FAILED out of {report['total']} checks in {report['duration_s']}s")
        for f in report["failures"]:
            logger.warning(f"  FAIL: {f['name']} — {f['detail']}")
    else:
        logger.info(f"HEALTH CHECK: All {report['total']} checks passed in {report['duration_s']}s")

    return report


def get_last_report():
    with _report_lock:
        return _last_report


def _health_check_loop():
    time.sleep(10)
    while True:
        try:
            run_health_checks()
        except Exception as e:
            logger.error(f"Health check loop error: {e}\n{traceback.format_exc()}")
        time.sleep(CHECK_INTERVAL)


_thread_started = False

def start_health_check_scheduler():
    global _thread_started
    if _thread_started:
        return
    _thread_started = True
    t = threading.Thread(target=_health_check_loop, daemon=True)
    t.start()
    logger.info(f"Health check scheduler started (every {CHECK_INTERVAL}s / {CHECK_INTERVAL // 60} minutes)")
