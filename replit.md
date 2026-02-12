# The Math Script: Ultimate Quest

## Overview
A gamified math learning app with React frontend and FastAPI backend, powered by Google Gemini AI. Kids choose a hero character and enter math problems to receive fun, story-based explanations with GSAP-powered character animations. They earn gold coins and can buy items in a shop.

## Architecture
- **Frontend**: React + Vite (JavaScript), GSAP for animations
- **Backend**: FastAPI (Python) serving React build + API endpoints
- **AI**: Google Gemini via Replit AI Integrations (gemini-2.5-flash for text, gemini-2.5-flash-image for images), ElevenLabs for TTS narration
- **PDF Generation**: fpdf library for parent progress reports
- **Port**: 5000 (FastAPI serves both API and frontend)

## Key Features
- Onboarding welcome screen with animated particles
- Hero selection (Wizard, Goku, Ninja, Princess, Hulk, Spider-Man, Miles Morales, Storm) with AI-generated portrait card UI
- AI-generated story explanations with GSAP animated hero scenes
- Character-specific GSAP animations: entrance, floating, punch/dash/smash/swing/spell moves, particle effects, typewriter text reveal
- AI-generated images for each story (gemini-2.5-flash-image)
- Gold coin reward system
- Item shop with purchasable gear (6 items)
- Inventory system shown in header
- Parent Command Center with session history table and PDF export
- YouTube video search links for each math topic
- ElevenLabs AI voice narration for story segments with on/off toggle
- Batch image generation endpoint for concurrent 4-image loading

## Project Structure
- `backend/main.py` - FastAPI app with API endpoints, Gemini client, session storage, PDF generation
- `frontend/src/App.jsx` - Root component with screen routing and session management
- `frontend/src/pages/Onboarding.jsx` - Welcome screen with GSAP particle animations
- `frontend/src/pages/Quest.jsx` - Main quest page with hero selection, input, story display, shop/parent toggles
- `frontend/src/components/AnimatedScene.jsx` - GSAP-powered animated story scene with hero moves and typewriter
- `frontend/src/components/HeroCard.jsx` - Hero selection card with hover effects
- `frontend/src/components/ShopPanel.jsx` - Item shop with buy functionality
- `frontend/src/components/ParentDashboard.jsx` - Session history table and PDF download
- `frontend/src/api/client.js` - API client functions
- `main.py` - Legacy Streamlit app (no longer in use)

## API Endpoints
- `GET /api/characters` - Get hero character data
- `GET /api/shop` - Get shop items
- `GET /api/session/{id}` - Get session state (coins, inventory, history)
- `POST /api/story` - Generate AI story explanation
- `POST /api/image` - Generate AI illustration
- `POST /api/segment-images-batch` - Generate all 4 story images concurrently
- `POST /api/tts` - Generate AI voice narration via ElevenLabs
- `POST /api/shop/buy` - Purchase shop item
- `GET /api/pdf/{id}` - Download PDF progress report
- `GET /api/youtube/{query}` - Get YouTube search URL

## Build & Deploy
- Build: `cd frontend && npm install && npm run build`
- Run: `uvicorn backend.main:app --host 0.0.0.0 --port 5000`
- Deployment: autoscale with build step

## Recent Changes
- 2026-02-12: ElevenLabs AI voice narration — natural human-sounding voice reads each story segment aloud with toggle on/off control. Replaces browser speech synthesis.
- 2026-02-12: Batch image generation — all 4 story images now generate concurrently via ThreadPoolExecutor, cutting load time from ~7s to ~2-3s.
- 2026-02-12: Added Miles Morales and Storm as playable heroes (8 total). AI-generated character portraits on hero selection cards.
- 2026-02-12: Illustrated storybook experience — story split into 4 segments with AI-generated images per segment, progress bar, "Next Part" button, preloaded images, graceful fallback on image failure.
- 2026-02-12: Full rebuild from Streamlit to React + FastAPI architecture. Added GSAP animations for character-specific moves (punch, dash, smash, swing, spell, magic). Typewriter text reveal, particle system, floating hero animation.
- 2026-02-12: Added animated hero scene with CSS/JS in Streamlit (now replaced).
- 2026-02-11: Set up full "Ultimate Quest" game version with arcade theme, shop, inventory, onboarding, and parent dashboard.
