"""
api/repository.py

All Cypher lives here. Routers deal in models; this module deals in the graph.

Data model
----------
    (:User   {id, subject, username, email, created_at})
    (:MindMap{id, title, description, visibility, node_count,
              created_at, updated_at, root_id})
    (:MapNode{map_id, id, depth, label, type, tags, description, content,
              metadata_json, energy_json, resonance_json, visual_json,
              created, modified, last_visited})
    (:ShareLink{token, permission, created_at, expires_at, revoked})

    (:User)-[:OWNS]->(:MindMap)
    (:MindMap)-[:CONTAINS]->(:MapNode)
    (:MapNode)-[:HAS_CHILD]->(:MapNode)
    (:MapNode)-[:EMERGES_FROM]->(:MapNode)
    (:MapNode)-[:RESETS_TO]->(:MapNode)      # may be circular; bears no tier
    (:MindMap)-[:SHARED_VIA]->(:ShareLink)

HAS_CHILD and EMERGES_FROM are deliberately separate types. HAS_CHILD is
containment — which node is inside which, and where a node lives in the outline.
EMERGES_FROM is convergence — which streams flowed together to make a node, of which
there may be many. "Consciousness" is inside The Fractiverse and emerges from four
axioms; one relation cannot carry both facts. Keeping them apart also means a
traversal can ask for one without the other, which the tier computation needs.

Why HAS_CHILD *and* a parent property: the relationship is what makes traversal
cheap in Neo4j (the reason for choosing it), while childIds/parentId are what the
frontend expects on the wire. The relationships are authoritative; the scalar
properties are derived when reading.

Note on JSON columns: Neo4j properties must be primitives or arrays of
primitives, so nested objects (energy/resonance/visual and free-form metadata)
are stored as JSON strings and parsed on read. Fields worth querying or indexing
(label, type, tags, depth) are stored as real properties instead. So is `content`,
the node's markdown page, which is the one field a reader may want on its own and
the one large enough to be worth projecting away.
"""

import json
import logging
import secrets
from uuid import uuid4
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from . import db
from .models import (
    Friend,
    Comment,
    MapNode,
    MindMap,
    MindMapSummary,
    NodeEnergy,
    NodeMetadata,
    NodeResonance,
    NodeTimestamps,
    NodeVisual,
    Profile,
    Pulse,
    PulseAuthor,
    PulseCreate,
    PulseMedia,
    SharePermission,
    ShareLink,
    Visibility,
)
from .resonance import ReaderModel
from .settings import Settings

logger = logging.getLogger(__name__)


def now_ms() -> int:
    return int(datetime.now(tz=timezone.utc).timestamp() * 1000)


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_urlsafe(12)}"


# --- users -----------------------------------------------------------------

UPSERT_USER = """
MERGE (u:User {subject: $subject})
ON CREATE SET
    u.id = $id,
    u.username = $username,
    u.email = $email,
    u.created_at = $now
ON MATCH SET
    u.username = coalesce($username, u.username),
    u.email = coalesce($email, u.email)
RETURN u.id AS id, u.subject AS subject, u.username AS username, u.email AS email
"""


