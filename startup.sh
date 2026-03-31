#!/bin/bash
# Startup script for Azure App Service (auto-detected by Oryx when the portal
# Startup Command field is empty).  Uses the PORT env var that Azure App Service
# for Linux sets automatically (default: 8000).
#
# --timeout-keep-alive 75: keeps persistent connections alive for 75 s so that
# Azure's load-balancer (idle timeout 4 min) and long-running AI requests
# (up to ~20 s) are handled without premature connection drops.
exec uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --timeout-keep-alive 75
