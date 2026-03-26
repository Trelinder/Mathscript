FROM node:20-bookworm-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

RUN pip install --no-cache-dir \
    "fastapi>=0.129.0" \
    "fpdf2>=2.7.0" \
    "google-genai>=1.62.0" \
    "httpx>=0.28.0" \
    "openai>=2.20.0" \
    "psycopg2-binary>=2.9.11" \
    "python-multipart>=0.0.22" \
    "requests>=2.32.0" \
    "resend>=2.23.0" \
    "stripe>=12.0.0" \
    "uvicorn>=0.40.0"

COPY backend ./backend
COPY main.py ./main.py
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY --from=frontend-build /app/frontend/public ./frontend/public

EXPOSE 7860

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860}"]