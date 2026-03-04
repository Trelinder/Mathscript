import os
import io
import base64
import logging
import httpx

logger = logging.getLogger(__name__)

_IMAGES_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "images")


def _hero_b64(filename: str, size: int) -> str:
    try:
        from PIL import Image
        path = os.path.join(_IMAGES_DIR, filename)
        with Image.open(path) as img:
            img = img.convert("RGBA")
            img.thumbnail((size, size), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            data = base64.b64encode(buf.getvalue()).decode()
            return f"data:image/png;base64,{data}"
    except Exception as e:
        logger.warning(f"[RESEND] Could not encode hero image {filename}: {e}")
        return ""


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
    img_arcanos  = _hero_b64("hero-arcanos.png",  50)
    img_blaze    = _hero_b64("hero-blaze.png",    50)
    img_zenith   = _hero_b64("hero-zenith.png",   68)
    img_luna     = _hero_b64("hero-luna.png",     50)
    img_tempest  = _hero_b64("hero-tempest.png",  50)

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

              <!-- Hero image row — actual hero artwork from the app -->
              <table align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                <tr>
                  <!-- Arcanos -->
                  <td style="padding:0 4px;text-align:center;vertical-align:bottom;">
                    <div style="width:50px;height:50px;border-radius:50%;overflow:hidden;border:2px solid #a855f7;box-shadow:0 0 10px rgba(168,85,247,0.5);background:#1a0a2e;">
                      <img src="{img_arcanos}" width="50" height="50" alt="Arcanos" style="width:50px;height:50px;object-fit:cover;display:block;border-radius:50%;">
                    </div>
                  </td>
                  <!-- Blaze -->
                  <td style="padding:0 4px;text-align:center;vertical-align:bottom;">
                    <div style="width:50px;height:50px;border-radius:50%;overflow:hidden;border:2px solid #f97316;box-shadow:0 0 10px rgba(249,115,22,0.5);background:#2a0e00;">
                      <img src="{img_blaze}" width="50" height="50" alt="Blaze" style="width:50px;height:50px;object-fit:cover;display:block;border-radius:50%;">
                    </div>
                  </td>
                  <!-- Zenith — center hero, bigger + glowing -->
                  <td style="padding:0 6px;text-align:center;vertical-align:bottom;">
                    <div style="width:68px;height:68px;border-radius:50%;overflow:hidden;border:3px solid #f59e0b;box-shadow:0 0 20px rgba(245,158,11,0.6),0 0 40px rgba(245,158,11,0.2);background:#1a1000;">
                      <img src="{img_zenith}" width="68" height="68" alt="Zenith" style="width:68px;height:68px;object-fit:cover;display:block;border-radius:50%;">
                    </div>
                  </td>
                  <!-- Luna -->
                  <td style="padding:0 4px;text-align:center;vertical-align:bottom;">
                    <div style="width:50px;height:50px;border-radius:50%;overflow:hidden;border:2px solid #ec4899;box-shadow:0 0 10px rgba(236,72,153,0.5);background:#1a0010;">
                      <img src="{img_luna}" width="50" height="50" alt="Luna" style="width:50px;height:50px;object-fit:cover;display:block;border-radius:50%;">
                    </div>
                  </td>
                  <!-- Tempest -->
                  <td style="padding:0 4px;text-align:center;vertical-align:bottom;">
                    <div style="width:50px;height:50px;border-radius:50%;overflow:hidden;border:2px solid #3b82f6;box-shadow:0 0 10px rgba(59,130,246,0.5);background:#00102a;">
                      <img src="{img_tempest}" width="50" height="50" alt="Tempest" style="width:50px;height:50px;object-fit:cover;display:block;border-radius:50%;">
                    </div>
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
