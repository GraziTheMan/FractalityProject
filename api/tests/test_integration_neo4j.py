"""
Integration tests against a real Neo4j.

These are the only tests that exercise the Cypher in api/repository.py. They are
SKIPPED unless NEO4J_URI is set, so the default suite runs anywhere.

Run them against AuraDB Free either way round. A file in the repository root:

    # .env.local  (or .env — both are read, .env.local wins)
    NEO4J_URI=neo4j+s://xxxxxxxx.databases.neo4j.io
    NEO4J_USERNAME=xxxxxxxx      # instance ID, per Aura's credentials file
    NEO4J_PASSWORD=...
    # leave NEO4J_DATABASE unset

or in the shell, which overrides any file:

    export NEO4J_URI='neo4j+s://xxxxx.databases.neo4j.io'
    export NEO4J_USERNAME='xxxxx'
    export NEO4J_PASSWORD='...'

then:

    pytest api/tests/test_integration_neo4j.py -v

If they skip, the reason says which files were read and what was missing from them
rather than only that a variable is unset.

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

from .envfiles import get as env_value, skip_reason, target_description

# Evaluated at import time, after conftest.py has loaded any env files.
_SKIP = skip_reason()

pytestmark = pytest.mark.skipif(bool(_SKIP), reason=_SKIP or "runnable")

# Reported through conftest's pytest_report_header, not printed here: pytest captures
# output during collection, so an import-time print is swallowed and never seen.

SUBJECT = "itest-subject"


@pytest.fixture
def settings():
    return Settings(
        # Explicit, and read through envfiles rather than os.environ, so a value in
        # .env.local reaches these tests without being injected into the process
        # environment where it would reconfigure everything else.
        _env_file=None,
        environment="test",
        neo4j_uri=env_value("NEO4J_URI"),
        # Aura's credentials file names it NEO4J_USERNAME; accept either.
        neo4j_user=(
            env_value("NEO4J_USER") or env_value("NEO4J_USERNAME") or "neo4j"
        ),
        neo4j_password=env_value("NEO4J_PASSWORD"),
        # Empty = server default; do not force a name that may not exist
        neo4j_database=env_value("NEO4J_DATABASE"),
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
            "content": "# Root\n\nA **markdown** page.\n\n- one\n- two\n",
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
    assert got.metadata.description == "the root"
    # Markdown is whitespace-significant, so this compares exactly rather than
    # by substring: a page that comes back with its newlines mangled is broken.
    assert got.metadata.content == "# Root\n\nA **markdown** page.\n\n- one\n- two\n"
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


async def test_a_full_size_page_survives_the_driver(settings, user):
    """
    64 KB is the cap the model allows, so the storage layer has to carry it. This
    is the case that cannot be checked without a real database: an in-memory test
    proves nothing about what the driver and Neo4j will accept.
    """
    summary = await repo.create_map(
        settings, SUBJECT, "Big Page", "", Visibility.PRIVATE, "root"
    )
    page = ("## Section\n\nBody text that is long enough to matter.\n\n" * 900)[:64_000]

    big = MapNode(id="root", depth=0, metadata={"label": "Root", "content": page})
    await repo.replace_nodes(settings, summary.id, [big], "root")

    got = (await repo.get_map(settings, summary.id)).nodes[0]
    assert len(got.metadata.content) == len(page)
    assert got.metadata.content == page


async def test_a_node_without_a_page_reads_as_empty_not_null(settings, user):
    """A null property must not surface as the string "None" or a None body."""
    summary = await repo.create_map(
        settings, SUBJECT, "No Page", "", Visibility.PRIVATE, "root"
    )
    await repo.replace_nodes(settings, summary.id, [node("root")], "root")

    got = (await repo.get_map(settings, summary.id)).nodes[0]
    assert got.metadata.content == ""


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
    assert created.my_rating == 0
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


async def test_a_rating_is_stored_once_per_user_and_can_be_changed(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())

    # MERGE with SET, so rating twice replaces rather than accumulating.
    assert await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 2)
    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, -1)

    rows = await db.run_read(
        settings,
        "MATCH (:User {subject: $s})-[r:RESONATED_WITH]->(:Pulse {id: $p}) "
        "RETURN count(r) AS n, collect(r.value) AS values",
        s=OTHER_SUBJECT,
        p=pulse.id,
    )
    assert rows[0]["n"] == 1, "a second rating must not create a second relationship"
    assert rows[0]["values"] == [-1], "the latest rating wins"

    seen = await repo.get_pulse(settings, pulse.id, OTHER_SUBJECT)
    assert seen.my_rating == -1


async def test_the_whole_scale_round_trips_through_the_database(settings, user, other_user):
    """Signed values have to survive the driver, negatives included."""
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())

    for value in (-2, -1, 1, 2):
        await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, value)
        seen = await repo.get_pulse(settings, pulse.id, OTHER_SUBJECT)
        assert seen.my_rating == value


async def test_rating_zero_deletes_the_relationship(settings, user, other_user):
    """
    0 is the absence of an opinion, not an opinion of zero. Storing it would leave
    rows the model has to skip, and would make "moved the slider back" different
    from "never touched it" for no benefit to anybody.
    """
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 2)
    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 0)

    rows = await db.run_read(
        settings,
        "MATCH (:User {subject: $s})-[r:RESONATED_WITH]->(:Pulse {id: $p}) RETURN count(r) AS n",
        s=OTHER_SUBJECT,
        p=pulse.id,
    )
    assert rows[0]["n"] == 0
    assert (await repo.get_pulse(settings, pulse.id, OTHER_SUBJECT)).my_rating == 0


async def test_clearing_a_rating_that_was_never_set_is_harmless(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    # Reports no change, which is not the same as failing.
    assert await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 0) is False
    assert (await repo.get_pulse(settings, pulse.id, OTHER_SUBJECT)).my_rating == 0


async def test_a_rating_is_private_to_the_reader_who_gave_it(settings, user, other_user):
    """
    The author must not be able to see what anyone thought. This is the property the
    whole design rests on, so it is asserted against the database rather than only
    against the wire format.
    """
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, -2)

    as_author = await repo.get_pulse(settings, pulse.id, SUBJECT)
    assert as_author.my_rating == 0, "the author sees their own rating, which is none"

    # And no aggregate of anyone else's reaches the author by any field.
    body = as_author.model_dump()
    for forbidden in ("resonators", "resonance", "resonated", "ratings", "seen"):
        assert forbidden not in body

    as_rater = await repo.get_pulse(settings, pulse.id, OTHER_SUBJECT)
    assert as_rater.my_rating == -2


async def test_an_anonymous_read_carries_no_rating(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 2)

    assert (await repo.get_pulse(settings, pulse.id)).my_rating == 0


# --- impressions -----------------------------------------------------------


async def test_an_impression_is_recorded_once_per_viewer(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())

    await repo.record_impressions(settings, OTHER_SUBJECT, [pulse.id])
    await repo.record_impressions(settings, OTHER_SUBJECT, [pulse.id, pulse.id])

    rows = await db.run_read(
        settings,
        "MATCH (:User {subject: $s})-[r:SAW]->(:Pulse {id: $p}) RETURN count(r) AS n",
        s=OTHER_SUBJECT,
        p=pulse.id,
    )
    assert rows[0]["n"] == 1, "a post scrolling past twice is one impression"


async def test_your_own_posts_are_not_counted_as_impressions(settings, user):
    """
    Seeing your own writing says nothing about what resonates with you, and counting
    it would let a prolific poster's own feed dominate their model.
    """
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    await repo.record_impressions(settings, SUBJECT, [pulse.id])

    rows = await db.run_read(
        settings,
        "MATCH (:User {subject: $s})-[r:SAW]->(:Pulse {id: $p}) RETURN count(r) AS n",
        s=SUBJECT,
        p=pulse.id,
    )
    assert rows[0]["n"] == 0


async def test_impressions_survive_a_missing_pulse_in_the_batch(settings, user, other_user):
    """A client's batch can name a post that was deleted while they were reading."""
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    seen = await repo.record_impressions(
        settings, OTHER_SUBJECT, [pulse.id, "p-does-not-exist"]
    )
    assert seen == 1


