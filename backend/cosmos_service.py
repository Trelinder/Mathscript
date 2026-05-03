"""
Firebase Firestore service for The Math Script.
Replaces the former Azure Cosmos DB service — the public API is identical
so the rest of the codebase needs no changes.

Required environment variable (one of):
  FIREBASE_SERVICE_ACCOUNT_JSON  — JSON string of the service-account file
  GOOGLE_APPLICATION_CREDENTIALS — path to the service-account JSON file

Firestore collections used
--------------------------
  user_content   — progress, session, milestone, and tycoon-state documents
                   (keyed by composite IDs, queried by userId field)
  auth_users     — registered user accounts (shared with database.py)
  telemetry      — spell_cast / tycoon_purchase events
"""

from __future__ import annotations

import datetime
import logging
import os
import threading
from typing import Any

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class CosmosService:
    """Backend service for reading and writing learner data to Firestore.

    The method signatures are identical to the former Cosmos DB implementation
    so callers in main.py do not need to change.
    """

    def __init__(self) -> None:
        from backend.database import get_firestore_db
        db = get_firestore_db()
        if db is None:
            raise RuntimeError(
                "Firebase is not initialised. "
                "Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS."
            )
        self._db = db

    # ------------------------------------------------------------------
    # Telemetry
    # ------------------------------------------------------------------

    def insert_telemetry_event(
        self,
        *,
        session_id: str,
        event_type: str,
        metadata: dict | None = None,
        timestamp: str | None = None,
    ) -> dict:
        doc = {
            "id": f"{event_type}_{session_id}_{_now_iso()}",
            "event_type": event_type,
            "session_id": session_id,
            "metadata": metadata or {},
            "timestamp": timestamp or _now_iso(),
        }
        _ref, written = self._db.collection("telemetry").add(doc)
        return doc

    def get_telemetry_stats(self) -> dict:
        spells_cast = 0
        correct_answers = 0
        total_answers = 0
        tycoon_purchases = 0

        try:
            rows = list(
                self._db.collection("telemetry")
                .where("event_type", "==", "spell_cast")
                .stream()
            )
            spells_cast = len(rows)
            for row in rows:
                meta = row.to_dict().get("metadata") or {}
                total_answers += 1
                if meta.get("correct"):
                    correct_answers += 1
        except Exception as exc:
            logger.warning("[Telemetry] stats query (spell_cast) failed: %s", exc)

        try:
            tycoon_purchases = sum(
                1 for _ in self._db.collection("telemetry")
                .where("event_type", "==", "tycoon_purchase")
                .stream()
            )
        except Exception as exc:
            logger.warning("[Telemetry] stats query (tycoon_purchase) failed: %s", exc)

        accuracy_pct = round(correct_answers / total_answers * 100, 1) if total_answers else 0.0
        return {
            "spells_cast": spells_cast,
            "math_accuracy_pct": accuracy_pct,
            "total_answers": total_answers,
            "tycoon_purchases": tycoon_purchases,
        }

    # ------------------------------------------------------------------
    # Registered users  (shared auth_users Firestore collection)
    # ------------------------------------------------------------------

    def upsert_user(
        self,
        username: str,
        password_hash: str,
        session_id: str,
        hero_unlocked: str | None = None,
        tycoon_currency: int = 0,
        extra: dict[str, Any] | None = None,
    ) -> dict:
        doc_ref = self._db.collection("auth_users").document(username)
        existing = doc_ref.get()
        now = _now_iso()
        if existing.exists:
            updates: dict = {
                "session_id": session_id,
                "tycoon_currency": tycoon_currency,
                "updated_at": now,
            }
            if password_hash:
                updates["password_hash"] = password_hash
            if hero_unlocked is not None:
                updates["hero_unlocked"] = hero_unlocked
            if extra:
                updates.update(extra)
            doc_ref.set(updates, merge=True)
        else:
            data: dict = {
                "username": username,
                "session_id": session_id,
                "hero_unlocked": hero_unlocked,
                "tycoon_currency": tycoon_currency,
                "updated_at": now,
                "created_at": now,
            }
            if password_hash:
                data["password_hash"] = password_hash
            if extra:
                data.update(extra)
            doc_ref.set(data)
        logger.info("[Firestore] Upserted user username=%s", username)
        return doc_ref.get().to_dict()

    def get_user(self, username: str) -> dict | None:
        doc = self._db.collection("auth_users").document(username).get()
        if not doc.exists:
            return None
        data = doc.to_dict()
        # Return in the shape the auth system expects
        return {
            "username":       data.get("username", username),
            "passwordHash":   data.get("password_hash", ""),
            "sessionId":      data.get("session_id", ""),
            "email":          data.get("email", ""),
            "heroUnlocked":   data.get("hero_unlocked"),
            "tycoonCurrency": data.get("tycoon_currency", 0),
            "resetToken":     data.get("reset_token"),
            "resetTokenExpiry": data.get("reset_token_expiry"),
        }

    def update_user_reset_token(
        self,
        username: str,
        token: str | None,
        expiry: str | None,
    ) -> None:
        doc_ref = self._db.collection("auth_users").document(username)
        if not doc_ref.get().exists:
            raise ValueError(f"User {username!r} not found")
        doc_ref.set(
            {"reset_token": token, "reset_token_expiry": expiry, "updated_at": _now_iso()},
            merge=True,
        )
        logger.info("[Firestore] Updated reset token for username=%s", username)

    def update_user_email(self, username: str, email: str) -> None:
        doc_ref = self._db.collection("auth_users").document(username)
        if not doc_ref.get().exists:
            raise ValueError(f"User {username!r} not found")
        doc_ref.set({"email": email, "updated_at": _now_iso()}, merge=True)
        logger.info("[Firestore] Updated email for username=%s", username)

    # ------------------------------------------------------------------
    # Progress documents
    # ------------------------------------------------------------------

    def upsert_progress(
        self,
        user_id: str,
        current_level: str,
        score: int,
        visual_analogies_completed: list[str],
        extra: dict[str, Any] | None = None,
    ) -> dict:
        doc: dict[str, Any] = {
            "id": f"progress_{user_id}",
            "type": "progress",
            "userId": user_id,
            "currentLevel": current_level,
            "score": score,
            "visualAnalogiesCompleted": visual_analogies_completed,
            "updatedAt": _now_iso(),
        }
        if extra:
            doc.update(extra)
        self._db.collection("user_content").document(f"progress_{user_id}").set(doc)
        logger.info("[Firestore] Upserted progress for userId=%s", user_id)
        return doc

    def get_progress(self, user_id: str) -> dict | None:
        doc = self._db.collection("user_content").document(f"progress_{user_id}").get()
        return doc.to_dict() if doc.exists else None

    # ------------------------------------------------------------------
    # Session documents
    # ------------------------------------------------------------------

    def upsert_session(
        self,
        user_id: str,
        session_id: str,
        start_time: str,
        end_time: str | None = None,
        duration_seconds: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> dict:
        doc_id = f"session_{user_id}_{session_id}"
        doc: dict[str, Any] = {
            "id": doc_id,
            "type": "session",
            "userId": user_id,
            "sessionId": session_id,
            "startTime": start_time,
            "endTime": end_time,
            "durationSeconds": duration_seconds,
            "updatedAt": _now_iso(),
        }
        if extra:
            doc.update(extra)
        self._db.collection("user_content").document(doc_id).set(doc)
        logger.info("[Firestore] Upserted session %s for userId=%s", session_id, user_id)
        return doc

    def get_sessions(self, user_id: str) -> list[dict]:
        docs = (
            self._db.collection("user_content")
            .where("userId", "==", user_id)
            .where("type", "==", "session")
            .order_by("startTime", direction="DESCENDING")
            .stream()
        )
        return [d.to_dict() for d in docs]

    # ------------------------------------------------------------------
    # All documents for a user (Parent Command Center)
    # ------------------------------------------------------------------

    def get_all_for_user(self, user_id: str) -> list[dict]:
        docs = (
            self._db.collection("user_content")
            .where("userId", "==", user_id)
            .order_by("updatedAt", direction="DESCENDING")
            .stream()
        )
        items = [d.to_dict() for d in docs]
        logger.info("[Firestore] Retrieved %d doc(s) for userId=%s", len(items), user_id)
        return items

    # ------------------------------------------------------------------
    # Tycoon game state
    # ------------------------------------------------------------------

    def upsert_tycoon_state(self, session_id: str, state: dict[str, Any]) -> dict:
        doc_id = f"tycoon_{session_id}"
        doc: dict[str, Any] = {
            "id": doc_id,
            "type": "tycoon_state",
            "userId": session_id,
            "gameState": state,
            "savedAt": _now_iso(),
            "updatedAt": _now_iso(),
        }
        self._db.collection("user_content").document(doc_id).set(doc)
        logger.info("[Firestore] Upserted tycoon state for sessionId=%s", session_id)
        return doc

    def get_tycoon_state(self, session_id: str) -> dict | None:
        doc = self._db.collection("user_content").document(f"tycoon_{session_id}").get()
        if doc.exists:
            return doc.to_dict().get("gameState")
        return None

    # ------------------------------------------------------------------
    # Milestone documents
    # ------------------------------------------------------------------

    def upsert_milestone(
        self,
        user_id: str,
        concept_id: str,
        game_type: str,
        timestamp: str,
    ) -> dict:
        milestone_doc: dict[str, Any] = {
            "id": f"milestone_{user_id}_{concept_id}",
            "type": "progress",
            "userId": user_id,
            "conceptId": concept_id,
            "gameType": game_type,
            "timestamp": timestamp,
            "masteredAt": _now_iso(),
            "updatedAt": _now_iso(),
        }
        try:
            self._db.collection("user_content").document(
                f"milestone_{user_id}_{concept_id}"
            ).set(milestone_doc)
        except Exception as exc:
            logger.error(
                "[Firestore] Failed to upsert milestone conceptId=%s userId=%s: %s",
                concept_id, user_id, exc,
            )
            raise
        logger.info("[Firestore] Upserted milestone conceptId=%s userId=%s", concept_id, user_id)

        progress = self.get_progress(user_id)
        if progress is None:
            completed: list[str] = [concept_id]
            new_score = 1
            current_level = "level_1"
        else:
            completed = list(progress.get("visualAnalogiesCompleted") or [])
            current_level = progress.get("currentLevel", "level_1")
            if concept_id not in completed:
                completed = completed + [concept_id]
                new_score = int(progress.get("score", 0)) + 1
            else:
                new_score = int(progress.get("score", 0))

        self.upsert_progress(
            user_id=user_id,
            current_level=current_level,
            score=new_score,
            visual_analogies_completed=completed,
        )
        return {"totalPoints": new_score}

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        pass  # Firestore client does not need explicit close

    def __enter__(self) -> "CosmosService":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


# ---------------------------------------------------------------------------
# Module-level singleton (lazy — only created on first access)
# ---------------------------------------------------------------------------

_service_instance: CosmosService | None = None
_service_lock = threading.Lock()


def get_cosmos_service() -> CosmosService:
    """Return the shared CosmosService instance (thread-safe).

    Creates the instance on first call.  Raises RuntimeError if Firebase
    credentials are not configured.
    """
    global _service_instance
    if _service_instance is None:
        with _service_lock:
            if _service_instance is None:
                _service_instance = CosmosService()
    return _service_instance
