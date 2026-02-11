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
- Hero selection (Wizard, Captain, Dino)
- AI-generated story explanations for math problems
- Gold coin reward system
- Item shop with purchasable gear
- Inventory system
- Parent Command Center with session history and PDF export

## Project Structure
- `main.py` - Single-file Streamlit application with all game logic

## Recent Changes
- 2026-02-11: Set up full "Ultimate Quest" game version with arcade theme, shop, inventory, onboarding, and parent dashboard. Connected to Gemini via Replit AI Integrations.
