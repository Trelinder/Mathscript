import os
import logging
import httpx

logger = logging.getLogger(__name__)


def _app_base_url() -> str:
    explicit = os.environ.get("APP_BASE_URL", "").rstrip("/")
    if explicit:
        return explicit
    azure_host = os.environ.get("WEBSITE_HOSTNAME", "")
    if azure_host:
        return f"https://{azure_host}"
    domain = os.environ.get("REPLIT_DOMAINS", "").split(",")[0].strip()
    if domain:
        return f"https://{domain}"
    return ""


def _get_resend_credentials():
    override_from = os.environ.get("RESEND_FROM_EMAIL", "")

    # Primary: use environment variable (set directly or loaded from Azure Key Vault)
    api_key = os.environ.get("RESEND_API_KEY", "")
    if api_key:
        return api_key, override_from

    # Fallback: Replit Connectors (used when running on Replit)
    hostname = os.environ.get("REPLIT_CONNECTORS_HOSTNAME", "")
    repl_identity = os.environ.get("REPL_IDENTITY", "")
    web_repl_renewal = os.environ.get("WEB_REPL_RENEWAL", "")

    if repl_identity:
        token = f"repl {repl_identity}"
    elif web_repl_renewal:
        token = f"depl {web_repl_renewal}"
    else:
        token = None

    if hostname and token:
        try:
            resp = httpx.get(
                f"https://{hostname}/api/v2/connection?include_secrets=true&connector_names=resend",
                headers={"Accept": "application/json", "X-Replit-Token": token},
                timeout=5,
            )
            data = resp.json()
            item = (data.get("items") or [None])[0]
            if item and item.get("settings", {}).get("api_key"):
                connector_from = override_from or item["settings"].get("from_email", "")
                return item["settings"]["api_key"], connector_from
        except Exception as e:
            logger.warning(f"[RESEND] Could not fetch credentials from connector: {e}")

    return "", override_from


# Consumer-email domains that cannot be used as verified Resend senders.
_UNVERIFIABLE_DOMAINS = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"}


def _resolve_from_email(raw_from: str) -> str:
    """Normalize *raw_from* into a sendable "Display Name <addr>" string.

    If *raw_from* is absent or uses a consumer domain that cannot be verified
    as a Resend sender, falls back to ``onboarding@resend.dev`` (Resend's
    built-in test address) and emits a prominent warning — that test address
    can only deliver to the Resend account owner's email, so production
    delivery to arbitrary addresses will fail until ``RESEND_FROM_EMAIL`` is
    set to a verified custom-domain address (e.g. ``hello@themathscript.com``).
    """
    domain = raw_from.split("@")[-1].lower() if "@" in raw_from else ""
    if not raw_from or domain in _UNVERIFIABLE_DOMAINS:
        logger.warning(
            "[RESEND] RESEND_FROM_EMAIL is not set or uses an unverifiable consumer domain "
            "(%r). Falling back to onboarding@resend.dev — this address can ONLY deliver "
            "to the Resend account owner's email; all other recipients will be rejected by "
            "Resend. Set RESEND_FROM_EMAIL to a verified custom-domain address "
            "(e.g. hello@themathscript.com) to enable delivery to arbitrary addresses.",
            raw_from or "<not set>",
        )
        raw_from = "onboarding@resend.dev"
    if "<" not in raw_from:
        raw_from = f"Math Quest <{raw_from}>"
    return raw_from


