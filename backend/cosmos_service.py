"""Azure Cosmos DB data service for The Math Script.

The App Service connects with its user-assigned managed identity. No database
keys are read by this application. Containers use `/id` as the partition key,
so documents use stable, type-prefixed IDs and point reads stay inexpensive.
"""

from __future__ import annotations

import datetime
import hashlib
import logging
import os
import threading
from typing import Any

from azure.cosmos import CosmosClient, exceptions
from azure.identity import DefaultAzureCredential

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


class CosmosService:
    """Singleton-friendly Azure Cosmos DB for NoSQL repository."""

    def __init__(self) -> None:
        endpoint = os.environ.get("COSMOS_ENDPOINT", "").strip()
        database_name = os.environ.get("COSMOS_DATABASE_NAME", "mathscript").strip()
        if not endpoint:
            raise RuntimeError("COSMOS_ENDPOINT is not configured")
        try:
            self._credential = DefaultAzureCredential()
            self._client = CosmosClient(endpoint, credential=self._credential)
            self._database = self._client.get_database_client(database_name)
            self._users = self._database.get_container_client("users")
            self._auth_tokens = self._database.get_container_client("auth_tokens")
            self._promo_codes = self._database.get_container_client("promo_codes")
            self._game_data = self._database.get_container_client("game_data")
            # Fail early rather than creating sessions or codes that cannot persist.
            self._database.read()
        except Exception as exc:
            raise RuntimeError(f"Azure Cosmos DB is unavailable: {type(exc).__name__}") from exc

    @staticmethod
    def _user_id(username: str) -> str:
        return f"user:{username.lower()}"

    @staticmethod
    def _game_id(kind: str, value: str) -> str:
        return f"{kind}:{value}"

    @staticmethod
    def _read(container, item_id: str) -> dict | None:
        try:
            return container.read_item(item=item_id, partition_key=item_id)
        except exceptions.CosmosResourceNotFoundError:
            return None

    # ── Registered users and password resets ────────────────────────────────
    def get_user(self, username: str) -> dict | None:
        data = self._read(self._users, self._user_id(username))
        if not data:
            return None
        return {
            "username": data.get("username", username),
            "passwordHash": data.get("password_hash", ""),
            "sessionId": data.get("session_id", ""),
            "email": data.get("email", ""),
            "heroUnlocked": data.get("hero_unlocked"),
            "tycoonCurrency": data.get("tycoon_currency", 0),
            "resetToken": data.get("reset_token_hash"),
            "resetTokenExpiry": data.get("reset_token_expiry"),
            "emailVerified": bool(data.get("email_verified", False)),
        }

    def upsert_user(self, username: str, password_hash: str, session_id: str,
                    hero_unlocked: str | None = None, tycoon_currency: int = 0,
                    extra: dict[str, Any] | None = None) -> dict:
        item_id = self._user_id(username)
        existing = self._read(self._users, item_id) or {}
        now = _now_iso()
        document = {
            **existing,
            "id": item_id,
            "type": "user",
            "username": username,
            "password_hash": password_hash or existing.get("password_hash", ""),
            "session_id": session_id,
            "tycoon_currency": tycoon_currency,
            "created_at": existing.get("created_at", now),
            "updated_at": now,
        }
        if hero_unlocked is not None:
            document["hero_unlocked"] = hero_unlocked
        if extra:
            document.update(extra)
        self._users.upsert_item(document)
        return self.get_user(username) or {}

    def update_user_reset_token(self, username: str, token_hash: str | None,
                                expiry: str | None) -> None:
        item_id = self._user_id(username)
        document = self._read(self._users, item_id)
        if not document:
            raise ValueError("User not found")
        document["reset_token_hash"] = token_hash
        document["reset_token_expiry"] = expiry
        document["updated_at"] = _now_iso()
        self._users.replace_item(item=item_id, body=document, partition_key=item_id)

    # ── Promo code issuance ─────────────────────────────────────────────────
    def get_promo_claim(self, email: str) -> dict | None:
        claim_id = self._game_id("promo_claim", hashlib.sha256(email.encode("utf-8")).hexdigest())
        return self._read(self._promo_codes, claim_id)

    def create_promo_claim(self, email: str, code: str, grants_premium_days: int = 30) -> None:
        """Create one durable, single-use promo record per email.

        `create_item` supplies the uniqueness precondition, preventing duplicate
        delivery across concurrent App Service instances.
        """
        claim_id = self._game_id("promo_claim", hashlib.sha256(email.encode("utf-8")).hexdigest())
        self._promo_codes.create_item({
            "id": claim_id, "type": "promo_claim", "email": email, "code": code,
            "grants_premium_days": grants_premium_days, "active": True,
            "email_sent": False, "created_at": _now_iso(),
        })

    def mark_promo_email_sent(self, email: str) -> None:
        document = self.get_promo_claim(email)
        if not document:
            raise ValueError("Promo claim not found")
        document["email_sent"] = True
        document["email_sent_at"] = _now_iso()
        self._promo_codes.replace_item(
            item=document["id"], body=document, partition_key=document["id"]
        )

    def delete_promo_claim(self, email: str) -> None:
        document = self.get_promo_claim(email)
        if document:
            self._promo_codes.delete_item(item=document["id"], partition_key=document["id"])

    # ── Progress and Tycoon state ───────────────────────────────────────────
    def get_progress(self, user_id: str) -> dict | None:
        return self._read(self._game_data, self._game_id("progress", user_id))

    def upsert_progress(self, user_id: str, current_level: str, score: int,
                        visual_analogies_completed: list[str], extra: dict | None = None) -> dict:
        item_id = self._game_id("progress", user_id)
        document = {"id": item_id, "type": "progress", "userId": user_id,
                    "currentLevel": current_level, "score": score,
                    "visualAnalogiesCompleted": visual_analogies_completed,
                    "updatedAt": _now_iso(), **(extra or {})}
        self._game_data.upsert_item(document)
        return document

    def upsert_tycoon_state(self, session_id: str, state: dict[str, Any]) -> dict:
        item_id = self._game_id("tycoon", session_id)
        document = {"id": item_id, "type": "tycoon_state", "userId": session_id,
                    "gameState": state, "savedAt": _now_iso(), "updatedAt": _now_iso()}
        self._game_data.upsert_item(document)
        return document

    def get_tycoon_state(self, session_id: str) -> dict | None:
        data = self._read(self._game_data, self._game_id("tycoon", session_id))
        return data.get("gameState") if data else None

    def upsert_milestone(self, user_id: str, concept_id: str, game_type: str,
                         timestamp: str) -> dict:
        current = self.get_progress(user_id) or {}
        completed = list(current.get("visualAnalogiesCompleted") or [])
        if concept_id not in completed:
            completed.append(concept_id)
        return self.upsert_progress(user_id, current.get("currentLevel", "level_1"),
                                    len(completed), completed,
                                    {"lastConceptId": concept_id, "gameType": game_type,
                                     "timestamp": timestamp, "masteredAt": _now_iso()})

    # ── Telemetry ───────────────────────────────────────────────────────────
    def insert_telemetry_event(self, *, session_id: str, event_type: str,
                               metadata: dict | None = None, timestamp: str | None = None) -> dict:
        item_id = self._game_id("telemetry", f"{session_id}:{_now_iso()}")
        document = {"id": item_id, "type": "telemetry", "session_id": session_id,
                    "event_type": event_type, "metadata": metadata or {},
                    "timestamp": timestamp or _now_iso()}
        self._game_data.create_item(document)
        return document

    def get_telemetry_stats(self) -> dict:
        query = "SELECT c.event_type, c.metadata FROM c WHERE c.type = 'telemetry'"
        rows = list(self._game_data.query_items(query=query, enable_cross_partition_query=True))
        spells = [row for row in rows if row.get("event_type") == "spell_cast"]
        correct = sum(1 for row in spells if (row.get("metadata") or {}).get("correct"))
        return {"spells_cast": len(spells), "total_answers": len(spells),
                "math_accuracy_pct": round(correct / len(spells) * 100, 1) if spells else 0.0,
                "tycoon_purchases": sum(1 for row in rows if row.get("event_type") == "tycoon_purchase")}


_service_instance: CosmosService | None = None
_service_lock = threading.Lock()


def get_cosmos_service() -> CosmosService:
    global _service_instance
    if _service_instance is None:
        with _service_lock:
            if _service_instance is None:
                _service_instance = CosmosService()
    return _service_instance
