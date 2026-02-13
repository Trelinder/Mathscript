import os
import psycopg2
import logging
from datetime import datetime, date

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
    updates = []
    values = []
    if customer_id is not None:
        updates.append("stripe_customer_id = %s")
        values.append(customer_id)
    if subscription_id is not None:
        updates.append("stripe_subscription_id = %s")
        values.append(subscription_id)
    if status is not None:
        updates.append("subscription_status = %s")
        values.append(status)
    updates.append("updated_at = NOW()")
    values.append(session_id)
    cur.execute(f"UPDATE app_users SET {', '.join(updates)} WHERE session_id = %s", values)
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

def is_premium(session_id):
    user = get_or_create_user(session_id)
    return user["subscription_status"] in ("active", "trialing")

FREE_DAILY_LIMIT = 6

def can_solve_problem(session_id):
    if is_premium(session_id):
        return True, -1
    usage = get_daily_usage(session_id)
    remaining = max(0, FREE_DAILY_LIMIT - usage)
    return remaining > 0, remaining
