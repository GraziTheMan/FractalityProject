"""
Integration tests against a real Neo4j.

These are the only tests that exercise the Cypher in api/repository.py. They are
SKIPPED unless NEO4J_URI is set, so the default suite runs anywhere.

Run them against AuraDB Free:

    export NEO4J_URI='neo4j+s://xxxxx.databases.neo4j.io'
    export NEO4J_USER='neo4j'
    export NEO4J_PASSWORD='...'
    pytest api/tests/test_integration_neo4j.py -v

WARNING: these create and delete nodes. Point them at a scratch database, never
at production data. Everything created is prefixed `itest-` and removed in
teardown, but a failed run can leave residue.
"""

import os
import time

import pytest

from api import db, repository as repo
from api.models import MapNode, SharePermission, Visibility
from api.settings import Settings

pytestmark = pytest.mark.skipif(
    not os.getenv("NEO4J_URI"),
    reason="NEO4J_URI is not set; skipping Neo4j integration tests",
)

SUBJECT = "itest-subject"


@pytest.fixture
def settings():
    return Settings(
        environment="test",
        neo4j_uri=os.environ["NEO4J_URI"],
        # Aura's credentials file names it NEO4J_USERNAME; accept either.
        neo4j_user=(
            os.getenv("NEO4J_USER") or os.getenv("NEO4J_USERNAME") or "neo4j"
        ),
        neo4j_password=os.environ["NEO4J_PASSWORD"],
        neo4j_database=os.getenv("NEO4J_DATABASE") or "neo4j",
    )


# Function-scoped, NOT module-scoped, and deliberately so.
#
# pytest-asyncio gives each test function its own event loop by default
# (asyncio_default_test_loop_scope=function). A module-scoped async fixture is
# therefore created on a different loop from the tests that use it, and the
# Neo4j driver holds sockets bound to that first loop. Every test then failed
# with "got Future attached to a different loop" or "Event loop is closed" —
# regardless of whether the database was reachable.
#
# Reconnecting per test costs a fraction of a second and removes the whole class
# of problem. Do not "optimise" this back to module scope without also pinning
# the loop scope for both fixtures and tests.
@pytest.fixture(autouse=True)
async def driver(settings):
    await db.init_driver(settings)
    await db.apply_schema(settings)
    yield
    try:
        await _cleanup(settings)
    finally:
        await db.close_driver()


async def _cleanup(settings):
    """Remove everything this module created."""
    await db.run_write(
        settings,
        """
        MATCH (u:User {subject: $subject})
        OPTIONAL MATCH (u)-[:OWNS]->(m:MindMap)
        OPTIONAL MATCH (m)-[:CONTAINS]->(n:MapNode)
        OPTIONAL MATCH (m)-[:SHARED_VIA]->(s:ShareLink)
        DETACH DELETE n, s, m, u
        """,
        subject=SUBJECT,
    )


@pytest.fixture
async def user(settings, driver):
    # Depends on `driver` explicitly rather than relying on autouse ordering,
    # so the connection definitely exists before this runs.
    await _cleanup(settings)
    return await repo.upsert_user(settings, SUBJECT, "itest", "itest@example.com")


def node(node_id, parent=None, children=(), depth=0, label=None):
    return MapNode(
        id=node_id,
        parentId=parent,
        childIds=list(children),
        depth=depth,
        metadata={"label": label or node_id, "tags": ["itest"]},
    )


# --- users -----------------------------------------------------------------


async def test_upsert_user_is_idempotent(settings):
    await _cleanup(settings)

    first = await repo.upsert_user(settings, SUBJECT, "name-one")
    second = await repo.upsert_user(settings, SUBJECT, "name-two")

    # Same node, updated in place — not a duplicate
    assert first["id"] == second["id"]
    assert second["username"] == "name-two"


# --- maps ------------------------------------------------------------------


async def test_create_and_fetch_map(settings, user):
    summary = await repo.create_map(
        settings, SUBJECT, "Integration Map", "desc", Visibility.PRIVATE, None
    )

    fetched = await repo.get_map(settings, summary.id)
    assert fetched is not None
    assert fetched.title == "Integration Map"
    assert fetched.visibility is Visibility.PRIVATE
    assert fetched.nodes == []


