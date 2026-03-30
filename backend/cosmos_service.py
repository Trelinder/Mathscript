"""
Azure Cosmos DB service for The Math Script.

Two-container pattern:
  - ``UserProgress`` (partition key: /userId) — progress, session, milestone docs
  - ``Users``        (partition key: /id)     — registered auth accounts

Required environment variables
-------------------------------
COSMOS_URI  – e.g. https://mathscript-db.documents.azure.com:443/
COSMOS_KEY  – primary or secondary read-write key for the account

Database  : MathScriptDB
"""

from __future__ import annotations

import datetime
import logging
import os
import threading
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy SDK import so the rest of the app still starts if the package is absent.
# ---------------------------------------------------------------------------
try:
    from azure.cosmos import CosmosClient, PartitionKey, exceptions as cosmos_exceptions
    _COSMOS_AVAILABLE = True
except ImportError:
    _COSMOS_AVAILABLE = False
    logger.warning(
        "[Cosmos] azure-cosmos package not installed — "
        "CosmosService will be unavailable."
    )

DATABASE_NAME = "MathScriptDB"
CONTAINER_NAME = "UserProgress"
_PARTITION_KEY_PATH = "/userId"

USERS_CONTAINER_NAME = "Users"
_USERS_PARTITION_KEY_PATH = "/id"

TELEMETRY_CONTAINER_NAME = "Telemetry"
_TELEMETRY_PARTITION_KEY_PATH = "/event_type"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Service class
# ---------------------------------------------------------------------------

