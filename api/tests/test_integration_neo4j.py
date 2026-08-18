"""
Integration tests against a real Neo4j.

These are the only tests that exercise the Cypher in api/repository.py. They are
SKIPPED unless NEO4J_URI is set, so the default suite runs anywhere.

Run them against AuraDB Free:

    export NEO4J_URI='neo4j+s://xxxxx.databases.neo4j.io'
    export NEO4J_USERNAME='xxxxx'   # instance ID, per Aura's credentials file
    export NEO4J_PASSWORD='...'
    # leave NEO4J_DATABASE unset
    pytest api/tests/test_integration_neo4j.py -v

WARNING: these create and delete nodes. Point them at a scratch database, never
at production data. Everything created is prefixed `itest-` and removed in
teardown, but a failed run can leave residue.
"""

import asyncio
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
        # Empty = server default; do not force a name that may not exist
        neo4j_database=os.getenv("NEO4J_DATABASE", ""),
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
    """Remove everything this module created.

    Matches on the `itest-` prefix rather than one exact subject: several tests
    need a second user, and a cleanup that only knew about the first would leave
    it behind to pollute later runs.
    """
    await db.run_write(
        settings,
        """
        MATCH (u:User)
        WHERE u.subject STARTS WITH 'itest-'
        OPTIONAL MATCH (u)-[:OWNS]->(m:MindMap)
        OPTIONAL MATCH (m)-[:CONTAINS]->(n:MapNode)
        OPTIONAL MATCH (m)-[:SHARED_VIA]->(s:ShareLink)
        OPTIONAL MATCH (u)-[:POSTED]->(p:Pulse)
        DETACH DELETE n, s, m, p, u
        """,
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


# --- feed / pulses ---------------------------------------------------------
#
# These are the only check on the feed's Cypher. The unit tests in test_feed.py
# stub the repository, so nothing there would notice a typo'd relationship name
# or a WHERE clause that silently matches nothing.

OTHER_SUBJECT = "itest-other"


@pytest.fixture
async def other_user(settings, user):
    """A second account, for blocking and cross-author visibility."""
    return await repo.upsert_user(settings, OTHER_SUBJECT, "itest-other", None)


def pulse_create(title="itest pulse", preview="body", tags=("itest",), media=None,
                 visibility=Visibility.PUBLIC):
    from api.models import PulseCreate
    return PulseCreate(
        title=title, preview=preview, tags=list(tags),
        media=media, visibility=visibility,
    )


async def test_create_and_read_a_pulse(settings, user):
    created = await repo.create_pulse(settings, SUBJECT, pulse_create())

    assert created is not None
    assert created.title == "itest pulse"
    assert created.author.name == "itest"
    assert created.resonators == 0
    assert created.own is True

    fetched = await repo.get_pulse(settings, created.id, SUBJECT)
    assert fetched.id == created.id
    assert fetched.tags == ["itest"]


async def test_media_round_trips_through_json(settings, user):
    from api.models import PulseMedia

    media = PulseMedia(url="https://example.com/a", title="A link", description="d")
    created = await repo.create_pulse(settings, SUBJECT, pulse_create(media=media))

    fetched = await repo.get_pulse(settings, created.id, SUBJECT)
    assert fetched.media is not None
    assert fetched.media.url == "https://example.com/a"
    assert fetched.media.title == "A link"


async def test_the_feed_is_newest_first(settings, user):
    first = await repo.create_pulse(settings, SUBJECT, pulse_create(title="older"))
    # created_at is millisecond-resolution, so two writes in the same millisecond
    # would make the ordering assertion meaningless.
    await asyncio.sleep(0.01)
    second = await repo.create_pulse(settings, SUBJECT, pulse_create(title="newer"))

    feed = await repo.list_feed(settings, SUBJECT, limit=10)
    ids = [p.id for p in feed]
    assert ids.index(second.id) < ids.index(first.id)


async def test_private_pulses_stay_out_of_the_public_feed(settings, user):
    public = await repo.create_pulse(settings, SUBJECT, pulse_create(title="public"))
    private = await repo.create_pulse(
        settings, SUBJECT, pulse_create(title="private", visibility=Visibility.PRIVATE)
    )

    feed_ids = [p.id for p in await repo.list_feed(settings, SUBJECT, limit=50)]
    assert public.id in feed_ids
    assert private.id not in feed_ids

    # But the author still sees it in their own list.
    own_ids = [p.id for p in await repo.list_own_pulses(settings, SUBJECT, limit=50)]
    assert private.id in own_ids


async def test_the_tag_filter_matches_and_excludes(settings, user):
    tagged = await repo.create_pulse(settings, SUBJECT, pulse_create(tags=["itest", "fractal"]))
    other = await repo.create_pulse(settings, SUBJECT, pulse_create(tags=["itest", "music"]))

    ids = [p.id for p in await repo.list_feed(settings, SUBJECT, tag="fractal", limit=50)]
    assert tagged.id in ids
    assert other.id not in ids

    # The filter normalises, so "#Fractal" finds the same pulse.
    ids_hash = [p.id for p in await repo.list_feed(settings, SUBJECT, tag="#Fractal", limit=50)]
    assert tagged.id in ids_hash


async def test_resonance_counts_once_per_user_and_can_be_taken_back(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())

    # MERGE, so pressing twice is still one resonance.
    assert await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, True)
    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, True)

    seen = await repo.get_pulse(settings, pulse.id, OTHER_SUBJECT)
    assert seen.resonators == 1, "a double tap must not create two relationships"
    assert seen.resonated is True
    assert seen.resonance > 0

    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, False)
    after = await repo.get_pulse(settings, pulse.id, OTHER_SUBJECT)
    assert after.resonators == 0
    assert after.resonated is False
    assert after.resonance == 0