async def test_replace_nodes_round_trips_the_full_shape(settings, user):
    """
    The important one: every field the frontend expects must survive a write and
    a read, including the JSON-encoded nested objects.
    """
    summary = await repo.create_map(
        settings, SUBJECT, "Shape Test", "", Visibility.PRIVATE, "root"
    )

    original = MapNode(
        id="root",
        parentId=None,
        childIds=["child"],
        depth=0,
        metadata={
            "label": "Root Node",
            "type": "concept",
            "tags": ["a", "b"],
            "description": "the root",
            "customExtra": "kept",
        },
        energy={"ATP": 0.75, "efficiency": 0.5, "network": "executive"},
        resonance={"semanticScore": 0.9, "tfidfScore": 0.4, "connections": ["x"]},
        visual={
            "position": {"x": 1.5, "y": -2.0, "z": 3.25},
            "scale": 2.0,
            "color": "#ff00ff",
            "glow": 0.8,
        },
    )
    child = node("child", parent="root", depth=1)

    await repo.replace_nodes(settings, summary.id, [original, child], "root")
    fetched = await repo.get_map(settings, summary.id)

    assert fetched.node_count == 2
    assert fetched.root_id == "root"

    got = next(n for n in fetched.nodes if n.id == "root")
    assert got.metadata.label == "Root Node"
    assert got.metadata.type == "concept"
    assert sorted(got.metadata.tags) == ["a", "b"]
    # Free-form extra metadata must survive the JSON column
    assert got.metadata.model_dump()["customExtra"] == "kept"
    assert got.energy.ATP == 0.75
    assert got.energy.network == "executive"
    assert got.resonance.semanticScore == 0.9
    assert got.visual.position.x == 1.5
    assert got.visual.color == "#ff00ff"
    assert got.childIds == ["child"]

    got_child = next(n for n in fetched.nodes if n.id == "child")
    assert got_child.parentId == "root"
    assert got_child.depth == 1


async def test_relationships_are_derived_from_edges_not_properties(settings, user):
    """
    childIds/parentId on the wire are rebuilt from HAS_CHILD relationships. A
    node whose parentId is set but whose parent does not list it must still come
    back linked in both directions.
    """
    summary = await repo.create_map(settings, SUBJECT, "Edges", "", Visibility.PRIVATE, "r")

    # Parent does NOT declare the child; only the child names its parent
    parent = node("r")
    orphan = node("c", parent="r", depth=1)

    await repo.replace_nodes(settings, summary.id, [parent, orphan], "r")
    fetched = await repo.get_map(settings, summary.id)

    got_parent = next(n for n in fetched.nodes if n.id == "r")
    got_child = next(n for n in fetched.nodes if n.id == "c")

    assert got_child.parentId == "r"
    assert got_parent.childIds == ["c"]


async def test_replace_nodes_is_a_replacement_not_an_append(settings, user):
    summary = await repo.create_map(settings, SUBJECT, "Replace", "", Visibility.PRIVATE, "a")

    await repo.replace_nodes(settings, summary.id, [node("a"), node("b")], "a")
    await repo.replace_nodes(settings, summary.id, [node("c")], "c")

    fetched = await repo.get_map(settings, summary.id)
    assert [n.id for n in fetched.nodes] == ["c"]
    assert fetched.node_count == 1


async def test_node_ids_are_scoped_per_map(settings, user):
    """
    The composite (map_id, id) constraint must allow the same node id in two
    different maps. A global uniqueness constraint would break this.
    """
    first = await repo.create_map(settings, SUBJECT, "One", "", Visibility.PRIVATE, "root")
    second = await repo.create_map(settings, SUBJECT, "Two", "", Visibility.PRIVATE, "root")

    await repo.replace_nodes(settings, first.id, [node("root", label="first")], "root")
    await repo.replace_nodes(settings, second.id, [node("root", label="second")], "root")

    got_first = await repo.get_map(settings, first.id)
    got_second = await repo.get_map(settings, second.id)

    assert got_first.nodes[0].metadata.label == "first"
    assert got_second.nodes[0].metadata.label == "second"


async def test_update_and_delete_map(settings, user):
    summary = await repo.create_map(settings, SUBJECT, "Temp", "", Visibility.PRIVATE, None)

    await repo.update_map(settings, summary.id, "Renamed", None, Visibility.PUBLIC)
    updated = await repo.get_map(settings, summary.id)
    assert updated.title == "Renamed"
    assert updated.visibility is Visibility.PUBLIC
    # description was passed as None and must be left alone
    assert updated.description == ""

    await repo.delete_map(settings, summary.id)
    assert await repo.get_map(settings, summary.id) is None


async def test_delete_removes_nodes_and_shares(settings, user):
    summary = await repo.create_map(settings, SUBJECT, "Cascade", "", Visibility.PRIVATE, "a")
    await repo.replace_nodes(settings, summary.id, [node("a")], "a")
    link = await repo.create_share_link(settings, summary.id, SharePermission.VIEW, None)

    await repo.delete_map(settings, summary.id)

    # No orphaned nodes or share links left behind
    rows = await db.run_read(
        settings,
        "MATCH (n:MapNode {map_id: $map_id}) RETURN count(n) AS c",
        map_id=summary.id,
    )
    assert rows[0]["c"] == 0
    assert await repo.resolve_share_link(settings, link.token) is None


