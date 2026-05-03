import os
import json
import logging
import threading
from datetime import date, datetime, timezone

logger = logging.getLogger(__name__)

FREE_DAILY_LIMIT = 6

_memory_lock = threading.Lock()
_memory_users = {}
_memory_usage = {}
_fallback_logged = False

# ── Firebase Firestore singleton ──────────────────────────────────────────────

_firestore_client = None
_firestore_lock = threading.Lock()


def get_firestore_db():
    """Return a Firestore client, initialising Firebase on first call.

    Credentials are read from (in order):
    1. FIREBASE_SERVICE_ACCOUNT_JSON  — JSON string of the service-account file
    2. GOOGLE_APPLICATION_CREDENTIALS — path to the service-account JSON file

    Returns None if neither variable is set.
    """
    global _firestore_client
    if _firestore_client is not None:
        return _firestore_client
    with _firestore_lock:
        if _firestore_client is not None:
            return _firestore_client
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore as _fs

            if not firebase_admin._apps:
                sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
                sa_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
                if sa_json:
                    cred = credentials.Certificate(json.loads(sa_json))
                    firebase_admin.initialize_app(cred)
                elif sa_path:
                    cred = credentials.Certificate(sa_path)
                    firebase_admin.initialize_app(cred)
                else:
                    logger.warning(
                        "[Firestore] No Firebase credentials found. "
                        "Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS."
                    )
                    return None

            _firestore_client = _fs.client()
            return _firestore_client
        except Exception as exc:
            logger.warning("[Firestore] Could not initialise Firebase: %s", exc)
            return None


def _firestore_available() -> bool:
    return get_firestore_db() is not None


def _database_url():
    """Legacy alias — returns a truthy string when Firestore is available."""
    return "firestore" if _firestore_available() else ""


# ── In-memory fallback helpers ────────────────────────────────────────────────

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


# ── Feature flag defaults ─────────────────────────────────────────────────────

_DEFAULT_FEATURE_FLAGS: dict[str, tuple[bool, str]] = {
    "CONCRETE_PACKERS":  (True,  "Drag-and-drop addition game for age 5-7"),
    "POTION_ALCHEMISTS": (True,  "Fraction pouring game for age 8-13"),
    "ORBITAL_ENGINEERS": (False, "Orbital geometry game (coming soon)"),
}

_memory_feature_flags: dict = {k: v for k, (v, _) in _DEFAULT_FEATURE_FLAGS.items()}


# ── Schema init ───────────────────────────────────────────────────────────────

