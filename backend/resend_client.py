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

              <!-- Hero emoji row — mirrors the app's hero selector -->
              <table align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 22px;">
                <tr>
                  <td style="padding:0 5px;text-align:center;">
                    <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#4f46e5);border:2px solid #7c3aed;font-size:26px;line-height:46px;text-align:center;">🧙</div>
                  </td>
                  <td style="padding:0 5px;text-align:center;">
                    <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#ea580c,#dc2626);border:2px solid #f97316;font-size:26px;line-height:46px;text-align:center;">🔥</div>
                  </td>
                  <td style="padding:0 5px;text-align:center;">
                    <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#00d4ff,#7c3aed);border:3px solid #00d4ff;font-size:32px;line-height:56px;text-align:center;box-shadow:0 0 16px rgba(0,212,255,0.5);">⚡</div>
                  </td>
                  <td style="padding:0 5px;text-align:center;">
                    <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#059669,#0891b2);border:2px solid #10b981;font-size:26px;line-height:46px;text-align:center;">🛡️</div>
                  </td>
                  <td style="padding:0 5px;text-align:center;">
                    <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#db2777);border:2px solid #a855f7;font-size:26px;line-height:46px;text-align:center;">🌙</div>
                  </td>
                </tr>
              </table>

              <!-- Main title — Orbitron font, gradient text matching the app exactly -->
              <h1 class="orbitron gradient-title" style="margin:0 0 6px;font-size:32px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:'Orbitron','Courier New',monospace;background:linear-gradient(90deg,#00d4ff 0%,#a78bfa 50%,#f472b6 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;color:#00d4ff;">THE MATH SCRIPT</h1>

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
