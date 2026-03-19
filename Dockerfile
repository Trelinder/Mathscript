# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

# Install dependencies first (better layer caching)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --silent

# Copy source and build
COPY frontend/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Build the final runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Install system dependencies required by psycopg2 and other packages
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq-dev \
        gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
        fastapi>=0.129.0 \
        "fpdf2>=2.7.0" \
        "google-genai>=1.62.0" \
        "httpx>=0.28.0" \
        "openai>=2.20.0" \
        "psycopg2-binary>=2.9.11" \
        "python-multipart>=0.0.22" \
        "resend>=2.23.0" \
        "stripe>=12.0.0" \
        "uvicorn>=0.40.0" \
        "requests>=2.31.0"

# Copy application source
COPY backend/ ./backend/
COPY main.py ./

# Copy the built frontend assets from the previous stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy public assets needed at runtime (hero images, etc.)
COPY frontend/public ./frontend/public

# Expose application port
EXPOSE 5000

# Health check — polls the dedicated health endpoint every 30 seconds
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/health')" || exit 1

# Default command
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "5000", "--workers", "2", "--log-level", "warning"]
