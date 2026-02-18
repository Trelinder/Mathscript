# The Math Script: Ultimate Quest

## Overview
The Math Script: Ultimate Quest is a gamified math learning application designed to make math engaging for children. It features a React frontend and a FastAPI backend, leveraging Google Gemini AI for an interactive experience. Users select a hero character and input math problems, receiving story-based explanations enhanced with GSAP-powered character animations. The application incorporates a reward system where kids earn gold coins to purchase items from an in-app shop, fostering a fun and interactive learning environment. The project aims to gamify math education, making it an enjoyable "quest" for children, with potential for broad market adoption.

## User Preferences
I want iterative development.
Ask before making major changes.

## System Architecture
The application is built with a React frontend (using Vite and JavaScript) for dynamic user interfaces and GSAP for rich animations. The backend is powered by FastAPI (Python), which serves both the React build and handles API endpoints.

**UI/UX Decisions:**
- **Theme:** Modern gaming UI inspired by Fortnite/Valorant, replacing a pixelated Minecraft theme.
- **Color Scheme:** Dark navy/purple palette with cyan and purple accents.
- **Typography:** Orbitron for headings and Rajdhani for body text.
- **Elements:** Gradient text titles, glassmorphism panels, subtle borders.
- **Responsiveness:** Comprehensive mobile-responsive design with CSS media queries for screens under 600px, touch-optimized buttons, stacked layouts, and PWA meta tags.
- **Animations:** Extensive use of GSAP for character animations (entrance, floating, attack moves like punch/dash/smash/swing/spell, particle effects) and UI transitions.

**Technical Implementations:**
- **AI Integration:** OpenAI GPT-4.1 Nano for combined math solving and storytelling, and Gemini 2.0 Flash for generating story illustrations. ElevenLabs provides TTS narration, with a browser SpeechSynthesis fallback.
- **Mini-games:** Programmatically generated interactive mini-games include quick-time boss attacks, drag-and-drop puzzles, timed challenges, choice-based branching paths, puzzle connect (match pairs), and memory sequence games.
- **Reward System:** Gold coin economy for purchasing in-game items.
- **Subscription Model:** Implemented using Stripe for billing, offering a free tier (limited problems) and a premium tier (unlimited access) with a 3-day free trial.
- **User Management:** PostgreSQL database (Neon-backed) for user subscriptions, usage tracking, and session management.
- **Parent Dashboard:** Provides session history, usage analytics, and PDF export of progress reports using the `fpdf` library.

**Feature Specifications:**
- **Hero Selection:** Nine original heroes (Arcanos, Blaze, Shadow, Luna, Titan, Webweaver, Volt, Tempest, Zenith) with AI-generated portrait cards and unique GSAP animations.
- **Interactive Storytelling:** AI-generated story explanations split into segments, each accompanied by AI-generated images and optional voice narration.
- **Shop & Inventory:** An in-app shop with 20 items across 5 categories (weapons, armor, pets, potions, mounts), offering different rarity tiers and custom SVG icons. Users can equip items that provide active effects during mini-games.
- **RPG Battle System:** Side-view arena with hero vs. boss combat, featuring character-specific attack animations, particle effects, damage numbers, and critical hits.
- **Usage & Paywall:** Daily problem limits for free users with upgrade nudges and a paywall system.
- **Admin Tools:** A password-protected web dashboard (`/manage`) for managing promo codes and monitoring system health.
- **Security:** HMAC-signed session IDs, global IP rate limiting, Content-Security-Policy headers, input validation, and protection against common web vulnerabilities.

## External Dependencies
- **AI Services:** OpenAI (GPT-4.1 Nano), Google Gemini (2.0 Flash), ElevenLabs (for TTS narration).
- **Database:** PostgreSQL (via Neon).
- **Payment Processing:** Stripe (for subscriptions and billing).
- **PDF Generation:** `fpdf` Python library.
- **Animations:** GSAP (GreenSock Animation Platform).
- **Deployment:** Replit (hosting and connectors for Stripe, PostgreSQL).