async def test_deleting_a_pulse_removes_its_impressions(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    await repo.record_impressions(settings, OTHER_SUBJECT, [pulse.id])
    await repo.delete_pulse(settings, SUBJECT, pulse.id)

    rows = await db.run_read(
        settings,
        "MATCH (:User {subject: $s})-[r:SAW]->() RETURN count(r) AS n",
        s=OTHER_SUBJECT,
    )
    assert rows[0]["n"] == 0


# --- the reader model ------------------------------------------------------


async def test_the_reader_model_is_built_from_real_ratings(settings, user, other_user):
    """
    The aggregating query, against a real database. Ten ratings on one tag is past
    the prediction threshold, so this also proves the threshold is reachable.
    """
    from api.resonance import MIN_RATINGS_FOR_PREDICTION

    ids = []
    for i in range(MIN_RATINGS_FOR_PREDICTION + 2):
        pulse = await repo.create_pulse(
            settings, SUBJECT, pulse_create(title=f"Post {i}", tags=["fractal"])
        )
        ids.append(pulse.id)
        await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 2)

    model = await repo.load_reader_model(settings, OTHER_SUBJECT)
    assert model.total_ratings == len(ids)
    assert "fractal" in model.tags
    assert model.tags["fractal"].count == len(ids)

    prediction = model.predict(["fractal"], None)
    assert prediction.value is not None and prediction.value > 0


