import os
import stripe
import requests
import logging

logger = logging.getLogger(__name__)

_stripe_credentials = None

def _get_repl_token():
    repl_identity = os.environ.get("REPL_IDENTITY")
    if repl_identity:
        return f"repl {repl_identity}"
    web_repl_renewal = os.environ.get("WEB_REPL_RENEWAL")
    if web_repl_renewal:
        return f"depl {web_repl_renewal}"
    return None

def get_stripe_credentials():
    global _stripe_credentials
    if _stripe_credentials:
        return _stripe_credentials

    hostname = os.environ.get("REPLIT_CONNECTORS_HOSTNAME", "connectors.replit.com")
    token = _get_repl_token()
    if not token:
        raise RuntimeError("No Replit token found for Stripe connection")

    is_production = os.environ.get("REPLIT_DEPLOYMENT") == "1"
    environment = "production" if is_production else "development"

    url = f"https://{hostname}/api/v2/connection"
    params = {
        "include_secrets": "true",
        "connector_names": "stripe",
        "environment": environment,
    }
    headers = {
        "Accept": "application/json",
        "X_REPLIT_TOKEN": token,
    }

    resp = requests.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    items = data.get("items", [])
    if not items:
        raise RuntimeError(f"No Stripe {environment} connection found")

    settings = items[0].get("settings", {})
    publishable = settings.get("publishable")
    secret = settings.get("secret")

    if not publishable or not secret:
        raise RuntimeError("Stripe keys not found in connection settings")

    _stripe_credentials = {
        "publishable_key": publishable,
        "secret_key": secret,
    }
    return _stripe_credentials

def get_stripe_client():
    creds = get_stripe_credentials()
    return stripe.StripeClient(creds["secret_key"])
