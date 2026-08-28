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

## Isolated agent note

Run the agent only from the connected workspace. If the session lacks shell or
filesystem tools, Luna must respond with a brief access warning instead of
pretending to edit files.

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.14+ |
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
uvicorn backend.main:app --host 0.0.0.0 --port 7860
```

The app will be available at **http://localhost:7860**.

> **Note:** Several features (AI story generation, Stripe payments, email) require
> environment variables to be set. Copy `.env.example` or see the list below and
> export them before starting the server.

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Google Gemini API key |
| `AZURE_OPENAI_ENDPOINT` | Azure Foundry / Azure OpenAI endpoint |
| `AZURE_OPENAI_API_KEY` | Azure Foundry / Azure OpenAI API key |
| `AZURE_IMAGE_OPENAI_ENDPOINT` | Azure Foundry endpoint hosting the image deployment |
| `AZURE_IMAGE_OPENAI_API_KEY` | API key for the Azure image deployment endpoint |
| `AZURE_IMAGE_MODEL` | Azure image deployment name; defaults to `gpt-image-2` |
| `AZURE_TTS_OPENAI_ENDPOINT` | Azure Foundry endpoint hosting the TTS deployment |
| `AZURE_TTS_OPENAI_API_KEY` | API key for the Azure TTS deployment endpoint |
| `AZURE_TTS_MODEL` | Speech-capable Azure deployment name; defaults to `gpt-4o-mini-tts` |
| `AZURE_TTS_VOICE` | Azure TTS voice; defaults to `alloy` |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `DATABASE_URL` | PostgreSQL connection string |
| `RESEND_API_KEY` | Resend email API key |
| `SESSION_SECRET` | HMAC secret for session signing |

## Running with Docker

```bash
docker build -t mathscript .
docker run -p 7860:7860 --env-file .env mathscript
```

## Deployment

This repository deploys to Azure Web App.

## Azure Key Vault

The app now reads secrets from `KEY_VAULT_URL` when it starts. To upload
plaintext secrets from a local `.env` file into the Azure NEW vault, run:

```bash
bash scripts/upload_secrets_to_keyvault.sh .env
```

The script uploads the supported secret names into `mathscriptkeynew` by
default and does not print secret values.