async def test_listing_only_returns_own_maps(settings, user):
    mine = await repo.create_map(settings, SUBJECT, "Mine", "", Visibility.PRIVATE, None)

    other_subject = "itest-other-subject"
    await repo.upsert_user(settings, other_subject, "other")
    theirs = await repo.create_map(
        settings, other_subject, "Theirs", "", Visibility.PRIVATE, None
    )

    try:
        listed = await repo.list_maps_for_owner(settings, SUBJECT)
        ids = {m.id for m in listed}
        assert mine.id in ids
        assert theirs.id not in ids
    finally:
        await db.run_write(
            settings,
            """
            MATCH (u:User {subject: $subject})
            OPTIONAL MATCH (u)-[:OWNS]->(m:MindMap)
            DETACH DELETE m, u
            """,
            subject=other_subject,
        )


async def test_public_listing_excludes_private_maps(settings, user):
    private = await repo.create_map(settings, SUBJECT, "Secret", "", Visibility.PRIVATE, None)
    public = await repo.create_map(settings, SUBJECT, "Open", "", Visibility.PUBLIC, None)

    listed = await repo.list_public_maps(settings)
    ids = {m.id for m in listed}

    assert public.id in ids
    assert private.id not in ids


async def test_large_map_writes_in_one_round_trip(settings, user):
    """A 500-node map must write and read back intact."""
    summary = await repo.create_map(settings, SUBJECT, "Big", "", Visibility.PRIVATE, "n0")

    nodes = [node("n0", children=["n1"])]
    for i in range(1, 500):
        children = [f"n{i+1}"] if i < 499 else []
        nodes.append(node(f"n{i}", parent=f"n{i-1}", children=children, depth=i))

    started = time.monotonic()
    await repo.replace_nodes(settings, summary.id, nodes, "n0")
    elapsed = time.monotonic() - started

    fetched = await repo.get_map(settings, summary.id)
    assert fetched.node_count == 500
    assert len(fetched.nodes) == 500
    # Generous, but a per-node round trip would blow well past this
    assert elapsed < 30, f"500-node write took {elapsed:.1f}s"


# --- share links -----------------------------------------------------------


async def test_share_link_lifecycle(settings, user):
    summary = await repo.create_map(settings, SUBJECT, "Shared", "", Visibility.UNLISTED, None)

    link = await repo.create_share_link(settings, summary.id, SharePermission.VIEW, None)
    assert link.map_id == summary.id
    assert link.is_active
    # 32 url-safe bytes base64s to well over 40 characters
    assert len(link.token) > 40

    resolved = await repo.resolve_share_link(settings, link.token)
    assert resolved is not None
    assert resolved.map_id == summary.id

    assert await repo.revoke_share_link(settings, summary.id, link.token) is True

    after = await repo.resolve_share_link(settings, link.token)
    assert after.revoked is True
    assert after.is_active is False


async def test_expiring_share_link_reports_inactive(settings, user):
    summary = await repo.create_map(settings, SUBJECT, "Expiring", "", Visibility.UNLISTED, None)

    link = await repo.create_share_link(settings, summary.id, SharePermission.VIEW, 60)
    assert link.expires_at is not None
    assert link.is_active

    # Force expiry in the database rather than sleeping
    await db.run_write(
        settings,
        "MATCH (s:ShareLink {token: $token}) SET s.expires_at = $past",
        token=link.token,
        past=int(time.time() * 1000) - 5000,
    )

    resolved = await repo.resolve_share_link(settings, link.token)
    assert resolved.is_active is False


async def test_share_tokens_are_unique_across_maps(settings, user):
    a = await repo.create_map(settings, SUBJECT, "A", "", Visibility.UNLISTED, None)
    b = await repo.create_map(settings, SUBJECT, "B", "", Visibility.UNLISTED, None)

    token_a = (await repo.create_share_link(settings, a.id, SharePermission.VIEW, None)).token
    token_b = (await repo.create_share_link(settings, b.id, SharePermission.EDIT, None)).token

    assert token_a != token_b
    assert (await repo.resolve_share_link(settings, token_a)).map_id == a.id
    assert (await repo.resolve_share_link(settings, token_b)).map_id == b.id


async def test_revoke_refuses_a_token_from_another_map(settings, user):
    """Revocation must be scoped: you cannot revoke someone else's link."""
    a = await repo.create_map(settings, SUBJECT, "A", "", Visibility.UNLISTED, None)
    b = await repo.create_map(settings, SUBJECT, "B", "", Visibility.UNLISTED, None)

    token_a = (await repo.create_share_link(settings, a.id, SharePermission.VIEW, None)).token

    assert await repo.revoke_share_link(settings, b.id, token_a) is False
    assert (await repo.resolve_share_link(settings, token_a)).revoked is False


async def test_schema_is_idempotent(settings):
    """Applying the schema twice must not error — it runs on every boot."""
    first = await db.apply_schema(settings)
    second = await db.apply_schema(settings)
    assert first == second == len(db.SCHEMA_STATEMENTS)
