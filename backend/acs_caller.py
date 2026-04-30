"""
acs_caller.py — Rapid AI Consultants outbound AI calling module
---------------------------------------------------------------
Uses Azure Communication Services (ACS) Call Automation SDK to:
  1. Place an outbound call to a lead's phone number
  2. Play a Text-to-Speech consent prompt via the ACS media engine
  3. Recognise a spoken "yes" or "no" response
  4. POST a consent event to /api/ivr/consent (stored in PostgreSQL)
  5. Play a closing message and hang up

Required environment variables (set in Azure App Settings or Key Vault):
  ACS_CONNECTION_STRING  — from ACS resource → Keys blade
  ACS_PHONE_NUMBER       — your verified ACS toll-free number, e.g. +18335551234
  ACS_CALLBACK_BASE_URL  — public HTTPS base URL of this app, e.g. https://yourapp.azurewebsites.net

The call event webhook is handled by POST /api/acs/events in main.py.
"""

import os
import logging
import re

logger = logging.getLogger(__name__)

# ── Lazy ACS SDK import (not installed in local/dev if package is absent) ─────
try:
    from azure.communication.callautomation import (
        CallAutomationClient,
        CallConnectionProperties,
        PhoneNumberIdentifier,
        TextSource,
        RecognitionChoice,
        SsmlSource,
    )
    from azure.communication.callautomation.models import (
        RecognizeInputType,
    )
    ACS_SDK_AVAILABLE = True
except ImportError:
    ACS_SDK_AVAILABLE = False
    logger.warning(
        "[ACS] azure-communication-callautomation not installed. "
        "Run: pip install azure-communication-callautomation"
    )

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

LOCALE = "en-US"


def _client() -> "CallAutomationClient":
    conn_str = os.environ.get("ACS_CONNECTION_STRING", "")
    if not conn_str:
        raise RuntimeError("ACS_CONNECTION_STRING environment variable is not set")
    if not ACS_SDK_AVAILABLE:
        raise RuntimeError("azure-communication-callautomation package is not installed")
    return CallAutomationClient.from_connection_string(conn_str)


def _callback_url(call_id: str) -> str:
    """Build the per-call callback URL so ACS knows where to send events."""
    base = os.environ.get("ACS_CALLBACK_BASE_URL", "").rstrip("/")
    if not base:
        raise RuntimeError("ACS_CALLBACK_BASE_URL environment variable is not set")
    return f"{base}/api/acs/events?call_id={call_id}"


def place_outbound_call(target_phone: str, lead_id: str | None = None) -> dict:
    """
    Initiate an outbound call to `target_phone` (E.164 format).
    Returns {"call_connection_id": ..., "server_call_id": ...}

    ACS will immediately POST events to /api/acs/events as the call progresses.
    """
    caller_phone = os.environ.get("ACS_PHONE_NUMBER", "")
    if not caller_phone:
        raise RuntimeError("ACS_PHONE_NUMBER environment variable is not set")

    # Use lead_id (or a uuid) as a stable call identifier for the callback URL.
    import uuid
    call_id = lead_id or str(uuid.uuid4())

    client = _client()
    result = client.create_call(
        target_participant=PhoneNumberIdentifier(target_phone),
        callback_url=_callback_url(call_id),
        source_caller_id_number=PhoneNumberIdentifier(caller_phone),
    )
    logger.info(
        "[ACS] Outbound call placed to %s | server_call_id=%s",
        _mask(target_phone),
        result.call_connection_properties.server_call_id,
    )
    return {
        "call_connection_id": result.call_connection_properties.call_connection_id,
        "server_call_id": result.call_connection_properties.server_call_id,
        "call_id": call_id,
    }


def play_consent_prompt(call_connection_id: str) -> None:
    """Play the consent TTS prompt over the live call."""
    client = _client()
    conn = client.get_call_connection(call_connection_id)
    conn.play_media_to_all(
        play_source=TextSource(text=CONSENT_PROMPT, voice_name="en-US-JennyNeural"),
        operation_context="consent_prompt",
    )


def start_speech_recognition(call_connection_id: str) -> None:
    """
    After the prompt plays, start speech recognition so the caller can say
    'yes' or 'no'.  ACS fires RecognizeCompleted when it detects speech.
    """
    client = _client()
    conn = client.get_call_connection(call_connection_id)
    conn.start_recognizing_media(
        input_type=RecognizeInputType.SPEECH,
        target_participant=None,          # recognise from all participants
        speech_language=LOCALE,
        operation_context="consent_recognition",
        initial_silence_timeout=8,
        speech_recognition_model_endpoint_id=None,
        choices=[
            RecognitionChoice(label="yes", phrases=["yes", "yeah", "yep", "sure", "okay"]),
            RecognitionChoice(label="no",  phrases=["no", "nope", "nah", "don't"]),
        ],
    )


def play_closing_message(call_connection_id: str, consented: bool) -> None:
    """Play the appropriate closing TTS after the consent decision."""
    client = _client()
    conn = client.get_call_connection(call_connection_id)
    text = OPTED_IN_PROMPT if consented else OPTED_OUT_PROMPT
    conn.play_media_to_all(
        play_source=TextSource(text=text, voice_name="en-US-JennyNeural"),
        operation_context="closing_message",
    )


def hang_up(call_connection_id: str) -> None:
    """End the call."""
    try:
        client = _client()
        client.get_call_connection(call_connection_id).hang_up(is_for_everyone=True)
    except Exception as exc:
        logger.warning("[ACS] hang_up failed (call may have already ended): %s", exc)


def _mask(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    return f"***-***-{digits[-4:]}" if len(digits) >= 4 else "***"
