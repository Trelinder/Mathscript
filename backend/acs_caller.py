"""
acs_caller.py — Rapid AI Consultants outbound AI calling module
---------------------------------------------------------------
Uses the ACS Call Automation REST API directly via `requests`.
No azure-communication-callautomation SDK required.

Required environment variables:
  ACS_CONNECTION_STRING  — from ACS resource → Keys blade
  ACS_PHONE_NUMBER       — your verified ACS toll-free number e.g. +18665551234
  ACS_CALLBACK_BASE_URL  — public HTTPS base URL of this app
"""

import os
import re
import hmac
import uuid
import hashlib
import base64
import logging
import datetime
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

CONSENT_PROMPT = (
    "Hello! This is the Rapid AI Consultants AI assistant. "
    "We'd like to send you helpful information and follow-up messages by text. "
    "To confirm you agree to receive SMS messages from Rapid AI Consultants, please say yes. "
    "To decline, say no."
)
OPTED_IN_PROMPT = (
    "Thank you! You've been opted in to SMS updates from Rapid AI Consultants. "
    "You can reply STOP at any time to unsubscribe. Have a great day!"
)
OPTED_OUT_PROMPT = (
    "No problem. You will not receive SMS messages from us. "
    "Thank you for your time. Goodbye!"
)

ACS_API_VERSION = "2024-12-01"


# ── Connection string parsing ─────────────────────────────────────────────────

def _parse_connection_string() -> tuple[str, str]:
    """Return (endpoint_url, access_key) from ACS_CONNECTION_STRING."""
    conn = os.environ.get("ACS_CONNECTION_STRING", "")
    if not conn:
        raise RuntimeError("ACS_CONNECTION_STRING environment variable is not set")
    parts = dict(p.split("=", 1) for p in conn.split(";") if "=" in p)
    endpoint = parts.get("endpoint", "").rstrip("/")
    key = parts.get("accesskey", "")
    if not endpoint or not key:
        raise RuntimeError("ACS_CONNECTION_STRING is malformed (missing endpoint or accesskey)")
    return endpoint, key


# ── HMAC-SHA256 request signing (ACS shared key auth) ────────────────────────

def _sign_request(method: str, url: str, body: str, key_b64: str) -> dict:
    """Return signed headers for an ACS REST request."""
    parsed = urlparse(url)
    path_and_query = parsed.path + (f"?{parsed.query}" if parsed.query else "")
    now = datetime.datetime.utcnow().strftime("%a, %d %b %Y %H:%M:%S GMT")
    body_bytes = body.encode("utf-8")
    content_hash = base64.b64encode(hashlib.sha256(body_bytes).digest()).decode()
    string_to_sign = f"{method}\n{path_and_query}\n{now};{parsed.netloc};{content_hash}"
    key_bytes = base64.b64decode(key_b64)
    signature = base64.b64encode(
        hmac.new(key_bytes, string_to_sign.encode("utf-8"), hashlib.sha256).digest()
    ).decode()
    return {
        "x-ms-date": now,
        "x-ms-content-sha256": content_hash,
        "Authorization": f"HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature={signature}",
        "Content-Type": "application/json",
    }


def _post(path: str, payload: dict) -> dict:
    import json
    endpoint, key = _parse_connection_string()
    url = f"{endpoint}{path}?api-version={ACS_API_VERSION}"
    body = json.dumps(payload)
    headers = _sign_request("POST", url, body, key)
    resp = requests.post(url, data=body, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json() if resp.content else {}


# ── Public API ────────────────────────────────────────────────────────────────

def place_outbound_call(target_phone: str, lead_id: str | None = None) -> dict:
    """Place an outbound call. Returns call connection details."""
    caller_phone = os.environ.get("ACS_PHONE_NUMBER", "")
    if not caller_phone:
        raise RuntimeError("ACS_PHONE_NUMBER environment variable is not set")
    base_url = os.environ.get("ACS_CALLBACK_BASE_URL", "").rstrip("/")
    if not base_url:
        raise RuntimeError("ACS_CALLBACK_BASE_URL environment variable is not set")

    call_id = lead_id or str(uuid.uuid4())
    callback_url = f"{base_url}/api/acs/events?call_id={call_id}"

    payload = {
        "targets": [{"kind": "phoneNumber", "phoneNumber": {"value": target_phone}}],
        "sourceCallerIdNumber": {"value": caller_phone},
        "callbackUri": callback_url,
        "callIntelligenceOptions": {"cognitiveServicesEndpoint": None},
    }

    result = _post("/calling/callConnections", payload)
    logger.info("[ACS] Outbound call placed to %s | id=%s", _mask(target_phone), call_id)
    return {
        "call_connection_id": result.get("callConnectionId", ""),
        "server_call_id": result.get("serverCallId", ""),
        "call_id": call_id,
    }


def play_consent_prompt(call_connection_id: str) -> None:
    _post(f"/calling/callConnections/{call_connection_id}:playToAll", {
        "playSourceInfo": {
            "kind": "textSource",
            "textSource": {
                "text": CONSENT_PROMPT,
                "voiceName": "en-US-JennyNeural",
                "kind": "textSource",
            },
        },
        "operationContext": "consent_prompt",
    })


def start_speech_recognition(call_connection_id: str) -> None:
    _post(f"/calling/callConnections/{call_connection_id}:startRecognizing", {
        "recognizeInputType": "speech",
        "playPrompt": None,
        "operationContext": "consent_recognition",
        "speechOptions": {"interSilenceTimeoutInMs": 2000},
        "speechRecognitionModelEndpointId": None,
        "choices": [
            {"label": "yes", "phrases": ["yes", "yeah", "yep", "sure", "okay"]},
            {"label": "no",  "phrases": ["no", "nope", "nah"]},
        ],
        "targetParticipant": None,
    })


def play_closing_message(call_connection_id: str, consented: bool) -> None:
    text = OPTED_IN_PROMPT if consented else OPTED_OUT_PROMPT
    _post(f"/calling/callConnections/{call_connection_id}:playToAll", {
        "playSourceInfo": {
            "kind": "textSource",
            "textSource": {
                "text": text,
                "voiceName": "en-US-JennyNeural",
                "kind": "textSource",
            },
        },
        "operationContext": "closing_message",
    })


def hang_up(call_connection_id: str) -> None:
    import json
    try:
        endpoint, key = _parse_connection_string()
        url = f"{endpoint}/calling/callConnections/{call_connection_id}?api-version={ACS_API_VERSION}"
        headers = _sign_request("DELETE", url, "", key)
        requests.delete(url, headers=headers, timeout=10)
    except Exception as exc:
        logger.warning("[ACS] hang_up failed: %s", exc)


def _mask(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    return f"***-***-{digits[-4:]}" if len(digits) >= 4 else "***"

