import json
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


_DB_CONNECT_TIMEOUT_SECONDS = 10  # Max wait for PostgreSQL TCP handshake


def get_db_connection():
    db_url = _database_url()
    if not db_url:
        raise RuntimeError("DATABASE_URL is not configured")
    # psycopg2 requires the postgresql:// scheme; many providers emit postgres://
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    return psycopg2.connect(db_url, connect_timeout=_DB_CONNECT_TIMEOUT_SECONDS)


# ── Feature flag defaults — single source of truth ───────────────────────────
# Used both to seed the feature_flags DB table on first run (init_db) and to
# populate the in-memory fallback (_memory_feature_flags) when no DB is
# available.  Format: { flag_name: (is_active_default, description) }
_DEFAULT_FEATURE_FLAGS: dict[str, tuple[bool, str]] = {
    "CONCRETE_PACKERS":  (True,  "Drag-and-drop addition game for age 5-7"),
    "POTION_ALCHEMISTS": (True,  "Fraction pouring game for age 8-13"),
    "ORBITAL_ENGINEERS": (False, "Orbital geometry game (coming soon)"),
}


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
        cur.execute("""
            CREATE TABLE IF NOT EXISTS game_sessions (
                session_id TEXT PRIMARY KEY,
                data JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS promo_codes (
                id SERIAL PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                discount_type TEXT NOT NULL DEFAULT 'percent',
                discount_value INTEGER NOT NULL DEFAULT 0,
                max_uses INTEGER NOT NULL DEFAULT 1,
                grants_premium_days INTEGER NOT NULL DEFAULT 0,
                active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                promo_code TEXT,
                email_sent BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)
        # ── Feature flags table ─────────────────────────────────────────────
        # Controls dynamic visibility of mini-games and experimental features
        # without requiring a redeployment.  The admin portal reads/writes this
        # table via the /api/admin/feature-flags routes.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS feature_flags (
                flag_name   TEXT PRIMARY KEY,
                is_active   BOOLEAN NOT NULL DEFAULT false,
                description TEXT    NOT NULL DEFAULT '',
                updated_at  TIMESTAMP DEFAULT NOW()
            );
        """)
        # ── Schema migrations — add columns introduced after initial deploy ─────
        # These are safe to run on every startup because of IF NOT EXISTS / DO NOTHING.
        cur.execute("""
            ALTER TABLE promo_codes
                ADD COLUMN IF NOT EXISTS grants_premium_days INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
        """)
        cur.execute("""
            ALTER TABLE leads
                ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT false;
        """)
        # ── Auth users table — persists registered accounts across restarts ─────
        # Primary persistent store for email/password (hashed) credentials.
        # Cosmos DB and the in-memory dict are used as secondary/fallback layers.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS auth_users (
                username        TEXT PRIMARY KEY,
                password_hash   TEXT NOT NULL,
                session_id      TEXT NOT NULL,
                email           TEXT NOT NULL DEFAULT '',
                hero_unlocked   TEXT,
                tycoon_currency INTEGER NOT NULL DEFAULT 0,
                created_at      TIMESTAMP DEFAULT NOW(),
                updated_at      TIMESTAMP DEFAULT NOW()
            );
        """)

        # Seed default flags (INSERT … ON CONFLICT DO NOTHING so existing
        # admin-toggled values are never overwritten on restart).
        for flag_name, (is_active, description) in _DEFAULT_FEATURE_FLAGS.items():
            cur.execute(
                """INSERT INTO feature_flags (flag_name, is_active, description)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (flag_name) DO NOTHING""",
                (flag_name, is_active, description)
            )
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


def load_session_data(session_id: str):
    """Load a game session from the database. Returns a dict or None."""
    if not _database_url():
        return None
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT data FROM game_sessions WHERE session_id = %s", (session_id,))
        row = cur.fetchone()
        if row:
            data = row[0]
            # psycopg2 typically returns JSONB columns as dicts; the string
            # branch is a fallback for environments without automatic JSON decoding.
            return data if isinstance(data, dict) else json.loads(data)
        return None
    except Exception as exc:
        logger.warning(f"[DB] Could not load session {session_id}: {exc}")
        return None
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def save_session_data(session_id: str, data: dict) -> None:
    """Persist a game session to the database (upsert). Best-effort — never raises."""
    if not _database_url():
        return
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Exclude runtime-only keys that are not worth persisting
        serializable = {k: v for k, v in data.items() if k != '_ts'}
        cur.execute(
            """INSERT INTO game_sessions (session_id, data, updated_at)
               VALUES (%s, %s::jsonb, NOW())
               ON CONFLICT (session_id) DO UPDATE
               SET data = EXCLUDED.data, updated_at = NOW()""",
            (session_id, json.dumps(serializable))
        )
        conn.commit()
    except Exception as exc:
        logger.warning(f"[DB] Could not save session {session_id}: {exc}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# ── Feature flag CRUD ─────────────────────────────────────────────────────────

# In-memory fallback used when DATABASE_URL is absent.  Initialised from
# _DEFAULT_FEATURE_FLAGS so there is a single source of truth for defaults.
_memory_feature_flags: dict = {k: v for k, (v, _) in _DEFAULT_FEATURE_FLAGS.items()}


def get_all_feature_flags() -> list[dict]:
    """Return all feature flags as a list of dicts."""
    def _from_memory():
        return [
            {
                "flag_name": k,
                "is_active": v,
                "description": _DEFAULT_FEATURE_FLAGS.get(k, (None, ""))[1],
                "updated_at": None,
            }
            for k, v in _memory_feature_flags.items()
        ]

    if not _database_url():
        return _from_memory()
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT flag_name, is_active, description, updated_at "
            "FROM feature_flags ORDER BY flag_name"
        )
        rows = cur.fetchall()
        return [
            {
                "flag_name": r[0],
                "is_active": bool(r[1]),
                "description": r[2] or "",
                "updated_at": str(r[3]) if r[3] else None,
            }
            for r in rows
        ]
    except Exception as exc:
        logger.warning(f"[DB] Could not load feature flags: {exc}")
        return _from_memory()
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def get_feature_flag(flag_name: str) -> bool | None:
    """Return a single flag's is_active value, or None if not found."""
    if not _database_url():
        return _memory_feature_flags.get(flag_name)
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT is_active FROM feature_flags WHERE flag_name = %s",
            (flag_name,)
        )
        row = cur.fetchone()
        return bool(row[0]) if row is not None else None
    except Exception as exc:
        logger.warning(f"[DB] Could not read feature flag {flag_name}: {exc}")
        return _memory_feature_flags.get(flag_name)
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def set_feature_flag(flag_name: str, is_active: bool) -> dict:
    """Upsert a feature flag.  Returns the updated record."""
    if not _database_url():
        _memory_feature_flags[flag_name] = is_active
        return {"flag_name": flag_name, "is_active": is_active, "description": "", "updated_at": None}
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO feature_flags (flag_name, is_active, updated_at)
               VALUES (%s, %s, NOW())
               ON CONFLICT (flag_name) DO UPDATE
               SET is_active = EXCLUDED.is_active, updated_at = NOW()
               RETURNING flag_name, is_active, description, updated_at""",
            (flag_name, is_active)
        )
        row = cur.fetchone()
        conn.commit()
        return {
            "flag_name": row[0],
            "is_active": bool(row[1]),
            "description": row[2] or "",
            "updated_at": str(row[3]) if row[3] else None,
        }
    except Exception as exc:
        logger.warning(f"[DB] Could not set feature flag {flag_name}: {exc}")
        _memory_feature_flags[flag_name] = is_active
        return {"flag_name": flag_name, "is_active": is_active, "description": "", "updated_at": None}
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

# ── Auth-user helpers ─────────────────────────────────────────────────────────
# These functions read and write the auth_users table, which is the primary
# persistent store for registered accounts (email + bcrypt-hashed password).
# They are called by the /api/auth/register and /api/auth/login routes before
# the Cosmos DB / in-memory fallback layers are consulted.

def get_auth_user(username: str) -> dict | None:
    """Return the auth_users row for *username*, or None if not found.

    Returned dict keys mirror the in-memory user doc used by the rest of the
    auth system: ``username``, ``passwordHash``, ``sessionId``, ``email``,
    ``heroUnlocked``, ``tycoonCurrency``.
    """
    if not _database_url():
        return None
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            "SELECT username, password_hash, session_id, email, hero_unlocked, tycoon_currency "
            "FROM auth_users WHERE username = %s",
            (username,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "username":        row[0],
            "passwordHash":    row[1],
            "sessionId":       row[2],
            "email":           row[3] or "",
            "heroUnlocked":    row[4],
            "tycoonCurrency":  row[5] or 0,
        }
    except Exception as exc:
        logger.warning("[DB] get_auth_user failed for %s: %s", username, exc)
        return None
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def upsert_auth_user(
    username: str,
    password_hash: str,
    session_id: str,
    email: str = "",
    hero_unlocked: str | None = None,
    tycoon_currency: int = 0,
) -> bool:
    """Insert or update a user row in auth_users.

    Returns True on success, False if the database is unavailable or the
    query fails (callers should fall back to Cosmos / in-memory in that case).
    """
    if not _database_url():
        return False
    conn = None
    cur = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO auth_users
                   (username, password_hash, session_id, email, hero_unlocked, tycoon_currency, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, NOW())
               ON CONFLICT (username) DO UPDATE
               SET password_hash   = EXCLUDED.password_hash,
                   session_id      = EXCLUDED.session_id,
                   email           = COALESCE(NULLIF(EXCLUDED.email, ''), auth_users.email),
                   hero_unlocked   = COALESCE(EXCLUDED.hero_unlocked,  auth_users.hero_unlocked),
                   tycoon_currency = EXCLUDED.tycoon_currency,
                   updated_at      = NOW()""",
            (username, password_hash, session_id, email or "", hero_unlocked, tycoon_currency),
        )
        conn.commit()
        return True
    except Exception as exc:
        logger.warning("[DB] upsert_auth_user failed for %s: %s", username, exc)
        return False
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
