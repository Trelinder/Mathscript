# MathScript — AI Assistant Guide

> **Role**: This document is the briefing for any AI assistant (Cursor, Copilot, GPT, Claude) working on this codebase.
> Read this before making any changes. The `.cursorrules` file is the machine-readable version.

---

## What This App Does
**MathScript: Ultimate Quest** — A gamified math learning web app for kids.
Children pick a hero character, enter a math problem, and get an AI-generated story explanation with animated battle scenes. They earn coins, buy gear in a shop, and parents can view progress reports.

---

## Current State
| Layer | Technology | Status |
|---|---|---|
| Frontend | React 18 + Vite (JavaScript) | ✅ Working |
| Backend | Python FastAPI (port 5000) | ⚠️ Needs env vars set |
| Database | PostgreSQL | ⚠️ Falls back to memory if `DATABASE_URL` missing |
| Payments | Stripe | ⚠️ Needs manual keys (was auto-configured by Replit) |
| AI | Gemini + OpenAI + ElevenLabs | ⚠️ Needs API keys in .env |
| Hosting | Oracle Cloud VM | 🔄 Migration from Replit in progress |
| Backend v2 | Spring Boot 3.3 / Java 21 | 🔄 Scaffold ready in `spring-backend/` |

---

## Directory Map
```
/
├── .cursorrules                    ← Master AI supervisor config (Cursor reads this)
├── .cursor/rules/
│   ├── frontend-react.mdc          ← React/Vite rules
│   ├── backend-python.mdc          ← FastAPI Python rules
│   ├── oracle-deploy.mdc           ← Oracle Cloud deployment guide
│   └── spring-java-migration.mdc   ← Spring Boot migration roadmap
├── .env.example                    ← Template — copy to .env and fill in values
├── deploy.sh                       ← Deploy script (build frontend + check env + restart)
├── mathscript.service              ← Systemd service file for Oracle VM
├── nginx-mathscript.conf           ← Nginx reverse proxy config
├── requirements.txt                ← Python dependencies
├── build.sh                        ← Frontend build only
├── backend/
│   ├── main.py                     ← FastAPI app + all REST endpoints
│   ├── database.py                 ← PostgreSQL CRUD + in-memory fallback
│   ├── stripe_client.py            ← Stripe operations
│   ├── healthcheck.py              ← Background health monitor
│   ├── resend_client.py            ← Email notifications
│   └── seed_products.py            ← Stripe product seeder
├── frontend/
│   ├── vite.config.js              ← Vite config (proxy → localhost:5000)
│   └── src/
│       ├── App.jsx                 ← Root + routing state machine
│       ├── api/client.js           ← All API calls go here
│       ├── pages/
│       │   ├── Onboarding.jsx      ← Hero select + welcome
│       │   └── Quest.jsx           ← Main game loop
│       └── components/
│           ├── AnimatedScene.jsx   ← GSAP hero battle animations
│           ├── MiniGame.jsx        ← Interactive mini-games
│           ├── ShopPanel.jsx       ← Item shop UI
│           ├── ParentDashboard.jsx ← Parent view + PDF
│           └── SubscriptionPanel.jsx ← Stripe checkout UI
└── spring-backend/                 ← Java migration target
    ├── pom.xml
    └── src/main/java/com/mathscript/
        ├── MathscriptApplication.java
        ├── config/ (CorsConfig, SecurityConfig)
        ├── controller/ (HealthController + stubs)
        └── util/ (HmacUtil — HMAC session signing)
```

---

## First-Time Oracle VM Setup
1. SSH into the VM: `ssh -i ~/.ssh/key.pem opc@YOUR_IP`
2. Clone the repo: `git clone https://github.com/Trelinder/Mathscript.git`
3. Copy env template: `cp .env.example .env && nano .env`
4. Fill in all values in `.env`
5. Run deploy script (also configures SSH keepalive): `chmod +x deploy.sh && ./deploy.sh`
6. Install systemd service:
   ```bash
   sudo cp mathscript.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now mathscript
   ```
7. Set up nginx: `sudo cp nginx-mathscript.conf /etc/nginx/sites-available/mathscript`
8. Open Oracle Security List: allow TCP ingress on port 80, 443

---

## Common Error → Fix Map

| Error | Likely Cause | Fix |
|---|---|---|
| App blank (white screen) | Frontend not built | `cd frontend && npm run build` |
| `ModuleNotFoundError: backend` | Running from wrong directory | Run uvicorn from project **root** |
| `psycopg2.OperationalError` | DATABASE_URL missing | Set `DATABASE_URL` in `.env` |
| `500 on /api/story` | GEMINI_API_KEY / OPENAI_API_KEY missing | Check `.env`, restart backend |
| CORS error in browser | Origin not in allowed list | Update `allow_origins` in `backend/main.py` |
| Port refused | iptables + OCI Security List | Run iptables commands in `oracle-deploy.mdc` |
| SSH timeout | No keepalive | Already fixed in `~/.ssh/config` |
| Stripe 400 | Webhook secret changed | Update `STRIPE_WEBHOOK_SECRET` |

---

## How to Run Locally (Dev Mode)

**Terminal 1 — Backend:**
```bash
cd /workspaces/Mathscript
cp .env.example .env  # fill in your keys
source .env           # or use python-dotenv
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 5000 --reload
```

**Terminal 2 — Frontend:**
```bash
cd /workspaces/Mathscript/frontend
npm install
npm run dev   # starts Vite on port 5173, proxies /api → localhost:5000
```

---

## Spring Java Migration Progress

- [x] Phase 0: Scaffold created (`spring-backend/`)
- [x] pom.xml with all dependencies
- [x] application.yml reading from env vars
- [x] CorsConfig, SecurityConfig, HmacUtil
- [x] HealthController `/health`
- [ ] Phase 1: Characters + Session endpoints
- [ ] Phase 2: Database JPA entities
- [ ] Phase 3: Shop endpoints
- [ ] Phase 4: Stripe webhook controller  
- [ ] Phase 5: AI story/image (Gemini + OpenAI)
- [ ] Phase 6: PDF + TTS
- [ ] Phase 7: Switch nginx to port 8080

---

## Rules for AI Assistants

1. **Read before changing** — understand the existing code pattern before suggesting edits
2. **Minimal changes** — fix the bug, don't refactor unrelated code
3. **Never hardcode secrets** — always `os.environ.get()` (Python) or `@Value` (Java)
4. **Check env vars first** — most runtime errors are missing env vars, not code bugs
5. **Test API shape** — frontend depends on exact JSON field names from backend
6. **Security first** — validate all user input, verify Stripe webhooks, use HMAC sessions
7. **Ask about Oracle networking** — port must be open in BOTH iptables AND OCI Security List
