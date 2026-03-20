# The Math Script™: Ultimate Quest

A gamified math learning web app for kids — AI-powered story explanations, animated battles, coins, gear, and structured lesson paths.

---

## Architecture

| Layer | Technology | Port |
|---|---|---|
| Frontend | React 18 + Vite | 5173 (dev) / served by nginx in prod |
| Backend | Python FastAPI | 5000 |
| Database | PostgreSQL (SQLite fallback for local dev) | 5432 |

```
/
├── frontend/          ← React + Vite (canonical frontend)
│   └── src/
│       ├── pages/     ← Onboarding, Quest, Learn
│       └── components/
├── backend/           ← FastAPI backend
│   ├── main.py        ← App entry point + all routes
│   ├── config.py      ← Pydantic settings (reads .env)
│   ├── models.py      ← SQLAlchemy ORM models (educational tables)
│   ├── db_edu.py      ← SQLAlchemy engine / session factory
│   ├── database.py    ← psycopg2 helpers (users / usage / Stripe)
│   ├── api/
│   │   └── edu.py     ← /api/courses /api/lessons /api/steps routes
│   └── seed_edu.py    ← Seed starter course content
├── alembic/           ← Database migrations
├── alembic.ini
├── requirements.txt
└── deploy/            ← Oracle Cloud deployment configs (nginx, systemd, scripts)
```

---

## Local Development

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 16+ (optional — app falls back to in-memory SQLite if `DATABASE_URL` is not set)

### 1. Clone & configure environment

```bash
git clone https://github.com/Trelinder/Mathscript.git
cd Mathscript
cp .env.example .env
# Edit .env and fill in your values (at minimum set SESSION_SECRET)
```

### 2. Backend setup

```bash
# Create and activate a Python virtual environment
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# (Optional) Run database migrations — requires DATABASE_URL in .env
alembic upgrade head

# (Optional) Seed starter course content
python -m backend.seed_edu

# Start the backend
uvicorn backend.main:app --host 0.0.0.0 --port 5000 --reload
```

The API is now available at `http://localhost:5000`.  
Health check: `http://localhost:5000/api/health`

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The frontend is now available at `http://localhost:5173`.  
API calls are proxied to `http://localhost:5000` via Vite's dev proxy.

---

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SESSION_SECRET` | **Yes** | Random string ≥ 32 chars. Generate: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | Recommended | PostgreSQL URL, e.g. `postgresql://user:pass@localhost:5432/mathscript`. Falls back to in-memory SQLite if not set. |
| `GEMINI_API_KEY` | Optional | Google Gemini API key for AI story generation |
| `OPENAI_API_KEY` | Optional | OpenAI API key (fallback AI provider) |
| `ELEVENLABS_API_KEY` | Optional | ElevenLabs API key for text-to-speech |
| `STRIPE_SECRET_KEY` | Optional | Stripe secret key for subscriptions |
| `STRIPE_PUBLISHABLE_KEY` | Optional | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe webhook signing secret |
| `RESEND_API_KEY` | Optional | Resend API key for email notifications |

> **Note:** The app is fully functional for local development without any AI, Stripe, or email keys. Only `SESSION_SECRET` and optionally `DATABASE_URL` are needed.

---

## API Endpoints

### Existing endpoints
- `GET /api/health` — Health check
- `GET /api/session/{session_id}` — Session data
- `POST /api/session/profile` — Update player profile
- `POST /api/story` — Generate AI math story
- `GET /api/shop` — Shop inventory
- `GET /api/characters` — Available heroes

### Educational endpoints (new)
- `GET /api/courses` — List all courses
- `GET /api/courses/{id}` — Course detail with lessons
- `GET /api/lessons/{id}` — Lesson detail with steps
- `GET /api/steps/{id}` — Step detail
- `POST /api/steps/{id}/attempt` — Submit an answer (returns pass/fail + feedback + next step)
- `GET /api/me/progress?session_id=...` — Progress across all lessons

---

## Database Migrations (Alembic)

```bash
# Apply all pending migrations
alembic upgrade head

# Create a new migration after changing models.py
alembic revision --autogenerate -m "describe_your_change"

# Downgrade one step
alembic downgrade -1
```

---

## Oracle Cloud Deployment

See [`deploy/README.md`](deploy/README.md) for step-by-step Oracle Cloud deployment instructions.

Quick summary:
1. Copy files to VM (or `git pull`)
2. Copy `.env.example` → `.env` and fill in values
3. Run `./deploy.sh` — it builds the frontend, installs deps, runs migrations, and restarts the service
4. First-time only: install and enable the systemd service and configure nginx

---

## Development Workflow

```bash
# Check code style (frontend)
cd frontend && npm run lint

# Run backend in debug mode
uvicorn backend.main:app --reload --port 5000

# Build frontend for production
cd frontend && npm run build
# Output goes to frontend/dist/ — served by FastAPI static files in production
```

---

## Learning Loop Features

The app implements a structured educational flow:

1. **Course List** — Browse available math courses (Addition, Subtraction, Multiplication, …)
2. **Lesson View** — Choose a lesson within a course
3. **Step-by-step practice** — Each step has:
   - Clear instructions
   - The math problem
   - Input area (text or multiple-choice)
   - Instant feedback (pass/fail + explanation)
   - Progressive hints on wrong answers
   - XP rewards on correct answers
4. **Progress tracking** — Per-session progress persisted in the database
5. **AI-powered quests** — The existing Quest mode uses Gemini/OpenAI for story-based problems

---

## Contributing

1. Fork the repo and create a branch
2. Make changes following the patterns in existing files
3. Test locally with `npm run dev` + `uvicorn`
4. Open a pull request
