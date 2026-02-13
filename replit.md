# The Math Script: Ultimate Quest

## Overview
A gamified math learning app with React frontend and FastAPI backend, powered by Google Gemini AI. Kids choose a hero character and enter math problems to receive fun, story-based explanations with GSAP-powered character animations. They earn gold coins and can buy items in a shop.

## Architecture
- **Frontend**: React + Vite (JavaScript), GSAP for animations
- **Backend**: FastAPI (Python) serving React build + API endpoints
- **AI**: OpenAI o4-mini for math solving accuracy, Gemini 2.0 Flash for story illustrations, Google Gemini via Replit AI Integrations (gemini-2.5-flash for storytelling), ElevenLabs for TTS narration
- **Database**: PostgreSQL (Neon-backed via Replit) for user subscriptions and usage tracking
- **Payments**: Stripe (via Replit connector) for subscription billing
- **PDF Generation**: fpdf library for parent progress reports
- **Port**: 5000 (FastAPI serves both API and frontend)

## Key Features
- Onboarding welcome screen with animated particles
- Hero selection (Arcanos, Blaze, Shadow, Luna, Titan, Webweaver, Volt, Tempest) with AI-generated portrait card UI
- AI-generated story explanations with GSAP animated hero scenes
- Character-specific GSAP animations: entrance, floating, punch/dash/smash/swing/spell moves, particle effects, typewriter text reveal
- AI-generated images for each story (Gemini 2.0 Flash native image generation)
- Interactive mini-games between story segments: quick-time boss attacks, drag-and-drop puzzles, timed challenges, choice-based branching paths
- Bonus gold coin rewards for completing mini-games
- Stripe subscription model: free tier (6 problems/day) and premium (unlimited) with 3-day free trial
- Usage tracking with daily limits and paywall for free users
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
- `frontend/src/components/ShopPanel.jsx` - Item shop with 5 categories, SVG icons, equip system, rarity tiers, and effect badges
- `frontend/src/components/ParentDashboard.jsx` - Session history table and PDF download
- `frontend/src/components/MiniGame.jsx` - Interactive mini-games (quick-time, drag-drop, timed, choice) with GSAP animations
- `frontend/src/components/SubscriptionPanel.jsx` - Premium upgrade UI with Stripe checkout
- `frontend/src/api/client.js` - API client functions
- `backend/stripe_client.py` - Stripe client using Replit connector credentials
- `backend/database.py` - PostgreSQL database operations for subscriptions and usage tracking
- `backend/seed_products.py` - Script to seed Stripe products and prices
- `main.py` - Legacy Streamlit app (no longer in use)

## API Endpoints
- `GET /api/characters` - Get hero character data
- `GET /api/shop` - Get shop items
- `GET /api/session/{id}` - Get session state (coins, inventory, history)
- `POST /api/story` - Generate AI story explanation
- `POST /api/image` - Generate AI illustration
- `POST /api/segment-images-batch` - Generate all 4 story images concurrently
- `POST /api/tts` - Generate AI voice narration via ElevenLabs
- `POST /api/shop/buy` - Purchase shop item (gear or consumable potion)
- `POST /api/shop/equip` - Equip an owned item (one per category)
- `POST /api/shop/unequip` - Unequip an item
- `POST /api/shop/use-potion` - Use a consumable potion
- `GET /api/pdf/{id}` - Download PDF progress report
- `POST /api/bonus-coins` - Add bonus gold coins from mini-game rewards
- `GET /api/youtube/{query}` - Get YouTube search URL
- `GET /api/subscription/{id}` - Get subscription status and usage
- `GET /api/stripe/prices` - Get available subscription prices
- `GET /api/stripe/publishable-key` - Get Stripe publishable key
- `POST /api/stripe/create-checkout` - Create Stripe checkout session
- `POST /api/stripe/portal` - Create Stripe customer portal session
- `POST /api/stripe/webhook` - Handle Stripe webhook events

## Build & Deploy
- Build: `cd frontend && npm install && npm run build`
- Run: `uvicorn backend.main:app --host 0.0.0.0 --port 5000`
- Deployment: autoscale with build step