async def test_the_reader_model_only_sees_its_own_readers_ratings(settings, user, other_user):
    """
    The property the design rests on. If another reader's ratings could reach this
    model, the prediction would be a popularity measure wearing a personal label.
    """
    from api.resonance import MIN_RATINGS_FOR_PREDICTION

    for i in range(MIN_RATINGS_FOR_PREDICTION + 2):
        pulse = await repo.create_pulse(
            settings, SUBJECT, pulse_create(title=f"Loved {i}", tags=["fractal"])
        )
        # OTHER loves it; the author rates nothing.
        await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 2)

    author_model = await repo.load_reader_model(settings, SUBJECT)
    assert author_model.total_ratings == 0
    assert author_model.predict(["fractal"], None).value is None

    other_model = await repo.load_reader_model(settings, OTHER_SUBJECT)
    assert other_model.predict(["fractal"], None).value > 0


async def test_a_cleared_rating_leaves_the_model(settings, user, other_user):
    from api.resonance import MIN_RATINGS_FOR_PREDICTION

    ids = []
    for i in range(MIN_RATINGS_FOR_PREDICTION):
        pulse = await repo.create_pulse(
            settings, SUBJECT, pulse_create(title=f"Post {i}", tags=["fractal"])
        )
        ids.append(pulse.id)
        await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 2)

    await repo.set_resonance(settings, OTHER_SUBJECT, ids[0], 0)

    model = await repo.load_reader_model(settings, OTHER_SUBJECT)
    assert model.total_ratings == len(ids) - 1
    assert model.tags["fractal"].count == len(ids) - 1


async def test_the_feed_carries_a_prediction_for_the_reader(settings, user, other_user):
    """End to end: rate enough posts, then read the feed and find a gauge value."""
    from api.resonance import MIN_RATINGS_FOR_PREDICTION

    for i in range(MIN_RATINGS_FOR_PREDICTION + 2):
        pulse = await repo.create_pulse(
            settings, SUBJECT, pulse_create(title=f"Post {i}", tags=["fractal"])
        )
        await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 2)

    fresh = await repo.create_pulse(
        settings, SUBJECT, pulse_create(title="Brand new", tags=["fractal"])
    )

    feed = await repo.list_feed(settings, viewer_subject=OTHER_SUBJECT, limit=50)
    repo.apply_predictions(feed, await repo.load_reader_model(settings, OTHER_SUBJECT))

    predicted = next(p for p in feed if p.id == fresh.id)
    assert predicted.predicted is not None and predicted.predicted > 0
    assert predicted.prediction_confidence > 0
    assert predicted.my_rating == 0, "an unrated post carries no rating"


async def test_only_the_author_can_delete_a_pulse(settings, user, other_user):
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())

    assert await repo.delete_pulse(settings, OTHER_SUBJECT, pulse.id) is False
    assert await repo.get_pulse(settings, pulse.id) is not None, "it must survive"

    assert await repo.delete_pulse(settings, SUBJECT, pulse.id) is True
    assert await repo.get_pulse(settings, pulse.id) is None


async def test_deleting_a_pulse_removes_its_resonance(settings, user, other_user):
    """DETACH DELETE, so no relationship outlives the node it pointed at."""
    pulse = await repo.create_pulse(settings, SUBJECT, pulse_create())
    await repo.set_resonance(settings, OTHER_SUBJECT, pulse.id, 2)
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