def init_db():
    """Seed default feature flags into Firestore if they do not exist yet."""
    db = get_firestore_db()
    if db is None:
        _log_fallback_once("Firebase not configured")
        return
    try:
        flags_ref = db.collection("feature_flags")
        for flag_name, (is_active, description) in _DEFAULT_FEATURE_FLAGS.items():
            doc_ref = flags_ref.document(flag_name)
            if not doc_ref.get().exists:
                doc_ref.set({
                    "flag_name": flag_name,
                    "is_active": is_active,
                    "description": description,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
        logger.info("[Firestore] Feature flags seeded")
    except Exception as exc:
        _log_fallback_once(str(exc))


# ── App users ─────────────────────────────────────────────────────────────────

def get_or_create_user(session_id):
    db = get_firestore_db()
    if db is None:
        _log_fallback_once("Firebase not configured")
        return _memory_get_or_create_user(session_id)
    try:
        doc_ref = db.collection("app_users").document(session_id)
        doc = doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
        else:
            data = {
                "session_id": session_id,
                "stripe_customer_id": None,
                "stripe_subscription_id": None,
                "subscription_status": "free",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            doc_ref.set(data)
        return {
            "session_id": data.get("session_id", session_id),
            "stripe_customer_id": data.get("stripe_customer_id"),
            "stripe_subscription_id": data.get("stripe_subscription_id"),
            "subscription_status": data.get("subscription_status", "free"),
        }
    except Exception as exc:
        _log_fallback_once(str(exc))
        return _memory_get_or_create_user(session_id)


def update_user_stripe(session_id, customer_id=None, subscription_id=None, status=None):
    db = get_firestore_db()
    if db is None:
        _log_fallback_once("Firebase not configured")
        _memory_update_user_stripe(session_id, customer_id, subscription_id, status)
        return
    try:
        updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if customer_id is not None:
            updates["stripe_customer_id"] = customer_id
        if subscription_id is not None:
            updates["stripe_subscription_id"] = subscription_id
        if status is not None:
            updates["subscription_status"] = status
        db.collection("app_users").document(session_id).set(updates, merge=True)
    except Exception as exc:
        _log_fallback_once(str(exc))
        _memory_update_user_stripe(session_id, customer_id, subscription_id, status)


def find_session_by_stripe(customer_id: str, subscription_id: str) -> str | None:
    """Return the session_id matching the given Stripe customer or subscription ID."""
    db = get_firestore_db()
    if db is None:
        return None
    try:
        col = db.collection("app_users")
        for doc in col.where("stripe_customer_id", "==", customer_id).limit(1).stream():
            return doc.to_dict().get("session_id")
        for doc in col.where("stripe_subscription_id", "==", subscription_id).limit(1).stream():
            return doc.to_dict().get("session_id")
        return None
    except Exception as exc:
        logger.warning("[Firestore] find_session_by_stripe failed: %s", exc)
        return None


def get_all_subscribers() -> dict:
    """Return subscriber stats and details for the admin panel."""
    db = get_firestore_db()
    if db is None:
        return {
            "total_users": 0,
            "stripe_customers": 0,
            "premium_subscribers": 0,
            "has_any_subscribers": False,
            "subscriber_details": [],
        }
    try:
        all_docs = list(db.collection("app_users").stream())
        total_users = len(all_docs)
        stripe_customers = 0
        premium_count = 0
        subscriber_details = []
        for doc in all_docs:
            data = doc.to_dict()
            if data.get("stripe_customer_id"):
                stripe_customers += 1
            status = data.get("subscription_status", "free")
            if status in ("active", "trialing", "past_due"):
                premium_count += 1
            if status != "free" or data.get("stripe_customer_id") or data.get("stripe_subscription_id"):
                subscriber_details.append({
                    "session_id": data.get("session_id", doc.id),
                    "stripe_customer_id": data.get("stripe_customer_id"),
                    "stripe_subscription_id": data.get("stripe_subscription_id"),
                    "subscription_status": status,
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                })
        subscriber_details.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
        return {
            "total_users": total_users,
            "stripe_customers": stripe_customers,
            "premium_subscribers": premium_count,
            "has_any_subscribers": premium_count > 0,
            "subscriber_details": subscriber_details,
        }
    except Exception as exc:
        logger.error("[Firestore] get_all_subscribers failed: %s", exc)
        return {
            "total_users": 0,
            "stripe_customers": 0,
            "premium_subscribers": 0,
            "has_any_subscribers": False,
            "subscriber_details": [],
        }


# ── Daily usage tracking ──────────────────────────────────────────────────────

def get_daily_usage(session_id):
    db = get_firestore_db()
    if db is None:
        _log_fallback_once("Firebase not configured")
        return _memory_get_daily_usage(session_id)
    try:
        today = date.today().isoformat()
        doc_id = f"{session_id}_{today}"
        doc = db.collection("usage_tracking").document(doc_id).get()
        return int(doc.to_dict().get("problem_count", 0)) if doc.exists else 0
    except Exception as exc:
        _log_fallback_once(str(exc))
        return _memory_get_daily_usage(session_id)


def increment_usage(session_id):
    db = get_firestore_db()
    if db is None:
        _log_fallback_once("Firebase not configured")
        return _memory_increment_usage(session_id)
    try:
        today = date.today().isoformat()
        doc_id = f"{session_id}_{today}"
        doc_ref = db.collection("usage_tracking").document(doc_id)

        from google.cloud.firestore_v1 import transaction as _txn_mod

        def _run(transaction, ref):
            snap = ref.get(transaction=transaction)
            new_count = int(snap.to_dict().get("problem_count", 0)) + 1 if snap.exists else 1
            transaction.set(ref, {
                "session_id": session_id,
                "usage_date": today,
                "problem_count": new_count,
            })
            return new_count

        txn = db.transaction()
        return _txn_mod.run_in_transaction(txn, _run, doc_ref)
    except Exception as exc:
        _log_fallback_once(str(exc))
        return _memory_increment_usage(session_id)


def is_premium(session_id):
    user = get_or_create_user(session_id)
    return user["subscription_status"] in ("active", "trialing")


def can_solve_problem(session_id):
    if is_premium(session_id):
        return True, -1
    usage = get_daily_usage(session_id)
    remaining = max(0, FREE_DAILY_LIMIT - usage)
    return remaining > 0, remaining


# ── Game sessions ─────────────────────────────────────────────────────────────

def load_session_data(session_id: str):
    """Load a game session from Firestore. Returns a dict or None."""
    db = get_firestore_db()
    if db is None:
        return None
    try:
        doc = db.collection("game_sessions").document(session_id).get()
        if doc.exists:
            return doc.to_dict().get("data")
        return None
    except Exception as exc:
        logger.warning("[Firestore] Could not load session %s: %s", session_id, exc)
        return None


def save_session_data(session_id: str, data: dict) -> None:
    """Persist a game session to Firestore (upsert). Best-effort — never raises."""
    db = get_firestore_db()
    if db is None:
        return
    try:
        serializable = {k: v for k, v in data.items() if k != "_ts"}
        db.collection("game_sessions").document(session_id).set({
            "session_id": session_id,
            "data": serializable,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.warning("[Firestore] Could not save session %s: %s", session_id, exc)


# ── Feature flags ─────────────────────────────────────────────────────────────

def get_all_feature_flags() -> list[dict]:
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

    db = get_firestore_db()
    if db is None:
        return _from_memory()
    try:
        docs = db.collection("feature_flags").order_by("flag_name").stream()
        return [
            {
                "flag_name": d.to_dict().get("flag_name", d.id),
                "is_active": bool(d.to_dict().get("is_active", False)),
                "description": d.to_dict().get("description", ""),
                "updated_at": d.to_dict().get("updated_at"),
            }
            for d in docs
        ]
    except Exception as exc:
        logger.warning("[Firestore] Could not load feature flags: %s", exc)
        return _from_memory()


def get_feature_flag(flag_name: str) -> bool | None:
    db = get_firestore_db()
    if db is None:
        return _memory_feature_flags.get(flag_name)
    try:
        doc = db.collection("feature_flags").document(flag_name).get()
        if doc.exists:
            return bool(doc.to_dict().get("is_active", False))
        return None
    except Exception as exc:
        logger.warning("[Firestore] Could not read feature flag %s: %s", flag_name, exc)
        return _memory_feature_flags.get(flag_name)


def set_feature_flag(flag_name: str, is_active: bool) -> dict:
    db = get_firestore_db()
    if db is None:
        _memory_feature_flags[flag_name] = is_active
        return {"flag_name": flag_name, "is_active": is_active, "description": "", "updated_at": None}
    try:
        now = datetime.now(timezone.utc).isoformat()
        doc_ref = db.collection("feature_flags").document(flag_name)
        doc_ref.set({"flag_name": flag_name, "is_active": is_active, "updated_at": now}, merge=True)
        doc = doc_ref.get().to_dict()
        return {
            "flag_name": doc.get("flag_name", flag_name),
            "is_active": bool(doc.get("is_active", is_active)),
            "description": doc.get("description", ""),
            "updated_at": doc.get("updated_at"),
        }
    except Exception as exc:
        logger.warning("[Firestore] Could not set feature flag %s: %s", flag_name, exc)
        _memory_feature_flags[flag_name] = is_active
        return {"flag_name": flag_name, "is_active": is_active, "description": "", "updated_at": None}


# ── Auth users ────────────────────────────────────────────────────────────────

def get_auth_user(username: str) -> dict | None:
    """Return the auth user doc for *username*, or None if not found."""
    db = get_firestore_db()
    if db is None:
        return None
    try:
        doc = db.collection("auth_users").document(username).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        return {
            "username":       data.get("username", username),
            "passwordHash":   data.get("password_hash", ""),
            "sessionId":      data.get("session_id", ""),
            "email":          data.get("email", ""),
            "heroUnlocked":   data.get("hero_unlocked"),
            "tycoonCurrency": data.get("tycoon_currency", 0),
        }
    except Exception as exc:
        logger.warning("[Firestore] get_auth_user failed for %s: %s", username, exc)
        return None


def upsert_auth_user(
    username: str,
    password_hash: str,
    session_id: str,
    email: str = "",
    hero_unlocked: str | None = None,
    tycoon_currency: int = 0,
) -> bool:
    """Insert or update a user in auth_users. Returns True on success."""
    db = get_firestore_db()
    if db is None:
        return False
    try:
        now = datetime.now(timezone.utc).isoformat()
        doc_ref = db.collection("auth_users").document(username)
        existing = doc_ref.get()
        if existing.exists:
            updates: dict = {
                "password_hash": password_hash,
                "session_id": session_id,
                "tycoon_currency": tycoon_currency,
                "updated_at": now,
            }
            if email:
                updates["email"] = email
            if hero_unlocked is not None:
                updates["hero_unlocked"] = hero_unlocked
            doc_ref.set(updates, merge=True)
        else:
            doc_ref.set({
                "username": username,
                "password_hash": password_hash,
                "session_id": session_id,
                "email": email or "",
                "hero_unlocked": hero_unlocked,
                "tycoon_currency": tycoon_currency,
                "created_at": now,
                "updated_at": now,
            })
        return True
    except Exception as exc:
        logger.warning("[Firestore] upsert_auth_user failed for %s: %s", username, exc)
        return False


# ── Leads / early-access ──────────────────────────────────────────────────────

def _email_doc_id(email: str) -> str:
    """Convert an email address to a Firestore-safe document ID."""
    return email.replace("/", "_").replace(".", "_").replace("@", "_at_")


def check_lead_exists(email: str) -> bool:
    """Return True if the email is already in the leads collection."""
    db = get_firestore_db()
    if db is None:
        return False
    try:
        return db.collection("leads").document(_email_doc_id(email)).get().exists
    except Exception as exc:
        logger.warning("[Firestore] check_lead_exists failed: %s", exc)
        return False


def check_promo_exists(code: str) -> bool:
    """Return True if a promo code document already exists."""
    db = get_firestore_db()
    if db is None:
        return False
    try:
        return db.collection("promo_codes").document(code).get().exists
    except Exception as exc:
        logger.warning("[Firestore] check_promo_exists failed: %s", exc)
        return False


def create_promo_and_lead(email: str, code: str, grants_premium_days: int = 30) -> None:
    """Write a promo code and a lead document as a batch."""
    db = get_firestore_db()
    if db is None:
        raise RuntimeError("Firestore not configured")
    now = datetime.now(timezone.utc).isoformat()
    batch = db.batch()
    batch.set(db.collection("promo_codes").document(code), {
        "code": code,
        "discount_type": "percent",
        "discount_value": 0,
        "max_uses": 1,
        "grants_premium_days": grants_premium_days,
        "active": True,
        "created_at": now,
    })
    batch.set(db.collection("leads").document(_email_doc_id(email)), {
        "email": email,
        "promo_code": code,
        "email_sent": False,
        "created_at": now,
    })
    batch.commit()


def update_lead_email_sent(email: str) -> None:
    db = get_firestore_db()
    if db is None:
        return
    try:
        db.collection("leads").document(_email_doc_id(email)).set(
            {"email_sent": True}, merge=True
        )
    except Exception as exc:
        logger.warning("[Firestore] update_lead_email_sent failed: %s", exc)


def delete_lead_and_promo(email: str, code: str) -> None:
    """Roll back lead + promo when email delivery fails."""
    db = get_firestore_db()
    if db is None:
        return
    try:
        batch = db.batch()
        batch.delete(db.collection("leads").document(_email_doc_id(email)))
        batch.delete(db.collection("promo_codes").document(code))
        batch.commit()
    except Exception as exc:
        logger.warning("[Firestore] delete_lead_and_promo failed: %s", exc)


def subscribe_email(email: str) -> bool:
    """Insert email into leads without a promo code. Returns False if already exists."""
    db = get_firestore_db()
    if db is None:
        return True  # caller has its own in-memory fallback
    try:
        doc_ref = db.collection("leads").document(_email_doc_id(email))
        if doc_ref.get().exists:
            return False
        doc_ref.set({
            "email": email,
            "promo_code": None,
            "email_sent": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return True
    except Exception as exc:
        logger.warning("[Firestore] subscribe_email failed: %s", exc)
        return True


def get_leads_stats() -> dict:
    """Return total leads count and emails-sent count."""
    db = get_firestore_db()
    if db is None:
        return {"total_leads": 0, "emails_sent": 0}
    try:
        docs = list(db.collection("leads").stream())
        total = len(docs)
        sent = sum(1 for d in docs if d.to_dict().get("email_sent"))
        return {"total_leads": total, "emails_sent": sent}
    except Exception as exc:
        logger.warning("[Firestore] get_leads_stats failed: %s", exc)
        return {"total_leads": 0, "emails_sent": 0}


def list_promo_codes() -> list[dict]:
    """Return all promo codes with redemption info."""
    db = get_firestore_db()
    if db is None:
        return []
    try:
        leads_by_code: dict[str, str] = {}
        for doc in db.collection("leads").stream():
            data = doc.to_dict()
            if data.get("promo_code"):
                leads_by_code[data["promo_code"]] = data.get("email", "")

        codes = []
        for doc in db.collection("promo_codes").order_by(
            "created_at", direction="DESCENDING"
        ).stream():
            data = doc.to_dict()
            days = data.get("grants_premium_days", 30)
            if days >= 36500:
                dtype = "lifetime"
            elif days >= 90:
                dtype = "90_day"
            else:
                dtype = "30_day"
            redeemed_by = leads_by_code.get(data.get("code", doc.id))
            codes.append({
                "code": data.get("code", doc.id),
                "duration_type": dtype,
                "grants_premium_days": days,
                "active": data.get("active", True),
                "created_at": data.get("created_at"),
                "redeemed": redeemed_by is not None,
                "redeemed_by": redeemed_by,
            })
        return codes
    except Exception as exc:
        logger.error("[Firestore] list_promo_codes failed: %s", exc)
        return []


def create_admin_promo_codes(count: int, days: int) -> list[str]:
    """Generate and store *count* admin promo codes. Returns the list of codes."""
    import secrets as _secrets
    db = get_firestore_db()
    if db is None:
        raise RuntimeError("Firestore not configured")
    generated = []
    batch = db.batch()
    now = datetime.now(timezone.utc).isoformat()
    for _ in range(count):
        attempts = 0
        while attempts < 20:
            code = _secrets.token_hex(4).upper()
            if not check_promo_exists(code):
                break
            attempts += 1
        batch.set(db.collection("promo_codes").document(code), {
            "code": code,
            "discount_type": "percent",
            "discount_value": 0,
            "max_uses": 1,
            "grants_premium_days": days,
            "active": True,
            "created_at": now,
        })
        generated.append(code)
    batch.commit()
    return generated


# ── Consent events ────────────────────────────────────────────────────────────

def insert_consent_event(
    phone: str, consented: bool, method: str, status: str, call_id: str | None
) -> None:
    """Insert one IVR consent event into Firestore."""
    db = get_firestore_db()
    if db is None:
        return
    try:
        db.collection("consent_events").add({
            "phone": phone,
            "consented": consented,
            "method": method,
            "status": status,
            "call_id": call_id,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.error("[Firestore] insert_consent_event failed: %s", exc)


def get_recent_consent_events(limit: int = 50) -> list[dict]:
    """Return the most recent consent events, newest first."""
    db = get_firestore_db()
    if db is None:
        return []
    try:
        docs = (
            db.collection("consent_events")
            .order_by("recorded_at", direction="DESCENDING")
            .limit(limit)
            .stream()
        )
        return [d.to_dict() for d in docs]
    except Exception as exc:
        logger.error("[Firestore] get_recent_consent_events failed: %s", exc)
        return []