def send_promo_email(to_email: str, promo_code: str) -> bool:
    base = _app_base_url()
    img_arcanos = f"{base}/images/email/hero-arcanos.png"
    img_blaze   = f"{base}/images/email/hero-blaze.png"
    img_zenith  = f"{base}/images/email/hero-zenith.png"
    img_luna    = f"{base}/images/email/hero-luna.png"
    img_tempest = f"{base}/images/email/hero-tempest.png"

    api_key, from_email = _get_resend_credentials()

    if not api_key:
        logger.error("[RESEND] No API key available — cannot send email")
        return False

    from_email = _resolve_from_email(from_email)

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Math Quest Promo Code</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    .orbitron {{ font-family: 'Orbitron', 'Courier New', monospace; }}
    .gradient-title {{
      background: linear-gradient(90deg, #00d4ff 0%, #a78bfa 50%, #f472b6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      color: #00d4ff;
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Inter',Arial,sans-serif;color:#e8e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#12172a;border-radius:16px;border:1px solid #1e2a4a;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(180deg,#0a0e1a 0%,#0f1628 60%,#12172a 100%);padding:36px 24px 28px;text-align:center;border-bottom:1px solid #1e2a4a;">

              <!-- Hero image row — actual hero artwork from the app -->
              <table align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <!-- Arcanos -->
                  <td style="padding:0 5px;text-align:center;vertical-align:middle;">
                    <div style="display:inline-block;border-radius:50%;border:2px solid #a855f7;box-shadow:0 0 14px rgba(168,85,247,0.7);">
                      <img src="{img_arcanos}" width="80" height="80" alt="" style="display:block;width:80px;height:80px;border-radius:50%;">
                    </div>
                  </td>
                  <!-- Blaze -->
                  <td style="padding:0 5px;text-align:center;vertical-align:middle;">
                    <div style="display:inline-block;border-radius:50%;border:2px solid #f97316;box-shadow:0 0 14px rgba(249,115,22,0.7);">
                      <img src="{img_blaze}" width="80" height="80" alt="" style="display:block;width:80px;height:80px;border-radius:50%;">
                    </div>
                  </td>
                  <!-- Zenith — center hero, bigger + glowing -->
                  <td style="padding:0 8px;text-align:center;vertical-align:middle;">
                    <div style="display:inline-block;border-radius:50%;border:3px solid #f59e0b;box-shadow:0 0 28px rgba(245,158,11,0.8),0 0 56px rgba(245,158,11,0.3);">
                      <img src="{img_zenith}" width="100" height="100" alt="" style="display:block;width:100px;height:100px;border-radius:50%;">
                    </div>
                  </td>
                  <!-- Luna -->
                  <td style="padding:0 5px;text-align:center;vertical-align:middle;">
                    <div style="display:inline-block;border-radius:50%;border:2px solid #ec4899;box-shadow:0 0 14px rgba(236,72,153,0.7);">
                      <img src="{img_luna}" width="80" height="80" alt="" style="display:block;width:80px;height:80px;border-radius:50%;">
                    </div>
                  </td>
                  <!-- Tempest -->
                  <td style="padding:0 5px;text-align:center;vertical-align:middle;">
                    <div style="display:inline-block;border-radius:50%;border:2px solid #3b82f6;box-shadow:0 0 14px rgba(59,130,246,0.7);">
                      <img src="{img_tempest}" width="80" height="80" alt="" style="display:block;width:80px;height:80px;border-radius:50%;">
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Main title — Orbitron font, gradient text matching the app exactly -->
              <h1 class="orbitron gradient-title" style="margin:0 0 6px;font-size:26px;font-weight:900;letter-spacing:3px;text-transform:uppercase;white-space:nowrap;font-family:'Orbitron','Courier New',monospace;background:linear-gradient(90deg,#00d4ff 0%,#a78bfa 50%,#f472b6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:#00d4ff;">THE MATH SCRIPT</h1>

              <!-- Subtitle — matches the app's "ULTIMATE QUEST" caption -->
              <p class="orbitron" style="margin:0 0 18px;font-size:12px;font-weight:700;letter-spacing:6px;color:#67e8f9;text-transform:uppercase;font-family:'Orbitron','Courier New',monospace;">ULTIMATE QUEST</p>

              <!-- Divider line matching the app's section separators -->
              <table align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#7c3aed);"></td>
                  <td style="width:8px;height:8px;background:#00d4ff;border-radius:50%;margin:0 8px;vertical-align:middle;padding:0 8px;">
                    <div style="width:6px;height:6px;background:#00d4ff;border-radius:50%;"></div>
                  </td>
                  <td style="width:60px;height:1px;background:linear-gradient(90deg,#7c3aed,transparent);"></td>
                </tr>
              </table>

            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="margin:0 0 12px;color:#e8e8f0;font-size:20px;">Your free promo code is here! 🎉</h2>
              <p style="margin:0 0 28px;color:#a0aec0;font-size:15px;line-height:1.6;">
                Thanks for joining early! Use the code below to unlock
                <strong style="color:#00d4ff;">30 days of free premium access</strong> —
                unlimited quests, all heroes, and the full adventure awaits.
              </p>
              <div style="background:#0a0e1a;border:2px dashed #7c3aed;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 8px;color:#a0aec0;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Your promo code</p>
                <p style="margin:0;font-size:32px;font-weight:900;color:#00d4ff;letter-spacing:4px;font-family:monospace;">{promo_code}</p>
              </div>
              <p style="margin:0 0 16px;color:#a0aec0;font-size:14px;line-height:1.6;">
                <strong style="color:#e8e8f0;">How to use it:</strong><br>
                Open the app &rarr; start your adventure &rarr; tap the shop or subscription screen &rarr; enter your code to activate premium.
              </p>
              <div style="text-align:center;margin-top:32px;">
                <a href="{base}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#00d4ff);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:16px;">Play Now &rarr;</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #1e2a4a;text-align:center;">
              <p style="margin:0;color:#4a5568;font-size:12px;">
                You received this because you requested an early-access promo code.<br>
                Questions? Reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    try:
        import resend
        resend.api_key = api_key

        params = {
            "from": from_email,
            "to": [to_email],
            "reply_to": [os.environ.get("OWNER_EMAIL", "mrlinder@themathscript.com")],
            "subject": "🎉 Your free Math Quest promo code is inside!",
            "html": html_body,
        }

        response = resend.Emails.send(params)
        rid = response.get('id') if isinstance(response, dict) else getattr(response, 'id', None)
        logger.info(f"[RESEND] Email sent to {to_email}, id={rid}")
        return True

    except Exception as e:
        logger.error(f"[RESEND] Failed to send email to {to_email}: {type(e).__name__}: {e}")
        return False


def send_contact_email(name: str, user_email: str, message: str) -> bool:
    api_key, from_email = _get_resend_credentials()

    if not api_key:
        logger.error("[RESEND] No API key — cannot send contact email")
        return False

    from_email = _resolve_from_email(from_email)

    import datetime
    timestamp = datetime.datetime.utcnow().strftime("%B %d, %Y at %H:%M UTC")
    safe_message = message.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    html_body = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>New Contact Message</title></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#12172a;border-radius:16px;border:1px solid #1e2a4a;overflow:hidden;">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#00d4ff);padding:24px 32px;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:3px;color:rgba(255,255,255,0.8);text-transform:uppercase;">The Math Script</p>
            <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#ffffff;">New Contact Message</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0 0 16px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;color:#7c3aed;text-transform:uppercase;">From</p>
                  <p style="margin:0;font-size:16px;font-weight:600;color:#e8e8f0;">{name}</p>
                  <p style="margin:2px 0 0;font-size:14px;color:#00d4ff;">{user_email}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 0;border-top:1px solid #1e2a4a;border-bottom:1px solid #1e2a4a;">
                  <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:2px;color:#7c3aed;text-transform:uppercase;">Message</p>
                  <p style="margin:0;font-size:15px;color:#e8e8f0;line-height:1.7;white-space:pre-wrap;">{safe_message}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 0 0;">
                  <p style="margin:0;font-size:12px;color:#4a5568;">Received {timestamp}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    try:
        import resend
        resend.api_key = api_key
        params = {
            "from": from_email,
            "to": [os.environ.get("OWNER_EMAIL", "mrlinder@themathscript.com")],
            "reply_to": [user_email],
            "subject": f"💬 New message from {name} via Math Quest",
            "html": html_body,
        }
        response = resend.Emails.send(params)
        rid = response.get('id') if isinstance(response, dict) else getattr(response, 'id', None)
        logger.info(f"[RESEND] Contact email sent from {user_email}, id={rid}")
        return True
    except Exception as e:
        logger.error(f"[RESEND] Failed to send contact email: {type(e).__name__}: {e}")
        return False


def send_password_reset_email(to_email: str, username: str, reset_url: str) -> bool:
    """Send a password-reset link to *to_email*.

    Returns True if the email was dispatched successfully, False otherwise.
    """
    api_key, from_email = _get_resend_credentials()

    if not api_key:
        logger.error("[RESEND] No API key available — cannot send password reset email")
        return False

    from_email = _resolve_from_email(from_email)

    html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password — The Math Script</title>
</head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Inter',Arial,sans-serif;color:#e8e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#12172a;border-radius:16px;border:1px solid #1e2a4a;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #1e2a4a;">
              <h1 style="margin:0 0 6px;font-family:'Courier New',monospace;font-size:22px;font-weight:900;letter-spacing:3px;color:#00c8ff;text-transform:uppercase;">THE MATH SCRIPT</h1>
              <p style="margin:0;font-size:12px;letter-spacing:4px;color:#4b8fa8;text-transform:uppercase;">Password Reset</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;color:#e8e8f0;">Hi <strong style="color:#00c8ff;">{username}</strong>,</p>
              <p style="margin:0 0 24px;font-size:14px;color:#a0aec0;line-height:1.6;">
                We received a request to reset your password. Click the button below to choose a new password.
                This link expires in <strong style="color:#e8e8f0;">1 hour</strong>.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="{reset_url}" style="display:inline-block;background:linear-gradient(135deg,#0099cc 0%,#00c8ff 100%);color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:1px;">RESET PASSWORD</a>
              </div>
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:12px;color:#4b8fa8;word-break:break-all;">{reset_url}</p>
              <p style="margin:0;font-size:13px;color:#6b7280;">
                If you didn't request a password reset, you can safely ignore this email. Your password won't change.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #1e2a4a;text-align:center;">
              <p style="margin:0;font-size:12px;color:#4a5568;">© The Math Script</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    try:
        import resend
        resend.api_key = api_key
        params = {
            "from": from_email,
            "to": [to_email],
            "subject": "🔐 Reset your Math Script password",
            "html": html_body,
        }
        response = resend.Emails.send(params)
        rid = response.get('id') if isinstance(response, dict) else getattr(response, 'id', None)
        logger.info(f"[RESEND] Password reset email sent to {to_email}, id={rid}")
        return True
    except Exception as e:
        logger.error(f"[RESEND] Failed to send password reset email: {type(e).__name__}: {e}")
        return False
