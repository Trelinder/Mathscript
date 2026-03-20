"""
SQLAlchemy engine + session factory for the educational backbone.
Falls back gracefully when DATABASE_URL is not configured (uses SQLite in-memory
so that the app can still start and serve the API in local dev without Postgres).
"""
import os
import logging

from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker, Session
from contextlib import contextmanager

from backend.models import Base

logger = logging.getLogger(__name__)

_DB_URL_ENV = "DATABASE_URL"


def _get_db_url() -> str:
    url = os.environ.get(_DB_URL_ENV, "").strip()
    if not url:
        logger.warning(
            "DATABASE_URL not set — using in-memory SQLite for educational tables. "
            "Data will NOT persist between restarts."
        )
        return "sqlite://"
    # SQLAlchemy requires postgresql+psycopg2 scheme; convert plain postgres:// too
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    return url


_db_url = _get_db_url()

# For in-memory SQLite, use StaticPool so all sessions share the same connection
# (required for the tables created in init_edu_db() to be visible across sessions)
if _db_url == "sqlite://":
    engine = create_engine(
        _db_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    engine = create_engine(
        _db_url,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_edu_db() -> None:
    """Create all educational tables if they don't exist."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Educational DB tables initialised")
    except Exception as exc:
        logger.error("Failed to initialise educational DB tables: %s", exc)


@contextmanager
def get_db():
    """Yield a SQLAlchemy session, rolling back on error."""
    db: Session = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