async def upsert_user(
    settings: Settings,
    subject: str,
    username: Optional[str] = None,
    email: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Ensure a local User exists for an authenticated principal.

    Identity lives with the auth provider; this is only the local projection we
    can attach relationships to.
    """
    rows = await db.run_write(
        settings,
        UPSERT_USER,
        subject=subject,
        id=new_id("user"),
        username=username,
        email=email,
        now=now_ms(),
    )
    return rows[0]


# --- serialization ---------------------------------------------------------


def _node_to_params(node: MapNode) -> Dict[str, Any]:
    """Flatten a MapNode into Neo4j-safe primitive properties."""
    extra = node.metadata.model_dump()
    for key in ("label", "type", "tags", "description", "content"):
        extra.pop(key, None)

    return {
        "id": node.id,
        "depth": node.depth,
        "parentId": node.parentId,
        "childIds": node.childIds,
        "label": node.metadata.label,
        "type": node.metadata.type,
        "tags": node.metadata.tags,
        "description": node.metadata.description,
        # Stored as its own property rather than inside metadata_json. It is the
        # one field a reader is likely to want without the rest of the node, and
        # burying a 64 KB body in a JSON blob makes it impossible to project away.
        "content": node.metadata.content,
        # Only the non-standard remainder, so the common fields stay queryable
        "metadata_json": json.dumps(extra) if extra else None,
        "energy_json": node.energy.model_dump_json(),
        "resonance_json": node.resonance.model_dump_json(),
        "visual_json": node.visual.model_dump_json(),
        "created": node.timestamps.created,
        "modified": node.timestamps.modified,
        "last_visited": node.timestamps.lastVisited,
    }


def _row_to_node(row: Dict[str, Any]) -> MapNode:
    """Rebuild a MapNode from a stored row, tolerating older/partial records."""

    def load(value: Optional[str], default: Dict[str, Any]) -> Dict[str, Any]:
        if not value:
            return default
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return default

    metadata_extra = load(row.get("metadata_json"), {})
    # `content` was free-form metadata before it became a column, so rows written
    # then carry it inside metadata_json. Take the column when it has something,
    # the blob otherwise — and pop it either way, because passing the same keyword
    # twice to NodeMetadata is a TypeError, not a silent preference.
    content_from_blob = metadata_extra.pop("content", None)
    content = row.get("content") or content_from_blob or ""

    metadata = NodeMetadata(
        label=row.get("label") or "",
        type=row.get("type") or "default",
        tags=row.get("tags") or [],
        description=row.get("description") or "",
        content=content if isinstance(content, str) else str(content),
        **metadata_extra,
    )

    return MapNode(
        id=row["id"],
        parentId=row.get("parentId"),
        # Derived from HAS_CHILD relationships, which are authoritative
        childIds=[c for c in (row.get("childIds") or []) if c is not None],
        # Likewise from EMERGES_FROM. Sorted, because collect() gives no order and an
        # unstable order would make an unchanged map look changed on every read.
        emergesFrom=sorted(
            c for c in (row.get("emergesFrom") or []) if c is not None
        ),
        resetsTo=sorted(
            c for c in (row.get("resetsTo") or []) if c is not None
        ),
        depth=row.get("depth") or 0,
        metadata=metadata,
        energy=NodeEnergy(**load(row.get("energy_json"), {})),
        resonance=NodeResonance(**load(row.get("resonance_json"), {})),
        visual=NodeVisual(**load(row.get("visual_json"), {})),
        timestamps=NodeTimestamps(
            created=row.get("created") or now_ms(),
            modified=row.get("modified") or now_ms(),
            lastVisited=row.get("last_visited"),
        ),
    )


def _row_to_summary(row: Dict[str, Any]) -> MindMapSummary:
    return MindMapSummary(
        id=row["id"],
        title=row.get("title") or "Untitled",
        description=row.get("description") or "",
        visibility=Visibility(row.get("visibility") or "private"),
        owner_id=row.get("owner_id") or "",
        owner_name=row.get("owner_name"),
        node_count=row.get("node_count") or 0,
        created_at=row.get("created_at") or now_ms(),
        updated_at=row.get("updated_at") or now_ms(),
    )


# --- mind maps -------------------------------------------------------------

CREATE_MAP = """
MATCH (u:User {subject: $subject})
CREATE (m:MindMap {
    id: $map_id,
    title: $title,
    description: $description,
    visibility: $visibility,
    root_id: $root_id,
    node_count: 0,
    created_at: $now,
    updated_at: $now
})
CREATE (u)-[:OWNS]->(m)
RETURN m.id AS id, m.title AS title, m.description AS description,
       m.visibility AS visibility, m.node_count AS node_count,
       m.created_at AS created_at, m.updated_at AS updated_at,
       u.id AS owner_id, u.username AS owner_name
"""


async def create_map(
    settings: Settings,
    subject: str,
    title: str,
    description: str,
    visibility: Visibility,
    root_id: Optional[str],
) -> MindMapSummary:
    rows = await db.run_write(
        settings,
        CREATE_MAP,
        subject=subject,
        map_id=new_id("map"),
        title=title,
        description=description,
        visibility=visibility.value,
        root_id=root_id,
        now=now_ms(),
    )
    if not rows:
        raise LookupError("user not found")
    return _row_to_summary(rows[0])


LIST_MAPS_FOR_OWNER = """
MATCH (u:User {subject: $subject})-[:OWNS]->(m:MindMap)
RETURN m.id AS id, m.title AS title, m.description AS description,
       m.visibility AS visibility, m.node_count AS node_count,
       m.created_at AS created_at, m.updated_at AS updated_at,
       u.id AS owner_id, u.username AS owner_name
ORDER BY m.updated_at DESC
SKIP $skip LIMIT $limit
"""


async def list_maps_for_owner(
    settings: Settings, subject: str, skip: int = 0, limit: int = 50
) -> List[MindMapSummary]:
    rows = await db.run_read(
        settings, LIST_MAPS_FOR_OWNER, subject=subject, skip=skip, limit=limit
    )
    return [_row_to_summary(r) for r in rows]


LIST_PUBLIC_MAPS = """
MATCH (u:User)-[:OWNS]->(m:MindMap {visibility: 'public'})
RETURN m.id AS id, m.title AS title, m.description AS description,
       m.visibility AS visibility, m.node_count AS node_count,
       m.created_at AS created_at, m.updated_at AS updated_at,
       u.id AS owner_id, u.username AS owner_name
ORDER BY m.updated_at DESC
SKIP $skip LIMIT $limit
"""


async def list_public_maps(
    settings: Settings, skip: int = 0, limit: int = 50
) -> List[MindMapSummary]:
    rows = await db.run_read(settings, LIST_PUBLIC_MAPS, skip=skip, limit=limit)
    return [_row_to_summary(r) for r in rows]


GET_MAP_META = """
MATCH (u:User)-[:OWNS]->(m:MindMap {id: $map_id})
RETURN m.id AS id, m.title AS title, m.description AS description,
       m.visibility AS visibility, m.node_count AS node_count,
       m.created_at AS created_at, m.updated_at AS updated_at,
       m.root_id AS root_id,
       u.id AS owner_id, u.subject AS owner_subject, u.username AS owner_name
"""

GET_MAP_NODES = """
MATCH (m:MindMap {id: $map_id})-[:CONTAINS]->(n:MapNode)
OPTIONAL MATCH (n)-[:HAS_CHILD]->(c:MapNode)
OPTIONAL MATCH (p:MapNode)-[:HAS_CHILD]->(n)
OPTIONAL MATCH (n)-[:EMERGES_FROM]->(e:MapNode)
OPTIONAL MATCH (n)-[:RESETS_TO]->(r:MapNode)
RETURN n.id AS id, n.depth AS depth, p.id AS parentId,
       collect(DISTINCT c.id) AS childIds,
       collect(DISTINCT e.id) AS emergesFrom,
       collect(DISTINCT r.id) AS resetsTo,
       n.label AS label, n.type AS type, n.tags AS tags,
       n.description AS description, n.content AS content,
       n.metadata_json AS metadata_json,
       n.energy_json AS energy_json, n.resonance_json AS resonance_json,
       n.visual_json AS visual_json,
       n.created AS created, n.modified AS modified, n.last_visited AS last_visited
"""


async def get_map_meta(settings: Settings, map_id: str) -> Optional[Dict[str, Any]]:
    rows = await db.run_read(settings, GET_MAP_META, map_id=map_id)
    return rows[0] if rows else None


async def get_map(settings: Settings, map_id: str) -> Optional[MindMap]:
    meta = await get_map_meta(settings, map_id)
    if meta is None:
        return None

    node_rows = await db.run_read(settings, GET_MAP_NODES, map_id=map_id)
    summary = _row_to_summary(meta)

    return MindMap(
        **summary.model_dump(),
        root_id=meta.get("root_id"),
        nodes=[_row_to_node(r) for r in node_rows],
    )


UPDATE_MAP = """
MATCH (m:MindMap {id: $map_id})
SET m.title = coalesce($title, m.title),
    m.description = coalesce($description, m.description),
    m.visibility = coalesce($visibility, m.visibility),
    m.updated_at = $now
RETURN m.id AS id
"""


async def update_map(
    settings: Settings,
    map_id: str,
    title: Optional[str],
    description: Optional[str],
    visibility: Optional[Visibility],
) -> bool:
    rows = await db.run_write(
        settings,
        UPDATE_MAP,
        map_id=map_id,
        title=title,
        description=description,
        visibility=visibility.value if visibility else None,
        now=now_ms(),
    )
    return bool(rows)


# DETACH DELETE removes relationships too, so no orphaned edges are left behind.
DELETE_MAP = """
MATCH (m:MindMap {id: $map_id})
OPTIONAL MATCH (m)-[:CONTAINS]->(n:MapNode)
OPTIONAL MATCH (m)-[:SHARED_VIA]->(s:ShareLink)
DETACH DELETE n, s, m
RETURN count(*) AS removed
"""


async def delete_map(settings: Settings, map_id: str) -> bool:
    rows = await db.run_write(settings, DELETE_MAP, map_id=map_id)
    return bool(rows)


# --- nodes -----------------------------------------------------------------

CLEAR_NODES = """
MATCH (m:MindMap {id: $map_id})-[:CONTAINS]->(n:MapNode)
DETACH DELETE n
"""

# UNWIND + MERGE writes the whole node set in one round trip. Doing this per node
# would be one network round trip each — unusable for a map of any size.
INSERT_NODES = """
MATCH (m:MindMap {id: $map_id})
UNWIND $nodes AS node
CREATE (n:MapNode {
    map_id: $map_id,
    id: node.id,
    depth: node.depth,
    label: node.label,
    type: node.type,
    tags: node.tags,
    description: node.description,
    content: node.content,
    metadata_json: node.metadata_json,
    energy_json: node.energy_json,
    resonance_json: node.resonance_json,
    visual_json: node.visual_json,
    created: node.created,
    modified: node.modified,
    last_visited: node.last_visited
})
CREATE (m)-[:CONTAINS]->(n)
"""

# Second pass: the parent may appear after the child in the input, so edges are
# linked only once every node exists.
LINK_NODES = """
UNWIND $edges AS edge
MATCH (parent:MapNode {map_id: $map_id, id: edge.parent})
MATCH (child:MapNode {map_id: $map_id, id: edge.child})
MERGE (parent)-[:HAS_CHILD]->(child)
"""

# Convergent emergence, kept as its own relationship type rather than as another
# HAS_CHILD. They are different relations and merging them would lose the
# distinction the whole feature exists for: HAS_CHILD says "is inside", EMERGES_FROM
# says "flowed into". A traversal that wants one and not the other must be able to ask.
LINK_EMERGENCE = """
UNWIND $edges AS edge
MATCH (source:MapNode {map_id: $map_id, id: edge.source})
MATCH (target:MapNode {map_id: $map_id, id: edge.target})
MERGE (target)-[:EMERGES_FROM]->(source)
"""

# Recurrence. Its own type because it is the one relation that may be circular, and
# keeping it apart is what lets every traversal that computes depth simply not ask for it.
LINK_RESETS = """
UNWIND $edges AS edge
MATCH (from:MapNode {map_id: $map_id, id: edge.from})
MATCH (to:MapNode {map_id: $map_id, id: edge.to})
MERGE (from)-[:RESETS_TO]->(to)
"""

FINALIZE_MAP = """
MATCH (m:MindMap {id: $map_id})
SET m.node_count = $node_count,
    m.root_id = $root_id,
    m.updated_at = $now
RETURN m.id AS id
"""


async def replace_nodes(
    settings: Settings,
    map_id: str,
    nodes: List[MapNode],
    root_id: Optional[str],
) -> int:
    """
    Replace a map's entire node set.

    Wholesale replacement rather than diffing: the client is the source of truth
    for a map it is editing, and this keeps the write idempotent and easy to
    reason about. Revisit if maps grow large enough that resending is wasteful.
    """
    await db.run_write(settings, CLEAR_NODES, map_id=map_id)

    if nodes:
        await db.run_write(
            settings,
            INSERT_NODES,
            map_id=map_id,
            nodes=[_node_to_params(n) for n in nodes],
        )

        edges = [
            {"parent": node.id, "child": child_id}
            for node in nodes
            for child_id in node.childIds
        ]
        # Include parentId-only relationships, in case a client sets parentId
        # without mirroring it into the parent's childIds.
        known = {(e["parent"], e["child"]) for e in edges}
        for node in nodes:
            if node.parentId and (node.parentId, node.id) not in known:
                edges.append({"parent": node.parentId, "child": node.id})

        if edges:
            await db.run_write(settings, LINK_NODES, map_id=map_id, edges=edges)

        emergence = [
            {"target": node.id, "source": source_id}
            for node in nodes
            for source_id in node.emergesFrom
            # A contributor that is also the containing parent would double-count the
            # node's convergence degree, which the cone reads as a radius.
            if source_id != node.parentId and source_id != node.id
        ]
        if emergence:
            await db.run_write(
                settings, LINK_EMERGENCE, map_id=map_id, edges=emergence
            )

        resets = [
            {"from": node.id, "to": target_id}
            for node in nodes
            for target_id in node.resetsTo
            if target_id != node.id
        ]
        if resets:
            await db.run_write(settings, LINK_RESETS, map_id=map_id, edges=resets)

    await db.run_write(
        settings,
        FINALIZE_MAP,
        map_id=map_id,
        node_count=len(nodes),
        root_id=root_id,
        now=now_ms(),
    )
    return len(nodes)


# --- share links -----------------------------------------------------------

CREATE_SHARE = """
MATCH (m:MindMap {id: $map_id})
CREATE (s:ShareLink {
    token: $token,
    permission: $permission,
    created_at: $now,
    expires_at: $expires_at,
    revoked: false
})
CREATE (m)-[:SHARED_VIA]->(s)
RETURN s.token AS token, s.permission AS permission,
       s.created_at AS created_at, s.expires_at AS expires_at,
       s.revoked AS revoked, m.id AS map_id
"""


async def create_share_link(
    settings: Settings,
    map_id: str,
    permission: SharePermission,
    expires_in_seconds: Optional[int],
) -> ShareLink:
    expires_at = now_ms() + expires_in_seconds * 1000 if expires_in_seconds else None

    rows = await db.run_write(
        settings,
        CREATE_SHARE,
        map_id=map_id,
        # 32 url-safe bytes: unguessable, since possessing the token is the
        # entire authorization check for an unlisted map.
        token=secrets.token_urlsafe(32),
        permission=permission.value,
        now=now_ms(),
        expires_at=expires_at,
    )
    if not rows:
        raise LookupError("map not found")

    row = rows[0]
    return ShareLink(
        token=row["token"],
        map_id=row["map_id"],
        permission=SharePermission(row["permission"]),
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        revoked=row["revoked"],
    )


RESOLVE_SHARE = """
MATCH (m:MindMap)-[:SHARED_VIA]->(s:ShareLink {token: $token})
RETURN s.token AS token, s.permission AS permission,
       s.created_at AS created_at, s.expires_at AS expires_at,
       s.revoked AS revoked, m.id AS map_id
"""


async def resolve_share_link(settings: Settings, token: str) -> Optional[ShareLink]:
    rows = await db.run_read(settings, RESOLVE_SHARE, token=token)
    if not rows:
        return None

    row = rows[0]
    return ShareLink(
        token=row["token"],
        map_id=row["map_id"],
        permission=SharePermission(row["permission"]),
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        revoked=row["revoked"],
    )


LIST_SHARES = """
MATCH (m:MindMap {id: $map_id})-[:SHARED_VIA]->(s:ShareLink)
RETURN s.token AS token, s.permission AS permission,
       s.created_at AS created_at, s.expires_at AS expires_at,
       s.revoked AS revoked, m.id AS map_id
ORDER BY s.created_at DESC
"""


async def list_share_links(settings: Settings, map_id: str) -> List[ShareLink]:
    rows = await db.run_read(settings, LIST_SHARES, map_id=map_id)
    return [
        ShareLink(
            token=r["token"],
            map_id=r["map_id"],
            permission=SharePermission(r["permission"]),
            created_at=r["created_at"],
            expires_at=r["expires_at"],
            revoked=r["revoked"],
        )
        for r in rows
    ]


# Revoke rather than delete, so a leaked token can never be reissued to a
# different map and the audit trail survives.
REVOKE_SHARE = """
MATCH (m:MindMap {id: $map_id})-[:SHARED_VIA]->(s:ShareLink {token: $token})
SET s.revoked = true
RETURN s.token AS token
"""


async def revoke_share_link(settings: Settings, map_id: str, token: str) -> bool:
    rows = await db.run_write(settings, REVOKE_SHARE, map_id=map_id, token=token)
    return bool(rows)


COUNT_MAPS_FOR_OWNER = """
MATCH (u:User {subject: $subject})-[:OWNS]->(m:MindMap)
RETURN count(m) AS total
"""


async def count_maps_for_owner(settings: Settings, subject: str) -> int:
    rows = await db.run_read(settings, COUNT_MAPS_FOR_OWNER, subject=subject)
    return rows[0]["total"] if rows else 0


# --- feed / pulses ---------------------------------------------------------
#
# Data model:
#
#   (:User)-[:POSTED]->(:Pulse)
#   (:User)-[:RESONATED_WITH {value, at}]->(:Pulse)
#   (:User)-[:SAW {at}]->(:Pulse)
#   (:User)-[:REPORTED {reason, at}]->(:Pulse)
#   (:User)-[:BLOCKED]->(:User)
#
# RESONATED_WITH carries a signed value, -2..+2. A rating of 0 deletes the
# relationship rather than storing a zero, so "has no opinion" and "never saw it"
# are one state in the data and the model does not have to tell them apart.
#
# Nothing here is aggregated for display. There is no resonator count and no score
# on the wire, for viewers or for authors: the ratings exist so the feed can learn
# what resonates with each reader, and a visible tally turns that into a
# scoreboard. SAW exists only to give the model a denominator — it is never read
# back to a user, and never per-viewer.
#
# Media is stored as a JSON string for the same reason node metadata is: Neo4j
# properties must be primitives or arrays of primitives.


def _author_name(row: Dict[str, Any]) -> str:
    """How an author is named, in one place because two things now ask.

    display_name first: it is the one the user chose. `username` next — it is
    always present for accounts made since the provider began requiring one, and
    absent for older ones, which is why posts used to be attributed to "Anonymous".
    """
    return (
        row.get("author_display_name")
        or row.get("author_name")
        or "Anonymous"
    )


def _row_to_pulse(row: Dict[str, Any], viewer_subject: Optional[str] = None) -> Pulse:
    """Build a Pulse from a query row.

    Carries no aggregate of any kind. Earlier versions returned a resonator count
    and a 0..1 score derived from it, which was a like count with a curve on it —
    and any visible tally makes posting a competition. The only resonance figure
    here is the caller's own rating.
    """
    media_raw = row.get("media_json")
    media = None
    if media_raw:
        try:
            media = PulseMedia(**json.loads(media_raw))
        except (ValueError, TypeError):
            # A pulse whose media cannot be parsed is still a readable pulse.
            # Dropping the attachment beats failing the whole feed request.
            logger.warning("Pulse %s has unreadable media_json", row.get("id"))

    return Pulse(
        id=row["id"],
        title=row.get("title") or "",
        preview=row.get("preview") or "",
        author=PulseAuthor(
            id=row.get("author_id") or "unknown",
            name=_author_name(row),
            avatar=row.get("author_avatar"),
        ),
        tags=list(row.get("tags") or []),
        media=media,
        visibility=Visibility(row.get("visibility") or "public"),
        timestamp=int(row.get("created_at") or 0),
        edited_at=int(row["edited_at"]) if row.get("edited_at") else None,
        my_rating=int(row.get("my_rating") or 0),
        own=bool(viewer_subject) and row.get("author_subject") == viewer_subject,
    )


CREATE_PULSE = """
MATCH (u:User {subject: $subject})
CREATE (p:Pulse {
    id: $id,
    title: $title,
    preview: $preview,
    tags: $tags,
    media_json: $media_json,
    visibility: $visibility,
    created_at: $now,
    reports: 0
})
CREATE (u)-[:POSTED]->(p)
RETURN p.id AS id, p.title AS title, p.preview AS preview, p.tags AS tags,
       p.media_json AS media_json, p.visibility AS visibility,
       p.created_at AS created_at, p.edited_at AS edited_at,
       0 AS my_rating,
       u.id AS author_id, u.username AS author_name, u.subject AS author_subject,
       u.display_name AS author_display_name, u.avatar_url AS author_avatar
"""


async def create_pulse(
    settings: Settings, subject: str, pulse: PulseCreate
) -> Optional[Pulse]:
    """Post a pulse. Returns None when the author has no User node."""
    rows = await db.run_write(
        settings,
        CREATE_PULSE,
        subject=subject,
        id=new_id("pulse"),
        title=pulse.title,
        preview=pulse.preview,
        tags=pulse.tags,
        media_json=pulse.media.model_dump_json() if pulse.media else None,
        visibility=pulse.visibility.value,
        now=now_ms(),
    )
    if not rows:
        return None
    return _row_to_pulse(rows[0], subject)


# --- comments ---------------------------------------------------------------
#
#   (:User)-[:WROTE]->(:Comment)-[:ON]->(:Pulse)
#   (:User)-[:RESONATED_WITH]->(:Comment)
#
# The same relationship type as a pulse rating, deliberately: it is the same act,
# and the reader model reads both through one traversal rather than a union of two
# that could drift apart.
#
# Comments are FLAT. No parent_comment_id, and that is a decision rather than an
# omission — nested replies are where pile-ons live, and with no visible score
# there is nothing to rank a reply by. One level can be added later without moving
# anything that exists.

CREATE_COMMENT = """
MATCH (u:User {subject: $subject}), (p:Pulse {id: $pulse_id})
CREATE (c:Comment {
    id: $id,
    text: $text,
    created_at: $now,
    reports: 0
})
CREATE (u)-[:WROTE]->(c)
CREATE (c)-[:ON]->(p)
RETURN c.id AS id, p.id AS pulse_id, c.text AS text,
       c.created_at AS created_at, c.edited_at AS edited_at,
       0 AS my_rating,
       u.id AS author_id, u.username AS author_name, u.subject AS author_subject,
       u.display_name AS author_display_name, u.avatar_url AS author_avatar
"""


async def create_comment(
    settings: Settings,
    subject: str,
    pulse_id: str,
    text: str,
) -> Optional[Comment]:
    rows = await db.run_write(
        settings,
        CREATE_COMMENT,
        subject=subject,
        pulse_id=pulse_id,
        id=f"comment-{uuid4().hex[:12]}",
        text=text,
        now=now_ms(),
    )
    return _row_to_comment(rows[0], subject) if rows else None


# Oldest first: a conversation reads forward. Blocked authors are excluded in the
# query for the same reason as the feed — filtering afterwards would make `limit`
# mean "up to N, minus however many were hidden".
LIST_COMMENTS = """
MATCH (author:User)-[:WROTE]->(c:Comment)-[:ON]->(p:Pulse {id: $pulse_id})
WHERE $viewer IS NULL OR NOT EXISTS {
    MATCH (v:User {subject: $viewer})-[:BLOCKED]->(author)
}
OPTIONAL MATCH (c)<-[mine:RESONATED_WITH]-(:User {subject: $viewer})
RETURN c.id AS id, p.id AS pulse_id, c.text AS text,
       c.created_at AS created_at, c.edited_at AS edited_at,
       coalesce(mine.value, 0) AS my_rating,
       author.id AS author_id, author.username AS author_name,
       author.subject AS author_subject,
       author.display_name AS author_display_name, author.avatar_url AS author_avatar
ORDER BY c.created_at ASC
SKIP $skip LIMIT $limit
"""


async def list_comments(
    settings: Settings,
    pulse_id: str,
    viewer_subject: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[Comment]:
    rows = await db.run_read(
        settings,
        LIST_COMMENTS,
        pulse_id=pulse_id,
        viewer=viewer_subject,
        skip=skip,
        limit=limit,
    )
    return [_row_to_comment(row, viewer_subject) for row in rows]


UPDATE_COMMENT = """
MATCH (u:User {subject: $subject})-[:WROTE]->(c:Comment {id: $comment_id})-[:ON]->(p:Pulse)
SET c.text = $text, c.edited_at = $now
RETURN c.id AS id, p.id AS pulse_id, c.text AS text,
       c.created_at AS created_at, c.edited_at AS edited_at,
       0 AS my_rating,
       u.id AS author_id, u.username AS author_name, u.subject AS author_subject,
       u.display_name AS author_display_name, u.avatar_url AS author_avatar
"""


async def update_comment(
    settings: Settings, subject: str, comment_id: str, text: str
) -> Optional[Comment]:
    """Edit your own comment. Ownership is part of the MATCH, not a check after it."""
    rows = await db.run_write(
        settings,
        UPDATE_COMMENT,
        subject=subject,
        comment_id=comment_id,
        text=text,
        now=now_ms(),
    )
    return _row_to_comment(rows[0], subject) if rows else None


DELETE_COMMENT = """
MATCH (:User {subject: $subject})-[:WROTE]->(c:Comment {id: $comment_id})
DETACH DELETE c
RETURN count(*) AS removed
"""


async def delete_comment(settings: Settings, subject: str, comment_id: str) -> bool:
    rows = await db.run_write(
        settings, DELETE_COMMENT, subject=subject, comment_id=comment_id
    )
    return bool(rows and rows[0]["removed"])


SET_COMMENT_RESONANCE = """
MATCH (u:User {subject: $subject}), (c:Comment {id: $comment_id})
MERGE (u)-[r:RESONATED_WITH]->(c)
SET r.value = $value, r.at = $now
RETURN c.id AS id
"""

CLEAR_COMMENT_RESONANCE = """
MATCH (:User {subject: $subject})-[r:RESONATED_WITH]->(:Comment {id: $comment_id})
DELETE r
RETURN count(*) AS removed
"""


async def set_comment_resonance(
    settings: Settings, subject: str, comment_id: str, value: int
) -> bool:
    """Rate a comment, or clear the rating when value is 0.

    0 removes rather than storing a neutral, so the reader model can tell "said
    nothing" from "said this is neutral" — the same distinction pulses make.
    """
    if value == 0:
        rows = await db.run_write(
            settings, CLEAR_COMMENT_RESONANCE, subject=subject, comment_id=comment_id
        )
        return bool(rows)

    rows = await db.run_write(
        settings,
        SET_COMMENT_RESONANCE,
        subject=subject,
        comment_id=comment_id,
        value=value,
        now=now_ms(),
    )
    return bool(rows)


GET_COMMENT = """
MATCH (author:User)-[:WROTE]->(c:Comment {id: $comment_id})-[:ON]->(p:Pulse)
OPTIONAL MATCH (c)<-[mine:RESONATED_WITH]-(:User {subject: $viewer})
RETURN c.id AS id, p.id AS pulse_id, c.text AS text,
       c.created_at AS created_at, c.edited_at AS edited_at,
       coalesce(mine.value, 0) AS my_rating,
       author.id AS author_id, author.username AS author_name,
       author.subject AS author_subject,
       author.display_name AS author_display_name, author.avatar_url AS author_avatar
"""


async def get_comment(
    settings: Settings, comment_id: str, viewer_subject: Optional[str] = None
) -> Optional[Comment]:
    rows = await db.run_read(
        settings, GET_COMMENT, comment_id=comment_id, viewer=viewer_subject
    )
    return _row_to_comment(rows[0], viewer_subject) if rows else None


REPORT_COMMENT = """
MATCH (c:Comment {id: $comment_id})
MERGE (u:User {subject: $subject})-[r:REPORTED]->(c)
ON CREATE SET r.at = $now, c.reports = coalesce(c.reports, 0) + 1
RETURN c.reports AS reports
"""


async def report_comment(settings: Settings, subject: str, comment_id: str) -> Optional[int]:
    """Counted once per reporter, like a pulse report.

    MERGE on the relationship is what makes it once: reporting twice is the same
    person still objecting, not two people.
    """
    rows = await db.run_write(
        settings, REPORT_COMMENT, subject=subject, comment_id=comment_id, now=now_ms()
    )
    return rows[0]["reports"] if rows else None


COUNT_RECENT_COMMENTS = """
MATCH (:User {subject: $subject})-[:WROTE]->(c:Comment)
WHERE c.created_at >= $since
RETURN count(c) AS recent
"""


async def count_recent_comments(settings: Settings, subject: str, window_ms: int) -> int:
    """How many comments the caller wrote inside the window.

    Takes a window rather than an instant, matching count_recent_pulses beside it:
    two rate-limit counters with different argument meanings is how a caller ends
    up passing one to the other.
    """
    rows = await db.run_read(
        settings,
        COUNT_RECENT_COMMENTS,
        subject=subject,
        since=now_ms() - window_ms,
    )
    return int(rows[0]["recent"]) if rows else 0


def _row_to_comment(row: Dict[str, Any], viewer_subject: Optional[str]) -> Comment:
    return Comment(
        id=row["id"],
        pulse_id=row["pulse_id"],
        text=row["text"] or "",
        timestamp=row["created_at"],
        edited_at=row.get("edited_at"),
        my_rating=row.get("my_rating") or 0,
        # Decided here, from the verified subject, exactly as a pulse decides it.
        own=bool(viewer_subject) and row.get("author_subject") == viewer_subject,
        author=PulseAuthor(
            id=row["author_id"],
            name=_author_name(row),
            avatar=row.get("author_avatar"),
        ),
    )


# Newest first, skipping anything from a blocked author.
#
# The block check is part of the query rather than a filter applied afterwards:
# filtering in Python would make `limit` mean "up to N, minus however many were
# blocked", so a user who blocks a prolific poster would get short pages.
LIST_FEED = """
MATCH (author:User)-[:POSTED]->(p:Pulse)
WHERE p.visibility = 'public'
  AND ($viewer IS NULL OR NOT EXISTS {
      MATCH (v:User {subject: $viewer})-[:BLOCKED]->(author)
  })
  AND ($tag IS NULL OR $tag IN p.tags)
OPTIONAL MATCH (p)<-[mine:RESONATED_WITH]-(:User {subject: $viewer})
RETURN p.id AS id, p.title AS title, p.preview AS preview, p.tags AS tags,
       p.media_json AS media_json, p.visibility AS visibility,
       p.created_at AS created_at, p.edited_at AS edited_at,
       coalesce(mine.value, 0) AS my_rating,
       author.id AS author_id, author.username AS author_name,
       author.subject AS author_subject,
       author.display_name AS author_display_name, author.avatar_url AS author_avatar
ORDER BY p.created_at DESC
SKIP $skip LIMIT $limit
"""


async def list_feed(
    settings: Settings,
    viewer_subject: Optional[str] = None,
    skip: int = 0,
    limit: int = 30,
    tag: Optional[str] = None,
) -> List[Pulse]:
    rows = await db.run_read(
        settings,
        LIST_FEED,
        viewer=viewer_subject,
        skip=skip,
        limit=limit,
        tag=tag.lower().lstrip("#") if tag else None,
    )
    return [_row_to_pulse(row, viewer_subject) for row in rows]


LIST_OWN_PULSES = """
MATCH (author:User {subject: $subject})-[:POSTED]->(p:Pulse)
OPTIONAL MATCH (p)<-[mine:RESONATED_WITH]-(:User {subject: $subject})
RETURN p.id AS id, p.title AS title, p.preview AS preview, p.tags AS tags,
       p.media_json AS media_json, p.visibility AS visibility,
       p.created_at AS created_at, p.edited_at AS edited_at,
       coalesce(mine.value, 0) AS my_rating,
       author.id AS author_id, author.username AS author_name,
       author.subject AS author_subject,
       author.display_name AS author_display_name, author.avatar_url AS author_avatar
ORDER BY p.created_at DESC
SKIP $skip LIMIT $limit
"""


async def list_own_pulses(
    settings: Settings, subject: str, skip: int = 0, limit: int = 30
) -> List[Pulse]:
    """Everything the caller posted, private pulses included."""
    rows = await db.run_read(
        settings, LIST_OWN_PULSES, subject=subject, skip=skip, limit=limit
    )
    return [_row_to_pulse(row, subject) for row in rows]


GET_PULSE = """
MATCH (author:User)-[:POSTED]->(p:Pulse {id: $pulse_id})
OPTIONAL MATCH (p)<-[mine:RESONATED_WITH]-(:User {subject: $viewer})
RETURN p.id AS id, p.title AS title, p.preview AS preview, p.tags AS tags,
       p.media_json AS media_json, p.visibility AS visibility,
       p.created_at AS created_at, p.edited_at AS edited_at,
       coalesce(mine.value, 0) AS my_rating,
       author.id AS author_id, author.username AS author_name,
       author.subject AS author_subject,
       author.display_name AS author_display_name, author.avatar_url AS author_avatar
"""


async def get_pulse(
    settings: Settings, pulse_id: str, viewer_subject: Optional[str] = None
) -> Optional[Pulse]:
    rows = await db.run_read(
        settings, GET_PULSE, pulse_id=pulse_id, viewer=viewer_subject
    )
    if not rows:
        return None
    return _row_to_pulse(rows[0], viewer_subject)


DELETE_PULSE = """
MATCH (u:User {subject: $subject})-[:POSTED]->(p:Pulse {id: $pulse_id})
DETACH DELETE p
RETURN count(*) AS deleted
"""


async def delete_pulse(settings: Settings, subject: str, pulse_id: str) -> bool:
    """Delete one of the caller's own pulses.

    Ownership is expressed in the MATCH rather than checked beforehand, so there
    is no window between the check and the delete, and no way to reach this with
    someone else's pulse id.
    """
    rows = await db.run_write(
        settings, DELETE_PULSE, subject=subject, pulse_id=pulse_id
    )
    return bool(rows and rows[0].get("deleted"))


RESONATE = """
MATCH (u:User {subject: $subject})
MATCH (p:Pulse {id: $pulse_id})
MERGE (u)-[r:RESONATED_WITH]->(p)
SET r.value = $value, r.at = $now
RETURN count(*) AS ok
"""

# Rating 0 means "no opinion", which is the absence of a rating rather than a
# rating of zero. Storing it would leave rows the model has to skip and would make
# "moved the slider back to the middle" different from "never touched it" for no
# reason anybody benefits from.
UNRESONATE = """
MATCH (:User {subject: $subject})-[r:RESONATED_WITH]->(:Pulse {id: $pulse_id})
DELETE r
RETURN count(*) AS ok
"""


async def set_resonance(
    settings: Settings, subject: str, pulse_id: str, value: int
) -> bool:
    """Record the caller's rating of a pulse, -2..+2.

    MERGE with SET, not CREATE: rating a post twice replaces the rating rather
    than accumulating, and a double tap on a phone must not produce two
    relationships. Changing your mind is the normal case here, not an edge one.
    """
    if value == 0:
        rows = await db.run_write(
            settings, UNRESONATE, subject=subject, pulse_id=pulse_id
        )
    else:
        rows = await db.run_write(
            settings,
            RESONATE,
            subject=subject,
            pulse_id=pulse_id,
            value=int(value),
            now=now_ms(),
        )
    return bool(rows and rows[0].get("ok"))


# --- impressions -----------------------------------------------------------
#
# The denominator. Without it there is no way to tell a post that landed badly
# from one that was barely shown, and both look identical as "no ratings".
#
# MERGE, so one viewer counts once however many times a post scrolls past. That is
# also what keeps this from being a reading log: the graph records that you saw a
# post, not how often or for how long, and nothing reads it back to any user.

RECORD_IMPRESSIONS = """
MATCH (u:User {subject: $subject})
UNWIND $pulse_ids AS pid
MATCH (p:Pulse {id: pid})
WHERE NOT (u)-[:POSTED]->(p)
MERGE (u)-[s:SAW]->(p)
ON CREATE SET s.at = $now
RETURN count(s) AS seen
"""


async def record_impressions(
    settings: Settings, subject: str, pulse_ids: List[str]
) -> int:
    """Note that this viewer has seen these pulses.

    Skips the viewer's own posts: seeing your own writing says nothing about what
    resonates with you, and counting it would let a prolific poster's own feed
    dominate their model.
    """
    if not pulse_ids:
        return 0
    rows = await db.run_write(
        settings,
        RECORD_IMPRESSIONS,
        subject=subject,
        pulse_ids=list(pulse_ids)[:200],
        now=now_ms(),
    )
    return int(rows[0].get("seen") or 0) if rows else 0


# --- what resonates with one reader ----------------------------------------
#
# Only ever the caller's own ratings. No other user's ratings enter this query,
# which is what makes the prediction a statement about the reader rather than a
# measure of the post's popularity.

READER_RATINGS = """
MATCH (:User {subject: $subject})-[r:RESONATED_WITH]->(p:Pulse)
OPTIONAL MATCH (a:User)-[:POSTED]->(p)
WITH r, p, a
ORDER BY coalesce(r.at, 0) DESC
LIMIT $limit
RETURN r.value AS value, p.tags AS tags, a.id AS author_id
"""


async def load_reader_model(
    settings: Settings, subject: Optional[str], limit: int = 2000
) -> ReaderModel:
    """Build the caller's affinity model from their rating history.

    Bounded to the most recent `limit` ratings. That is a cap on the work, but it
    is also the right model: what resonated with someone three years and ten
    thousand posts ago is weaker evidence about them now than what resonated last
    week.
    """
    if not subject:
        # An anonymous reader has no history, so there is nothing to predict from
        # and nothing that could be predicted about them.
        return ReaderModel.empty()

    rows = await db.run_read(settings, READER_RATINGS, subject=subject, limit=limit)
    return ReaderModel.from_ratings(
        (
            int(row.get("value") or 0),
            list(row.get("tags") or []),
            row.get("author_id"),
        )
        for row in rows
    )


def apply_predictions(items: List[Any], model: ReaderModel) -> List[Any]:
    """Fill in predicted resonance for this reader, in place.

    Mutates rather than rebuilding: these are plain models and the caller already
    owns the list.

    Takes pulses OR comments. A comment has an author and no tags, and that is not
    a gap to paper over — predict() renormalises over the components it has, so an
    empty tag list means a comment is scored on author affinity alone. Which is the
    truth about a comment: it tells you about a person, where a post tells you
    about a topic.
    """
    for item in items:
        prediction = model.predict(getattr(item, "tags", ()), item.author.id)
        item.predicted = prediction.value
        item.prediction_confidence = prediction.confidence
    return items


# --- moderation ------------------------------------------------------------
#
# The minimum a feed open to strangers needs before it accepts their content.
# None of this is optional: without it the first abusive post has no path to
# removal except a database console.

REPORT_PULSE = """
MATCH (u:User {subject: $subject})
MATCH (p:Pulse {id: $pulse_id})
MERGE (u)-[r:REPORTED]->(p)
ON CREATE SET r.reason = $reason, r.at = $now
WITH p
OPTIONAL MATCH (p)<-[all_reports:REPORTED]-(:User)
WITH p, count(all_reports) AS total
SET p.reports = total
RETURN total
"""


async def report_pulse(
    settings: Settings, subject: str, pulse_id: str, reason: str
) -> Optional[int]:
    """Record a report and return the pulse's total report count.

    MERGE keyed on the reporter, so one person cannot inflate the count by
    reporting repeatedly. `reports` is denormalised onto the pulse only because
    an admin queue needs to sort by it.
    """
    rows = await db.run_write(
        settings,
        REPORT_PULSE,
        subject=subject,
        pulse_id=pulse_id,
        reason=reason,
        now=now_ms(),
    )
    if not rows:
        return None
    return int(rows[0].get("total") or 0)


# Blocking ends the friendship and any pending request, in the same statement.
#
# Not left to the caller to do in the right order: blocking somebody and still
# finding them in your friend list — or still owing them an answer to a request —
# is the block failing at the one thing it is for. Doing it here means it cannot
# be forgotten by a future call site.
BLOCK_USER = """
MATCH (me:User {subject: $subject})
MATCH (them:User {id: $target_id})
WHERE them.subject <> $subject
MERGE (me)-[:BLOCKED]->(them)
WITH me, them
OPTIONAL MATCH (me)-[f:FRIENDS_WITH]-(them)
DELETE f
WITH me, them
OPTIONAL MATCH (me)-[r:REQUESTED]-(them)
DELETE r
RETURN count(*) AS ok
"""

UNBLOCK_USER = """
MATCH (:User {subject: $subject})-[b:BLOCKED]->(:User {id: $target_id})
DELETE b
RETURN count(*) AS ok
"""


async def set_block(
    settings: Settings, subject: str, target_id: str, blocked: bool
) -> bool:
    """Block or unblock another user.

    The `them.subject <> $subject` guard stops self-blocking, which would silently
    empty the blocker's own feed.

    Blocking also ends any friendship and cancels any pending request in either
    direction — see the Cypher. Unblocking deliberately does NOT restore them: a
    friendship that comes back on its own is not something either person agreed to
    twice.
    """
    rows = await db.run_write(
        settings,
        BLOCK_USER if blocked else UNBLOCK_USER,
        subject=subject,
        target_id=target_id,
    )
    return bool(rows and rows[0].get("ok"))


# --- friends -----------------------------------------------------------------
#
#   (:User)-[:REQUESTED {at}]->(:User)      one side has asked
#   (:User)-[:FRIENDS_WITH {since}]->(:User)  agreed, stored ONE WAY
#
# Stored one way and matched both ways. The alternative — writing two
# relationships — means every unfriend has to delete both, and the day one delete
# succeeds and the other does not, the graph says two contradictory things about
# the same pair. One row cannot disagree with itself.
#
# Blocking and friendship are the same question asked twice, so they are resolved
# in the same place rather than left to whoever calls them in the right order.

FRIEND_FIELDS = """
    them.id AS id, them.username AS username,
    coalesce(them.display_name, them.username, 'Someone') AS name,
    them.avatar_url AS avatar
"""


SEND_FRIEND_REQUEST = """
MATCH (me:User {subject: $subject}), (them:User {id: $target_id})
WHERE me <> them
  AND NOT EXISTS { MATCH (me)-[:BLOCKED]-(them) }
  AND NOT EXISTS { MATCH (me)-[:FRIENDS_WITH]-(them) }
MERGE (me)-[r:REQUESTED]->(them)
ON CREATE SET r.at = $now
RETURN them.id AS id
"""

# The other side had already asked, so asking back IS the answer.
ACCEPT_IF_MUTUAL = """
MATCH (me:User {subject: $subject})-[mine:REQUESTED]->(them:User {id: $target_id})
MATCH (them)-[theirs:REQUESTED]->(me)
DELETE mine, theirs
MERGE (me)-[f:FRIENDS_WITH]->(them)
ON CREATE SET f.since = $now
RETURN them.id AS id
"""


async def send_friend_request(
    settings: Settings, subject: str, target_id: str
) -> str:
    """Ask to be friends. Returns what happened: 'sent', 'friends', or 'refused'.

    Asking somebody who has already asked you IS accepting them. Without that, two
    people who both press the button reach a state where each is waiting for the
    other, and neither has anything to accept.
    """
    now = now_ms()
    rows = await db.run_write(
        settings, SEND_FRIEND_REQUEST, subject=subject, target_id=target_id, now=now
    )
    if not rows:
        # Blocked in either direction, already friends, or aimed at yourself. Not
        # distinguished on purpose: telling someone "that person has blocked you"
        # reveals the block, and a block should be quiet.
        return "refused"

    mutual = await db.run_write(
        settings, ACCEPT_IF_MUTUAL, subject=subject, target_id=target_id, now=now
    )
    return "friends" if mutual else "sent"


ACCEPT_FRIEND_REQUEST = """
MATCH (them:User {id: $target_id})-[r:REQUESTED]->(me:User {subject: $subject})
WHERE NOT EXISTS { MATCH (me)-[:BLOCKED]-(them) }
DELETE r
MERGE (me)-[f:FRIENDS_WITH]->(them)
ON CREATE SET f.since = $now
RETURN them.id AS id
"""


async def accept_friend_request(settings: Settings, subject: str, target_id: str) -> bool:
    rows = await db.run_write(
        settings, ACCEPT_FRIEND_REQUEST, subject=subject, target_id=target_id, now=now_ms()
    )
    return bool(rows)


# Covers declining one aimed at you and withdrawing one you sent: both are
# "this request should not exist", and the undirected match says so once.
DROP_FRIEND_REQUEST = """
MATCH (me:User {subject: $subject})-[r:REQUESTED]-(them:User {id: $target_id})
DELETE r
RETURN count(*) AS removed
"""


async def drop_friend_request(settings: Settings, subject: str, target_id: str) -> bool:
    rows = await db.run_write(
        settings, DROP_FRIEND_REQUEST, subject=subject, target_id=target_id
    )
    return bool(rows and rows[0]["removed"])


# Undirected, because the relationship is stored one way and either party may end
# it. A directed match would let one of them unfriend and the other not.
UNFRIEND = """
MATCH (me:User {subject: $subject})-[f:FRIENDS_WITH]-(them:User {id: $target_id})
DELETE f
RETURN count(*) AS removed
"""


async def unfriend(settings: Settings, subject: str, target_id: str) -> bool:
    rows = await db.run_write(settings, UNFRIEND, subject=subject, target_id=target_id)
    return bool(rows and rows[0]["removed"])


LIST_FRIENDS = f"""
MATCH (me:User {{subject: $subject}})-[f:FRIENDS_WITH]-(them:User)
RETURN {FRIEND_FIELDS}, f.since AS since
ORDER BY name
"""

LIST_INCOMING_REQUESTS = f"""
MATCH (them:User)-[r:REQUESTED]->(me:User {{subject: $subject}})
WHERE NOT EXISTS {{ MATCH (me)-[:BLOCKED]-(them) }}
RETURN {FRIEND_FIELDS}, r.at AS since
ORDER BY r.at DESC
"""

LIST_OUTGOING_REQUESTS = f"""
MATCH (me:User {{subject: $subject}})-[r:REQUESTED]->(them:User)
RETURN {FRIEND_FIELDS}, r.at AS since
ORDER BY r.at DESC
"""


def _row_to_friend(row: Dict[str, Any]) -> Friend:
    return Friend(
        id=row["id"],
        username=row.get("username"),
        name=row.get("name") or "Someone",
        avatar=row.get("avatar"),
        since=int(row["since"]) if row.get("since") else None,
    )


async def list_friends(settings: Settings, subject: str) -> List[Friend]:
    rows = await db.run_read(settings, LIST_FRIENDS, subject=subject)
    return [_row_to_friend(row) for row in rows]


async def list_friend_requests(settings: Settings, subject: str) -> Dict[str, List[Friend]]:
    incoming = await db.run_read(settings, LIST_INCOMING_REQUESTS, subject=subject)
    outgoing = await db.run_read(settings, LIST_OUTGOING_REQUESTS, subject=subject)
    return {
        "incoming": [_row_to_friend(row) for row in incoming],
        "outgoing": [_row_to_friend(row) for row in outgoing],
    }


FIND_USER_BY_USERNAME = f"""
MATCH (them:User)
WHERE toLower(them.username) = toLower($username)
RETURN {FRIEND_FIELDS}, null AS since
LIMIT 1
"""


async def find_user_by_username(settings: Settings, username: str) -> Optional[Friend]:
    """Look somebody up by handle, so there is a way to find them at all.

    Case-insensitive, because a handle people type from memory is a handle people
    mistype the case of. Exact match only: a prefix search over every user is a way
    to enumerate the whole membership, which is not a thing a social app should
    hand out for free.
    """
    rows = await db.run_read(settings, FIND_USER_BY_USERNAME, username=username)
    return _row_to_friend(rows[0]) if rows else None


LIST_BLOCKED = """
MATCH (:User {subject: $subject})-[:BLOCKED]->(them:User)
RETURN them.id AS id, them.username AS name
ORDER BY them.username
"""


async def list_blocked(settings: Settings, subject: str) -> List[Dict[str, Any]]:
    return await db.run_read(settings, LIST_BLOCKED, subject=subject)


COUNT_RECENT_PULSES = """
MATCH (:User {subject: $subject})-[:POSTED]->(p:Pulse)
WHERE p.created_at > $since
RETURN count(p) AS recent
"""


async def count_recent_pulses(settings: Settings, subject: str, window_ms: int) -> int:
    """How many pulses the caller posted inside the window.

    The rate limit is derived from stored data rather than an in-process counter
    on purpose: Render runs more than one instance, and a per-process counter
    would give each of them its own allowance.
    """
    rows = await db.run_read(
        settings,
        COUNT_RECENT_PULSES,
        subject=subject,
        since=now_ms() - window_ms,
    )
    return int(rows[0]["recent"]) if rows else 0


# --- profile ---------------------------------------------------------------

# The default map is validated on READ, not on write.
#
# A map can be deleted, or its visibility narrowed, long after being chosen as the
# default. Checking only at write time would leave a profile pointing at something the
# user can no longer open, and the app would report a failure on every sign-in with no
# way to see why. So the pointer is only returned while it still resolves to a map this
# user owns; otherwise it reads as "no default" and sign-in falls back to the most
# recent map.
GET_PROFILE = """
MATCH (u:User {subject: $subject})
OPTIONAL MATCH (u)-[:OWNS]->(d:MindMap {id: u.default_map_id})
RETURN u.id AS id, u.display_name AS display_name, u.avatar_url AS avatar_url,
       u.username AS username, u.email AS email, u.bio AS bio,
       d.id AS default_map_id
"""


async def get_profile(settings: Settings, subject: str) -> Optional[Profile]:
    rows = await db.run_read(settings, GET_PROFILE, subject=subject)
    return Profile(**rows[0]) if rows else None


UPDATE_PROFILE = """
MATCH (u:User {subject: $subject})
SET u.display_name    = CASE WHEN $set_name    THEN $display_name  ELSE u.display_name END,
    u.avatar_url      = CASE WHEN $set_avatar  THEN $avatar_url    ELSE u.avatar_url   END,
    u.default_map_id  = CASE WHEN $set_default THEN $default_map_id ELSE u.default_map_id END,
    u.bio             = CASE WHEN $set_bio     THEN $bio            ELSE u.bio            END
WITH u
OPTIONAL MATCH (u)-[:OWNS]->(d:MindMap {id: u.default_map_id})
RETURN u.id AS id, u.display_name AS display_name, u.avatar_url AS avatar_url,
       u.username AS username, u.email AS email, u.bio AS bio,
       d.id AS default_map_id
"""


async def update_profile(
    settings: Settings,
    subject: str,
    display_name: Optional[str] = None,
    avatar_url: Optional[str] = None,
    default_map_id: Optional[str] = None,
    bio: Optional[str] = None,
    set_name: bool = False,
    set_avatar: bool = False,
    set_default: bool = False,
    set_bio: bool = False,
) -> Optional[Profile]:
    """Partial profile update.

    The `set_*` flags exist because null is a meaningful value here: omitting a
    field must leave it alone, while explicitly sending null must clear it. A
    plain `coalesce($x, u.x)` cannot express the difference, so a user could never
    remove an avatar once set.
    """
    rows = await db.run_write(
        settings,
        UPDATE_PROFILE,
        subject=subject,
        display_name=display_name,
        avatar_url=avatar_url,
        default_map_id=default_map_id,
        bio=bio,
        set_name=set_name,
        set_avatar=set_avatar,
        set_default=set_default,
        set_bio=set_bio,
    )
    return Profile(**rows[0]) if rows else None


UPDATE_PULSE = """
MATCH (u:User {subject: $subject})-[:POSTED]->(p:Pulse {id: $pulse_id})
SET p.title      = CASE WHEN $set_title      THEN $title      ELSE p.title      END,
    p.preview    = CASE WHEN $set_preview    THEN $preview    ELSE p.preview    END,
    p.tags       = CASE WHEN $set_tags       THEN $tags       ELSE p.tags       END,
    p.media_json = CASE WHEN $set_media      THEN $media_json ELSE p.media_json END,
    p.visibility = CASE WHEN $set_visibility THEN $visibility ELSE p.visibility END,
    p.edited_at  = $now
RETURN count(*) AS updated
"""


async def update_pulse(
    settings: Settings, subject: str, pulse_id: str, changes: Dict[str, Any]
) -> bool:
    """Edit one of the caller's own pulses.

    Ownership is in the MATCH, so this cannot reach another author's pulse and
    there is no window between checking and writing. `edited_at` is always set:
    a reader is entitled to know a post has changed since it was published.
    """
    rows = await db.run_write(
        settings,
        UPDATE_PULSE,
        subject=subject,
        pulse_id=pulse_id,
        title=changes.get("title"),
        preview=changes.get("preview"),
        tags=changes.get("tags"),
        media_json=changes.get("media_json"),
        visibility=changes.get("visibility"),
        set_title="title" in changes,
        set_preview="preview" in changes,
        set_tags="tags" in changes,
        set_media="media" in changes,
        set_visibility="visibility" in changes,
        now=now_ms(),
    )
    return bool(rows and rows[0].get("updated"))
