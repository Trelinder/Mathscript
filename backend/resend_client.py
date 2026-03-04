import os
import logging

logger = logging.getLogger(__name__)

def send_promo_email(to_email: str, promo_code: str) -> bool:
    api_key = os.environ.get("RESEND_API_KEY", "")
    if not api_key:
        logger.error("[RESEND] RESEND_API_KEY is not set — cannot send email")
        return False

    try:
        import resend
        resend.api_key = api_key

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
            <td style="background:linear-gradient(135deg,#7c3aed,#00d4ff);padding:32px;text-align:center;">
              <div style="font-size:48px;margin-bottom:8px;">🧙‍♂️</div>
              <h1 style="margin:0;font-size:26px;color:#ffffff;font-weight:800;letter-spacing:1px;">The Math Script</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Ultimate Quest</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="margin:0 0 12px;color:#e8e8f0;font-size:20px;">Your free promo code is here! 🎉</h2>
              <p style="margin:0 0 28px;color:#a0aec0;font-size:15px;line-height:1.6;">
                Thanks for joining early! Use the code below to unlock <strong style="color:#00d4ff;">30 days of free premium access</strong> — 
                unlimited quests, all heroes, and the full adventure awaits.
              </p>
              <div style="background:#0a0e1a;border:2px dashed #7c3aed;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <p style="margin:0 0 8px;color:#a0aec0;font-size:12px;text-transform:uppercase;letter-spacing:2px;">Your promo code</p>
                <p style="margin:0;font-size:32px;font-weight:900;color:#00d4ff;letter-spacing:4px;font-family:monospace;">{promo_code}</p>
              </div>
              <p style="margin:0 0 16px;color:#a0aec0;font-size:14px;line-height:1.6;">
                <strong style="color:#e8e8f0;">How to use it:</strong><br>
                Open the app → start your adventure → tap the shop or subscription screen → enter your code to activate premium.
              </p>
              <div style="text-align:center;margin-top:32px;">
                <a href="https://mathscript.replit.app" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#00d4ff);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:16px;">Play Now →</a>
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

        params = {
            "from": "Math Quest <onboarding@resend.dev>",
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