async def test_resonance_is_per_viewer(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, True)

    # The author has not resonated with it; the count is still 1.
    as_author = await repo.get_pulse(settings, pulse.id, SUBJECT)
    assert as_author.resonators == 1
    assert as_author.resonated is False


async def test_only_the_author_can_delete_a_pulse(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())

    assert await repo.delete_pulse(settings, OTHER_SUBJECT, pulse.id) is False
    assert await repo.get_pulse(settings, pulse.id) is not None, "it must survive"

    assert await repo.delete_pulse(settings, SUBJECT, pulse.id) is True
    assert await repo.get_pulse(settings, pulse.id) is None


async def test_deleting_a_pulse_removes_its_resonance(settings, user, other_user):
    """DETACH DELETE, so no relationship outlives the node it pointed at."""
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, True)
    await repo.delete_pulse(settings, SUBJECT, pulse.id)

    rows = await db.run_read(
        settings,
        "MATCH (:User {subject: $s})-[r:RESONATED_WITH]->() RETURN count(r) AS n",
        s=OTHER_SUBJECT,
    )
    assert rows[0]["n"] == 0


async def test_blocking_hides_an_author_from_the_feed(settings, user, other_user):
    mine = await repo.create_pulse(settings, SUBJECT, pulse_create(title="mine"))
    theirs = await repo.create_pulse(settings, OTHER_SUBJECT, pulse_create(title="theirs"))

    before = [p.id for p in await repo.list_feed(settings, SUBJECT, limit=50)]
    assert theirs.id in before

    assert await repo.set_block(settings, SUBJECT, other_user["id"], True)

    after = [p.id for p in await repo.list_feed(settings, SUBJECT, limit=50)]
    assert theirs.id not in after, "a blocked author's pulses must not appear"
    assert mine.id in after, "blocking must not hide your own pulses"

    # And the block is only for the blocker: the other user still sees everything.
    theirs_view = [p.id for p in await repo.list_feed(settings, OTHER_SUBJECT, limit=50)]
    assert theirs.id in theirs_view
    assert mine.id in theirs_view


async def test_unblocking_restores_the_feed(settings, user, other_user):
    theirs = await repo.create_pulse(settings, OTHER_SUBJECT, pulse_create())
    await repo.set_block(settings, SUBJECT, other_user["id"], True)
    await repo.set_block(settings, SUBJECT, other_user["id"], False)

    ids = [p.id for p in await repo.list_feed(settings, SUBJECT, limit=50)]
    assert theirs.id in ids


async def test_you_cannot_block_yourself(settings, user):
    """It would silently empty your own feed."""
    me = await repo.upsert_user(settings, SUBJECT, "itest", None)
    assert await repo.set_block(settings, SUBJECT, me["id"], True) is False


async def test_blocked_list_reflects_the_blocks(settings, user, other_user):
    assert await repo.list_blocked(settings, SUBJECT) == []
    await repo.set_block(settings, SUBJECT, other_user["id"], True)

    blocked = await repo.list_blocked(settings, SUBJECT)
    assert [b["id"] for b in blocked] == [other_user["id"]]


async def test_reports_count_once_per_reporter(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())

    assert await repo.report_pulse(settings, OTHER_SUBJECT, pulse.id, "spam") == 1
    # Same reporter again: still one.
    assert await repo.report_pulse(settings, OTHER_SUBJECT, pulse.id, "abuse") == 1
    # A different reporter increments it.
    assert await repo.report_pulse(settings, SUBJECT, pulse.id, "other") == 2


async def test_reporting_a_missing_pulse_reports_nothing(settings, user):
    assert await repo.report_pulse(settings, SUBJECT, "pulse-nope", "spam") is None


async def test_the_rate_limit_window_counts_only_recent_pulses(settings, user):
    await repo.create_pulse(settings, SUBJECT, pulse_create())
    await repo.create_pulse(settings, SUBJECT, pulse_create())

    assert await repo.count_recent_pulses(settings, SUBJECT, 60 * 60 * 1000) == 2
    # A window that ended before they were written sees none of them.
    assert await repo.count_recent_pulses(settings, SUBJECT, 0) == 0


async def test_feed_paging_does_not_repeat_or_skip(settings, user):
    created = []
    for i in range(5):
        created.append(await repo.create_pulse(settings, SUBJECT, pulse_create(title=f"p{i}")))
        await asyncio.sleep(0.005)

    first = await repo.list_feed(settings, SUBJECT, skip=0, limit=2)
    second = await repo.list_feed(settings, SUBJECT, skip=2, limit=2)

    assert len(first) == 2 and len(second) == 2
    assert set(p.id for p in first).isdisjoint(p.id for p in second)
