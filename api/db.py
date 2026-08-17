"""
api/db.py

Neo4j driver lifecycle and schema setup.

One driver is created per process and shared; the driver maintains its own
connection pool, so creating one per request is a common and expensive mistake.
"""

import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from neo4j import AsyncGraphDatabase, AsyncDriver

from .settings import Settings

logger = logging.getLogger(__name__)

_driver: Optional[AsyncDriver] = None


async def init_driver(settings: Settings) -> Optional[AsyncDriver]:
    """
    Create the shared driver. Returns None when Neo4j is not configured, so the
    API can still boot and serve /health — useful on a fresh deploy before
    credentials are in place.
    """
    global _driver

    if not settings.neo4j_configured:
        logger.warning("Neo4j is not configured; database routes will return 503")
        return None

    _driver = AsyncGraphDatabase.driver(
        settings.neo4j_uri,
        auth=(settings.neo4j_user, settings.neo4j_password),
        # AuraDB Free pauses when idle; a bounded pool and short acquisition
        # timeout surface that as a clean error instead of a hung request.
        max_connection_pool_size=20,
        connection_acquisition_timeout=30,
    )

    # verify_connectivity() only proves the server answered — it does NOT check
    # that settings.neo4j_database exists. An Aura instance that is paused, still
    # provisioning, or whose database has a different name passes this and then
    # fails every query with DatabaseNotFound. Run a trivial query against the
    # configured database so a misconfiguration is caught at startup.
    await _driver.verify_connectivity()
    await verify_database(settings)

    logger.info(
        "Connected to Neo4j at %s (database %s)", settings.neo4j_uri, settings.database_label
    )
    return _driver


async def verify_database(settings: Settings) -> None:
    """
    Prove the configured database is usable. Raises on failure.

    Separate from verify_connectivity() because the two answer different
    questions, and conflating them is how a service reports itself healthy while
    being unable to serve a single request.
    """
    driver = get_driver()
    if driver is None:
        raise RuntimeError("Neo4j is not configured")

    async with driver.session(database=settings.database_or_default) as s:
        result = await s.run("RETURN 1 AS ok")
        await result.single()


async def close_driver() -> None:
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None


def get_driver() -> Optional[AsyncDriver]:
    return _driver


@asynccontextmanager
async def session(settings: Settings):
    """Async context manager yielding a Neo4j session."""
    driver = get_driver()
    if driver is None:
        raise RuntimeError("Neo4j is not configured")

    async with driver.session(database=settings.database_or_default) as s:
        yield s


async def run_write(settings: Settings, cypher: str, **params) -> List[Dict[str, Any]]:
    """Execute a write query in a transaction and return all records as dicts."""
    async with session(settings) as s:
        result = await s.execute_write(
            lambda tx: _collect(tx, cypher, params)
        )
        return result


async def run_read(settings: Settings, cypher: str, **params) -> List[Dict[str, Any]]:
    """Execute a read query and return all records as dicts."""
    async with session(settings) as s:
        result = await s.execute_read(
            lambda tx: _collect(tx, cypher, params)
        )
        return result


async def _collect(tx, cypher: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
    cursor = await tx.run(cypher, **params)
    records = [record.data() async for record in cursor]
    return records


# --- schema ----------------------------------------------------------------

# Uniqueness constraints double as indexes in Neo4j, so these cover both
# correctness and lookup performance. All are IF NOT EXISTS, so applying them on
# every boot is safe and idempotent.
SCHEMA_STATEMENTS = [
    "CREATE CONSTRAINT user_id_unique IF NOT EXISTS "
    "FOR (u:User) REQUIRE u.id IS UNIQUE",

    "CREATE CONSTRAINT user_subject_unique IF NOT EXISTS "
    "FOR (u:User) REQUIRE u.subject IS UNIQUE",

    "CREATE CONSTRAINT map_id_unique IF NOT EXISTS "
    "FOR (m:MindMap) REQUIRE m.id IS UNIQUE",

    "CREATE CONSTRAINT share_token_unique IF NOT EXISTS "
    "FOR (s:ShareLink) REQUIRE s.token IS UNIQUE",

    # A node id is only unique *within* a map, so the constraint is composite.
    "CREATE CONSTRAINT mapnode_scoped_unique IF NOT EXISTS "
    "FOR (n:MapNode) REQUIRE (n.map_id, n.id) IS UNIQUE",

    # Feed queries sort by recency
    "CREATE INDEX map_updated_at IF NOT EXISTS "
    "FOR (m:MindMap) ON (m.updated_at)",

    "CREATE INDEX map_visibility IF NOT EXISTS "
    "FOR (m:MindMap) ON (m.visibility)",
]


async def apply_schema(settings: Settings) -> int:
    """
    Apply constraints and indexes. Returns how many statements succeeded.

    Each runs in its own transaction: a constraint that already exists in a
    slightly different form fails only itself rather than aborting the batch.
    """
    if get_driver() is None:
        return 0

    applied = 0
    first_error: Optional[Exception] = None

    for statement in SCHEMA_STATEMENTS:
        try:
            async with session(settings) as s:
                await s.run(statement)
            applied += 1
        except Exception as exc:  # noqa: BLE001 - report and continue
            if first_error is None:
                first_error = exc
            logger.warning("Schema statement failed: %s (%s)", statement.split()[2], exc)

    # Every statement failing is not a partial degradation, it means the database
    # is unusable — wrong name, paused instance, no write permission. Raise rather
    # than logging warnings and returning 0, which reads like success to a caller
    # that does not inspect the count.
    if applied == 0 and SCHEMA_STATEMENTS:
        raise RuntimeError(
            f"No schema statements could be applied to database "
            f"{settings.database_label}. First error: {first_error}"
        ) from first_error

    logger.info("Applied %d/%d schema statements", applied, len(SCHEMA_STATEMENTS))
    return applied
