# The Math Script Security Hardening Runbook

This repo now includes application-layer protections, but high-traffic protection should also be enforced at the edge.

## 1) Cloudflare / Edge WAF Baseline

Enable these Cloudflare settings for `themathscript.com`:

1. **WAF Managed Rules**: ON (all OWASP + Cloudflare managed sets).
2. **Bot Management / Bot Fight Mode**: ON.
3. **DDoS Managed Protection**: ON for all zones.
4. **Rate Limiting Rules** (example):
   - `POST /api/story`: block/challenge above 30 requests / minute / IP
   - `POST /api/tts`: block/challenge above 20 requests / minute / IP
   - `POST /api/segment-image*`: block/challenge above 30 requests / minute / IP
5. **Country Access Rules**:
   - Use allowlist/denylist based on your business footprint.
   - Mirror app-level env vars:
     - `ALLOWED_COUNTRY_CODES`
     - `BLOCKED_COUNTRY_CODES`
6. **Threat Score Rule**:
   - Block requests with threat score >= configured threshold.
   - Mirror app env var: `CF_THREAT_BLOCK_SCORE`.

## 2) Application Security Environment Variables

Set these env vars in production:

- `SESSION_SECRET` (long random string, rotate quarterly)
- `SECURITY_ALERT_WEBHOOK_URL` (Slack/Discord/SIEM webhook)
- `SECURITY_ALERT_MIN_INTERVAL_SECONDS` (recommended: `90`)
- `CF_THREAT_BLOCK_SCORE` (recommended: `45`)
- `CF_BOT_SCORE_BLOCK` (recommended: `8`)
- `PARENT_PIN_MAX_FAILURES` (recommended: `6`)
- `PARENT_PIN_LOCK_SECONDS` (recommended: `900`)
- `ALLOWED_COUNTRY_CODES` (optional CSV, e.g. `US,CA,GB`)
- `BLOCKED_COUNTRY_CODES` (optional CSV)

## 3) Monitoring and Alerts

The backend emits webhook alerts for:

- suspicious activity strikes
- automatic IP blocks
- Cloudflare threat-based blocks
- heavy endpoint throttling
- parent PIN lock events

Route these webhook events into Slack, PagerDuty, or your SIEM.

## 4) Legal / IP Protection

Public legal routes are served by the app:

- `/terms`
- `/privacy`
- `/security`

These pages include anti-scraping and IP ownership language. Keep terms updated as product policies evolve.

## 5) Non-code Protections (Recommended)

- Register and enforce trademark for **The Math Script™**
- Add DMCA process and template takedown notice
- Disable source maps in production builds if not needed
- Keep dependencies updated and enable Dependabot/SCA scanning
- Rotate API keys and secrets on a fixed schedule
