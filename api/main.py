"""
api/main.py

The Fractality API.

Run locally:
    uvicorn api.main:app --reload --port 8000

Deployed (see render.yaml):
    uvicorn api.main:app --host 0.0.0.0 --port $PORT
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .routers import mindmaps
from .settings import get_settings

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refuse to start quietly misconfigured in production. These are conditions
    # where the service would appear healthy while being wide open or useless.
    problems = settings.validate_for_production()
    if problems:
        if settings.is_production:
            raise RuntimeError(
                "Refusing to start in production with: " + "; ".join(problems)
            )
        for problem in problems:
            logger.warning("Config: %s", problem)

    try:
        await db.init_driver(settings)
        await db.apply_schema(settings)
    except Exception as exc:  # noqa: BLE001
        # Boot anyway so /health can report the failure; database routes 503.
        logger.error("Neo4j initialisation failed: %s", exc)

    yield

    await db.close_driver()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Mind maps, share links and social features for the Fractality Platform.",
    lifespan=lifespan,
)

# Explicit origins, never "*": the frontend sends credentials, and browsers
# refuse wildcard origins on credentialed requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(mindmaps.router)


@app.get("/health", tags=["meta"])
async def health():
    """
    Liveness plus a readiness summary. Used by Render's health check, so it must
    stay cheap and must not require authentication.
    """
    driver = db.get_driver()
    database = "unconfigured"

    if driver is not None:
        try:
            await driver.verify_connectivity()
            database = "ok"
        except Exception as exc:  # noqa: BLE001
            logger.warning("Health check: Neo4j unreachable: %s", exc)
            database = "unreachable"

    return {
        "status": "ok",
        "environment": settings.environment,
        "database": database,
        "auth": "configured" if settings.auth_configured else "unconfigured",
    }
