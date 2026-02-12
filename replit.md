# The Math Script: Ultimate Quest

## Overview
A gamified math learning app built with Streamlit and Google Gemini AI. Kids choose a hero character and enter math problems to receive fun, story-based explanations. They earn gold coins and can buy items in a shop.

## Architecture
- **Framework**: Streamlit (Python)
- **AI**: Google Gemini via Replit AI Integrations (gemini-2.5-flash)
- **PDF Generation**: fpdf library for parent progress reports
- **Port**: 5000

## Key Features
- Onboarding welcome screen
- Hero selection (Wizard, Goku, Ninja, Princess, Hulk, Spider-Man)
- AI-generated story explanations for math problems with animated hero scenes
- Animated hero scene: entrance animation, floating/bobbing, particle effects, typewriter text reveal
- AI-generated images for each story (gemini-2.5-flash-image)
- Gold coin reward system
- Item shop with purchasable gear
- Inventory system
- Parent Command Center with session history and PDF export
- YouTube video search links for each topic

## Project Structure
- `main.py` - Single-file Streamlit application with all game logic, uses `streamlit.components.v1.html()` for animated scenes

## Recent Changes
- 2026-02-12: Added animated hero scene with CSS/JS: hero entrance, floating animation, character-specific particle effects, typewriter story reveal. Uses unique IDs and JSON serialization for XSS safety.
- 2026-02-11: Set up full "Ultimate Quest" game version with arcade theme, shop, inventory, onboarding, and parent dashboard. Connected to Gemini via Replit AI Integrations.
