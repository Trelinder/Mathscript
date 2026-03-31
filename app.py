# This file re-exports the FastAPI ASGI application so that tools that look for
# an 'app' object at the package root (e.g. some Azure Oryx detection paths) can
# find it.  The canonical startup command is:
#   uvicorn backend.main:app  (set via the webapps-deploy startup-command field)
# Do NOT use plain gunicorn with this module — FastAPI is ASGI-only and requires
# either uvicorn directly or gunicorn with uvicorn.workers.UvicornWorker.
from backend.main import app  # noqa: F401  re-export
