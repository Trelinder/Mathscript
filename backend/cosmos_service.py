"""
Azure Cosmos DB service for The Math Script.

Single-container pattern: both UserProgress and SessionData documents live in
the ``UserProgress`` container (partition key: /userId) and are differentiated
by a ``type`` field.

Required environment variables
-------------------------------
COSMOS_URI  – e.g. https://mathscript-db.documents.azure.com:443/
COSMOS_KEY  – primary or secondary read-write key for the account

Database  : MathScriptDB
Container : UserProgress  (partition key: /userId)
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
        self._db = self._client.get_database_client(DATABASE_NAME)
        self._container = self._db.get_container_client(CONTAINER_NAME)

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
