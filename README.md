---
title: The Math Script
emoji: 📐
colorFrom: blue
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# The Math Script

A gamified math-learning app with a React + Vite frontend and a FastAPI backend,
powered by Google Gemini AI. Kids pick a hero character, enter a math problem,
and receive fun story-based explanations with animated scenes.

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 20+ |
| npm | 9+ |

## Local Development Setup

```bash
# 1. Clone the repo
git clone https://github.com/Trelinder/Mathscript.git
cd Mathscript

# 2. Run the one-time setup (creates .venv, installs deps, builds frontend)
bash setup.sh

# 3. Start the server
source .venv/bin/activate
PORT=7860 uvicorn backend.main:app --host 0.0.0.0 --port "${PORT}"
```

The app will be available at **http://localhost:7860**.

> **Note:** Several features (AI story generation, Stripe payments, email) require
> environment variables to be set. Copy `.env.example` or see the list below and
> export them before starting the server.

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Google Gemini API key |
| `OPENAI_API_KEY` | OpenAI API key (math solving) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `DATABASE_URL` | PostgreSQL connection string |
| `RESEND_API_KEY` | Resend email API key |
| `ELEVENLABS_API_KEY` | ElevenLabs TTS API key |
| `SESSION_SECRET` | HMAC secret for session signing |

## Running with Docker

```bash
docker build -t mathscript .
docker run -p 7860:7860 --env-file .env mathscript
```

## Deployment

This repository deploys to Azure Web App.