## Recent Changes
- 2026-02-13: Massive shop expansion — 20 items across 5 categories (weapons, armor, pets, potions, mounts) with 4 rarity tiers (common, rare, epic, legendary). Custom SVG icons for all items replacing emojis. Category tab navigation. Equip system (one item per category) with equip/unequip buttons. Consumable potions (buy multiples, stackable). Item effects actively applied in battle: ATK boost increases damage, DEF reduces incoming damage, GOLD bonus earns extra coins, TIME bonus extends timed challenges. Equipped stat badges shown during battle intro. Items range from 50-700 gold.
- 2026-02-13: Full RPG battle system overhaul — side-view arena with hero sprite vs animated boss SVG, atmospheric starfield background with ground plane. Hero-specific GSAP attack animations: dash-strike-return with per-character effects (Arcanos=spell, Blaze=fire, Shadow=slash, Luna=spell, Titan=impact, Webweaver=slash, Volt=lightning, Tempest=spell). Attack name labels, hit particle bursts, boss recoil, screen shake, damage numbers with critical hits. Boss counter-attacks with lunge animation and hero recoil. Idle floating animations for both combatants. Victory screen with hero portrait, floating particles, and bounce animation.
- 2026-02-13: Added interactive mini-games between story segments — quick-time boss attacks (pick correct answer to hit the boss), drag-and-drop equation puzzles, timed math challenges with countdown, and choice-based branching paths. Mini-games are AI-generated by Gemini based on the math problem. Bonus gold coins awarded for correct answers.
- 2026-02-13: Replaced trademarked characters (Spider-Man, Hulk, Goku, etc.) with 8 original heroes: Arcanos (sorcerer), Blaze (fire martial artist), Shadow (ninja), Luna (moon enchantress), Titan (stone giant), Webweaver (acrobatic web hero), Volt (electric hero), Tempest (storm warrior). New AI-generated portraits for all heroes.
- 2026-02-13: Updated free tier to 6 problems/day (from 3) and added 3-day free trial for premium subscriptions.
- 2026-02-13: Stripe subscription model — free tier (6 problems/day) and premium (unlimited). PostgreSQL database for user subscriptions and usage tracking. Stripe checkout, customer portal, webhook handling. Usage counter in header, upgrade button, pricing panel with monthly ($9.99) and yearly ($79.99) plans. Paywall when daily limit reached. 3-day free trial included.
- 2026-02-13: Switched image generation from DALL-E 3 to Gemini 2.0 Flash native image output for faster generation.
- 2026-02-13: Modern gaming UI overhaul — replaced pixelated Minecraft theme (Press Start 2P font) with contemporary Fortnite/Valorant-style design. New fonts: Orbitron (headings), Rajdhani (body). Gradient text titles, glassmorphism panels, subtle borders, dark navy/purple palette with cyan and purple accents. Updated all components: Onboarding, Quest, HeroCard, ShopPanel, ParentDashboard, AnimatedScene.
- 2026-02-12: Mobile-responsive design — comprehensive CSS media queries for screens under 600px. Touch-optimized buttons, stacked input layout, compact 4-column hero grid, safe-area padding, PWA meta tags, and mobile-web-app-capable headers for app store readiness.
- 2026-02-12: ElevenLabs AI voice narration — natural human-sounding voice reads each story segment aloud with toggle on/off control. Replaces browser speech synthesis.
- 2026-02-12: Batch image generation — all 4 story images now generate concurrently via ThreadPoolExecutor, cutting load time from ~7s to ~2-3s.
- 2026-02-12: Added Miles Morales and Storm as playable heroes (8 total). AI-generated character portraits on hero selection cards.
- 2026-02-12: Illustrated storybook experience — story split into 4 segments with AI-generated images per segment, progress bar, "Next Part" button, preloaded images, graceful fallback on image failure.
- 2026-02-12: Full rebuild from Streamlit to React + FastAPI architecture. Added GSAP animations for character-specific moves (punch, dash, smash, swing, spell, magic). Typewriter text reveal, particle system, floating hero animation.
- 2026-02-12: Added animated hero scene with CSS/JS in Streamlit (now replaced).
- 2026-02-11: Set up full "Ultimate Quest" game version with arcade theme, shop, inventory, onboarding, and parent dashboard.
