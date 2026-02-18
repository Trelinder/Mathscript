import os
import psycopg2
import logging
import secrets
import string
from datetime import datetime, date, timedelta

logger = logging.getLogger(__name__)

def get_db_connection():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_users (
            session_id TEXT PRIMARY KEY,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            subscription_status TEXT DEFAULT 'free',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usage_tracking (
            id SERIAL PRIMARY KEY,
            session_id TEXT NOT NULL,
            usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
            problem_count INTEGER DEFAULT 0,
            UNIQUE(session_id, usage_date)
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS promo_codes (
            id SERIAL PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            duration_type TEXT NOT NULL,
            duration_days INTEGER,
            created_at TIMESTAMP DEFAULT NOW(),
            redeemed BOOLEAN DEFAULT FALSE,
            redeemed_by TEXT,
            redeemed_at TIMESTAMP,
            expires_at TIMESTAMP
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    logger.info("Database tables initialized")

def get_or_create_user(session_id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT session_id, stripe_customer_id, stripe_subscription_id, subscription_status FROM app_users WHERE session_id = %s", (session_id,))
    row = cur.fetchone()
    if not row:
        cur.execute("INSERT INTO app_users (session_id) VALUES (%s) RETURNING session_id, stripe_customer_id, stripe_subscription_id, subscription_status", (session_id,))
        row = cur.fetchone()
        conn.commit()
    cur.close()
    conn.close()
    return {
        "session_id": row[0],
        "stripe_customer_id": row[1],
        "stripe_subscription_id": row[2],
        "subscription_status": row[3],
    }

def update_user_stripe(session_id, customer_id=None, subscription_id=None, status=None):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE app_users SET "
        "stripe_customer_id = COALESCE(%s, stripe_customer_id), "
        "stripe_subscription_id = COALESCE(%s, stripe_subscription_id), "
        "subscription_status = COALESCE(%s, subscription_status), "
        "updated_at = NOW() "
        "WHERE session_id = %s",
        (customer_id, subscription_id, status, session_id)
    )
    conn.commit()
    cur.close()
    conn.close()

def get_daily_usage(session_id):
    conn = get_db_connection()
    cur = conn.cursor()
    today = date.today()
    cur.execute("SELECT problem_count FROM usage_tracking WHERE session_id = %s AND usage_date = %s", (session_id, today))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else 0

def increment_usage(session_id):
    conn = get_db_connection()
    cur = conn.cursor()
    today = date.today()
    cur.execute("""
        INSERT INTO usage_tracking (session_id, usage_date, problem_count)
        VALUES (%s, %s, 1)
        ON CONFLICT (session_id, usage_date)
        DO UPDATE SET problem_count = usage_tracking.problem_count + 1
        RETURNING problem_count
    """, (session_id, today))
    count = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return count

def _generate_promo_code():
    chars = string.ascii_uppercase + string.digits
    part1 = ''.join(secrets.choice(chars) for _ in range(4))
    part2 = ''.join(secrets.choice(chars) for _ in range(4))
    part3 = ''.join(secrets.choice(chars) for _ in range(4))
    return f"MATH-{part1}-{part2}-{part3}"

PROMO_DURATIONS = {
    "30_day": 30,
    "90_day": 90,
    "lifetime": None,
}

def create_promo_codes(duration_type, count=1):
    if duration_type not in PROMO_DURATIONS:
        raise ValueError(f"Invalid duration type: {duration_type}. Use: {list(PROMO_DURATIONS.keys())}")
    duration_days = PROMO_DURATIONS[duration_type]
    conn = get_db_connection()
    cur = conn.cursor()
    codes = []
    for _ in range(count):
        code = _generate_promo_code()
        cur.execute(
            "INSERT INTO promo_codes (code, duration_type, duration_days) VALUES (%s, %s, %s) RETURNING code",
            (code, duration_type, duration_days)
        )
        codes.append(cur.fetchone()[0])
    conn.commit()
    cur.close()
    conn.close()
    logger.info(f"Created {count} promo codes ({duration_type}): {codes}")
    return codes

def redeem_promo_code(code, session_id):
    code = code.strip().upper()
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, duration_type, duration_days, redeemed FROM promo_codes WHERE code = %s", (code,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return {"success": False, "error": "Invalid promo code"}
    promo_id, duration_type, duration_days, redeemed = row
    if redeemed:
        cur.close()
        conn.close()
        return {"success": False, "error": "This code has already been used"}
    now = datetime.now()
    expires_at = None
    if duration_days is not None:
        expires_at = now + timedelta(days=duration_days)
    cur.execute(
        "UPDATE promo_codes SET redeemed = TRUE, redeemed_by = %s, redeemed_at = %s, expires_at = %s WHERE id = %s",
        (session_id, now, expires_at, promo_id)
    )
    conn.commit()
    cur.close()
    conn.close()
    label = "Lifetime" if duration_type == "lifetime" else f"{duration_days} days"
    logger.info(f"Promo code {code} redeemed by {session_id} ({label})")
    return {"success": True, "duration_type": duration_type, "duration_days": duration_days, "expires_at": expires_at.isoformat() if expires_at else None}

def has_active_promo(session_id):
    conn = get_db_connection()
    cur = conn.cursor()
    now = datetime.now()
    cur.execute(
        "SELECT id, duration_type, expires_at FROM promo_codes WHERE redeemed_by = %s AND redeemed = TRUE ORDER BY redeemed_at DESC",
        (session_id,)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    for row in rows:
        _, duration_type, expires_at = row
        if duration_type == "lifetime":
            return True
        if expires_at and expires_at > now:
            return True
    return False

def get_promo_status(session_id):
    conn = get_db_connection()
    cur = conn.cursor()
    now = datetime.now()
    cur.execute(
        "SELECT code, duration_type, duration_days, expires_at FROM promo_codes WHERE redeemed_by = %s AND redeemed = TRUE ORDER BY redeemed_at DESC LIMIT 1",
        (session_id,)
    )
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        return None
    code, duration_type, duration_days, expires_at = row
    if duration_type == "lifetime":
        return {"active": True, "type": "lifetime", "label": "Lifetime Premium"}
    if expires_at and expires_at > now:
        days_left = (expires_at - now).days
        return {"active": True, "type": duration_type, "days_left": days_left, "label": f"Premium ({days_left} days left)"}
    return {"active": False, "type": duration_type, "label": "Expired"}

def list_promo_codes():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT code, duration_type, duration_days, redeemed, redeemed_by, redeemed_at, expires_at, created_at FROM promo_codes ORDER BY created_at DESC")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [
        {
            "code": r[0], "duration_type": r[1], "duration_days": r[2],
            "redeemed": r[3], "redeemed_by": r[4],
            "redeemed_at": r[5].isoformat() if r[5] else None,
            "expires_at": r[6].isoformat() if r[6] else None,
            "created_at": r[7].isoformat() if r[7] else None,
        }
        for r in rows
    ]

def is_premium(session_id):
    user = get_or_create_user(session_id)
    if user["subscription_status"] in ("active", "trialing"):
        return True
    return has_active_promo(session_id)

FREE_DAILY_LIMIT = 3

def can_solve_problem(session_id):
    if is_premium(session_id):
        return True, -1
    usage = get_daily_usage(session_id)
    remaining = max(0, FREE_DAILY_LIMIT - usage)
    return remaining > 0, remaining
