"""
Application configuration via Pydantic Settings.
Values are read from environment variables (or a .env file if present).
"""
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Database
    database_url: str = ""

    # Session security (must be set in production)
    session_secret: str = "fallback-dev-secret-change-me"

    # AI keys (all optional – app runs without them in local dev)
    gemini_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    elevenlabs_api_key: Optional[str] = None

    # Stripe (optional for local dev)
    stripe_secret_key: Optional[str] = None
    stripe_publishable_key: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None

    # Email (optional)
    resend_api_key: Optional[str] = None

    # Replit-specific (ignored outside Replit)
    replit_dev_domain: Optional[str] = None
    replit_domains: Optional[str] = None
    replit_deployment: Optional[str] = None


settings = Settings()
