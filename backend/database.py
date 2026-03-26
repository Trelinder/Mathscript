import os
import psycopg2
import logging
from threading import Lock
from datetime import date

logger = logging.getLogger(__name__)

FREE_DAILY_LIMIT = 6

_memory_lock = Lock()
_memory_users = {}
_memory_usage = {}
_fallback_logged = False


def _database_url():
    return os.environ.get("DATABASE_URL", "").strip()


def _log_fallback_once(reason: str):
    global _fallback_logged
    if _fallback_logged:
        return
    _fallback_logged = True
    logger.warning(
        "Database unavailable (%s). Using in-memory fallback mode for usage/subscription data.",
        reason,
    )


def _memory_get_or_create_user(session_id):
    with _memory_lock:
        user = _memory_users.get(session_id)
        if not user:
            user = {
                "session_id": session_id,
                "stripe_customer_id": None,
                "stripe_subscription_id": None,
                "subscription_status": "free",
            }
            _memory_users[session_id] = user
        return dict(user)


def _memory_update_user_stripe(session_id, customer_id=None, subscription_id=None, status=None):
    with _memory_lock:
        user = _memory_users.get(session_id)
        if not user:
            user = {
                "session_id": session_id,
                "stripe_customer_id": None,
                "stripe_subscription_id": None,
                "subscription_status": "free",
            }
        if customer_id is not None:
            user["stripe_customer_id"] = customer_id
        if subscription_id is not None:
            user["stripe_subscription_id"] = subscription_id
        if status is not None:
            user["subscription_status"] = status
        _memory_users[session_id] = user


def _memory_get_daily_usage(session_id):
    key = (session_id, date.today().isoformat())
    with _memory_lock:
        return int(_memory_usage.get(key, 0))


def _memory_increment_usage(session_id):
    key = (session_id, date.today().isoformat())
    with _memory_lock:
        _memory_usage[key] = int(_memory_usage.get(key, 0)) + 1
        return _memory_usage[key]


def get_db_connection():
    db_url = _database_url()
    if not db_url:
        raise RuntimeError("DATABASE_URL is not configured")
    return psycopg2.connect(db_url)


def init_db():
    if not _database_url():
        _log_fallback_once("DATABASE_URL is missing")
        return

    conn = None
    cur = None
    try:
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
        conn.commit()
        logger.info("Database tables initialized")
    except Exception as exc:
        _log_fallback_once(str(exc))
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def get_or_create_user(session_id):
    if not _database_url():
        _log_fallback_once("DATABASE_URL is missing")
        return _memory_get_or_create_user(session_id)

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT session_id, stripe_customer_id, stripe_subscription_id, subscription_status "
            "FROM app_users WHERE session_id = %s",
            (session_id,),
        )
        row = cur.fetchone()
        if not row:
            cur.execute(
                "INSERT INTO app_users (session_id) VALUES (%s) "
                "RETURNING session_id, stripe_customer_id, stripe_subscription_id, subscription_status",
                (session_id,),
            )
            row = cur.fetchone()
            conn.commit()
        return {
            "session_id": row[0],
            "stripe_customer_id": row[1],
            "stripe_subscription_id": row[2],
            "subscription_status": row[3],
        }
    except Exception as exc:
        _log_fallback_once(str(exc))
        return _memory_get_or_create_user(session_id)
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def update_user_stripe(session_id, customer_id=None, subscription_id=None, status=None):
    if not _database_url():
        _log_fallback_once("DATABASE_URL is missing")
        _memory_update_user_stripe(session_id, customer_id, subscription_id, status)
        return

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "UPDATE app_users SET "
            "stripe_customer_id = COALESCE(%s, stripe_customer_id), "
            "stripe_subscription_id = COALESCE(%s, stripe_subscription_id), "
            "subscription_status = COALESCE(%s, subscription_status), "
            "updated_at = NOW() "
            "WHERE session_id = %s",
            (customer_id, subscription_id, status, session_id),
        )
        conn.commit()
    except Exception as exc:
        _log_fallback_once(str(exc))
        _memory_update_user_stripe(session_id, customer_id, subscription_id, status)
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def get_daily_usage(session_id):
    if not _database_url():
        _log_fallback_once("DATABASE_URL is missing")
        return _memory_get_daily_usage(session_id)

    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        today = date.today()
        cur.execute(
            "SELECT problem_count FROM usage_tracking WHERE session_id = %s AND usage_date = %s",
            (session_id, today),
        )
        row = cur.fetchone()
        return row[0] if row else 0
    except Exception as exc:
        _log_fallback_once(str(exc))
        return _memory_get_daily_usage(session_id)
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def increment_usage(session_id):
    if not _database_url():
        _log_fallback_once("DATABASE_URL is missing")
        return _memory_increment_usage(session_id)

    conn = None
    cur = None
    try:
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
        return count
    except Exception as exc:
        _log_fallback_once(str(exc))
        return _memory_increment_usage(session_id)
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def is_premium(session_id):
    user = get_or_create_user(session_id)
    return user["subscription_status"] in ("active", "trialing")


def can_solve_problem(session_id):
    if is_premium(session_id):
        return True, -1
    usage = get_daily_usage(session_id)
    remaining = max(0, FREE_DAILY_LIMIT - usage)
    return remaining > 0, remaining