class CosmosService:
    """Backend service for reading and writing learner data to Cosmos DB.

    Usage::

        svc = CosmosService()          # reads env vars on init
        svc.upsert_progress(...)
        svc.upsert_session(...)
        svc.get_all_for_user(user_id)  # Parent Command Center query
    """

    def __init__(self) -> None:
        if not _COSMOS_AVAILABLE:
            raise RuntimeError(
                "azure-cosmos is not installed. "
                "Add azure-cosmos>=4.15.0 to requirements.txt."
            )

        uri = os.environ.get("COSMOS_URI", "").strip()
        key = os.environ.get("COSMOS_KEY", "").strip()

        if not uri or not key:
            raise RuntimeError(
                "COSMOS_URI and COSMOS_KEY environment variables must be set."
            )

        self._client = CosmosClient(uri, credential=key)
        self._db = self._client.create_database_if_not_exists(id=DATABASE_NAME)
        self._container = self._db.create_container_if_not_exists(
            id=CONTAINER_NAME,
            partition_key=PartitionKey(path=_PARTITION_KEY_PATH),
        )
        self._users_container = self._db.create_container_if_not_exists(
            id=USERS_CONTAINER_NAME,
            partition_key=PartitionKey(path=_USERS_PARTITION_KEY_PATH),
        )
        self._telemetry_container = self._db.create_container_if_not_exists(
            id=TELEMETRY_CONTAINER_NAME,
            partition_key=PartitionKey(path=_TELEMETRY_PARTITION_KEY_PATH),
        )

    # ------------------------------------------------------------------
    # Telemetry documents  (Telemetry container, partition key: /event_type)
    # ------------------------------------------------------------------

    def insert_telemetry_event(
        self,
        *,
        session_id: str,
        event_type: str,
        metadata: dict | None = None,
        timestamp: str | None = None,
    ) -> dict:
        """Append a single telemetry event to the Telemetry container."""
        doc = {
            "id": f"{event_type}_{session_id}_{_now_iso()}",
            "event_type": event_type,
            "session_id": session_id,
            "metadata": metadata or {},
            "timestamp": timestamp or _now_iso(),
        }
        return self._telemetry_container.upsert_item(doc)

    def get_telemetry_stats(self) -> dict:
        """Return aggregated telemetry stats across all events."""
        spells_cast = 0
        correct_answers = 0
        total_answers = 0
        tycoon_purchases = 0

        for event_type in ("spell_cast", "tycoon_purchase"):
            try:
                rows = list(self._telemetry_container.query_items(
                    query="SELECT * FROM c WHERE c.event_type = @et",
                    parameters=[{"name": "@et", "value": event_type}],
                    enable_cross_partition_query=True,
                ))
            except Exception as exc:  # pragma: no cover
                logger.warning("[TELEMETRY] stats query failed for %s: %s", event_type, exc)
                rows = []

            if event_type == "spell_cast":
                spells_cast = len(rows)
                for row in rows:
                    meta = row.get("metadata") or {}
                    total_answers += 1
                    if meta.get("correct"):
                        correct_answers += 1
            elif event_type == "tycoon_purchase":
                tycoon_purchases = len(rows)

        accuracy_pct = round(correct_answers / total_answers * 100, 1) if total_answers else 0.0

        return {
            "spells_cast": spells_cast,
            "math_accuracy_pct": accuracy_pct,
            "total_answers": total_answers,
            "tycoon_purchases": tycoon_purchases,
        }

    # ------------------------------------------------------------------
    # Registered-user documents  (Users container, partition key: /id)
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
        """Create or update an authenticated user document in the Users container.

        If *password_hash* is an empty string the existing ``passwordHash`` field
        in Cosmos is left unchanged (safe for profile-only updates).
        """
        doc: dict[str, Any] = {
            "id": username,
            "type": "user",
            "username": username,
            "sessionId": session_id,
            "heroUnlocked": hero_unlocked,
            "tycoonCurrency": tycoon_currency,
            "updatedAt": _now_iso(),
        }
        # Only write passwordHash when a non-empty hash is supplied so that
        # profile-only updates cannot accidentally clear the stored hash.
        if password_hash:
            doc["passwordHash"] = password_hash
        if extra:
            doc.update(extra)
        result = self._users_container.upsert_item(doc)
        logger.info("[Cosmos] Upserted user username=%s", username)
        return result

    def get_user(self, username: str) -> dict | None:
        """Return the user document for *username*, or ``None`` if not found."""
        try:
            return self._users_container.read_item(item=username, partition_key=username)
        except cosmos_exceptions.CosmosResourceNotFoundError:
            return None

    # ------------------------------------------------------------------
    # Progress documents  (type = "progress")
    # ------------------------------------------------------------------

    def upsert_progress(
        self,
        user_id: str,
        current_level: str,
        score: int,
        visual_analogies_completed: list[str],
        extra: dict[str, Any] | None = None,
    ) -> dict:
        """Create or update a progress document for *user_id*.

        Parameters
        ----------
        user_id:
            Unique learner identifier (also the partition key).
        current_level:
            The level the student is currently on (e.g. ``"level_3"``).
        score:
            Cumulative score for the learner.
        visual_analogies_completed:
            List of analogy IDs the learner has finished.
        extra:
            Any additional fields to merge into the document.
        """
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

        result = self._container.upsert_item(doc)
        logger.info("[Cosmos] Upserted progress for userId=%s", user_id)
        return result

    # ------------------------------------------------------------------
    # Session documents  (type = "session")
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
        """Create or update a session document.

        Parameters
        ----------
        user_id:
            Learner's unique identifier (partition key).
        session_id:
            Unique identifier for this session (e.g. ``"sess_abc123"``).
        start_time:
            ISO-8601 timestamp when the session started.
        end_time:
            ISO-8601 timestamp when the session ended (``None`` while active).
        duration_seconds:
            Total session duration in seconds (``None`` while active).
        extra:
            Any additional fields to merge into the document.
        """
        doc: dict[str, Any] = {
            "id": f"session_{user_id}_{session_id}",
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

        result = self._container.upsert_item(doc)
        logger.info(
            "[Cosmos] Upserted session sessionId=%s for userId=%s",
            session_id,
            user_id,
        )
        return result

    # ------------------------------------------------------------------
    # Parent Command Center: fetch all documents for a userId
    # ------------------------------------------------------------------

    def get_all_for_user(self, user_id: str) -> list[dict]:
        """Return all documents (progress + sessions) for a learner.

        Used by the password-protected Parent Command Center to display a
        child's complete learning metrics.

        Parameters
        ----------
        user_id:
            The learner's unique identifier.

        Returns
        -------
        list[dict]
            All documents belonging to *user_id*, ordered by ``updatedAt``
            descending.
        """
        query = (
            "SELECT * FROM c WHERE c.userId = @userId "
            "ORDER BY c.updatedAt DESC"
        )
        params: list[dict] = [{"name": "@userId", "value": user_id}]

        items = list(
            self._container.query_items(
                query=query,
                parameters=params,
                partition_key=user_id,
            )
        )
        logger.info(
            "[Cosmos] Retrieved %d document(s) for userId=%s",
            len(items),
            user_id,
        )
        return items

    # ------------------------------------------------------------------
    # Convenience: fetch only progress or only sessions
    # ------------------------------------------------------------------

    def get_progress(self, user_id: str) -> dict | None:
        """Return the progress document for *user_id*, or ``None``."""
        try:
            return self._container.read_item(
                item=f"progress_{user_id}",
                partition_key=user_id,
            )
        except cosmos_exceptions.CosmosResourceNotFoundError:
            return None

    # ------------------------------------------------------------------
    # Milestone documents  (type = "progress", sub-typed by "conceptId")
    # ------------------------------------------------------------------

    def upsert_milestone(
        self,
        user_id: str,
        concept_id: str,
        game_type: str,
        timestamp: str,
    ) -> dict:
        """Record that *user_id* has mastered *concept_id* in *game_type*.

        Each (user, concept) pair maps to exactly one milestone document so
        repeated submissions are idempotent — the document is updated with the
        latest timestamp but the score is only incremented the *first* time a
        concept is mastered.

        Parameters
        ----------
        user_id:
            Unique learner identifier (partition key).
        concept_id:
            Opaque concept slug, e.g. ``"addition-intro"``.
        game_type:
            Which game produced this milestone, e.g. ``"tycoon"``.
        timestamp:
            ISO-8601 timestamp supplied by the client (stored as-is for
            auditability; server sets ``masteredAt`` from its own clock).

        Returns
        -------
        dict
            ``{"totalPoints": int}`` — the learner's cumulative points after
            this upsert, where each *unique* concept mastery contributes 1 point.
        """
        # ── 1. Upsert the per-concept milestone document ─────────────────────
        # id = milestone_{userId}_{conceptId} gives one doc per (user, concept)
        # so upsert is safe to call multiple times for the same milestone.
        milestone_doc: dict[str, Any] = {
            "id": f"milestone_{user_id}_{concept_id}",
            "type": "progress",
            "userId": user_id,
            "conceptId": concept_id,
            "gameType": game_type,
            "timestamp": timestamp,
            "masteredAt": _now_iso(),
        }
        try:
            self._container.upsert_item(milestone_doc)
        except Exception as exc:
            logger.error(
                "[Cosmos] Failed to upsert milestone conceptId=%s for userId=%s: %s",
                concept_id,
                user_id,
                exc,
            )
            raise
        logger.info(
            "[Cosmos] Upserted milestone conceptId=%s for userId=%s",
            concept_id,
            user_id,
        )

        # ── 2. Read the master progress document for this user ───────────────
        progress = self.get_progress(user_id)

        if progress is None:
            # First interaction — bootstrap the progress document.
            completed: list[str] = [concept_id]
            new_score = 1
            current_level = "level_1"
        else:
            completed = list(progress.get("visualAnalogiesCompleted") or [])
            current_level = progress.get("currentLevel", "level_1")
            if concept_id not in completed:
                # New concept mastered — increment score.
                completed = completed + [concept_id]
                new_score = int(progress.get("score", 0)) + 1
            else:
                # Already mastered — score unchanged.
                new_score = int(progress.get("score", 0))

        # ── 3. Write the updated master progress document ────────────────────
        self.upsert_progress(
            user_id=user_id,
            current_level=current_level,
            score=new_score,
            visual_analogies_completed=completed,
        )

        return {"totalPoints": new_score}

    def get_sessions(self, user_id: str) -> list[dict]:
        """Return all session documents for *user_id*."""
        query = (
            "SELECT * FROM c WHERE c.userId = @userId AND c.type = 'session' "
            "ORDER BY c.startTime DESC"
        )
        params: list[dict] = [{"name": "@userId", "value": user_id}]
        return list(
            self._container.query_items(
                query=query,
                parameters=params,
                partition_key=user_id,
            )
        )

    def close(self) -> None:
        """Close the underlying Cosmos DB client and release resources."""
        self._client.close()

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
    """Return the shared :class:`CosmosService` instance (thread-safe).

    Creates the instance on first call.  Raises ``RuntimeError`` if the
    required environment variables are missing.
    """
    global _service_instance
    if _service_instance is None:
        with _service_lock:
            if _service_instance is None:
                _service_instance = CosmosService()
    return _service_instance
