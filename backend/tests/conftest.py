"""
Shared pytest fixtures and environment setup for backend unit tests.

Sets minimal environment variables so that main.py can be imported without
hitting live external services (database, Stripe, Azure Key Vault, etc.).
"""

import os
import sys

# Add the backend directory to the path so that `import main` resolves.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Minimal env vars required to import main.py without interactive prompts or
# live service connections.
os.environ.setdefault("SESSION_SECRET", "test-secret-for-unit-tests")
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_PUBLISHABLE_KEY", "pk_test_dummy")
os.environ.setdefault("DATABASE_URL", "")
os.environ.setdefault("OPENAI_API_KEY", "sk-dummy")
os.environ.setdefault("GEMINI_API_KEY", "dummy-gemini-key")
# Prevents the interactive _prompt_for_missing_key() from blocking tests.
os.environ.setdefault("WEBSITE_HOSTNAME", "test-host")
