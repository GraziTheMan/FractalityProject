"""
api/main.py

The Fractality API.

Run locally:
    uvicorn api.main:app --reload --port 8000

Deployed (see render.yaml):
    uvicorn api.main:app --host 0.0.0.0 --port $PORT
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .routers import feed, me, mindmaps
from .settings import get_settings

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("api")


async def _connect_database() -> None:
    """Open the driver and apply the schema. Separated so it can be given a deadline."""
    await db.init_driver(settings)
    await db.apply_schema(settings)


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

    # Bounded, because the except below cannot catch a hang.
    #
    # The intent here was always "boot anyway and let /health report the problem",
    # but without a timeout an unreachable host does not raise — it blocks. DNS that
    # does not answer, or a paused Aura instance behind a TLS handshake that never
    # completes, held startup open indefinitely. On Render that is a deploy that never
    # goes live and reports nothing; locally it was a test run that hung during
    # collection with no output at all.
    try:
        await asyncio.wait_for(
            _connect_database(),
            timeout=settings.startup_db_timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.error(
            "Neo4j did not respond within %ss; booting without it. "
            "Database routes will return 503 and /health will report the failure.",
            settings.startup_db_timeout_seconds,
        )
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
app.include_router(feed.router)
app.include_router(me.router)


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
            # Query the configured database rather than only checking
            # connectivity: verify_connectivity() succeeds against a reachable
            # server even when the target database does not exist, which would
            # make this endpoint report "ok" for a service that cannot serve a
            # single request.
            await db.verify_database(settings)
            database = "ok"
        except Exception as exc:  # noqa: BLE001
            logger.warning("Health check: database %s unusable: %s", settings.database_label, exc)
            database = "unreachable"

    return {
        "status": "ok",
        "environment": settings.environment,
        "database": database,
        "auth": "configured" if settings.auth_configured else "unconfigured",
    }
