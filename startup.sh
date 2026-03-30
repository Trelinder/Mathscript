#!/bin/bash
# Startup script for Azure App Service (auto-detected by Oryx when the portal
# Startup Command field is empty).  Uses the PORT env var that Azure App Service
# for Linux sets automatically (default: 8000).
exec uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}"
