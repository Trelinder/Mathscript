import os
import logging
import httpx

logger = logging.getLogger(__name__)


def _get_resend_credentials():
    override_from = os.environ.get("RESEND_FROM_EMAIL", "")

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

    api_key = os.environ.get("RESEND_API_KEY", "")
    return api_key, override_from


def send_promo_email(to_email: str, promo_code: str) -> bool:
    api_key, from_email = _get_resend_credentials()

    if not api_key:
        logger.error("[RESEND] No API key available — cannot send email")
        return False

    UNVERIFIABLE_DOMAINS = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"}
    raw_domain = from_email.split("@")[-1].lower() if "@" in from_email else ""
    if not from_email or raw_domain in UNVERIFIABLE_DOMAINS:
        from_email = "onboarding@resend.dev"
    if "<" not in from_email:
        from_email = f"Math Quest <{from_email}>"

    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Math Quest Promo Code</title>
</head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:'Inter',Arial,sans-serif;color:#e8e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#12172a;border-radius:16px;border:1px solid #1e2a4a;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(160deg,#0d0221 0%,#1a0533 30%,#0e1a4a 65%,#001233 100%);padding:0;text-align:center;position:relative;">
              <!-- Top star row -->
              <div style="padding:24px 24px 0;font-size:13px;letter-spacing:8px;color:rgba(255,255,255,0.25);">&#10022; &#10022; &#10022; &#10022; &#10022; &#10022; &#10022;</div>

              <!-- Glowing hero badge -->
              <div style="margin:18px auto 14px;width:90px;height:90px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#00d4ff);display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px rgba(124,58,237,0.3),0 0 40px rgba(0,212,255,0.35);font-size:46px;line-height:90px;">🧙&#8205;♂️</div>

              <!-- Sparkle row -->
              <div style="font-size:14px;color:rgba(0,212,255,0.5);letter-spacing:4px;">&#10024; &#10024; &#10024;</div>

              <!-- Title -->
              <h1 style="margin:12px 0 4px;font-size:28px;font-weight:900;letter-spacing:2px;color:#ffffff;text-shadow:0 0 24px rgba(124,58,237,0.8),0 0 8px rgba(0,212,255,0.6);">THE MATH SCRIPT</h1>

              <!-- Subtitle with gradient bar -->
              <div style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#00d4ff);border-radius:20px;padding:4px 18px;margin:4px 0 8px;">
                <p style="margin:0;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Ultimate Quest</p>
              </div>

              <!-- Early access badge -->
              <div style="margin:10px auto 20px;display:inline-block;border:1px solid rgba(0,212,255,0.4);border-radius:6px;padding:5px 16px;background:rgba(0,212,255,0.08);">
                <p style="margin:0;color:#00d4ff;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">&#9733; Early Access Reward &#9733;</p>
              </div>
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
                <a href="https://mathscript.replit.app" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#00d4ff);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:16px;">Play Now &rarr;</a>
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
            "subject": "🎉 Your free Math Quest promo code is inside!",
            "html": html_body,
        }

        response = resend.Emails.send(params)
        logger.info(f"[RESEND] Email sent to {to_email}, id={response.get('id')}")
        return True

    except Exception as e:
        logger.error(f"[RESEND] Failed to send email to {to_email}: {e}")
        return False
